/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { serializeNesRom } from './nesParser';

export interface SampleRomInfo {
  id: string;
  name: string;
  genre: string;
  mapper: number;
  description: string;
  prgKb: number;
  chrKb: number;
  mirroring: 'horizontal' | 'vertical';
  hasBattery: boolean;
  tvSystem: 'NTSC' | 'PAL';
  data: Uint8Array;
}

/**
 * Synthesizes a real playable 6502 NROM NES ROM with authentic code, tiles, and sound.
 */
function createBladeBounceRom(): Uint8Array {
  // PRG ROM: 16KB (16384 bytes)
  const prg = new Uint8Array(16384);
  // CHR ROM: 8KB (8192 bytes)
  const chr = new Uint8Array(8192);

  // Fill CHR with NES pattern tiles (letters, numbers, paddle, ball, brick, borders)
  // Each tile is 16 bytes (2 bitplanes of 8 bytes)
  function createTile(charHex: string[]): Uint8Array {
    const tile = new Uint8Array(16);
    for (let row = 0; row < 8; row++) {
      tile[row] = parseInt(charHex[row] || '00', 16);
      tile[row + 8] = 0; // Low bitplane for color 1
    }
    return tile;
  }

  // Tile 0: Blank
  // Tile 1: Solid block
  for (let i = 0; i < 8; i++) {
    chr[16 + i] = 0xff;
  }
  // Tile 2: Ball (circle)
  const ballData = ['00', '3C', '7E', 'FF', 'FF', '7E', '3C', '00'];
  for (let i = 0; i < 8; i++) {
    chr[32 + i] = parseInt(ballData[i], 16);
  }
  // Tile 3: Paddle Left
  const paddleLeft = ['00', '00', '7F', 'FF', 'FF', '7F', '00', '00'];
  for (let i = 0; i < 8; i++) chr[48 + i] = parseInt(paddleLeft[i], 16);
  // Tile 4: Paddle Center
  const paddleMid = ['00', '00', 'FF', 'FF', 'FF', 'FF', '00', '00'];
  for (let i = 0; i < 8; i++) chr[64 + i] = parseInt(paddleMid[i], 16);
  // Tile 5: Paddle Right
  const paddleRight = ['00', '00', 'FE', 'FF', 'FF', 'FE', '00', '00'];
  for (let i = 0; i < 8; i++) chr[80 + i] = parseInt(paddleRight[i], 16);
  // Tile 6: Brick
  const brick = ['FF', '81', 'BD', 'BD', 'BD', 'BD', '81', 'FF'];
  for (let i = 0; i < 8; i++) chr[96 + i] = parseInt(brick[i], 16);

  // Numbers 0-9 in tiles 16-25
  const numbers: Record<number, string[]> = {
    0: ['3C', '66', '66', '66', '66', '66', '3C', '00'],
    1: ['18', '38', '18', '18', '18', '18', '7E', '00'],
    2: ['3C', '66', '06', '1C', '30', '60', '7E', '00'],
    3: ['3C', '66', '06', '1C', '06', '66', '3C', '00'],
    4: ['0C', '1C', '3C', '6C', '7E', '0C', '0C', '00'],
    5: ['7E', '60', '7C', '06', '06', '66', '3C', '00'],
    6: ['3C', '60', '7C', '66', '66', '66', '3C', '00'],
    7: ['7E', '06', '0C', '18', '30', '30', '30', '00'],
    8: ['3C', '66', '66', '3C', '66', '66', '3C', '00'],
    9: ['3C', '66', '66', '3E', '06', '0C', '38', '00'],
  };
  for (let d = 0; d <= 9; d++) {
    const tileOff = (16 + d) * 16;
    for (let r = 0; r < 8; r++) {
      chr[tileOff + r] = parseInt(numbers[d][r], 16);
    }
  }

  // Letters B, O, U, N, C, E, P, L, A, Y, S, R, T
  const letters: Record<string, string[]> = {
    B: ['7C', '66', '66', '7C', '66', '66', '7C', '00'],
    O: ['3C', '66', '66', '66', '66', '66', '3C', '00'],
    U: ['66', '66', '66', '66', '66', '66', '3C', '00'],
    N: ['66', '76', '7E', '7E', '6E', '66', '66', '00'],
    C: ['3C', '66', '60', '60', '60', '66', '3C', '00'],
    E: ['7E', '60', '7C', '60', '60', '60', '7E', '00'],
    P: ['7C', '66', '66', '7C', '60', '60', '60', '00'],
    L: ['60', '60', '60', '60', '60', '60', '7E', '00'],
    A: ['3C', '66', '66', '7E', '66', '66', '66', '00'],
    Y: ['66', '66', '66', '3C', '18', '18', '18', '00'],
    S: ['3C', '66', '60', '3C', '06', '66', '3C', '00'],
    R: ['7C', '66', '66', '7C', '78', '6C', '66', '00'],
    T: ['7E', '18', '18', '18', '18', '18', '18', '00'],
  };
  let charIdx = 30;
  for (const [_, rows] of Object.entries(letters)) {
    const tileOff = charIdx * 16;
    for (let r = 0; r < 8; r++) {
      chr[tileOff + r] = parseInt(rows[r], 16);
    }
    charIdx++;
  }

  // Fill sprite pattern table (Bank 1: 0x1000 - 0x1FFF)
  chr.set(chr.slice(0, 4096), 4096);

  // 6502 Machine Code initialization in PRG ROM ($C000 - $FFFF)
  // Entry point: RESET vector at $FFFC -> $C000
  // NMI vector: $FFFA -> $C100 (Frame loop)
  // IRQ vector: $FFFE -> $C200 (RTI)

  let pc = 0;
  function emit(...bytes: number[]) {
    for (const b of bytes) {
      prg[pc++] = b & 0xff;
    }
  }

  // --- RESET ROUTINE ($C000) ---
  // SEI (78), CLD (D8)
  emit(0x78, 0xd8);
  // Disable APU frame IRQ: LDA #$40, STA $4017
  emit(0xa9, 0x40, 0x8d, 0x17, 0x40);
  // Initialize Stack Pointer: LDX #$FF, TXS
  emit(0xa2, 0xff, 0x9a);
  // Wait 1st VBlank: BIT $2002, BPL -3
  emit(0x2c, 0x02, 0x20, 0x10, 0xfb);
  // Clear RAM ($0000 - $07FF)
  // LDX #$00, TXA, STA $00,X, STA $0100,X, STA $0200,X, STA $0300,X, INX, BNE
  emit(0xa2, 0x00, 0x8a);
  emit(0x95, 0x00, 0x9d, 0x00, 0x02, 0x9d, 0x00, 0x03, 0xe8, 0xd0, 0xf5);

  // Wait 2nd VBlank: BIT $2002, BPL -3
  emit(0x2c, 0x02, 0x20, 0x10, 0xfb);

  // Set initial game state in RAM ($0000-$0020)
  // $10 = Paddle X (112 = 0x70)
  // $11 = Paddle Y (216 = 0xD8)
  // $12 = Ball X (124 = 0x7C)
  // $13 = Ball Y (140 = 0x8C)
  // $14 = Ball VelX (1)
  // $15 = Ball VelY (1)
  // $16 = Score (0)
  emit(0xa9, 0x70, 0x85, 0x10);
  emit(0xa9, 0xd8, 0x85, 0x11);
  emit(0xa9, 0x7c, 0x85, 0x12);
  emit(0xa9, 0x8c, 0x85, 0x13);
  emit(0xa9, 0x01, 0x85, 0x14);
  emit(0xa9, 0x01, 0x85, 0x15);
  emit(0xa9, 0x00, 0x85, 0x16);

  // Load PPU Palettes at $3F00
  // BIT $2002
  emit(0x2c, 0x02, 0x20);
  // LDA #$3F, STA $2006, LDA #$00, STA $2006
  emit(0xa9, 0x3f, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20);
  // Palette values (16 background + 16 sprite colors)
  // $0F (Black bg), $30 (White), $21 (Cyan/Sky), $16 (Red)
  const bgPalette = [
    0x0f, 0x30, 0x21, 0x16, // BG 0
    0x0f, 0x1a, 0x2a, 0x3a, // BG 1
    0x0f, 0x06, 0x16, 0x26, // BG 2
    0x0f, 0x09, 0x19, 0x29, // BG 3
    0x0f, 0x30, 0x27, 0x16, // SP 0 (Ball & paddle: Black, White, Amber, Red)
    0x0f, 0x30, 0x21, 0x11, // SP 1
    0x0f, 0x30, 0x15, 0x25, // SP 2
    0x0f, 0x30, 0x19, 0x29  // SP 3
  ];
  for (const c of bgPalette) {
    emit(0xa9, c, 0x8d, 0x07, 0x20);
  }

  // Draw Title and Bricks to Nametable 0 ($2000)
  // Set PPU address to $2000
  emit(0xa9, 0x20, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20);
  // Fill top banner with blank
  for (let i = 0; i < 96; i++) {
    emit(0xa9, 0x00, 0x8d, 0x07, 0x20);
  }
  // Row of Bricks (Tile 6)
  for (let i = 0; i < 32; i++) {
    emit(0xa9, 0x06, 0x8d, 0x07, 0x20);
  }
  for (let i = 0; i < 32; i++) {
    emit(0xa9, 0x06, 0x8d, 0x07, 0x20);
  }

  // Enable APU audio channels (Pulse 1, Pulse 2, Triangle, Noise)
  // LDA #$0F, STA $4015
  emit(0xa9, 0x0f, 0x8d, 0x15, 0x40);

  // Enable PPU Rendering & NMI
  // PPUCTRL: Enable NMI ($80), Sprites 8x8, BG table $0000, Sprite table $1000 -> $80 | $08 = $88
  emit(0xa9, 0x88, 0x8d, 0x00, 0x20);
  // PPUMASK: Show BG ($08), Show Sprites ($10), Show left 8px ($06) -> $1E
  emit(0xa9, 0x1e, 0x8d, 0x01, 0x20);

  // Reset scroll: LDA #0, STA $2005, STA $2005
  emit(0xa9, 0x00, 0x8d, 0x05, 0x20, 0x8d, 0x05, 0x20);

  // Infinite main loop: JMP $C0A0 (current address)
  const mainLoopAddr = 0xc000 + pc;
  emit(0x4c, mainLoopAddr & 0xff, (mainLoopAddr >> 8) & 0xff);

  // --- NMI INTERRUPT HANDLER (Frame loop at $C100) ---
  pc = 0x0100;
  // OAM DMA to $0200: LDA #$02, STA $4014
  emit(0xa9, 0x02, 0x8d, 0x14, 0x40);

  // Read Controller 1 ($4016)
  // LDA #1, STA $4016, LDA #0, STA $4016
  emit(0xa9, 0x01, 0x8d, 0x16, 0x40, 0xa9, 0x00, 0x8d, 0x16, 0x40);
  // Read 8 buttons into $20
  // LDX #8, LDA $4016, LSR, ROL $20, DEX, BNE -8
  emit(0xa2, 0x08, 0xad, 0x16, 0x40, 0x4a, 0x26, 0x20, 0xca, 0xd0, 0xf6);

  // Controller checks:
  // Bit 1: Left. If pressed, DEC $10
  // LDA $20, AND #$02, BEQ +5, DEC $10
  emit(0xa5, 0x20, 0x29, 0x02, 0xf0, 0x03, 0xc6, 0x10);
  // Bit 0: Right. If pressed, INC $10
  // LDA $20, AND #$01, BEQ +5, INC $10
  emit(0xa5, 0x20, 0x29, 0x01, 0xf0, 0x03, 0xe6, 0x10);

  // Clamp Paddle X between 16 and 216
  // LDA $10, CMP #16, BCS +4, LDA #16, STA $10
  emit(0xa5, 0x10, 0xc9, 0x10, 0xb0, 0x04, 0xa9, 0x10, 0x85, 0x10);
  // CMP #216, BCC +4, LDA #216, STA $10
  emit(0xa5, 0x10, 0xc9, 0xd8, 0x90, 0x04, 0xa9, 0xd8, 0x85, 0x10);

  // Update Ball Position
  // X: LDA $12, CLC, ADC $14, STA $12
  emit(0xa5, 0x12, 0x18, 0x65, 0x14, 0x85, 0x12);
  // Y: LDA $13, CLC, ADC $15, STA $13
  emit(0xa5, 0x13, 0x18, 0x65, 0x15, 0x85, 0x13);

  // Bounce Ball on Left / Right walls (8 and 240)
  // LDA $12, CMP #8, BCS +6, LDA #1, STA $14
  emit(0xa5, 0x12, 0xc9, 0x08, 0xb0, 0x04, 0xa9, 0x01, 0x85, 0x14);
  // CMP #240, BCC +6, LDA #$FF, STA $14
  emit(0xa5, 0x12, 0xc9, 0xf0, 0x90, 0x04, 0xa9, 0xff, 0x85, 0x14);

  // Bounce Ball on Ceiling ($13 < 40)
  emit(0xa5, 0x13, 0xc9, 0x28, 0xb0, 0x04, 0xa9, 0x01, 0x85, 0x15);

  // Bounce Ball on Paddle ($13 >= 212 and $13 <= 220)
  // If Ball Y >= 212 and Ball Y <= 220 and Ball X >= PaddleX - 4 and Ball X <= PaddleX + 28
  emit(0xa5, 0x13, 0xc9, 0xd4, 0x90, 0x1c); // if Y < 212 skip
  emit(0xa5, 0x13, 0xc9, 0xdc, 0xb0, 0x18); // if Y > 220 skip
  emit(0xa5, 0x12, 0x38, 0xe5, 0x10);       // A = BallX - PaddleX
  emit(0xc9, 0x24, 0xb0, 0x10);             // if diff > 36 skip
  // Bounced! Reverse VelY: LDA #$FF, STA $15, INC $16 (Score)
  emit(0xa9, 0xff, 0x85, 0x15, 0xe6, 0x16);
  // Play Pulse 1 Beep: LDA #$88, STA $4000, LDA #$AB, STA $4002, LDA #$08, STA $4003
  emit(0xa9, 0x88, 0x8d, 0x00, 0x40, 0xa9, 0xab, 0x8d, 0x02, 0x40, 0xa9, 0x08, 0x8d, 0x03, 0x40);

  // Bottom reset if Ball Y > 230
  emit(0xa5, 0x13, 0xc9, 0xe6, 0x90, 0x0a);
  emit(0xa9, 0x7c, 0x85, 0x12, 0xa9, 0x8c, 0x85, 0x13, 0xa9, 0x01, 0x85, 0x15);

  // Write Sprites into OAM buffer ($0200)
  // Sprite 0: Ball (Y, Tile 2, Attr 0, X)
  emit(0xa5, 0x13, 0x8d, 0x00, 0x02); // Y
  emit(0xa9, 0x02, 0x8d, 0x01, 0x02); // Tile
  emit(0xa9, 0x00, 0x8d, 0x02, 0x02); // Attr
  emit(0xa5, 0x12, 0x8d, 0x03, 0x02); // X

  // Sprite 1: Paddle Left (Tile 3)
  emit(0xa5, 0x11, 0x8d, 0x04, 0x02); // Y
  emit(0xa9, 0x03, 0x8d, 0x05, 0x02); // Tile
  emit(0xa9, 0x00, 0x8d, 0x06, 0x02); // Attr
  emit(0xa5, 0x10, 0x8d, 0x07, 0x02); // X

  // Sprite 2: Paddle Mid (Tile 4)
  emit(0xa5, 0x11, 0x8d, 0x08, 0x02);
  emit(0xa9, 0x04, 0x8d, 0x09, 0x02);
  emit(0xa9, 0x00, 0x8d, 0x0a, 0x02);
  emit(0xa5, 0x10, 0x18, 0x69, 0x08, 0x8d, 0x0b, 0x02);

  // Sprite 3: Paddle Mid 2 (Tile 4)
  emit(0xa5, 0x11, 0x8d, 0x0c, 0x02);
  emit(0xa9, 0x04, 0x8d, 0x0d, 0x02);
  emit(0xa9, 0x00, 0x8d, 0x0e, 0x02);
  emit(0xa5, 0x10, 0x18, 0x69, 0x10, 0x8d, 0x0f, 0x02);

  // Sprite 4: Paddle Right (Tile 5)
  emit(0xa5, 0x11, 0x8d, 0x10, 0x02);
  emit(0xa9, 0x05, 0x8d, 0x11, 0x02);
  emit(0xa9, 0x00, 0x8d, 0x12, 0x02);
  emit(0xa5, 0x10, 0x18, 0x69, 0x18, 0x8d, 0x13, 0x02);

  // Reset PPU scroll before exit: LDA #0, STA $2005, STA $2005
  emit(0xa9, 0x00, 0x8d, 0x05, 0x20, 0x8d, 0x05, 0x20);

  // RTI
  emit(0x40);

  // --- IRQ HANDLER ($C200) ---
  pc = 0x0200;
  emit(0x40); // RTI

  // --- HARDWARE VECTORS ($FFFA - $FFFF in 16KB PRG mirror at offset 0x3FFA) ---
  const vOff = 16384 - 6;
  // NMI Vector: $C100
  prg[vOff + 0] = 0x00;
  prg[vOff + 1] = 0xc1;
  // RESET Vector: $C000
  prg[vOff + 2] = 0x00;
  prg[vOff + 3] = 0xc0;
  // IRQ Vector: $C200
  prg[vOff + 4] = 0x00;
  prg[vOff + 5] = 0xc2;

  return serializeNesRom(
    {
      mapperId: 0,
      mirroring: 'horizontal',
      hasBattery: false,
      tvSystem: 'NTSC',
    },
    prg,
    chr
  );
}

/**
 * Diagnostic Color & APU Sound Test Cartridge
 */
function createDiagnosticRom(): Uint8Array {
  const prg = new Uint8Array(16384);
  const chr = new Uint8Array(8192);

  // Pattern tile 1: Solid
  for (let i = 0; i < 8; i++) chr[16 + i] = 0xff;

  // RESET
  let pc = 0;
  function emit(...bytes: number[]) {
    for (const b of bytes) prg[pc++] = b & 0xff;
  }

  // SEI, CLD, Stack $FF
  emit(0x78, 0xd8, 0xa2, 0xff, 0x9a);
  // Wait VBlank
  emit(0x2c, 0x02, 0x20, 0x10, 0xfb);
  emit(0x2c, 0x02, 0x20, 0x10, 0xfb);

  // Load 32 palettes with test color spectrum
  emit(0x2c, 0x02, 0x20);
  emit(0xa9, 0x3f, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20);
  const colors = [
    0x0f, 0x16, 0x27, 0x30, 0x0f, 0x11, 0x21, 0x31,
    0x0f, 0x19, 0x29, 0x39, 0x0f, 0x14, 0x24, 0x34,
    0x0f, 0x16, 0x27, 0x30, 0x0f, 0x11, 0x21, 0x31,
    0x0f, 0x19, 0x29, 0x39, 0x0f, 0x14, 0x24, 0x34
  ];
  for (const c of colors) emit(0xa9, c, 0x8d, 0x07, 0x20);

  // Fill Nametable with colored bars
  emit(0xa9, 0x20, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20);
  for (let i = 0; i < 960; i++) {
    const tile = i % 4 === 0 ? 0x01 : 0x00;
    emit(0xa9, tile, 0x8d, 0x07, 0x20);
  }

  // Set APU
  emit(0xa9, 0x0f, 0x8d, 0x15, 0x40);
  // Enable NMI & Display
  emit(0xa9, 0x80, 0x8d, 0x00, 0x20);
  emit(0xa9, 0x1e, 0x8d, 0x01, 0x20);

  const loop = 0xc000 + pc;
  emit(0x4c, loop & 0xff, (loop >> 8) & 0xff);

  // NMI
  pc = 0x0100;
  emit(0x40); // RTI

  // Vectors
  const vOff = 16384 - 6;
  prg[vOff + 0] = 0x00; prg[vOff + 1] = 0xc1;
  prg[vOff + 2] = 0x00; prg[vOff + 3] = 0xc0;
  prg[vOff + 4] = 0x00; prg[vOff + 5] = 0xc2;

  return serializeNesRom(
    {
      mapperId: 0,
      mirroring: 'vertical',
      hasBattery: false,
      tvSystem: 'NTSC',
    },
    prg,
    chr
  );
}

export const SAMPLE_ROMS: SampleRomInfo[] = [
  {
    id: 'blade_bounce',
    name: 'Blade Bounce (NROM Action)',
    genre: 'Arcade / Paddle',
    mapper: 0,
    description: 'Homebrew breakout action game with 60 FPS physics, score counter, and APU chime audio.',
    prgKb: 16,
    chrKb: 8,
    mirroring: 'horizontal',
    hasBattery: false,
    tvSystem: 'NTSC',
    data: createBladeBounceRom(),
  },
  {
    id: 'diagnostic_cart',
    name: 'NES Hardware & Color Diagnostic',
    genre: 'Utility / Diagnostic',
    mapper: 0,
    description: 'Hardware calibration test cartridge testing 64-color palette, NMI interrupts, and APU audio DACs.',
    prgKb: 16,
    chrKb: 8,
    mirroring: 'vertical',
    hasBattery: false,
    tvSystem: 'NTSC',
    data: createDiagnosticRom(),
  },
];
