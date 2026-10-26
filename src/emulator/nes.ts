/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NesRomData } from '../types/nes';
import { Cpu6502, CpuBus } from './cpu6502';
import { Ppu, PpuBus } from './ppu';
import { Apu } from './apu';
import { IMapper, createMapper } from './mappers';

export interface ControllerState {
  a: boolean;
  b: boolean;
  select: boolean;
  start: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export class NesSystem implements CpuBus, PpuBus {
  public cpu: Cpu6502;
  public ppu: Ppu;
  public apu: Apu;
  public mapper: IMapper;

  // 2KB NES Internal Work RAM ($0000 - $07FF, mirrored up to $1FFF)
  public ram: Uint8Array = new Uint8Array(2048);

  // 2KB Nametable VRAM ($2000 - $2FFF)
  public vram: Uint8Array = new Uint8Array(2048);

  // Controller inputs
  public controller1: ControllerState = {
    a: false, b: false, select: false, start: false, up: false, down: false, left: false, right: false
  };
  private controller1Latch: number = 0;
  private controller1Shift: number = 0;

  // Saved state snapshot buffer
  private savedState: string | null = null;

  constructor(rom: NesRomData) {
    this.mapper = createMapper(
      rom.header.mapperId,
      rom.prgRom,
      rom.chrRom,
      rom.header.mirroring
    );
    this.cpu = new Cpu6502(this);
    this.ppu = new Ppu(this);
    this.apu = new Apu();
    this.reset();
  }

  public reset(): void {
    this.ram.fill(0);
    this.vram.fill(0);
    this.ppu.reset();
    this.apu.reset();
    this.cpu.reset();
  }

  // --- CPU BUS READ / WRITE ---
  public read(address: number): number {
    address &= 0xffff;

    // $0000 - $1FFF: 2KB RAM mirrored
    if (address < 0x2000) {
      return this.ram[address & 0x07ff];
    }
    // $2000 - $3FFF: PPU registers mirrored every 8 bytes
    else if (address < 0x4000) {
      return this.ppu.readRegister(0x2000 + (address & 0x07));
    }
    // $4000 - $4017: APU and I/O registers
    else if (address < 0x4018) {
      if (address === 0x4016) {
        // Controller 1 read
        const bit = (this.controller1Shift & 0x80) ? 1 : 0;
        this.controller1Shift = (this.controller1Shift << 1) & 0xff;
        return 0x40 | bit;
      }
      return 0;
    }
    // $4018 - $5FFF: Cartridge expansion
    else if (address < 0x6000) {
      return 0;
    }
    // $6000 - $FFFF: Cartridge PRG-RAM / PRG-ROM via Mapper
    else {
      return this.mapper.readPrg(address);
    }
  }

  public write(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;

    if (address < 0x2000) {
      this.ram[address & 0x07ff] = value;
    } else if (address < 0x4000) {
      this.ppu.writeRegister(0x2000 + (address & 0x07), value);
    } else if (address === 0x4014) {
      // OAM DMA copy 256 bytes from CPU address ($XX00) to PPU OAM
      const base = value << 8;
      for (let i = 0; i < 256; i++) {
        this.ppu.oam[this.ppu.oamAddr] = this.read(base + i);
        this.ppu.oamAddr = (this.ppu.oamAddr + 1) & 0xff;
      }
    } else if (address === 0x4016) {
      // Controller Strobe
      const prevLatch = this.controller1Latch;
      this.controller1Latch = value & 1;
      if (prevLatch === 1 && this.controller1Latch === 0) {
        // Snapshot controller 1 button state: A, B, Select, Start, Up, Down, Left, Right
        let state = 0;
        if (this.controller1.a) state |= 0x80;
        if (this.controller1.b) state |= 0x40;
        if (this.controller1.select) state |= 0x20;
        if (this.controller1.start) state |= 0x10;
        if (this.controller1.up) state |= 0x08;
        if (this.controller1.down) state |= 0x04;
        if (this.controller1.left) state |= 0x02;
        if (this.controller1.right) state |= 0x01;
        this.controller1Shift = state;
      }
    } else if (address >= 0x4000 && address <= 0x4017) {
      this.apu.writeRegister(address, value);
    } else if (address >= 0x6000) {
      this.mapper.writePrg(address, value);
    }
  }

  // --- PPU BUS IMPLEMENTATION ---
  public readChr(addr: number): number {
    return this.mapper.readChr(addr);
  }

  public writeChr(addr: number, val: number): void {
    this.mapper.writeChr(addr, val);
  }

  public readNametable(addr: number): number {
    const vramAddr = this.mirrorNametable(addr);
    return this.vram[vramAddr & 0x07ff];
  }

  public writeNametable(addr: number, val: number): void {
    const vramAddr = this.mirrorNametable(addr);
    this.vram[vramAddr & 0x07ff] = val;
  }

  public triggerNmi(): void {
    this.cpu.triggerNmi();
  }

  private mirrorNametable(addr: number): number {
    const normalized = (addr - 0x2000) & 0x0fff;
    const table = Math.floor(normalized / 0x0400);
    const offset = normalized & 0x03ff;
    const mode = this.mapper.getMirroring();

    if (mode === 'vertical') {
      // Table 0 & 2 mapped to 0, Table 1 & 3 mapped to 1
      return (table & 1) * 0x400 + offset;
    } else if (mode === 'horizontal') {
      // Table 0 & 1 mapped to 0, Table 2 & 3 mapped to 1
      return (table >= 2 ? 1 : 0) * 0x400 + offset;
    } else if (mode === 'single-screen-lower') {
      return offset;
    } else if (mode === 'single-screen-upper') {
      return 0x400 + offset;
    }
    return offset;
  }

  /**
   * Runs the system for 1 complete video frame (~29780 CPU cycles on NTSC).
   */
  public stepFrame(): void {
    const cyclesPerFrame = 29780;
    let cyclesDone = 0;

    while (cyclesDone < cyclesPerFrame) {
      const step = this.cpu.step();
      this.ppu.step(step);
      cyclesDone += step;

      // Scanline IRQ for Mapper 4 (MMC3)
      if (this.mapper.stepScanline && this.ppu.scanline < 240 && this.ppu.cycle === 260) {
        if (this.mapper.stepScanline()) {
          this.cpu.triggerIrq();
        }
      }
    }
  }

  // Save / Load state
  public saveState(): void {
    const stateObj = {
      cpu: {
        a: this.cpu.a, x: this.cpu.x, y: this.cpu.y, pc: this.cpu.pc, sp: this.cpu.sp,
        c: this.cpu.flagC, z: this.cpu.flagZ, i: this.cpu.flagI, d: this.cpu.flagD,
        v: this.cpu.flagV, n: this.cpu.flagN,
      },
      ram: Array.from(this.ram),
      vram: Array.from(this.vram),
      oam: Array.from(this.ppu.oam),
      palette: Array.from(this.ppu.palette),
    };
    this.savedState = JSON.stringify(stateObj);
  }

  public loadState(): boolean {
    if (!this.savedState) return false;
    try {
      const s = JSON.parse(this.savedState);
      this.cpu.a = s.cpu.a;
      this.cpu.x = s.cpu.x;
      this.cpu.y = s.cpu.y;
      this.cpu.pc = s.cpu.pc;
      this.cpu.sp = s.cpu.sp;
      this.cpu.flagC = s.cpu.c;
      this.cpu.flagZ = s.cpu.z;
      this.cpu.flagI = s.cpu.i;
      this.cpu.flagD = s.cpu.d;
      this.cpu.flagV = s.cpu.v;
      this.cpu.flagN = s.cpu.n;
      this.ram.set(s.ram);
      this.vram.set(s.vram);
      this.ppu.oam.set(s.oam);
      this.ppu.palette.set(s.palette);
      return true;
    } catch {
      return false;
    }
  }
}
