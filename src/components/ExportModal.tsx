/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Download,
  X,
  FileCode,
  Archive,
  CheckCircle2,
  HardDrive,
  Cpu,
  ShieldCheck,
  Save,
} from 'lucide-react';
import { NesRomData, WindowsExeConfig, RomSaveState } from '../types/nes';
import { buildWindowsExecutable, buildDesktopDistributionZip } from '../utils/peBuilder';
import { serializeNesRom } from '../utils/nesParser';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rom: NesRomData;
  config: WindowsExeConfig;
  customIcoBytes?: Uint8Array;
  saveStates: RomSaveState[];
  selectedSaveStateId?: string;
  onSelectSaveStateId: (id: string | undefined) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  rom,
  config,
  customIcoBytes,
  saveStates,
  selectedSaveStateId,
  onSelectSaveStateId,
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const sanitizedFileName = config.gameTitle.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const activeSaveState = saveStates.find((s) => s.id === selectedSaveStateId);

  const downloadExeDirect = () => {
    setIsExporting(true);
    try {
      const { exeBytes } = buildWindowsExecutable(
        serializeNesRom(rom.header, rom.prgRom, rom.chrRom, rom.trainer, rom.header.isNes2),
        config,
        customIcoBytes,
        activeSaveState
      );
      const blob = new Blob([exeBytes.buffer as ArrayBuffer], { type: 'application/vnd.microsoft.portable-executable' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedFileName}.exe`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessNotice(`Downloaded ${sanitizedFileName}.exe`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadZipPackage = async () => {
    setIsExporting(true);
    try {
      const zipBlob = await buildDesktopDistributionZip(
        serializeNesRom(rom.header, rom.prgRom, rom.chrRom, rom.trainer, rom.header.isNes2),
        config,
        customIcoBytes,
        activeSaveState
      );
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedFileName}_Desktop_Package.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessNotice(`Downloaded complete desktop release bundle (.zip)`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadNesRom = () => {
    const raw = serializeNesRom(rom.header, rom.prgRom, rom.chrRom, rom.trainer, rom.header.isNes2);
    const blob = new Blob([raw.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted_${rom.fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Export Standalone Windows Executable
              </h3>
              <p className="text-xs text-slate-400">
                Ready for double-click execution on Windows 10 & 11
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {successNotice && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Save State Selection */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
          <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <Save className="w-3.5 h-3.5 text-amber-400" />
            <span>Pre-Packaged Save State (Game Progress)</span>
          </label>
          <p className="text-[11px] text-slate-400">
            Choose whether to resume from your current checkpoint on desktop launch, or start cleanly from the title screen.
          </p>
          <select
            value={selectedSaveStateId || ''}
            onChange={(e) => onSelectSaveStateId(e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="">Start from Title Screen (No Save State)</option>
            {saveStates.map((s) => (
              <option key={s.id} value={s.id}>
                Slot {s.slotNumber}: {s.name} ({new Date(s.timestamp).toLocaleTimeString()})
              </option>
            ))}
          </select>
        </div>

        {/* Binary Build Summary */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
          <span className="font-semibold text-slate-200 block">Synthesized Target Package:</span>
          <div className="grid grid-cols-2 gap-2 text-slate-400">
            <div>
              Target Subsystem: <span className="text-slate-200 font-mono">Windows GUI (0x02)</span>
            </div>
            <div>
              Architecture: <span className="text-slate-200 font-mono">{config.targetArchitecture.toUpperCase()}</span>
            </div>
            <div>
              Default Window: <span className="text-slate-200 font-mono">{config.defaultWindowMode}</span>
            </div>
            <div>
              CRT Scanlines: <span className="text-slate-200 font-mono">{config.enableCrtShader ? 'Active' : 'Off'}</span>
            </div>
            <div>
              Audio Sampling: <span className="text-slate-200 font-mono">{config.audioSampleRate} Hz</span>
            </div>
            <div>
              Embedded Progress: <span className="text-amber-400 font-mono">{activeSaveState ? activeSaveState.name : 'None'}</span>
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="space-y-3">
          {/* Primary Option: Complete Portable ZIP */}
          <button
            disabled={isExporting}
            onClick={downloadZipPackage}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold transition-all shadow-md active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center gap-3 text-left">
              <Archive className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-sm font-bold">Complete Desktop Release Bundle (.zip)</div>
                <div className="text-xs font-normal text-slate-900 opacity-90">
                  Includes {sanitizedFileName}.exe, config.ini, autorun.inf, icon.ico, {activeSaveState ? 'saves/quicksave.state, ' : ''}and saves/ folder
                </div>
              </div>
            </div>
            <Download className="w-5 h-5 shrink-0 ml-3" />
          </button>

          {/* Secondary Option: Direct .exe */}
          <button
            disabled={isExporting}
            onClick={downloadExeDirect}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-left">
                <span className="font-semibold block">{sanitizedFileName}.exe (Direct Executable)</span>
                <span className="text-slate-400 text-[11px]">Standalone single-file Portable Executable with embedded payload</span>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </button>

          {/* Tertiary Option: Converted .nes ROM */}
          <button
            disabled={isExporting}
            onClick={downloadNesRom}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Export Repaired / Converted .NES ROM</span>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
