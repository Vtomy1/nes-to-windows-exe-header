/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MirroringType = 'horizontal' | 'vertical' | 'four-screen' | 'single-screen-lower' | 'single-screen-upper';
export type TVSystem = 'NTSC' | 'PAL' | 'Dendy' | 'Dual';

export interface INesHeader {
  magic: string; // 'NES\x1a'
  prgRomSize16K: number; // In 16KB units
  chrRomSize8K: number; // In 8KB units (0 = CHR RAM)
  flags6: number;
  flags7: number;
  flags8: number;
  flags9: number;
  flags10: number;
  reserved: number[];
  
  // Parsed properties
  mapperId: number;
  submapperId?: number;
  mirroring: MirroringType;
  hasBattery: boolean;
  hasTrainer: boolean;
  isFourScreen: boolean;
  isNes2: boolean;
  isVsUnisystem: boolean;
  isPlayChoice10: boolean;
  tvSystem: TVSystem;
  prgRamSize?: number; // In bytes
  chrRamSize?: number; // In bytes
}

export interface NesRomData {
  fileName: string;
  fileSize: number;
  header: INesHeader;
  rawHeader: Uint8Array; // 16 bytes
  trainer?: Uint8Array; // 512 bytes if present
  prgRom: Uint8Array;
  chrRom: Uint8Array;
  miscRom?: Uint8Array;
  crc32: string;
  sha1?: string;
  mapperName: string;
  valid: boolean;
  diagnostics: string[];
}

export interface WindowsExeConfig {
  gameTitle: string;
  publisher: string;
  version: string;
  description: string;
  targetArchitecture: 'x64' | 'x86';
  defaultWindowMode: 'windowed-4-3' | 'windowed-integer' | 'fullscreen-4-3' | 'borderless-fill';
  defaultScale: number; // 2x, 3x, 4x
  enableCrtShader: boolean;
  enableVsync: boolean;
  showFps: boolean;
  audioSampleRate: 44100 | 48000;
  masterVolume: number; // 0-100
  lowPassFilter: boolean;
  pauseOnFocusLost: boolean;
  allowQuickSave: boolean;
  xinputAutoMap: boolean;
  keyBindings: {
    up: string;
    down: string;
    left: string;
    right: string;
    a: string;
    b: string;
    select: string;
    start: string;
  };
}

export interface PeSectionInfo {
  name: string;
  virtualSize: number;
  virtualAddress: number;
  rawSize: number;
  rawOffset: number;
  characteristics: number;
  description: string;
}

export interface PeHeaderSummary {
  machine: string;
  subsystem: string;
  entryPointRva: number;
  imageBase: string;
  sectionAlignment: number;
  fileAlignment: number;
  sections: PeSectionInfo[];
  totalFileSize: number;
}
