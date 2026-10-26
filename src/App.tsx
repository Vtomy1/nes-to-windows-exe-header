/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { RomUploader } from './components/RomUploader';
import { EmulatorView } from './components/EmulatorView';
import { RomDoctor } from './components/RomDoctor';
import { PEInspector } from './components/PEInspector';
import { HexViewer } from './components/HexViewer';
import { ExeConfigStudio } from './components/ExeConfigStudio';
import { ExportModal } from './components/ExportModal';
import { SAMPLE_ROMS } from './utils/sampleRoms';
import { parseNesRom, serializeNesRom } from './utils/nesParser';
import { createDefaultExeConfig, buildWindowsExecutable } from './utils/peBuilder';
import { generateIcoFromCanvas } from './utils/icoGenerator';
import { NesRomData, WindowsExeConfig } from './types/nes';

export default function App() {
  // Load Blade Bounce sample as default
  const defaultParsed = useMemo(() => {
    return parseNesRom(SAMPLE_ROMS[0].data, 'blade_bounce.nes');
  }, []);

  const [currentRom, setCurrentRom] = useState<NesRomData>(defaultParsed);
  const [activeTab, setActiveTab] = useState<'emulator' | 'doctor' | 'pe_inspector' | 'hex' | 'config'>('emulator');
  const [exeConfig, setExeConfig] = useState<WindowsExeConfig>(() =>
    createDefaultExeConfig('Blade Bounce')
  );
  const [customIcoBytes, setCustomIcoBytes] = useState<Uint8Array | undefined>(undefined);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  const emulatorCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute PE summary on the fly
  const peSummary = useMemo(() => {
    try {
      const romBytes = serializeNesRom(
        currentRom.header,
        currentRom.prgRom,
        currentRom.chrRom,
        currentRom.trainer,
        currentRom.header.isNes2
      );
      const { summary } = buildWindowsExecutable(romBytes, exeConfig, customIcoBytes);
      return summary;
    } catch {
      return {
        machine: 'AMD64 (x64)',
        subsystem: 'IMAGE_SUBSYSTEM_WINDOWS_GUI',
        entryPointRva: 0x1000,
        imageBase: '0x140000000',
        sectionAlignment: 4096,
        fileAlignment: 512,
        sections: [],
        totalFileSize: 0,
      };
    }
  }, [currentRom, exeConfig, customIcoBytes]);

  const handleRomLoaded = (rom: NesRomData) => {
    setCurrentRom(rom);
    const title = rom.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
    setExeConfig((prev) => ({
      ...prev,
      gameTitle: title.charAt(0).toUpperCase() + title.slice(1),
      description: `${title} Standalone Windows Executable`,
    }));
  };

  const handleCaptureIcon = () => {
    if (emulatorCanvasRef.current) {
      const ico = generateIcoFromCanvas(emulatorCanvasRef.current);
      setCustomIcoBytes(ico);
      // Auto open config tab on icon section
      setActiveTab('config');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Bar Contract compliant Navigation */}
      <HeaderBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenExport={() => setIsExportModalOpen(true)}
        romName={currentRom.fileName}
      />

      {/* Main Workspace Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Global ROM Uploader & Stats Strip */}
        <RomUploader
          currentRom={currentRom}
          onRomLoaded={handleRomLoaded}
        />

        {/* Tab Views */}
        {activeTab === 'emulator' && (
          <EmulatorView
            rom={currentRom}
            config={exeConfig}
            canvasRef={emulatorCanvasRef}
            onCaptureIcon={handleCaptureIcon}
          />
        )}

        {activeTab === 'doctor' && (
          <RomDoctor
            rom={currentRom}
            onRomUpdated={setCurrentRom}
          />
        )}

        {activeTab === 'pe_inspector' && (
          <PEInspector
            peSummary={peSummary}
            config={exeConfig}
          />
        )}

        {activeTab === 'hex' && (
          <HexViewer
            rom={currentRom}
          />
        )}

        {activeTab === 'config' && (
          <ExeConfigStudio
            config={exeConfig}
            onConfigChange={setExeConfig}
            emulatorCanvasRef={emulatorCanvasRef}
            customIcoBytes={customIcoBytes}
            onSetCustomIco={setCustomIcoBytes}
          />
        )}
      </main>

      {/* Minimal clean footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>NES to Windows EXE Header Converter & Runtime Engine</span>
          <span>·</span>
          <span>PE32+ GUI Subsystem</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>iNES 1.0 & NES 2.0 Compliant</span>
          <span>·</span>
          <span>Direct3D & XInput Ready</span>
        </div>
      </footer>

      {/* Export Executable & Package Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        rom={currentRom}
        config={exeConfig}
        customIcoBytes={customIcoBytes}
      />
    </div>
  );
}
