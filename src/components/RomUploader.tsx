/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Upload, Gamepad2, FileCheck, Sparkles, Layers } from 'lucide-react';
import { NesRomData } from '../types/nes';
import { parseNesRom } from '../utils/nesParser';
import { SAMPLE_ROMS, SampleRomInfo } from '../utils/sampleRoms';

interface RomUploaderProps {
  currentRom: NesRomData;
  onRomLoaded: (rom: NesRomData) => void;
}

export const RomUploader: React.FC<RomUploaderProps> = ({ currentRom, onRomLoaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (buffer) {
        const bytes = new Uint8Array(buffer);
        const parsed = parseNesRom(bytes, file.name);
        onRomLoaded(parsed);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (buffer) {
        const bytes = new Uint8Array(buffer);
        const parsed = parseNesRom(bytes, file.name);
        onRomLoaded(parsed);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const loadSample = (sample: SampleRomInfo) => {
    const parsed = parseNesRom(sample.data, `${sample.id}.nes`);
    onRomLoaded(parsed);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 mb-6">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5">
        {/* Dropzone & Quick Upload */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center gap-4 p-4 rounded-lg border border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-950/40 hover:bg-slate-950/70 transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shrink-0">
            <Upload className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100 group-hover:text-amber-300 transition-colors">
                Drop your .NES ROM here
              </span>
              <span className="text-xs text-slate-400">or browse computer</span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              Supports standard iNES 1.0, NES 2.0, Famicom dumps, and raw homebrew
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".nes,.bin,.rom"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Sample ROM quick selection */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Built-in Samples:
          </span>
          <div className="flex items-center gap-2">
            {SAMPLE_ROMS.map((sample) => (
              <button
                key={sample.id}
                onClick={() => loadSample(sample)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  currentRom.fileName.includes(sample.id)
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="whitespace-nowrap">{sample.name.split(' (')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Clean Unboxed Metadata Strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-4 pt-3.5 border-t border-slate-800/80 text-xs text-slate-400">
        <span className="flex items-center gap-1.5 text-slate-200 font-medium">
          <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
          {currentRom.fileName}
        </span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span>{(currentRom.fileSize / 1024).toFixed(1)} KB</span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span className="text-amber-400 font-mono">Mapper {currentRom.header.mapperId}</span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span>PRG: {currentRom.header.prgRomSize16K * 16} KB</span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span>CHR: {currentRom.header.chrRomSize8K === 0 ? 'RAM (8 KB)' : `${currentRom.header.chrRomSize8K * 8} KB`}</span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span className="capitalize">{currentRom.header.mirroring} Mirroring</span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span className="font-mono tabular-nums text-slate-400">CRC32: {currentRom.crc32}</span>
      </div>
    </div>
  );
};
