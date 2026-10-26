/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Wrench,
  Download,
  AlertTriangle,
  RotateCw,
  Cpu,
  Layers,
  BatteryCharging,
  Tv,
} from 'lucide-react';
import { NesRomData, MirroringType, TVSystem } from '../types/nes';
import { serializeNesRom, getMapperName, parseNesRom } from '../utils/nesParser';

interface RomDoctorProps {
  rom: NesRomData;
  onRomUpdated: (updatedRom: NesRomData) => void;
}

export const RomDoctor: React.FC<RomDoctorProps> = ({ rom, onRomUpdated }) => {
  const [mapperId, setMapperId] = useState<number>(rom.header.mapperId);
  const [mirroring, setMirroring] = useState<MirroringType>(rom.header.mirroring);
  const [hasBattery, setHasBattery] = useState<boolean>(rom.header.hasBattery);
  const [hasTrainer, setHasTrainer] = useState<boolean>(rom.header.hasTrainer);
  const [tvSystem, setTvSystem] = useState<TVSystem>(rom.header.tvSystem);
  const [upgradeToNes2, setUpgradeToNes2] = useState<boolean>(rom.header.isNes2);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sync state if ROM prop changes
  React.useEffect(() => {
    setMapperId(rom.header.mapperId);
    setMirroring(rom.header.mirroring);
    setHasBattery(rom.header.hasBattery);
    setHasTrainer(rom.header.hasTrainer);
    setTvSystem(rom.header.tvSystem);
    setUpgradeToNes2(rom.header.isNes2);
  }, [rom]);

  const applyChanges = () => {
    const newBytes = serializeNesRom(
      {
        mapperId,
        mirroring,
        hasBattery,
        tvSystem,
        isFourScreen: mirroring === 'four-screen',
      },
      rom.prgRom,
      rom.chrRom,
      hasTrainer ? (rom.trainer || new Uint8Array(512)) : undefined,
      upgradeToNes2
    );

    const updated = parseNesRom(newBytes, rom.fileName);
    onRomUpdated(updated);
    setStatusMessage('Header successfully reconstructed and verified!');
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const downloadPatchedRom = () => {
    const newBytes = serializeNesRom(
      {
        mapperId,
        mirroring,
        hasBattery,
        tvSystem,
        isFourScreen: mirroring === 'four-screen',
      },
      rom.prgRom,
      rom.chrRom,
      hasTrainer ? (rom.trainer || new Uint8Array(512)) : undefined,
      upgradeToNes2
    );
    const blob = new Blob([newBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repaired_${rom.fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const byteLabels = [
    'Magic N', 'Magic E', 'Magic S', 'Magic ^Z',
    'PRG 16K', 'CHR 8K', 'Flags 6 (Map/Mir)', 'Flags 7 (Map/NES2)',
    'Flags 8 (Sub/RAM)', 'Flags 9 (TV/Hi)', 'Flags 10 (RAM)', 'Reserved',
    'Reserved', 'Reserved', 'Reserved', 'Reserved',
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            {rom.diagnostics.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <h2 className="text-lg font-bold text-white tracking-tight">
              {rom.diagnostics.length === 0
                ? 'Header Health Status: Pristine'
                : `Header Diagnostics: ${rom.diagnostics.length} Warning(s) Detected`}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Standard: {rom.header.isNes2 ? 'Modern NES 2.0 Specification' : 'Legacy iNES 1.0 Specification'}
            {' · '}
            Mapper: {rom.mapperName}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={applyChanges}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            Rebuild Header
          </button>
          <button
            onClick={downloadPatchedRom}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Save .NES
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Diagnostics List */}
      {rom.diagnostics.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1.5">
          <span className="font-semibold block text-amber-400">Diagnostic Findings:</span>
          {rom.diagnostics.map((diag, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-amber-400">▪</span>
              <span>{diag}</span>
            </div>
          ))}
        </div>
      )}

      {/* 16-Byte Header Hex Inspector Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
          <span>Raw Header Byte Matrix (Offsets 0x00 - 0x0F)</span>
          <span className="text-xs text-slate-400 font-mono">16 Bytes</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {Array.from(rom.rawHeader).map((byte, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center hover:border-amber-500/40 transition-colors"
            >
              <span className="text-[10px] font-mono text-slate-400 mb-1">
                +0x{idx.toString(16).toUpperCase().padStart(2, '0')}
              </span>
              <span className="text-base font-mono font-bold text-amber-400 tabular-nums">
                {byte.toString(16).toUpperCase().padStart(2, '0')}
              </span>
              <span className="text-[10px] text-slate-400 truncate w-full mt-1" title={byteLabels[idx]}>
                {byteLabels[idx]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Header Doctor & Repair Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Specification & Mapper */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>Architecture & Format</span>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Header Specification</label>
            <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setUpgradeToNes2(false)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !upgradeToNes2 ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                iNES 1.0
              </button>
              <button
                type="button"
                onClick={() => setUpgradeToNes2(true)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  upgradeToNes2 ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                NES 2.0 (Modern)
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Cartridge Mapper ID</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                max="255"
                value={mapperId}
                onChange={(e) => setMapperId(parseInt(e.target.value) || 0)}
                className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-slate-400 flex items-center truncate">
                {getMapperName(mapperId).split(' (')[0]}
              </span>
            </div>
          </div>
        </div>

        {/* Video & Mirroring */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Nametable Mirroring & TV</span>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Nametable Mirroring</label>
            <select
              value={mirroring}
              onChange={(e) => setMirroring(e.target.value as MirroringType)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="horizontal">Horizontal (Super Mario, Kid Icarus)</option>
              <option value="vertical">Vertical (Mega Man, Metroid, Castlevania)</option>
              <option value="four-screen">Four-Screen VRAM (Gauntlet, Rad Racer II)</option>
              <option value="single-screen-lower">Single-Screen Lower</option>
              <option value="single-screen-upper">Single-Screen Upper</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">TV Video System</label>
            <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setTvSystem('NTSC')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tvSystem === 'NTSC' ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                NTSC (60Hz)
              </button>
              <button
                type="button"
                onClick={() => setTvSystem('PAL')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tvSystem === 'PAL' ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                PAL (50Hz)
              </button>
            </div>
          </div>
        </div>

        {/* Battery & Memory Flags */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <BatteryCharging className="w-4 h-4 text-amber-400" />
            <span>NVRAM & Special Features</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <div>
              <span className="text-xs font-medium text-slate-200 block">Battery-Backed SRAM</span>
              <span className="text-[11px] text-slate-400">Non-volatile saves (Zelda, RPGs)</span>
            </div>
            <input
              type="checkbox"
              checked={hasBattery}
              onChange={(e) => setHasBattery(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <div>
              <span className="text-xs font-medium text-slate-200 block">512-Byte Trainer</span>
              <span className="text-[11px] text-slate-400">Copier / Game Genie trainer prefix</span>
            </div>
            <input
              type="checkbox"
              checked={hasTrainer}
              onChange={(e) => setHasTrainer(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
