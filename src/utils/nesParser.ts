/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INesHeader, NesRomData, MirroringType, TVSystem } from '../types/nes';
import { computeCrc32 } from './crc32';

export const MAPPER_NAMES: Record<number, string> = {
  0: 'NROM (Super Mario Bros., Donkey Kong, Pac-Man)',
  1: 'MMC1 / SxROM (The Legend of Zelda, Metroid, Mega Man 2)',
  2: 'UxROM (Castlevania, Contra, Mega Man 1, DuckTales)',
  3: 'CNROM (Solomon\'s Key, Adventure Island)',
  4: 'MMC3 / TxROM (Super Mario Bros. 3, Mega Man 3-6, Kirby)',
  7: 'AxROM (Battletoads, Marble Madness)',
  9: 'MMC2 (Mike Tyson\'s Punch-Out!!)',
  10: 'MMC4 (Fire Emblem, Famicom Wars)',
  11: 'Color Dreams (Crystal Mines, Robodemons)',
  19: 'Namco 163 (Final Lap, Rolling Thunder)',
  69: 'Sunsoft FME-7 / 5B (Gimmick!, Batman: Return of the Joker)',
  71: 'Camerica / Codemasters (Micro Machines)',
  85: 'Konami VRC7 (Lagrange Point)',
};

export function getMapperName(id: number): string {
  return MAPPER_NAMES[id] || `Mapper ${id} (Custom/Rare)`;
}

export function parseNesRom(bytes: Uint8Array, fileName: string = 'game.nes'): NesRomData {
  const diagnostics: string[] = [];
  
  if (bytes.length < 16) {
    return {
      fileName,
      fileSize: bytes.length,
      header: createDefaultHeader(),
      rawHeader: new Uint8Array(16),
      prgRom: new Uint8Array(0),
      chrRom: new Uint8Array(0),
      crc32: '00000000',
      mapperName: 'Unknown',
      valid: false,
      diagnostics: ['File is smaller than the minimum 16-byte NES header.'],
    };
  }

  // Check magic bytes: 'NES\x1a' (0x4E, 0x45, 0x53, 0x1A)
  const isMagicValid =
    bytes[0] === 0x4e &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x53 &&
    bytes[3] === 0x1a;

  if (!isMagicValid) {
    diagnostics.push('Missing "NES^Z" magic header signature (bytes 0-3 are not 0x4E 0x45 0x53 0x1A).');
  }

  const rawHeader = bytes.slice(0, 16);
  const prgRomSize16K = rawHeader[4];
  const chrRomSize8K = rawHeader[5];
  const flags6 = rawHeader[6];
  const flags7 = rawHeader[7];
  const flags8 = rawHeader[8];
  const flags9 = rawHeader[9];
  const flags10 = rawHeader[10];
  const reserved = Array.from(rawHeader.slice(11, 16));

  // Check for DiskDude corruption (popular 90s corruption in bytes 7-15)
  const diskDudeCheck = String.fromCharCode(...rawHeader.slice(7, 15));
  if (diskDudeCheck.toLowerCase().includes('diskdude')) {
    diagnostics.push('Detected "DiskDude!" header corruption artifact common in legacy 90s dumps.');
  }

  // Check if NES 2.0 format: (flags7 & 0x0C) === 0x08
  const isNes2 = (flags7 & 0x0c) === 0x08;
  
  // Calculate mapper ID
  let mapperId = (flags6 >> 4) | (flags7 & 0xf0);
  let submapperId = 0;
  
  if (isNes2) {
    mapperId |= (flags8 & 0x0f) << 8;
    submapperId = flags8 >> 4;
  }

  // Mirroring
  let mirroring: MirroringType = (flags6 & 0x01) ? 'vertical' : 'horizontal';
  const isFourScreen = !!(flags6 & 0x08);
  if (isFourScreen) {
    mirroring = 'four-screen';
  }

  const hasBattery = !!(flags6 & 0x02);
  const hasTrainer = !!(flags6 & 0x04);
  const isVsUnisystem = !!(flags7 & 0x01);
  const isPlayChoice10 = !!(flags7 & 0x02);

  // TV System
  let tvSystem: TVSystem = 'NTSC';
  if (isNes2) {
    const timing = flags9 & 0x03;
    if (timing === 1) tvSystem = 'PAL';
    else if (timing === 2) tvSystem = 'Dual';
    else if (timing === 3) tvSystem = 'Dendy';
  } else {
    tvSystem = (flags9 & 0x01) ? 'PAL' : 'NTSC';
  }

  // Calculate actual sizes
  let prgSize = prgRomSize16K * 16384;
  let chrSize = chrRomSize8K * 8192;

  if (isNes2) {
    // NES 2.0 allows high nibble in byte 9
    const prgHigh = (rawHeader[9] & 0x0f) << 8;
    const chrHigh = (rawHeader[9] & 0xf0) << 4;
    prgSize = (prgRomSize16K | prgHigh) * 16384;
    chrSize = (chrRomSize8K | chrHigh) * 8192;
  }

  // Trainer offset
  let offset = 16;
  let trainer: Uint8Array | undefined;
  if (hasTrainer) {
    trainer = bytes.slice(offset, offset + 512);
    offset += 512;
  }

  // Extract PRG ROM
  const prgRom = bytes.slice(offset, offset + prgSize);
  offset += prgSize;

  // Extract CHR ROM
  const chrRom = bytes.slice(offset, offset + chrSize);
  offset += chrSize;

  // Validate expected file size
  const expectedSize = 16 + (hasTrainer ? 512 : 0) + prgSize + chrSize;
  if (bytes.length < expectedSize) {
    diagnostics.push(`File appears truncated: actual size is ${bytes.length} bytes, but header specifies ${expectedSize} bytes.`);
  } else if (bytes.length > expectedSize) {
    diagnostics.push(`File contains ${bytes.length - expectedSize} bytes of trailing garbage/misc data.`);
  }

  const crc32 = computeCrc32(bytes);
  const header: INesHeader = {
    magic: 'NES\x1a',
    prgRomSize16K,
    chrRomSize8K,
    flags6,
    flags7,
    flags8,
    flags9,
    flags10,
    reserved,
    mapperId,
    submapperId,
    mirroring,
    hasBattery,
    hasTrainer,
    isFourScreen,
    isNes2,
    isVsUnisystem,
    isPlayChoice10,
    tvSystem,
    prgRamSize: 8192,
    chrRamSize: chrSize === 0 ? 8192 : 0,
  };

  return {
    fileName,
    fileSize: bytes.length,
    header,
    rawHeader,
    trainer,
    prgRom,
    chrRom,
    crc32,
    mapperName: getMapperName(mapperId),
    valid: isMagicValid && prgRom.length > 0,
    diagnostics,
  };
}

export function createDefaultHeader(): INesHeader {
  return {
    magic: 'NES\x1a',
    prgRomSize16K: 2, // 32KB
    chrRomSize8K: 1, // 8KB
    flags6: 0x00,
    flags7: 0x00,
    flags8: 0x00,
    flags9: 0x00,
    flags10: 0x00,
    reserved: [0, 0, 0, 0, 0],
    mapperId: 0,
    mirroring: 'horizontal',
    hasBattery: false,
    hasTrainer: false,
    isFourScreen: false,
    isNes2: false,
    isVsUnisystem: false,
    isPlayChoice10: false,
    tvSystem: 'NTSC',
    prgRamSize: 8192,
    chrRamSize: 8192,
  };
}

export function serializeNesRom(
  headerConfig: Partial<INesHeader>,
  prgRom: Uint8Array,
  chrRom: Uint8Array,
  trainer?: Uint8Array,
  upgradeToNes2: boolean = false
): Uint8Array {
  const header = new Uint8Array(16);
  header[0] = 0x4e; // 'N'
  header[1] = 0x45; // 'E'
  header[2] = 0x53; // 'S'
  header[3] = 0x1a; // 0x1A

  const prgBanks = Math.max(1, Math.ceil(prgRom.length / 16384));
  const chrBanks = Math.ceil(chrRom.length / 8192);

  header[4] = prgBanks & 0xff;
  header[5] = chrBanks & 0xff;

  const mapper = headerConfig.mapperId ?? 0;
  let f6 = (mapper & 0x0f) << 4;
  if (headerConfig.mirroring === 'vertical') f6 |= 0x01;
  if (headerConfig.mirroring === 'four-screen' || headerConfig.isFourScreen) f6 |= 0x08;
  if (headerConfig.hasBattery) f6 |= 0x02;
  if (trainer && trainer.length === 512) f6 |= 0x04;
  header[6] = f6;

  let f7 = mapper & 0xf0;
  if (upgradeToNes2) {
    f7 |= 0x08; // NES 2.0 identifier in bits 2-3
  }
  if (headerConfig.isVsUnisystem) f7 |= 0x01;
  if (headerConfig.isPlayChoice10) f7 |= 0x02;
  header[7] = f7;

  if (upgradeToNes2) {
    header[8] = ((mapper >> 8) & 0x0f) | ((headerConfig.submapperId ?? 0) << 4);
    header[9] = ((prgBanks >> 8) & 0x0f) | (((chrBanks >> 8) & 0x0f) << 4);
    header[10] = 0x07; // 8KB PRG RAM
    header[11] = 0x00;
    header[12] = headerConfig.tvSystem === 'PAL' ? 0x01 : 0x00;
  } else {
    header[8] = 0;
    header[9] = headerConfig.tvSystem === 'PAL' ? 1 : 0;
    header[10] = 0;
  }

  const totalLength = 16 + (trainer ? 512 : 0) + prgRom.length + chrRom.length;
  const output = new Uint8Array(totalLength);
  output.set(header, 0);

  let cursor = 16;
  if (trainer) {
    output.set(trainer, cursor);
    cursor += 512;
  }
  output.set(prgRom, cursor);
  cursor += prgRom.length;
  output.set(chrRom, cursor);

  return output;
}
