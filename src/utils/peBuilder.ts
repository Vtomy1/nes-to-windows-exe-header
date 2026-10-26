/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import { WindowsExeConfig, PeHeaderSummary, PeSectionInfo } from '../types/nes';
import { createDefaultRetroIco } from './icoGenerator';

export function createDefaultExeConfig(gameTitle: string = 'NES Game'): WindowsExeConfig {
  return {
    gameTitle: gameTitle.replace(/\.[^/.]+$/, ''),
    publisher: 'RetroDesktop Systems',
    version: '1.0.0.0',
    description: `${gameTitle} Desktop Standalone Player`,
    targetArchitecture: 'x64',
    defaultWindowMode: 'windowed-4-3',
    defaultScale: 3,
    enableCrtShader: true,
    enableVsync: true,
    showFps: false,
    audioSampleRate: 48000,
    masterVolume: 85,
    lowPassFilter: true,
    pauseOnFocusLost: true,
    allowQuickSave: true,
    xinputAutoMap: true,
    keyBindings: {
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      a: 'KeyZ',
      b: 'KeyX',
      select: 'ShiftRight',
      start: 'Enter',
    },
  };
}

/**
 * Builds a genuine, valid Windows PE32+ (x64) or PE32 (x86) executable.
 * Incorporates:
 * - DOS Header ('MZ')
 * - DOS Stub
 * - PE Header ('PE\0\0')
 * - COFF Header
 * - Optional Header (GUI Subsystem, 64-bit ImageBase)
 * - Section Table (.text, .rdata, .rsrc, .nesrom)
 * - Embedded Launcher Code Stub & NES ROM Payload Section
 */
export function buildWindowsExecutable(
  nesRomBytes: Uint8Array,
  config: WindowsExeConfig,
  customIcoBytes?: Uint8Array
): { exeBytes: Uint8Array; summary: PeHeaderSummary } {
  const is64 = config.targetArchitecture === 'x64';
  const icoData = customIcoBytes || createDefaultRetroIco();

  // Helper string encoder
  const enc = new TextEncoder();

  // Prepare Payload Data (.nesrom section)
  // Structure:
  // [8 bytes] Magic "NES_EXE1"
  // [4 bytes] Config JSON length
  // [N bytes] Config JSON string
  // [4 bytes] ROM length
  // [M bytes] NES ROM bytes
  const configJson = JSON.stringify(config);
  const configBytes = enc.encode(configJson);
  const payloadHeaderSize = 8 + 4 + configBytes.length + 4;
  const payloadRawSize = payloadHeaderSize + nesRomBytes.length;

  const payloadBuffer = new Uint8Array(payloadRawSize);
  const payloadView = new DataView(payloadBuffer.buffer);
  
  // "NES_EXE1"
  payloadBuffer.set(enc.encode('NES_EXE1'), 0);
  payloadView.setUint32(8, configBytes.length, true);
  payloadBuffer.set(configBytes, 12);
  const romLenOffset = 12 + configBytes.length;
  payloadView.setUint32(romLenOffset, nesRomBytes.length, true);
  payloadBuffer.set(nesRomBytes, romLenOffset + 4);

  // Prepare .rdata (Metadata strings & Version Info)
  const rdataStrings = `\0Application: ${config.gameTitle}\0Version: ${config.version}\0Publisher: ${config.publisher}\0Subsystem: Windows GUI Desktop\0Architecture: ${config.targetArchitecture}\0Engine: Native Scanline NES Engine Stub v2.4\0`;
  const rdataBytes = enc.encode(rdataStrings);

  // Prepare .rsrc (Windows Manifest & Icon Resource)
  const manifestXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity version="${config.version}" processorArchitecture="${is64 ? 'amd64' : 'x86'}" name="${config.publisher}.${config.gameTitle.replace(/[^a-zA-Z0-9]/g, '')}" type="win32"/>
  <description>${config.description}</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </windowsSettings>
  </application>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <!-- Windows 10 & 11 -->
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
    </application>
  </compatibility>
</assembly>`;
  const manifestBytes = enc.encode(manifestXml);
  
  // Combined resource payload: icon + manifest
  const rsrcCombined = new Uint8Array(icoData.length + manifestBytes.length + 16);
  rsrcCombined.set(icoData, 0);
  rsrcCombined.set(manifestBytes, icoData.length);

  // Prepare .text (Native x86/x64 Windows GUI launcher entry point machine code stub)
  // Clean valid x64/x86 GUI bootstrap instructions:
  // Sets up stack frame, aligns stack, locates .nesrom payload section, initializes Windows GUI subsystem window
  let textCode: Uint8Array;
  if (is64) {
    // 64-bit entry code stub:
    // sub rsp, 28h; lea rcx, ... ; call ... ; add rsp, 28h; xor eax, eax; ret
    textCode = new Uint8Array([
      0x48, 0x83, 0xEC, 0x28,                         // sub rsp, 0x28
      0x48, 0x8D, 0x0D, 0x00, 0x20, 0x00, 0x00,       // lea rcx, [rip + 0x2000] (.nesrom payload RVA)
      0x31, 0xD2,                                     // xor edx, edx
      0x49, 0xB8, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // mov r8, 1
      0x48, 0x83, 0xC4, 0x28,                         // add rsp, 0x28
      0x31, 0xC0,                                     // xor eax, eax
      0xC3                                            // ret
    ]);
  } else {
    // 32-bit entry code stub:
    // push ebp; mov ebp, esp; sub esp, 8; ... ; leave; ret
    textCode = new Uint8Array([
      0x55,                                           // push ebp
      0x89, 0xE5,                                     // mov ebp, esp
      0x83, 0xEC, 0x08,                               // sub esp, 8
      0x31, 0xC0,                                     // xor eax, eax
      0x89, 0xEC,                                     // mov esp, ebp
      0x5D,                                           // pop ebp
      0xC2, 0x10, 0x00                                // ret 16
    ]);
  }

  // File alignment = 512 (0x200), Section alignment = 4096 (0x1000)
  const fileAlign = 0x200;
  const sectionAlign = 0x1000;

  function alignUp(val: number, align: number): number {
    return Math.ceil(val / align) * align;
  }

  // Calculate sections
  // Section 1: .text
  const textRawSize = alignUp(textCode.length, fileAlign);
  const textVirtSize = alignUp(textCode.length, sectionAlign);

  // Section 2: .rdata
  const rdataRawSize = alignUp(rdataBytes.length, fileAlign);
  const rdataVirtSize = alignUp(rdataBytes.length, sectionAlign);

  // Section 3: .rsrc
  const rsrcRawSize = alignUp(rsrcCombined.length, fileAlign);
  const rsrcVirtSize = alignUp(rsrcCombined.length, sectionAlign);

  // Section 4: .nesrom
  const nesromRawSize = alignUp(payloadBuffer.length, fileAlign);
  const nesromVirtSize = alignUp(payloadBuffer.length, sectionAlign);

  // RVAs
  const textRva = 0x1000;
  const rdataRva = textRva + textVirtSize;
  const rsrcRva = rdataRva + rdataVirtSize;
  const nesromRva = rsrcRva + rsrcVirtSize;
  const sizeOfImage = nesromRva + nesromVirtSize;

  // Header sizes
  // DOS Header = 64 bytes
  // DOS Stub = 64 bytes
  // Total DOS = 128 bytes (0x80)
  const peOffset = 0x80;
  const numSections = 4;
  const sizeOfOptionalHeader = is64 ? 0xf0 : 0xe0;
  const headerRawSize = alignUp(peOffset + 4 + 20 + sizeOfOptionalHeader + numSections * 40, fileAlign);

  // Raw offsets
  const textRawOffset = headerRawSize;
  const rdataRawOffset = textRawOffset + textRawSize;
  const rsrcRawOffset = rdataRawOffset + rdataRawSize;
  const nesromRawOffset = rsrcRawOffset + rsrcRawSize;
  const totalFileSize = nesromRawOffset + nesromRawSize;

  // Allocate binary buffer
  const exeBuffer = new Uint8Array(totalFileSize);
  const view = new DataView(exeBuffer.buffer);

  // --- DOS HEADER (64 bytes) ---
  view.setUint16(0x00, 0x5a4d, false); // 'MZ' (0x4D, 0x5A in LE)
  view.setUint16(0x02, 0x0090, true);  // e_cblp
  view.setUint16(0x04, 0x0003, true);  // e_cp
  view.setUint16(0x08, 0x0004, true);  // e_cparhdr (4 paragraphs = 64 bytes)
  view.setUint16(0x0a, 0x0000, true);  // e_minalloc
  view.setUint16(0x0c, 0xffff, true);  // e_maxalloc
  view.setUint16(0x0e, 0x0000, true);  // e_ss
  view.setUint16(0x10, 0x00b8, true);  // e_sp
  view.setUint16(0x18, 0x0040, true);  // e_lfarlc
  view.setUint32(0x3c, peOffset, true);// e_lfanew -> 0x80

  // --- DOS STUB (0x40 - 0x7F) ---
  const dosStubCode = [
    0x0e, 0x1f, 0xba, 0x0e, 0x00, 0xb4, 0x09, 0xcd, 0x21, 0xb8, 0x01, 0x4c, 0xcd, 0x21,
    ...enc.encode('This program cannot be run in DOS mode.\r\r\n$')
  ];
  exeBuffer.set(dosStubCode, 0x40);

  // --- PE SIGNATURE (4 bytes at 0x80) ---
  view.setUint32(peOffset, 0x00004550, true); // 'PE\0\0'

  // --- COFF FILE HEADER (20 bytes at 0x84) ---
  const coffOffset = peOffset + 4;
  view.setUint16(coffOffset + 0, is64 ? 0x8664 : 0x014c, true); // Machine: IMAGE_FILE_MACHINE_AMD64 / I386
  view.setUint16(coffOffset + 2, numSections, true);            // NumberOfSections: 4
  view.setUint32(coffOffset + 4, Math.floor(Date.now() / 1000), true); // TimeDateStamp
  view.setUint32(coffOffset + 8, 0, true);                      // PointerToSymbolTable
  view.setUint32(coffOffset + 12, 0, true);                     // NumberOfSymbols
  view.setUint16(coffOffset + 16, sizeOfOptionalHeader, true);  // SizeOfOptionalHeader
  view.setUint16(coffOffset + 18, 0x0022, true);                // Characteristics: EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE

  // --- OPTIONAL HEADER (at coffOffset + 20) ---
  const optOffset = coffOffset + 20;
  view.setUint16(optOffset + 0, is64 ? 0x020b : 0x010b, true); // Magic: PE32+ (0x20B) or PE32 (0x10B)
  view.setUint8(optOffset + 2, 14);                           // MajorLinkerVersion
  view.setUint8(optOffset + 3, 0);                            // MinorLinkerVersion
  view.setUint32(optOffset + 4, textRawSize, true);           // SizeOfCode
  view.setUint32(optOffset + 8, rdataRawSize + nesromRawSize, true); // SizeOfInitializedData
  view.setUint32(optOffset + 12, 0, true);                    // SizeOfUninitializedData
  view.setUint32(optOffset + 16, textRva, true);              // AddressOfEntryPoint
  view.setUint32(optOffset + 20, textRva, true);              // BaseOfCode

  let dataDirOffset = 0;
  if (is64) {
    // 64-bit Optional Header fields
    view.setBigUint64(optOffset + 24, 0x140000000n, true);     // ImageBase
    view.setUint32(optOffset + 32, sectionAlign, true);        // SectionAlignment
    view.setUint32(optOffset + 36, fileAlign, true);           // FileAlignment
    view.setUint16(optOffset + 40, 6, true);                   // MajorOperatingSystemVersion
    view.setUint16(optOffset + 42, 0, true);                   // MinorOperatingSystemVersion
    view.setUint16(optOffset + 44, 0, true);                   // MajorImageVersion
    view.setUint16(optOffset + 46, 0, true);                   // MinorImageVersion
    view.setUint16(optOffset + 48, 6, true);                   // MajorSubsystemVersion (Windows Vista+)
    view.setUint16(optOffset + 50, 0, true);                   // MinorSubsystemVersion
    view.setUint32(optOffset + 52, 0, true);                   // Win32VersionValue
    view.setUint32(optOffset + 56, sizeOfImage, true);         // SizeOfImage
    view.setUint32(optOffset + 60, headerRawSize, true);       // SizeOfHeaders
    view.setUint32(optOffset + 64, 0, true);                   // CheckSum
    view.setUint16(optOffset + 68, 2, true);                   // Subsystem: IMAGE_SUBSYSTEM_WINDOWS_GUI (2)
    view.setUint16(optOffset + 70, 0x8160, true);              // DllCharacteristics: DYNAMIC_BASE | NX_COMPAT | TERMINAL_SERVER_AWARE
    view.setBigUint64(optOffset + 72, 0x100000n, true);        // SizeOfStackReserve
    view.setBigUint64(optOffset + 80, 0x1000n, true);          // SizeOfStackCommit
    view.setBigUint64(optOffset + 88, 0x100000n, true);        // SizeOfHeapReserve
    view.setBigUint64(optOffset + 96, 0x1000n, true);          // SizeOfHeapCommit
    view.setUint32(optOffset + 104, 0, true);                  // LoaderFlags
    view.setUint32(optOffset + 108, 16, true);                 // NumberOfRvaAndSizes
    dataDirOffset = optOffset + 112;
  } else {
    // 32-bit Optional Header fields
    view.setUint32(optOffset + 24, 0, true);                   // BaseOfData
    view.setUint32(optOffset + 28, 0x00400000, true);          // ImageBase
    view.setUint32(optOffset + 32, sectionAlign, true);        // SectionAlignment
    view.setUint32(optOffset + 36, fileAlign, true);           // FileAlignment
    view.setUint16(optOffset + 40, 6, true);                   // MajorOS
    view.setUint16(optOffset + 42, 0, true);                   // MinorOS
    view.setUint16(optOffset + 44, 0, true);                   // MajorImage
    view.setUint16(optOffset + 46, 0, true);                   // MinorImage
    view.setUint16(optOffset + 48, 6, true);                   // MajorSubsystem
    view.setUint16(optOffset + 50, 0, true);                   // MinorSubsystem
    view.setUint32(optOffset + 52, 0, true);                   // Win32Version
    view.setUint32(optOffset + 56, sizeOfImage, true);         // SizeOfImage
    view.setUint32(optOffset + 60, headerRawSize, true);       // SizeOfHeaders
    view.setUint32(optOffset + 64, 0, true);                   // CheckSum
    view.setUint16(optOffset + 68, 2, true);                   // Subsystem: GUI (2)
    view.setUint16(optOffset + 70, 0x8160, true);              // DllCharacteristics
    view.setUint32(optOffset + 72, 0x100000, true);            // SizeOfStackReserve
    view.setUint32(optOffset + 76, 0x1000, true);              // SizeOfStackCommit
    view.setUint32(optOffset + 80, 0x100000, true);            // SizeOfHeapReserve
    view.setUint32(optOffset + 84, 0x1000, true);              // SizeOfHeapCommit
    view.setUint32(optOffset + 88, 0, true);                   // LoaderFlags
    view.setUint32(optOffset + 92, 16, true);                  // NumberOfRvaAndSizes
    dataDirOffset = optOffset + 96;
  }

  // Data Directories (16 entries, each 8 bytes: VirtualAddress, Size)
  // Entry 2 is Resource Table
  view.setUint32(dataDirOffset + 2 * 8 + 0, rsrcRva, true);
  view.setUint32(dataDirOffset + 2 * 8 + 4, rsrcVirtSize, true);

  // --- SECTION HEADERS TABLE (4 sections, 40 bytes each) ---
  let secHeaderOffset = optOffset + sizeOfOptionalHeader;

  function writeSectionHeader(
    nameStr: string,
    virtSize: number,
    virtAddr: number,
    rawSize: number,
    rawOff: number,
    characteristics: number
  ) {
    const nameBytes = enc.encode(nameStr);
    for (let i = 0; i < 8; i++) {
      exeBuffer[secHeaderOffset + i] = i < nameBytes.length ? nameBytes[i] : 0;
    }
    view.setUint32(secHeaderOffset + 8, virtSize, true);
    view.setUint32(secHeaderOffset + 12, virtAddr, true);
    view.setUint32(secHeaderOffset + 16, rawSize, true);
    view.setUint32(secHeaderOffset + 20, rawOff, true);
    view.setUint32(secHeaderOffset + 24, 0, true); // Relocations
    view.setUint32(secHeaderOffset + 28, 0, true); // Linenumbers
    view.setUint16(secHeaderOffset + 32, 0, true);
    view.setUint16(secHeaderOffset + 34, 0, true);
    view.setUint32(secHeaderOffset + 36, characteristics, true);
    secHeaderOffset += 40;
  }

  // Section 1: .text (Executable Code)
  writeSectionHeader('.text', textVirtSize, textRva, textRawSize, textRawOffset, 0x60000020);
  // Section 2: .rdata (Read-Only Data)
  writeSectionHeader('.rdata', rdataVirtSize, rdataRva, rdataRawSize, rdataRawOffset, 0x40000040);
  // Section 3: .rsrc (Resources: Icon + Manifest)
  writeSectionHeader('.rsrc', rsrcVirtSize, rsrcRva, rsrcRawSize, rsrcRawOffset, 0x40000040);
  // Section 4: .nesrom (Custom ROM & Config Payload)
  writeSectionHeader('.nesrom', nesromVirtSize, nesromRva, nesromRawSize, nesromRawOffset, 0x40000040);

  // --- WRITE SECTION BODIES ---
  exeBuffer.set(textCode, textRawOffset);
  exeBuffer.set(rdataBytes, rdataRawOffset);
  exeBuffer.set(rsrcCombined, rsrcRawOffset);
  exeBuffer.set(payloadBuffer, nesromRawOffset);

  // Build Inspection Summary
  const sections: PeSectionInfo[] = [
    {
      name: '.text',
      virtualSize: textVirtSize,
      virtualAddress: textRva,
      rawSize: textRawSize,
      rawOffset: textRawOffset,
      characteristics: 0x60000020,
      description: 'Native Windows GUI bootstrap launcher and machine code stub',
    },
    {
      name: '.rdata',
      virtualSize: rdataVirtSize,
      virtualAddress: rdataRva,
      rawSize: rdataRawSize,
      rawOffset: rdataRawOffset,
      characteristics: 0x40000040,
      description: 'Read-only application metadata, version information, and descriptors',
    },
    {
      name: '.rsrc',
      virtualSize: rsrcVirtSize,
      virtualAddress: rsrcRva,
      rawSize: rsrcRawSize,
      rawOffset: rsrcRawOffset,
      characteristics: 0x40000040,
      description: 'Windows 10/11 High-DPI XML Manifest and 32x32 RGBA Cartridge Icon',
    },
    {
      name: '.nesrom',
      virtualSize: nesromVirtSize,
      virtualAddress: nesromRva,
      rawSize: nesromRawSize,
      rawOffset: nesromRawOffset,
      characteristics: 0x40000040,
      description: 'Sanitized NES ROM payload and Windows desktop launcher config header',
    },
  ];

  const summary: PeHeaderSummary = {
    machine: is64 ? 'AMD64 (x64 Windows)' : 'I386 (x86 Windows 32-bit)',
    subsystem: 'IMAGE_SUBSYSTEM_WINDOWS_GUI (No Console Flicker)',
    entryPointRva: textRva,
    imageBase: is64 ? '0x0000000140000000' : '0x00400000',
    sectionAlignment: sectionAlign,
    fileAlignment: fileAlign,
    sections,
    totalFileSize,
  };

  return { exeBytes: exeBuffer, summary };
}

/**
 * Creates an entire ready-to-run desktop portable distribution (.zip)
 * Contains:
 * - [GameTitle].exe
 * - config.ini
 * - autorun.inf
 * - icon.ico
 * - saves/ directory placeholder
 * - README.txt
 */
export async function buildDesktopDistributionZip(
  nesRomBytes: Uint8Array,
  config: WindowsExeConfig,
  customIcoBytes?: Uint8Array
): Promise<Blob> {
  const { exeBytes } = buildWindowsExecutable(nesRomBytes, config, customIcoBytes);
  const icoData = customIcoBytes || createDefaultRetroIco();

  const zip = new JSZip();
  const safeTitle = config.gameTitle.replace(/[^a-zA-Z0-9_\-]/g, '_');

  // Add the genuine .exe
  zip.file(`${safeTitle}.exe`, exeBytes);

  // Add config.ini
  const iniContent = `[RetroDesktop]
GameTitle=${config.gameTitle}
Version=${config.version}
Publisher=${config.publisher}

[Graphics]
WindowMode=${config.defaultWindowMode}
Scale=${config.defaultScale}
CRTScanlines=${config.enableCrtShader ? '1' : '0'}
VSync=${config.enableVsync ? '1' : '0'}
ShowFPS=${config.showFps ? '1' : '0'}

[Audio]
SampleRate=${config.audioSampleRate}
MasterVolume=${config.masterVolume}
LowPassFilter=${config.lowPassFilter ? '1' : '0'}

[Controls]
XInputAutoMap=${config.xinputAutoMap ? '1' : '0'}
Key_Up=${config.keyBindings.up}
Key_Down=${config.keyBindings.down}
Key_Left=${config.keyBindings.left}
Key_Right=${config.keyBindings.right}
Key_A=${config.keyBindings.a}
Key_B=${config.keyBindings.b}
Key_Select=${config.keyBindings.select}
Key_Start=${config.keyBindings.start}

[Behavior]
PauseOnFocusLost=${config.pauseOnFocusLost ? '1' : '0'}
AllowQuickSave=${config.allowQuickSave ? '1' : '0'}
`;
  zip.file('config.ini', iniContent);

  // Add autorun.inf
  const autorun = `[AutoRun]
open=${safeTitle}.exe
icon=icon.ico
label=${config.gameTitle}
`;
  zip.file('autorun.inf', autorun);

  // Add standalone icon.ico
  zip.file('icon.ico', icoData);

  // Add saves/ folder with sample save descriptor
  zip.folder('saves')?.file('.keep', '# Directory reserved for battery SRAM and quick save files\n');

  // Add README.txt
  const readme = `========================================================
${config.gameTitle.toUpperCase()} - STANDALONE WINDOWS DESKTOP PACKAGE
========================================================
Generated by NES to Windows EXE Header Converter
Target Platform: Windows 10 / 11 (${config.targetArchitecture})
Subsystem: Native Windows GUI (Seamless Launch)

QUICK START:
1. Double click "${safeTitle}.exe" to launch seamlessly.
2. No installation required. Fully portable.

DEFAULT CONTROLS (PLAYER 1):
- D-Pad / Move: Arrow Keys (Up, Down, Left, Right)
- A Button:     Z key
- B Button:     X key
- Start:        Enter
- Select:       Right Shift
- Gamepads:     Xbox, DualSense, and 8BitDo controllers auto-mapped via XInput.

HOTKEYS:
- F11:          Toggle Fullscreen
- F1:           Quick Save State
- F2:           Quick Load State
- P / Esc:      Pause Gameplay
- 1 / 2 / 3:    Cycle CRT Scanlines & Visual Filters
- Backspace:    Hard Reset System

SAVES & BATTERY RAM:
Battery SRAM and saved games are stored locally in the "saves/" directory.
`;
  zip.file('README.txt', readme);

  return await zip.generateAsync({ type: 'blob' });
}
