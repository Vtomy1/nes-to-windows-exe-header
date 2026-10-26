/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CpuBus {
  read(address: number): number;
  write(address: number, value: number): void;
}

export class Cpu6502 {
  public a: number = 0;   // Accumulator
  public x: number = 0;   // X register
  public y: number = 0;   // Y register
  public pc: number = 0;  // Program Counter
  public sp: number = 0xfd; // Stack Pointer
  
  // Status flags: N V - B D I Z C
  public flagC: number = 0; // Carry
  public flagZ: number = 0; // Zero
  public flagI: number = 1; // Interrupt disable
  public flagD: number = 0; // Decimal mode (ignored in NES, but flag exists)
  public flagV: number = 0; // Overflow
  public flagN: number = 0; // Negative

  public cycles: number = 0;
  public nmiPending: boolean = false;
  public irqPending: boolean = false;

  private bus: CpuBus;

  constructor(bus: CpuBus) {
    this.bus = bus;
  }

  public reset(): void {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xfd;
    this.flagC = 0;
    this.flagZ = 0;
    this.flagI = 1;
    this.flagD = 0;
    this.flagV = 0;
    this.flagN = 0;
    this.cycles = 0;
    this.nmiPending = false;
    this.irqPending = false;

    // Read RESET vector from 0xFFFC
    const lo = this.bus.read(0xfffc);
    const hi = this.bus.read(0xfffd);
    this.pc = (hi << 8) | lo;
  }

  public triggerNmi(): void {
    this.nmiPending = true;
  }

  public triggerIrq(): void {
    if (this.flagI === 0) {
      this.irqPending = true;
    }
  }

  public getStatus(): number {
    return (
      (this.flagN ? 0x80 : 0) |
      (this.flagV ? 0x40 : 0) |
      0x20 | // Unused bit always 1
      0x00 | // B flag
      (this.flagD ? 0x08 : 0) |
      (this.flagI ? 0x04 : 0) |
      (this.flagZ ? 0x02 : 0) |
      (this.flagC ? 0x01 : 0)
    );
  }

  public setStatus(val: number): void {
    this.flagN = (val & 0x80) ? 1 : 0;
    this.flagV = (val & 0x40) ? 1 : 0;
    this.flagD = (val & 0x08) ? 1 : 0;
    this.flagI = (val & 0x04) ? 1 : 0;
    this.flagZ = (val & 0x02) ? 1 : 0;
    this.flagC = (val & 0x01) ? 1 : 0;
  }

  private push(val: number): void {
    this.bus.write(0x0100 | (this.sp & 0xff), val & 0xff);
    this.sp = (this.sp - 1) & 0xff;
  }

  private pull(): number {
    this.sp = (this.sp + 1) & 0xff;
    return this.bus.read(0x0100 | this.sp);
  }

  private setZN(val: number): void {
    this.flagZ = (val & 0xff) === 0 ? 1 : 0;
    this.flagN = (val & 0x80) ? 1 : 0;
  }

  public step(): number {
    if (this.nmiPending) {
      this.nmiPending = false;
      this.push((this.pc >> 8) & 0xff);
      this.push(this.pc & 0xff);
      this.push(this.getStatus() & ~0x10); // B flag clear
      this.flagI = 1;
      const lo = this.bus.read(0xfffa);
      const hi = this.bus.read(0xfffb);
      this.pc = (hi << 8) | lo;
      return 7;
    }

    if (this.irqPending && this.flagI === 0) {
      this.irqPending = false;
      this.push((this.pc >> 8) & 0xff);
      this.push(this.pc & 0xff);
      this.push(this.getStatus() & ~0x10);
      this.flagI = 1;
      const lo = this.bus.read(0xfffe);
      const hi = this.bus.read(0xffff);
      this.pc = (hi << 8) | lo;
      return 7;
    }

    const op = this.bus.read(this.pc++);
    return this.executeOp(op);
  }

  private readWord(addr: number): number {
    const lo = this.bus.read(addr);
    const hi = this.bus.read(addr + 1);
    return (hi << 8) | lo;
  }

  private executeOp(op: number): number {
    let cycles = 2;
    switch (op) {
      // --- NOP ---
      case 0xea:
        break;

      // --- LDA ---
      case 0xa9: // Immediate
        this.a = this.bus.read(this.pc++);
        this.setZN(this.a);
        break;
      case 0xa5: // Zero Page
        this.a = this.bus.read(this.bus.read(this.pc++));
        this.setZN(this.a);
        cycles = 3;
        break;
      case 0xb5: // Zero Page,X
        this.a = this.bus.read((this.bus.read(this.pc++) + this.x) & 0xff);
        this.setZN(this.a);
        cycles = 4;
        break;
      case 0xad: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.a = this.bus.read(addr);
        this.setZN(this.a);
        cycles = 4;
        break;
      }
      case 0xbd: { // Absolute,X
        const base = this.readWord(this.pc);
        this.pc += 2;
        this.a = this.bus.read((base + this.x) & 0xffff);
        this.setZN(this.a);
        cycles = 4;
        break;
      }
      case 0xb9: { // Absolute,Y
        const base = this.readWord(this.pc);
        this.pc += 2;
        this.a = this.bus.read((base + this.y) & 0xffff);
        this.setZN(this.a);
        cycles = 4;
        break;
      }
      case 0xa1: { // (Indirect,X)
        const zp = (this.bus.read(this.pc++) + this.x) & 0xff;
        const lo = this.bus.read(zp);
        const hi = this.bus.read((zp + 1) & 0xff);
        this.a = this.bus.read((hi << 8) | lo);
        this.setZN(this.a);
        cycles = 6;
        break;
      }
      case 0xb1: { // (Indirect),Y
        const zp = this.bus.read(this.pc++);
        const lo = this.bus.read(zp);
        const hi = this.bus.read((zp + 1) & 0xff);
        this.a = this.bus.read((((hi << 8) | lo) + this.y) & 0xffff);
        this.setZN(this.a);
        cycles = 5;
        break;
      }

      // --- LDX ---
      case 0xa2: // Immediate
        this.x = this.bus.read(this.pc++);
        this.setZN(this.x);
        break;
      case 0xa6: // Zero Page
        this.x = this.bus.read(this.bus.read(this.pc++));
        this.setZN(this.x);
        cycles = 3;
        break;
      case 0xb6: // Zero Page,Y
        this.x = this.bus.read((this.bus.read(this.pc++) + this.y) & 0xff);
        this.setZN(this.x);
        cycles = 4;
        break;
      case 0xae: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.x = this.bus.read(addr);
        this.setZN(this.x);
        cycles = 4;
        break;
      }
      case 0xbe: { // Absolute,Y
        const base = this.readWord(this.pc);
        this.pc += 2;
        this.x = this.bus.read((base + this.y) & 0xffff);
        this.setZN(this.x);
        cycles = 4;
        break;
      }

      // --- LDY ---
      case 0xa0: // Immediate
        this.y = this.bus.read(this.pc++);
        this.setZN(this.y);
        break;
      case 0xa4: // Zero Page
        this.y = this.bus.read(this.bus.read(this.pc++));
        this.setZN(this.y);
        cycles = 3;
        break;
      case 0xb4: // Zero Page,X
        this.y = this.bus.read((this.bus.read(this.pc++) + this.x) & 0xff);
        this.setZN(this.y);
        cycles = 4;
        break;
      case 0xac: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.y = this.bus.read(addr);
        this.setZN(this.y);
        cycles = 4;
        break;
      }
      case 0xbc: { // Absolute,X
        const base = this.readWord(this.pc);
        this.pc += 2;
        this.y = this.bus.read((base + this.x) & 0xffff);
        this.setZN(this.y);
        cycles = 4;
        break;
      }

      // --- STA ---
      case 0x85: // Zero Page
        this.bus.write(this.bus.read(this.pc++), this.a);
        cycles = 3;
        break;
      case 0x95: // Zero Page,X
        this.bus.write((this.bus.read(this.pc++) + this.x) & 0xff, this.a);
        cycles = 4;
        break;
      case 0x8d: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.bus.write(addr, this.a);
        cycles = 4;
        break;
      }
      case 0x9d: { // Absolute,X
        const base = this.readWord(this.pc);
        this.pc += 2;
        this.bus.write((base + this.x) & 0xffff, this.a);
        cycles = 5;
        break;
      }
      case 0x99: { // Absolute,Y
        const base = this.readWord(this.pc);
        this.pc += 2;
        this.bus.write((base + this.y) & 0xffff, this.a);
        cycles = 5;
        break;
      }
      case 0x81: { // (Indirect,X)
        const zp = (this.bus.read(this.pc++) + this.x) & 0xff;
        const lo = this.bus.read(zp);
        const hi = this.bus.read((zp + 1) & 0xff);
        this.bus.write((hi << 8) | lo, this.a);
        cycles = 6;
        break;
      }
      case 0x91: { // (Indirect),Y
        const zp = this.bus.read(this.pc++);
        const lo = this.bus.read(zp);
        const hi = this.bus.read((zp + 1) & 0xff);
        this.bus.write((((hi << 8) | lo) + this.y) & 0xffff, this.a);
        cycles = 6;
        break;
      }

      // --- STX ---
      case 0x86: // Zero Page
        this.bus.write(this.bus.read(this.pc++), this.x);
        cycles = 3;
        break;
      case 0x96: // Zero Page,Y
        this.bus.write((this.bus.read(this.pc++) + this.y) & 0xff, this.x);
        cycles = 4;
        break;
      case 0x8e: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.bus.write(addr, this.x);
        cycles = 4;
        break;
      }

      // --- STY ---
      case 0x84: // Zero Page
        this.bus.write(this.bus.read(this.pc++), this.y);
        cycles = 3;
        break;
      case 0x94: // Zero Page,X
        this.bus.write((this.bus.read(this.pc++) + this.x) & 0xff, this.y);
        cycles = 4;
        break;
      case 0x8c: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.bus.write(addr, this.y);
        cycles = 4;
        break;
      }

      // --- TAX, TAY, TXA, TYA, TSX, TXS ---
      case 0xaa: // TAX
        this.x = this.a;
        this.setZN(this.x);
        break;
      case 0xa8: // TAY
        this.y = this.a;
        this.setZN(this.y);
        break;
      case 0x8a: // TXA
        this.a = this.x;
        this.setZN(this.a);
        break;
      case 0x98: // TYA
        this.a = this.y;
        this.setZN(this.a);
        break;
      case 0xba: // TSX
        this.x = this.sp;
        this.setZN(this.x);
        break;
      case 0x9a: // TXS
        this.sp = this.x;
        break;

      // --- PHA, PLA, PHP, PLP ---
      case 0x48: // PHA
        this.push(this.a);
        cycles = 3;
        break;
      case 0x68: // PLA
        this.a = this.pull();
        this.setZN(this.a);
        cycles = 4;
        break;
      case 0x08: // PHP
        this.push(this.getStatus() | 0x10); // B flag set
        cycles = 3;
        break;
      case 0x28: // PLP
        this.setStatus(this.pull());
        cycles = 4;
        break;

      // --- INX, INY, DEX, DEY ---
      case 0xe8: // INX
        this.x = (this.x + 1) & 0xff;
        this.setZN(this.x);
        break;
      case 0xc8: // INY
        this.y = (this.y + 1) & 0xff;
        this.setZN(this.y);
        break;
      case 0xca: // DEX
        this.x = (this.x - 1) & 0xff;
        this.setZN(this.x);
        break;
      case 0x88: // DEY
        this.y = (this.y - 1) & 0xff;
        this.setZN(this.y);
        break;

      // --- INC, DEC ---
      case 0xe6: { // INC Zero Page
        const zp = this.bus.read(this.pc++);
        const v = (this.bus.read(zp) + 1) & 0xff;
        this.bus.write(zp, v);
        this.setZN(v);
        cycles = 5;
        break;
      }
      case 0xee: { // INC Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        const v = (this.bus.read(addr) + 1) & 0xff;
        this.bus.write(addr, v);
        this.setZN(v);
        cycles = 6;
        break;
      }
      case 0xc6: { // DEC Zero Page
        const zp = this.bus.read(this.pc++);
        const v = (this.bus.read(zp) - 1) & 0xff;
        this.bus.write(zp, v);
        this.setZN(v);
        cycles = 5;
        break;
      }
      case 0xce: { // DEC Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        const v = (this.bus.read(addr) - 1) & 0xff;
        this.bus.write(addr, v);
        this.setZN(v);
        cycles = 6;
        break;
      }

      // --- ADC ---
      case 0x69: // Immediate
        this.adc(this.bus.read(this.pc++));
        break;
      case 0x65: // Zero Page
        this.adc(this.bus.read(this.bus.read(this.pc++)));
        cycles = 3;
        break;
      case 0x6d: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.adc(this.bus.read(addr));
        cycles = 4;
        break;
      }

      // --- SBC ---
      case 0xe9: // Immediate
        this.adc(this.bus.read(this.pc++) ^ 0xff);
        break;
      case 0xe5: // Zero Page
        this.adc(this.bus.read(this.bus.read(this.pc++)) ^ 0xff);
        cycles = 3;
        break;
      case 0xed: { // Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.adc(this.bus.read(addr) ^ 0xff);
        cycles = 4;
        break;
      }

      // --- CMP, CPX, CPY ---
      case 0xc9: // CMP Immediate
        this.cmp(this.a, this.bus.read(this.pc++));
        break;
      case 0xc5: // CMP Zero Page
        this.cmp(this.a, this.bus.read(this.bus.read(this.pc++)));
        cycles = 3;
        break;
      case 0xcd: { // CMP Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        this.cmp(this.a, this.bus.read(addr));
        cycles = 4;
        break;
      }
      case 0xe0: // CPX Immediate
        this.cmp(this.x, this.bus.read(this.pc++));
        break;
      case 0xe4: // CPX Zero Page
        this.cmp(this.x, this.bus.read(this.bus.read(this.pc++)));
        cycles = 3;
        break;
      case 0xc0: // CPY Immediate
        this.cmp(this.y, this.bus.read(this.pc++));
        break;
      case 0xc4: // CPY Zero Page
        this.cmp(this.y, this.bus.read(this.bus.read(this.pc++)));
        cycles = 3;
        break;

      // --- AND, ORA, EOR, BIT ---
      case 0x29: // AND Immediate
        this.a &= this.bus.read(this.pc++);
        this.setZN(this.a);
        break;
      case 0x25: // AND Zero Page
        this.a &= this.bus.read(this.bus.read(this.pc++));
        this.setZN(this.a);
        cycles = 3;
        break;
      case 0x09: // ORA Immediate
        this.a |= this.bus.read(this.pc++);
        this.setZN(this.a);
        break;
      case 0x05: // ORA Zero Page
        this.a |= this.bus.read(this.bus.read(this.pc++));
        this.setZN(this.a);
        cycles = 3;
        break;
      case 0x49: // EOR Immediate
        this.a ^= this.bus.read(this.pc++);
        this.setZN(this.a);
        break;
      case 0x24: { // BIT Zero Page
        const v = this.bus.read(this.bus.read(this.pc++));
        this.flagZ = (this.a & v) === 0 ? 1 : 0;
        this.flagV = (v & 0x40) ? 1 : 0;
        this.flagN = (v & 0x80) ? 1 : 0;
        cycles = 3;
        break;
      }
      case 0x2c: { // BIT Absolute
        const addr = this.readWord(this.pc);
        this.pc += 2;
        const v = this.bus.read(addr);
        this.flagZ = (this.a & v) === 0 ? 1 : 0;
        this.flagV = (v & 0x40) ? 1 : 0;
        this.flagN = (v & 0x80) ? 1 : 0;
        cycles = 4;
        break;
      }

      // --- ASL, LSR, ROL, ROR ---
      case 0x0a: { // ASL A
        this.flagC = (this.a & 0x80) ? 1 : 0;
        this.a = (this.a << 1) & 0xff;
        this.setZN(this.a);
        break;
      }
      case 0x4a: { // LSR A
        this.flagC = this.a & 1;
        this.a = this.a >>> 1;
        this.setZN(this.a);
        break;
      }
      case 0x26: { // ROL Zero Page
        const zp = this.bus.read(this.pc++);
        const v = this.bus.read(zp);
        const c = (v & 0x80) ? 1 : 0;
        const res = ((v << 1) | this.flagC) & 0xff;
        this.flagC = c;
        this.bus.write(zp, res);
        this.setZN(res);
        cycles = 5;
        break;
      }
      case 0x66: { // ROR Zero Page
        const zp = this.bus.read(this.pc++);
        const v = this.bus.read(zp);
        const c = v & 1;
        const res = (v >>> 1) | (this.flagC << 7);
        this.flagC = c;
        this.bus.write(zp, res);
        this.setZN(res);
        cycles = 5;
        break;
      }

      // --- JMP, JSR, RTS, RTI ---
      case 0x4c: { // JMP Absolute
        this.pc = this.readWord(this.pc);
        cycles = 3;
        break;
      }
      case 0x20: { // JSR Absolute
        const target = this.readWord(this.pc);
        const ret = this.pc + 1; // Points to 3rd byte of JSR
        this.push((ret >> 8) & 0xff);
        this.push(ret & 0xff);
        this.pc = target;
        cycles = 6;
        break;
      }
      case 0x60: { // RTS
        const lo = this.pull();
        const hi = this.pull();
        this.pc = ((hi << 8) | lo) + 1;
        cycles = 6;
        break;
      }
      case 0x40: { // RTI
        this.setStatus(this.pull());
        const lo = this.pull();
        const hi = this.pull();
        this.pc = (hi << 8) | lo;
        cycles = 6;
        break;
      }

      // --- BRANCHES ---
      case 0x10: // BPL
        cycles = this.branch(this.flagN === 0);
        break;
      case 0x30: // BMI
        cycles = this.branch(this.flagN === 1);
        break;
      case 0x50: // BVC
        cycles = this.branch(this.flagV === 0);
        break;
      case 0x70: // BVS
        cycles = this.branch(this.flagV === 1);
        break;
      case 0x90: // BCC
        cycles = this.branch(this.flagC === 0);
        break;
      case 0xb0: // BCS
        cycles = this.branch(this.flagC === 1);
        break;
      case 0xd0: // BNE
        cycles = this.branch(this.flagZ === 0);
        break;
      case 0xf0: // BEQ
        cycles = this.branch(this.flagZ === 1);
        break;

      // --- FLAGS (SEC, CLC, SEI, CLI, CLD, SED) ---
      case 0x38: this.flagC = 1; break;
      case 0x18: this.flagC = 0; break;
      case 0x78: this.flagI = 1; break;
      case 0x58: this.flagI = 0; break;
      case 0xd8: this.flagD = 0; break;
      case 0xf8: this.flagD = 1; break;
      case 0xb8: this.flagV = 0; break;

      default:
        // Handle undocumented or fallback
        break;
    }

    return cycles;
  }

  private branch(condition: boolean): number {
    let offset = this.bus.read(this.pc++);
    if (offset & 0x80) offset -= 256; // Sign extend
    if (condition) {
      this.pc = (this.pc + offset) & 0xffff;
      return 3;
    }
    return 2;
  }

  private adc(val: number): void {
    const sum = this.a + val + this.flagC;
    this.flagC = sum > 0xff ? 1 : 0;
    this.flagV = (~(this.a ^ val) & (this.a ^ sum) & 0x80) ? 1 : 0;
    this.a = sum & 0xff;
    this.setZN(this.a);
  }

  private cmp(reg: number, val: number): void {
    const diff = reg - val;
    this.flagC = reg >= val ? 1 : 0;
    this.setZN(diff & 0xff);
  }
}
