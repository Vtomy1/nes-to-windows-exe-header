/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Authentic 64-color NES master palette (RGB)
export const NES_PALETTE_RGB: number[] = [
  0x666666, 0x002a88, 0x1412a7, 0x3b00a4, 0x5c007e, 0x6e0040, 0x6c0600, 0x561d00,
  0x333500, 0x0b4800, 0x005200, 0x004f08, 0x00404d, 0x000000, 0x000000, 0x000000,
  0xadadad, 0x155fd9, 0x4240ff, 0x7527fe, 0xa01acc, 0xb71e7b, 0xb53120, 0x994e00,
  0x6b6d00, 0x388700, 0x0c9300, 0x008f32, 0x007c8d, 0x000000, 0x000000, 0x000000,
  0xfffeff, 0x64b0ff, 0x9290ff, 0xc676ff, 0xf36aff, 0xfe6ecc, 0xfe8170, 0xea9e22,
  0xbcbe00, 0x88d800, 0x5ce430, 0x45e082, 0x48cdde, 0x4f4f4f, 0x000000, 0x000000,
  0xfffeff, 0xc0dfff, 0xd3d2ff, 0xe8c8ff, 0xfbc2ff, 0xfec4ea, 0xfeccc5, 0xf7d8a5,
  0xe4e594, 0xcfe99b, 0xbfe7b3, 0xb6ebd0, 0xb7e5f3, 0xc7c7c7, 0x000000, 0x000000,
];

// Precomputed 32-bit ABGR values for direct Uint32Array writing on little-endian systems
export const NES_PALETTE_UINT32: Uint32Array = new Uint32Array(
  NES_PALETTE_RGB.map((rgb) => {
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    // ABGR: Alpha 0xFF, Blue, Green, Red
    return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
  })
);

export interface PpuBus {
  readChr(addr: number): number;
  writeChr(addr: number, val: number): void;
  readNametable(addr: number): number;
  writeNametable(addr: number, val: number): void;
  triggerNmi(): void;
}

export class Ppu {
  // Registers
  public ctrl: number = 0;   // $2000
  public mask: number = 0;   // $2001
  public status: number = 0; // $2002
  public oamAddr: number = 0;// $2003
  public scrollX: number = 0;// $2005
  public scrollY: number = 0;

  // Internal VRAM address registers (Loopy)
  public v: number = 0; // Current VRAM address (15 bit)
  public t: number = 0; // Temporary VRAM address (15 bit)
  public x: number = 0; // Fine X scroll (3 bit)
  public w: number = 0; // First/second write toggle

  public oam: Uint8Array = new Uint8Array(256);
  public palette: Uint8Array = new Uint8Array(32);
  public readBuffer: number = 0;

  // Timing
  public scanline: number = 0;
  public cycle: number = 0;
  public frame: number = 0;

  // Framebuffer 256x240 RGBA
  public frameBuffer: Uint32Array = new Uint32Array(256 * 240);

  private bus: PpuBus;

  constructor(bus: PpuBus) {
    this.bus = bus;
  }

  public reset(): void {
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0;
    this.oamAddr = 0;
    this.scrollX = 0;
    this.scrollY = 0;
    this.v = 0;
    this.t = 0;
    this.x = 0;
    this.w = 0;
    this.scanline = 0;
    this.cycle = 0;
    this.frame = 0;
    this.readBuffer = 0;
    this.oam.fill(0);
    this.palette.fill(0x0f); // Default to black
    this.frameBuffer.fill(0xff000000);
  }

  public readRegister(reg: number): number {
    switch (reg) {
      case 0x2002: { // PPUSTATUS
        const res = (this.status & 0xe0) | (this.readBuffer & 0x1f);
        this.status &= ~0x80; // Clear VBlank flag
        this.w = 0;           // Clear write toggle
        return res;
      }
      case 0x2004: // OAMDATA
        return this.oam[this.oamAddr];
      case 0x2007: { // PPUDATA
        let data = this.readVram(this.v);
        // Buffered read for addresses < $3F00
        if (this.v < 0x3f00) {
          const buffered = this.readBuffer;
          this.readBuffer = data;
          data = buffered;
        } else {
          this.readBuffer = this.readVram(this.v - 0x1000);
        }
        // Increment VRAM address
        this.v = (this.v + ((this.ctrl & 0x04) ? 32 : 1)) & 0x7fff;
        return data;
      }
      default:
        return 0;
    }
  }

  public writeRegister(reg: number, val: number): void {
    val &= 0xff;
    switch (reg) {
      case 0x2000: // PPUCTRL
        this.ctrl = val;
        // t: ...BA.. ........ = d: ......BA
        this.t = (this.t & 0xf3ff) | ((val & 0x03) << 10);
        break;
      case 0x2001: // PPUMASK
        this.mask = val;
        break;
      case 0x2003: // OAMADDR
        this.oamAddr = val;
        break;
      case 0x2004: // OAMDATA
        this.oam[this.oamAddr] = val;
        this.oamAddr = (this.oamAddr + 1) & 0xff;
        break;
      case 0x2005: // PPUSCROLL
        if (this.w === 0) {
          // First write: fine X and coarse X
          this.t = (this.t & 0x7fe0) | (val >> 3);
          this.x = val & 0x07;
          this.w = 1;
        } else {
          // Second write: fine Y and coarse Y
          this.t = (this.t & 0x0c1f) | ((val & 0x07) << 12) | ((val & 0xf8) << 2);
          this.w = 0;
        }
        break;
      case 0x2006: // PPUADDR
        if (this.w === 0) {
          this.t = (this.t & 0x00ff) | ((val & 0x3f) << 8);
          this.w = 1;
        } else {
          this.t = (this.t & 0x7f00) | val;
          this.v = this.t;
          this.w = 0;
        }
        break;
      case 0x2007: // PPUDATA
        this.writeVram(this.v, val);
        this.v = (this.v + ((this.ctrl & 0x04) ? 32 : 1)) & 0x7fff;
        break;
    }
  }

  public readVram(addr: number): number {
    addr &= 0x3fff;
    if (addr < 0x2000) {
      return this.bus.readChr(addr);
    } else if (addr < 0x3f00) {
      return this.bus.readNametable(addr);
    } else {
      // Palette RAM ($3F00 - $3FFF with mirror)
      let pAddr = addr & 0x1f;
      if (pAddr >= 0x10 && (pAddr & 0x03) === 0) pAddr -= 0x10;
      return this.palette[pAddr];
    }
  }

  public writeVram(addr: number, val: number): void {
    addr &= 0x3fff;
    if (addr < 0x2000) {
      this.bus.writeChr(addr, val);
    } else if (addr < 0x3f00) {
      this.bus.writeNametable(addr, val);
    } else {
      let pAddr = addr & 0x1f;
      if (pAddr >= 0x10 && (pAddr & 0x03) === 0) pAddr -= 0x10;
      this.palette[pAddr] = val & 0x3f;
    }
  }

  public step(cpuCycles: number): void {
    // 3 PPU cycles per 1 CPU cycle on NTSC
    this.cycle += cpuCycles * 3;

    while (this.cycle >= 341) {
      this.cycle -= 341;

      // Render scanline if visible (0-239)
      if (this.scanline < 240) {
        this.renderScanline(this.scanline);
      }

      this.scanline++;

      // Scanline 241: Enter VBlank & Trigger NMI
      if (this.scanline === 241) {
        this.status |= 0x80; // Set VBlank flag
        if (this.ctrl & 0x80) { // NMI enabled
          this.bus.triggerNmi();
        }
      }

      // Scanline 261: Pre-render scanline
      if (this.scanline >= 262) {
        this.scanline = 0;
        this.status &= ~0xe0; // Clear VBlank and Sprite 0 hit
        this.frame++;
      }
    }
  }

  private renderScanline(sl: number): void {
    const showBg = (this.mask & 0x08) !== 0;
    const showSprites = (this.mask & 0x10) !== 0;
    const bgTable = (this.ctrl & 0x10) ? 0x1000 : 0x0000;
    const spTable = (this.ctrl & 0x08) ? 0x1000 : 0x0000;
    const spHeight = (this.ctrl & 0x20) ? 16 : 8;

    const rowOffset = sl * 256;
    const universalBgColor = NES_PALETTE_UINT32[this.palette[0] & 0x3f];

    // Clear line with universal background color
    for (let x = 0; x < 256; x++) {
      this.frameBuffer[rowOffset + x] = universalBgColor;
    }

    if (!showBg && !showSprites) return;

    // Buffer to track background pixel colors (for sprite priority & sprite 0 hit)
    const bgPixels = new Uint8Array(256);

    // 1. Render Background
    if (showBg) {
      // Coarse and fine scroll coordinates
      const scrollX = (this.t & 0x1f) * 8 + this.x;
      const scrollY = ((this.t >> 5) & 0x1f) * 8 + ((this.t >> 12) & 0x07);
      const baseNtX = this.ctrl & 0x01;
      const baseNtY = (this.ctrl >> 1) & 0x01;

      for (let x = 0; x < 256; x++) {
        const px = x + scrollX;
        const py = sl + scrollY;

        const ntX = (baseNtX + Math.floor(px / 256)) & 1;
        const ntY = (baseNtY + Math.floor(py / 240)) & 1;
        const normalizedPx = px % 256;
        const normalizedPy = py % 240;

        const ntBase = 0x2000 + (ntY * 2 + ntX) * 0x400;
        const tileX = (normalizedPx >> 3) & 0x1f;
        const tileY = (normalizedPy >> 3) & 0x1f;
        const tileIndex = this.readVram(ntBase + tileY * 32 + tileX);

        // Attribute byte for palette index
        const attrAddr = ntBase + 0x3c0 + ((tileY >> 2) * 8) + (tileX >> 2);
        const attrByte = this.readVram(attrAddr);
        const shift = ((tileY & 2) ? 4 : 0) | ((tileX & 2) ? 2 : 0);
        const palHigh = (attrByte >> shift) & 0x03;

        // Fetch tile pixel
        const fineY = normalizedPy & 0x07;
        const fineX = normalizedPx & 0x07;
        const tileAddr = bgTable + tileIndex * 16 + fineY;
        const p1 = this.readVram(tileAddr);
        const p2 = this.readVram(tileAddr + 8);
        const bit = 7 - fineX;
        const palLow = (((p2 >> bit) & 1) << 1) | ((p1 >> bit) & 1);

        if (palLow !== 0) {
          bgPixels[x] = palLow;
          const colorIdx = this.palette[(palHigh << 2) | palLow] & 0x3f;
          this.frameBuffer[rowOffset + x] = NES_PALETTE_UINT32[colorIdx];
        }
      }
    }

    // 2. Render Sprites (OAM: 64 sprites of 4 bytes: Y, Tile, Attr, X)
    if (showSprites) {
      // Scan sprites backwards so Sprite 0 has top priority
      for (let i = 63; i >= 0; i--) {
        const off = i * 4;
        const spY = this.oam[off] + 1; // Sprites are delayed by 1 scanline
        if (sl < spY || sl >= spY + spHeight) continue;

        const spTile = this.oam[off + 1];
        const spAttr = this.oam[off + 2];
        const spX = this.oam[off + 3];

        const flipV = (spAttr & 0x80) !== 0;
        const flipH = (spAttr & 0x40) !== 0;
        const behindBg = (spAttr & 0x20) !== 0;
        const palHigh = (spAttr & 0x03) | 4; // Sprite palettes are 4-7

        let lineInSprite = sl - spY;
        if (flipV) lineInSprite = spHeight - 1 - lineInSprite;

        let tileAddr = 0;
        if (spHeight === 16) {
          const bank = (spTile & 1) ? 0x1000 : 0x0000;
          const actualTile = (spTile & ~1) + (lineInSprite >= 8 ? 1 : 0);
          tileAddr = bank + actualTile * 16 + (lineInSprite & 7);
        } else {
          tileAddr = spTable + spTile * 16 + lineInSprite;
        }

        const p1 = this.readVram(tileAddr);
        const p2 = this.readVram(tileAddr + 8);

        for (let col = 0; col < 8; col++) {
          const px = spX + col;
          if (px >= 256) continue;

          const bit = flipH ? col : 7 - col;
          const palLow = (((p2 >> bit) & 1) << 1) | ((p1 >> bit) & 1);
          if (palLow === 0) continue; // Transparent

          // Sprite 0 hit check
          if (i === 0 && bgPixels[px] !== 0 && px < 255) {
            this.status |= 0x40; // Set Sprite 0 Hit flag
          }

          if (!behindBg || bgPixels[px] === 0) {
            const colorIdx = this.palette[(palHigh << 2) | palLow] & 0x3f;
            this.frameBuffer[rowOffset + px] = NES_PALETTE_UINT32[colorIdx];
          }
        }
      }
    }
  }
}
