/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MirroringType } from '../types/nes';

export interface IMapper {
  readPrg(addr: number): number;
  writePrg(addr: number, val: number): void;
  readChr(addr: number): number;
  writeChr(addr: number, val: number): void;
  getMirroring(): MirroringType;
  stepScanline?(): boolean; // Returns true if IRQ should fire
}

/**
 * Mapper 0: NROM
 */
export class Mapper0 implements IMapper {
  private prgRom: Uint8Array;
  private chrRom: Uint8Array;
  private chrRam: Uint8Array;
  private prgRam: Uint8Array = new Uint8Array(8192);
  private mirroring: MirroringType;

  constructor(prgRom: Uint8Array, chrRom: Uint8Array, mirroring: MirroringType) {
    this.prgRom = prgRom;
    this.chrRom = chrRom;
    this.chrRam = new Uint8Array(8192);
    this.mirroring = mirroring;
  }

  public readPrg(addr: number): number {
    if (addr >= 0x8000) {
      const offset = (addr - 0x8000) % this.prgRom.length;
      return this.prgRom[offset];
    } else if (addr >= 0x6000) {
      return this.prgRam[addr - 0x6000];
    }
    return 0;
  }

  public writePrg(addr: number, val: number): void {
    if (addr >= 0x6000 && addr < 0x8000) {
      this.prgRam[addr - 0x6000] = val;
    }
  }

  public readChr(addr: number): number {
    if (this.chrRom.length > 0) {
      return this.chrRom[addr % this.chrRom.length];
    }
    return this.chrRam[addr & 0x1fff];
  }

  public writeChr(addr: number, val: number): void {
    if (this.chrRom.length === 0) {
      this.chrRam[addr & 0x1fff] = val;
    }
  }

  public getMirroring(): MirroringType {
    return this.mirroring;
  }
}

/**
 * Mapper 1: MMC1
 */
export class Mapper1 implements IMapper {
  private prgRom: Uint8Array;
  private chrRom: Uint8Array;
  private chrRam: Uint8Array;
  private prgRam: Uint8Array = new Uint8Array(8192);
  private mirroring: MirroringType;

  private shiftReg: number = 0x10;
  private ctrl: number = 0x0c;
  private chrBank0: number = 0;
  private chrBank1: number = 0;
  private prgBank: number = 0;

  constructor(prgRom: Uint8Array, chrRom: Uint8Array, mirroring: MirroringType) {
    this.prgRom = prgRom;
    this.chrRom = chrRom;
    this.chrRam = new Uint8Array(8192);
    this.mirroring = mirroring;
  }

  public readPrg(addr: number): number {
    if (addr >= 0x6000 && addr < 0x8000) {
      return this.prgRam[addr - 0x6000];
    }
    if (addr >= 0x8000) {
      const prgMode = (this.ctrl >> 2) & 0x03;
      const num16kBanks = Math.floor(this.prgRom.length / 16384);
      let bank = 0;

      if (prgMode === 0 || prgMode === 1) {
        // 32KB mode
        const bank32 = (this.prgBank & 0x0e) % Math.floor(this.prgRom.length / 32768);
        return this.prgRom[bank32 * 32768 + (addr - 0x8000)];
      } else if (prgMode === 2) {
        // Fix first bank at $8000, switch $C000
        if (addr < 0xc000) {
          bank = 0;
          return this.prgRom[bank * 16384 + (addr - 0x8000)];
        } else {
          bank = this.prgBank % num16kBanks;
          return this.prgRom[bank * 16384 + (addr - 0xc000)];
        }
      } else {
        // Switch $8000, fix last bank at $C000
        if (addr < 0xc000) {
          bank = this.prgBank % num16kBanks;
          return this.prgRom[bank * 16384 + (addr - 0x8000)];
        } else {
          bank = num16kBanks - 1;
          return this.prgRom[bank * 16384 + (addr - 0xc000)];
        }
      }
    }
    return 0;
  }

  public writePrg(addr: number, val: number): void {
    if (addr >= 0x6000 && addr < 0x8000) {
      this.prgRam[addr - 0x6000] = val;
      return;
    }
    if (addr < 0x8000) return;

    // Reset if bit 7 set
    if (val & 0x80) {
      this.shiftReg = 0x10;
      this.ctrl |= 0x0c;
      return;
    }

    const full = this.shiftReg & 1;
    this.shiftReg = (this.shiftReg >> 1) | ((val & 1) << 4);

    if (full) {
      const reg = (addr >> 13) & 0x03;
      const data = this.shiftReg;
      this.shiftReg = 0x10;

      switch (reg) {
        case 0: // Control
          this.ctrl = data;
          const mir = data & 0x03;
          if (mir === 0) this.mirroring = 'single-screen-lower';
          else if (mir === 1) this.mirroring = 'single-screen-upper';
          else if (mir === 2) this.mirroring = 'vertical';
          else this.mirroring = 'horizontal';
          break;
        case 1: // CHR bank 0
          this.chrBank0 = data;
          break;
        case 2: // CHR bank 1
          this.chrBank1 = data;
          break;
        case 3: // PRG bank
          this.prgBank = data & 0x0f;
          break;
      }
    }
  }

  public readChr(addr: number): number {
    if (this.chrRom.length === 0) {
      return this.chrRam[addr & 0x1fff];
    }
    const chrMode = (this.ctrl & 0x10) !== 0;
    const num4kBanks = Math.floor(this.chrRom.length / 4096);
    if (!chrMode) {
      // 8KB mode
      const bank = (this.chrBank0 & ~1) % Math.floor(this.chrRom.length / 8192);
      return this.chrRom[bank * 8192 + (addr & 0x1fff)];
    } else {
      // 4KB mode
      if (addr < 0x1000) {
        const bank = this.chrBank0 % num4kBanks;
        return this.chrRom[bank * 4096 + addr];
      } else {
        const bank = this.chrBank1 % num4kBanks;
        return this.chrRom[bank * 4096 + (addr - 0x1000)];
      }
    }
  }

  public writeChr(addr: number, val: number): void {
    if (this.chrRom.length === 0) {
      this.chrRam[addr & 0x1fff] = val;
    }
  }

  public getMirroring(): MirroringType {
    return this.mirroring;
  }
}

/**
 * Mapper 2: UxROM
 */
export class Mapper2 implements IMapper {
  private prgRom: Uint8Array;
  private chrRom: Uint8Array;
  private chrRam: Uint8Array = new Uint8Array(8192);
  private mirroring: MirroringType;
  private selectedBank: number = 0;

  constructor(prgRom: Uint8Array, chrRom: Uint8Array, mirroring: MirroringType) {
    this.prgRom = prgRom;
    this.chrRom = chrRom;
    this.mirroring = mirroring;
  }

  public readPrg(addr: number): number {
    const numBanks = Math.floor(this.prgRom.length / 16384);
    if (addr >= 0x8000 && addr < 0xc000) {
      const bank = this.selectedBank % numBanks;
      return this.prgRom[bank * 16384 + (addr - 0x8000)];
    } else if (addr >= 0xc000) {
      const lastBank = numBanks - 1;
      return this.prgRom[lastBank * 16384 + (addr - 0xc000)];
    }
    return 0;
  }

  public writePrg(_addr: number, val: number): void {
    this.selectedBank = val & 0x0f;
  }

  public readChr(addr: number): number {
    if (this.chrRom.length > 0) return this.chrRom[addr % this.chrRom.length];
    return this.chrRam[addr & 0x1fff];
  }

  public writeChr(addr: number, val: number): void {
    if (this.chrRom.length === 0) this.chrRam[addr & 0x1fff] = val;
  }

  public getMirroring(): MirroringType {
    return this.mirroring;
  }
}

/**
 * Mapper 3: CNROM
 */
export class Mapper3 implements IMapper {
  private prgRom: Uint8Array;
  private chrRom: Uint8Array;
  private mirroring: MirroringType;
  private chrBank: number = 0;

  constructor(prgRom: Uint8Array, chrRom: Uint8Array, mirroring: MirroringType) {
    this.prgRom = prgRom;
    this.chrRom = chrRom;
    this.mirroring = mirroring;
  }

  public readPrg(addr: number): number {
    return this.prgRom[(addr - 0x8000) % this.prgRom.length];
  }

  public writePrg(_addr: number, val: number): void {
    this.chrBank = val & 0x03;
  }

  public readChr(addr: number): number {
    const bank = this.chrBank % Math.floor(this.chrRom.length / 8192);
    return this.chrRom[bank * 8192 + (addr & 0x1fff)];
  }

  public writeChr(): void {}

  public getMirroring(): MirroringType {
    return this.mirroring;
  }
}

/**
 * Mapper 4: MMC3
 */
export class Mapper4 implements IMapper {
  private prgRom: Uint8Array;
  private chrRom: Uint8Array;
  private chrRam: Uint8Array = new Uint8Array(8192);
  private prgRam: Uint8Array = new Uint8Array(8192);
  private mirroring: MirroringType;

  private bankSelect: number = 0;
  private registers: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private irqLatch: number = 0;
  private irqCounter: number = 0;
  private irqEnabled: boolean = false;

  constructor(prgRom: Uint8Array, chrRom: Uint8Array, mirroring: MirroringType) {
    this.prgRom = prgRom;
    this.chrRom = chrRom;
    this.mirroring = mirroring;
  }

  public readPrg(addr: number): number {
    if (addr >= 0x6000 && addr < 0x8000) return this.prgRam[addr - 0x6000];
    if (addr >= 0x8000) {
      const num8kBanks = Math.floor(this.prgRom.length / 8192);
      const prgMode = (this.bankSelect & 0x40) !== 0;
      let bank = 0;

      if (addr < 0xa000) {
        bank = prgMode ? (num8kBanks - 2) : (this.registers[6] % num8kBanks);
      } else if (addr < 0xc000) {
        bank = this.registers[7] % num8kBanks;
      } else if (addr < 0xe000) {
        bank = prgMode ? (this.registers[6] % num8kBanks) : (num8kBanks - 2);
      } else {
        bank = num8kBanks - 1;
      }
      return this.prgRom[bank * 8192 + (addr & 0x1fff)];
    }
    return 0;
  }

  public writePrg(addr: number, val: number): void {
    if (addr >= 0x6000 && addr < 0x8000) {
      this.prgRam[addr - 0x6000] = val;
      return;
    }
    const isEven = (addr & 1) === 0;
    if (addr >= 0x8000 && addr < 0xa000) {
      if (isEven) this.bankSelect = val;
      else this.registers[this.bankSelect & 0x07] = val;
    } else if (addr >= 0xa000 && addr < 0xc000) {
      if (isEven) this.mirroring = (val & 1) ? 'horizontal' : 'vertical';
    } else if (addr >= 0xc000 && addr < 0xe000) {
      if (isEven) this.irqLatch = val;
      else this.irqCounter = 0;
    } else if (addr >= 0xe000) {
      this.irqEnabled = !isEven;
    }
  }

  public readChr(addr: number): number {
    if (this.chrRom.length === 0) return this.chrRam[addr & 0x1fff];
    const chrA12 = (this.bankSelect & 0x80) !== 0;
    const num1kBanks = Math.floor(this.chrRom.length / 1024);
    let bank = 0;

    if (!chrA12) {
      if (addr < 0x0800) bank = (this.registers[0] & ~1) + ((addr >> 10) & 1);
      else if (addr < 0x1000) bank = (this.registers[1] & ~1) + ((addr >> 10) & 1);
      else if (addr < 0x1400) bank = this.registers[2];
      else if (addr < 0x1800) bank = this.registers[3];
      else if (addr < 0x1c00) bank = this.registers[4];
      else bank = this.registers[5];
    } else {
      if (addr < 0x0400) bank = this.registers[2];
      else if (addr < 0x0800) bank = this.registers[3];
      else if (addr < 0x0c00) bank = this.registers[4];
      else if (addr < 0x1000) bank = this.registers[5];
      else if (addr < 0x1800) bank = (this.registers[0] & ~1) + ((addr >> 10) & 1);
      else bank = (this.registers[1] & ~1) + ((addr >> 10) & 1);
    }

    return this.chrRom[(bank % num1kBanks) * 1024 + (addr & 0x3ff)];
  }

  public writeChr(addr: number, val: number): void {
    if (this.chrRom.length === 0) this.chrRam[addr & 0x1fff] = val;
  }

  public getMirroring(): MirroringType {
    return this.mirroring;
  }

  public stepScanline(): boolean {
    if (this.irqCounter === 0) {
      this.irqCounter = this.irqLatch;
    } else {
      this.irqCounter--;
    }
    return this.irqCounter === 0 && this.irqEnabled;
  }
}

export function createMapper(
  mapperId: number,
  prgRom: Uint8Array,
  chrRom: Uint8Array,
  mirroring: MirroringType
): IMapper {
  switch (mapperId) {
    case 0: return new Mapper0(prgRom, chrRom, mirroring);
    case 1: return new Mapper1(prgRom, chrRom, mirroring);
    case 2: return new Mapper2(prgRom, chrRom, mirroring);
    case 3: return new Mapper3(prgRom, chrRom, mirroring);
    case 4: return new Mapper4(prgRom, chrRom, mirroring);
    default:
      // Fallback to Mapper 0
      return new Mapper0(prgRom, chrRom, mirroring);
  }
}
