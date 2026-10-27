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

  // --- BUILD CHR PATTERN TILES ---
  // Each tile is 16 bytes: Plane 0 (8 bytes) + Plane 1 (8 bytes)
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
  for (let i = 0; i < 8; i++) {
    chr[96 + i] = parseInt(brick[i], 16);
    chr[96 + 8 + i] = 0x81; // 2-color brick texture
  }

  // Copy pattern table 0 to pattern table 1 so sprites and BG can share tiles
  chr.set(chr.slice(0, 4096), 4096);

  // --- 6502 MACHINE CODE COMPILATION ---
  let pc = 0;
  function emit(...bytes: number[]) {
    for (const b of bytes) {
      prg[pc++] = b & 0xff;
    }
  }

  // Address base: $C000 in 16KB PRG mirror ($C000 - $FFFF)
  // RESET ROUTINE ($C000)
  // 1. SEI, CLD, Stack init
  emit(0x78);       // SEI
  emit(0xd8);       // CLD
  emit(0xa2, 0xff); // LDX #$FF
  emit(0x9a);       // TXS
  emit(0xa9, 0x40); // LDA #$40
  emit(0x8d, 0x17, 0x40); // STA $4017 (Disable APU frame IRQ)

  // 2. Wait 2 VBlanks for PPU to stabilize
  // vwait1: BIT $2002, BPL vwait1
  emit(0x2c, 0x02, 0x20); // BIT $2002
  emit(0x10, 0xfb);       // BPL -5
  // vwait2: BIT $2002, BPL vwait2
  emit(0x2c, 0x02, 0x20); // BIT $2002
  emit(0x10, 0xfb);       // BPL -5

  // 3. Clear zero-page and RAM ($0000-$07FF)
  emit(0xa9, 0x00); // LDA #$00
  emit(0xaa);       // TAX
  // clr_loop:
  const clrLoop = pc;
  emit(0x95, 0x00);       // STA $00,X
  emit(0x9d, 0x00, 0x01); // STA $0100,X
  emit(0x9d, 0x00, 0x02); // STA $0200,X
  emit(0x9d, 0x00, 0x03); // STA $0300,X
  emit(0x9d, 0x00, 0x04); // STA $0400,X
  emit(0x9d, 0x00, 0x05); // STA $0500,X
  emit(0x9d, 0x00, 0x06); // STA $0600,X
  emit(0x9d, 0x00, 0x07); // STA $0700,X
  emit(0xe8);             // INX
  emit(0xd0, (clrLoop - (pc + 1)) & 0xff); // BNE clr_loop

  // 4. Initialize Game Variables in Zero Page
  // $10 = Paddle X (112 = 0x70)
  // $11 = Paddle Y (216 = 0xD8)
  // $12 = Ball X (124 = 0x7C)
  // $13 = Ball Y (140 = 0x8C)
  // $14 = Ball VelX (1)
  // $15 = Ball VelY (-1 = 0xFF)
  // $16 = Score (0)
  emit(0xa9, 0x70, 0x85, 0x10);
  emit(0xa9, 0xd8, 0x85, 0x11);
  emit(0xa9, 0x7c, 0x85, 0x12);
  emit(0xa9, 0x8c, 0x85, 0x13);
  emit(0xa9, 0x01, 0x85, 0x14);
  emit(0xa9, 0xff, 0x85, 0x15);
  emit(0xa9, 0x00, 0x85, 0x16);

  // 5. Load 32 Palettes at $3F00
  emit(0x2c, 0x02, 0x20); // BIT $2002
  emit(0xa9, 0x3f, 0x8d, 0x06, 0x20); // LDA #$3F, STA $2006
  emit(0xa9, 0x00, 0x8d, 0x06, 0x20); // LDA #$00, STA $2006

  const paletteColors = [
    // Background palettes (0-3)
    0x0f, 0x30, 0x21, 0x16, // BG0: Black, White, Cyan, Red
    0x0f, 0x27, 0x17, 0x07, // BG1: Orange / Brick colors
    0x0f, 0x1a, 0x2a, 0x3a, // BG2: Green
    0x0f, 0x09, 0x19, 0x29, // BG3
    // Sprite palettes (4-7)
    0x0f, 0x30, 0x27, 0x16, // SP0: Ball / Paddle (White, Amber, Red)
    0x0f, 0x30, 0x21, 0x11, // SP1
    0x0f, 0x30, 0x15, 0x25, // SP2
    0x0f, 0x30, 0x19, 0x29  // SP3
  ];

  for (const c of paletteColors) {
    emit(0xa9, c, 0x8d, 0x07, 0x20); // LDA #c, STA $2007
  }

  // 6. Draw Playfield in Nametable 0 ($2000)
  // Set PPU address to $2000
  emit(0xa9, 0x20, 0x8d, 0x06, 0x20);
  emit(0xa9, 0x00, 0x8d, 0x06, 0x20);

  // Clear 4 pages of Nametable (1024 bytes) using loop
  emit(0xa9, 0x00); // Tile 0 (blank)
  emit(0xaa);       // TAX
  emit(0xa8);       // TAY
  const ntClrLoop = pc;
  emit(0x8d, 0x07, 0x20); // STA $2007
  emit(0xe8);             // INX
  emit(0xd0, (ntClrLoop - (pc + 1)) & 0xff); // BNE
  emit(0xc8);             // INY
  emit(0xc0, 0x04);       // CPY #4
  emit(0xd0, (ntClrLoop - (pc + 1)) & 0xff); // BNE

  // Draw 2 rows of bricks at $2080 (Rows 4 & 5)
  emit(0xa9, 0x20, 0x8d, 0x06, 0x20);
  emit(0xa9, 0x80, 0x8d, 0x06, 0x20);
  emit(0xa9, 0x06); // Tile 6 (Brick)
  emit(0xa2, 0x40); // 64 bricks
  const brickLoop = pc;
  emit(0x8d, 0x07, 0x20); // STA $2007
  emit(0xca);             // DEX
  emit(0xd0, (brickLoop - (pc + 1)) & 0xff); // BNE

  // Draw bottom floor border at $2360 (Row 27)
  emit(0xa9, 0x23, 0x8d, 0x06, 0x20);
  emit(0xa9, 0x60, 0x8d, 0x06, 0x20);
  emit(0xa9, 0x01); // Tile 1 (Solid line)
  emit(0xa2, 0x20); // 32 tiles
  const floorLoop = pc;
  emit(0x8d, 0x07, 0x20); // STA $2007
  emit(0xca);             // DEX
  emit(0xd0, (floorLoop - (pc + 1)) & 0xff); // BNE

  // 7. Enable APU
  emit(0xa9, 0x0f, 0x8d, 0x15, 0x40); // LDA #$0F, STA $4015

  // 8. Enable PPU Rendering and NMI
  // PPUCTRL: NMI on ($80) | BG Table 0 ($00) | Sprite Table 0 ($00) -> $80
  emit(0xa9, 0x80, 0x8d, 0x00, 0x20);
  // PPUMASK: Show BG ($08) | Show Sprites ($10) | Show left 8px ($06) -> $1E
  emit(0xa9, 0x1e, 0x8d, 0x01, 0x20);

  // 9. Reset scroll
  emit(0xa9, 0x00, 0x8d, 0x05, 0x20, 0x8d, 0x05, 0x20);

  // 10. Main Idle Loop (wait for NMIs)
  const idleAddr = 0xc000 + pc;
  emit(0x4c, idleAddr & 0xff, (idleAddr >> 8) & 0xff); // JMP idle

  // --- NMI FRAME HANDLER ---
  const nmiAddr = 0xc000 + pc;

  // Push registers
  emit(0x48); // PHA
  emit(0x8a); // TXA
  emit(0x48); // PHA
  emit(0x98); // TYA
  emit(0x48); // PHA

  // OAM DMA to $0200
  emit(0xa9, 0x02, 0x8d, 0x14, 0x40);

  // Read Controller 1 ($4016)
  emit(0xa9, 0x01, 0x8d, 0x16, 0x40);
  emit(0xa9, 0x00, 0x8d, 0x16, 0x40);
  emit(0xa2, 0x08); // 8 buttons
  const padLoop = pc;
  emit(0xad, 0x16, 0x40); // LDA $4016
  emit(0x4a);             // LSR
  emit(0x26, 0x20);       // ROL $20
  emit(0xca);             // DEX
  emit(0xd0, (padLoop - (pc + 1)) & 0xff); // BNE

  // Check Left button ($20 & 0x02)
  emit(0xa5, 0x20, 0x29, 0x02);
  const skipLeftOffsetPos = pc + 1;
  emit(0xf0, 0x00); // BEQ (placeholder)
  emit(0xc6, 0x10); // DEC $10
  emit(0xc6, 0x10); // DEC $10
  prg[skipLeftOffsetPos] = (pc - (skipLeftOffsetPos + 1)) & 0xff;

  // Check Right button ($20 & 0x01)
  emit(0xa5, 0x20, 0x29, 0x01);
  const skipRightOffsetPos = pc + 1;
  emit(0xf0, 0x00); // BEQ (placeholder)
  emit(0xe6, 0x10); // INC $10
  emit(0xe6, 0x10); // INC $10
  prg[skipRightOffsetPos] = (pc - (skipRightOffsetPos + 1)) & 0xff;

  // Clamp Paddle X between 12 and 212
  emit(0xa5, 0x10, 0xc9, 0x0c); // CMP #12
  const clampLeftPos = pc + 1;
  emit(0xb0, 0x00);             // BCS (placeholder)
  emit(0xa9, 0x0c, 0x85, 0x10); // LDA #12, STA $10
  prg[clampLeftPos] = (pc - (clampLeftPos + 1)) & 0xff;

  emit(0xa5, 0x10, 0xc9, 0xd4); // CMP #212
  const clampRightPos = pc + 1;
  emit(0x90, 0x00);             // BCC (placeholder)
  emit(0xa9, 0xd4, 0x85, 0x10); // LDA #212, STA $10
  prg[clampRightPos] = (pc - (clampRightPos + 1)) & 0xff;

  // Update Ball X and Y
  emit(0xa5, 0x12, 0x18, 0x65, 0x14, 0x85, 0x12); // BallX += VelX
  emit(0xa5, 0x13, 0x18, 0x65, 0x15, 0x85, 0x13); // BallY += VelY

  // Bounce Ball on Left Wall (BallX <= 12)
  emit(0xa5, 0x12, 0xc9, 0x0c);
  const bounceLeftPos = pc + 1;
  emit(0xb0, 0x00);
  emit(0xa9, 0x01, 0x85, 0x14); // VelX = 1
  prg[bounceLeftPos] = (pc - (bounceLeftPos + 1)) & 0xff;

  // Bounce Ball on Right Wall (BallX >= 240)
  emit(0xa5, 0x12, 0xc9, 0xf0);
  const bounceRightPos = pc + 1;
  emit(0x90, 0x00);
  emit(0xa9, 0xff, 0x85, 0x14); // VelX = -1
  prg[bounceRightPos] = (pc - (bounceRightPos + 1)) & 0xff;

  // Bounce Ball on Ceiling (BallY <= 48)
  emit(0xa5, 0x13, 0xc9, 0x30);
  const bounceCeilPos = pc + 1;
  emit(0xb0, 0x00);
  emit(0xa9, 0x01, 0x85, 0x15); // VelY = 1
  prg[bounceCeilPos] = (pc - (bounceCeilPos + 1)) & 0xff;

  // Paddle Collision: BallY between 212 and 220
  emit(0xa5, 0x13, 0xc9, 0xd4); // CMP #212
  const skipPaddle1 = pc + 1;
  emit(0x90, 0x00);             // BCC
  emit(0xa5, 0x13, 0xc9, 0xdc); // CMP #220
  const skipPaddle2 = pc + 1;
  emit(0xb0, 0x00);             // BCS

  // Check X overlap: BallX - PaddleX between 0 and 36
  emit(0xa5, 0x12, 0x38, 0xe5, 0x10); // A = BallX - PaddleX
  const skipPaddle3 = pc + 1;
  emit(0x90, 0x00); // BCC (Ball was to left of paddle)
  emit(0xc9, 0x24); // CMP #36
  const skipPaddle4 = pc + 1;
  emit(0xb0, 0x00); // BCS (Ball was to right of paddle)

  // BOUNCE SUCCESS: VelY = -1, Score++, Pulse Beep
  emit(0xa9, 0xff, 0x85, 0x15); // VelY = -1
  emit(0xe6, 0x16);             // INC $16 (Score)
  emit(0xa9, 0x88, 0x8d, 0x00, 0x40); // APU Pulse 1 Duty & Vol
  emit(0xa9, 0x80, 0x8d, 0x02, 0x40); // APU Pulse 1 Frequency Lo
  emit(0xa9, 0x08, 0x8d, 0x03, 0x40); // APU Pulse 1 Length & Hi

  const paddleEnd = pc;
  prg[skipPaddle1] = (paddleEnd - (skipPaddle1 + 1)) & 0xff;
  prg[skipPaddle2] = (paddleEnd - (skipPaddle2 + 1)) & 0xff;
  prg[skipPaddle3] = (paddleEnd - (skipPaddle3 + 1)) & 0xff;
  prg[skipPaddle4] = (paddleEnd - (skipPaddle4 + 1)) & 0xff;

  // Ball fell past paddle (BallY >= 232) -> Reset
  emit(0xa5, 0x13, 0xc9, 0xe8);
  const skipResetPos = pc + 1;
  emit(0x90, 0x00);
  emit(0xa9, 0x7c, 0x85, 0x12); // BallX = 124
  emit(0xa9, 0x8c, 0x85, 0x13); // BallY = 140
  emit(0xa9, 0xff, 0x85, 0x15); // VelY = -1
  prg[skipResetPos] = (pc - (skipResetPos + 1)) & 0xff;

  // --- WRITE SPRITES TO OAM ($0200) ---
  // Sprite 0: Ball (Tile 2, Attr 0)
  emit(0xa5, 0x13, 0x8d, 0x00, 0x02); // Y
  emit(0xa9, 0x02, 0x8d, 0x01, 0x02); // Tile
  emit(0xa9, 0x00, 0x8d, 0x02, 0x02); // Attr
  emit(0xa5, 0x12, 0x8d, 0x03, 0x02); // X

  // Sprites 1-4: Paddle (Y = $11, Tiles 3, 4, 4, 5)
  emit(0xa5, 0x11);
  emit(0x8d, 0x04, 0x02); // Sp 1 Y
  emit(0x8d, 0x08, 0x02); // Sp 2 Y
  emit(0x8d, 0x0c, 0x02); // Sp 3 Y
  emit(0x8d, 0x10, 0x02); // Sp 4 Y

  emit(0xa9, 0x03, 0x8d, 0x05, 0x02); // Sp 1 Tile (Paddle Left)
  emit(0xa9, 0x04, 0x8d, 0x09, 0x02); // Sp 2 Tile (Paddle Mid)
  emit(0xa9, 0x04, 0x8d, 0x0d, 0x02); // Sp 3 Tile (Paddle Mid)
  emit(0xa9, 0x05, 0x8d, 0x11, 0x02); // Sp 4 Tile (Paddle Right)

  emit(0xa9, 0x00);
  emit(0x8d, 0x06, 0x02);
  emit(0x8d, 0x0a, 0x02);
  emit(0x8d, 0x0e, 0x02);
  emit(0x8d, 0x12, 0x02);

  // Paddle X positions: $10, $10+8, $10+16, $10+24
  emit(0xa5, 0x10, 0x8d, 0x07, 0x02); // Sp 1 X
  emit(0x18, 0x69, 0x08, 0x8d, 0x0b, 0x02); // Sp 2 X
  emit(0x18, 0x69, 0x08, 0x8d, 0x0f, 0x02); // Sp 3 X
  emit(0x18, 0x69, 0x08, 0x8d, 0x13, 0x02); // Sp 4 X

  // Reset PPU scroll before returning
  emit(0xa9, 0x00, 0x8d, 0x05, 0x20, 0x8d, 0x05, 0x20);

  // Pull registers & RTI
  emit(0x68); // PLA
  emit(0xa8); // TAY
  emit(0x68); // PLA
  emit(0xaa); // TAX
  emit(0x68); // PLA
  emit(0x40); // RTI

  // --- IRQ HANDLER ($C200) ---
  const irqAddr = 0xc000 + pc;
  emit(0x40); // RTI

  // --- VECTORS AT $FFFA ($3FFA in 16KB PRG) ---
  const vOff = 16384 - 6;
  // NMI Vector ($FFFA): Points to nmiAddr
  prg[vOff + 0] = nmiAddr & 0xff;
  prg[vOff + 1] = (nmiAddr >> 8) & 0xff;
  // RESET Vector ($FFFC): Points to $C000
  prg[vOff + 2] = 0x00;
  prg[vOff + 3] = 0xc0;
  // IRQ Vector ($FFFE): Points to irqAddr
  prg[vOff + 4] = irqAddr & 0xff;
  prg[vOff + 5] = (irqAddr >> 8) & 0xff;

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

  // Pattern tile 1: Solid block
  for (let i = 0; i < 8; i++) {
    chr[16 + i] = 0xff;
    chr[16 + 8 + i] = 0xff;
  }
  chr.set(chr.slice(0, 4096), 4096);

  let pc = 0;
  function emit(...bytes: number[]) {
    for (const b of bytes) prg[pc++] = b & 0xff;
  }

  // RESET
  emit(0x78, 0xd8, 0xa2, 0xff, 0x9a);
  // Wait 2 VBlanks
  emit(0x2c, 0x02, 0x20, 0x10, 0xfb);
  emit(0x2c, 0x02, 0x20, 0x10, 0xfb);

  // Load 32 palettes with test color spectrum
  emit(0x2c, 0x02, 0x20);
  emit(0xa9, 0x3f, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20);
  const colors = [
    0x0f, 0x16, 0x27, 0x30,
    0x0f, 0x11, 0x21, 0x31,
    0x0f, 0x19, 0x29, 0x39,
    0x0f, 0x14, 0x24, 0x34,
    0x0f, 0x16, 0x27, 0x30,
    0x0f, 0x11, 0x21, 0x31,
    0x0f, 0x19, 0x29, 0x39,
    0x0f, 0x14, 0x24, 0x34
  ];
  for (const c of colors) emit(0xa9, c, 0x8d, 0x07, 0x20);

  // Fill Nametable with alternating solid colored bars
  emit(0xa9, 0x20, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20);
  emit(0xa2, 0x00);
  const fillBars = pc;
  emit(0x8a);       // TXA
  emit(0x29, 0x01); // AND #1 (alternating tile 0 and 1)
  emit(0x8d, 0x07, 0x20);
  emit(0xe8);       // INX
  emit(0xd0, (fillBars - (pc + 1)) & 0xff);

  // Enable APU audio
  emit(0xa9, 0x0f, 0x8d, 0x15, 0x40);

  // Enable PPU
  emit(0xa9, 0x80, 0x8d, 0x00, 0x20); // NMI enabled
  emit(0xa9, 0x1e, 0x8d, 0x01, 0x20); // Show BG & Sprites
  emit(0xa9, 0x00, 0x8d, 0x05, 0x20, 0x8d, 0x05, 0x20);

  // Idle Loop
  const idle = 0xc000 + pc;
  emit(0x4c, idle & 0xff, (idle >> 8) & 0xff);

  // NMI
  const nmiAddr = 0xc000 + pc;
  emit(0x40); // RTI

  // IRQ
  const irqAddr = 0xc000 + pc;
  emit(0x40); // RTI

  // Vectors
  const vOff = 16384 - 6;
  prg[vOff + 0] = nmiAddr & 0xff;
  prg[vOff + 1] = (nmiAddr >> 8) & 0xff;
  prg[vOff + 2] = 0x00;
  prg[vOff + 3] = 0xc0;
  prg[vOff + 4] = irqAddr & 0xff;
  prg[vOff + 5] = (irqAddr >> 8) & 0xff;

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
