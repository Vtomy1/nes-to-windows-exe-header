/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Navigation } from 'lucide-react';
import { NesRomData } from '../types/nes';

interface HexViewerProps {
  rom: NesRomData;
}

export const HexViewer: React.FC<HexViewerProps> = ({ rom }) => {
  const [page, setPage] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const bytesPerPage = 512; // 32 rows of 16 bytes
  const totalPages = Math.ceil(rom.fileSize / bytesPerPage);

  // Raw file bytes
  const fileBytes = useMemo(() => {
    // Reconstruct full file
    const total = 16 + (rom.trainer ? 512 : 0) + rom.prgRom.length + rom.chrRom.length;
    const buf = new Uint8Array(total);
    buf.set(rom.rawHeader, 0);
    let offset = 16;
    if (rom.trainer) {
      buf.set(rom.trainer, offset);
      offset += 512;
    }
    buf.set(rom.prgRom, offset);
    offset += rom.prgRom.length;
    buf.set(rom.chrRom, offset);
    return buf;
  }, [rom]);

  const currentSlice = useMemo(() => {
    const start = page * bytesPerPage;
    const end = Math.min(start + bytesPerPage, fileBytes.length);
    return fileBytes.slice(start, end);
  }, [page, fileBytes]);

  const rows = useMemo(() => {
    const result = [];
    const baseOffset = page * bytesPerPage;
    for (let i = 0; i < currentSlice.length; i += 16) {
      const slice = currentSlice.slice(i, i + 16);
      result.push({
        offset: baseOffset + i,
        bytes: slice,
      });
    }
    return result;
  }, [page, currentSlice]);

  const jumpToOffset = (targetOffset: number) => {
    const targetPage = Math.floor(targetOffset / bytesPerPage);
    setPage(Math.max(0, Math.min(totalPages - 1, targetPage)));
  };

  const getByteColorClass = (globalOffset: number): string => {
    if (globalOffset < 16) return 'text-amber-400 font-bold'; // Header
    if (rom.trainer && globalOffset >= 16 && globalOffset < 528) return 'text-purple-400'; // Trainer
    const prgStart = 16 + (rom.trainer ? 512 : 0);
    const prgEnd = prgStart + rom.prgRom.length;
    if (globalOffset >= prgEnd - 6 && globalOffset < prgEnd) return 'text-red-400 font-bold'; // Interrupt vectors
    if (globalOffset >= prgStart && globalOffset < prgEnd) return 'text-sky-300'; // PRG ROM
    return 'text-emerald-400'; // CHR ROM
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Toolbar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Quick jump navigation */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-amber-400" />
            Quick Seek:
          </span>
          <button
            onClick={() => jumpToOffset(0)}
            className="px-2.5 py-1 text-xs font-mono rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-400 transition-colors"
          >
            0x0000 (iNES Header)
          </button>
          <button
            onClick={() => jumpToOffset(16 + (rom.trainer ? 512 : 0))}
            className="px-2.5 py-1 text-xs font-mono rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-400 transition-colors"
          >
            0x{ (16 + (rom.trainer ? 512 : 0)).toString(16).toUpperCase() } (PRG Code)
          </button>
          <button
            onClick={() => jumpToOffset(16 + (rom.trainer ? 512 : 0) + rom.prgRom.length - 6)}
            className="px-2.5 py-1 text-xs font-mono rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-red-400 transition-colors"
          >
            Vectors ($FFFA)
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block"></span> Header
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block"></span> PRG-ROM
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block"></span> Vectors
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block"></span> CHR-ROM
          </span>
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-slate-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            Page {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-slate-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hex Table Display */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header Row */}
          <div className="flex items-center pb-2 mb-2 border-b border-slate-800 text-slate-400 text-[11px]">
            <span className="w-24 shrink-0 font-bold">Offset</span>
            <div className="flex-1 grid grid-cols-16 text-center font-bold">
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i}>{i.toString(16).toUpperCase()}</span>
              ))}
            </div>
            <span className="w-36 shrink-0 pl-4 font-bold">Decoded ASCII</span>
          </div>

          {/* Data Rows */}
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.offset} className="flex items-center hover:bg-slate-900/60 rounded px-1 py-0.5">
                {/* Offset */}
                <span className="w-24 shrink-0 text-slate-400 tabular-nums">
                  0x{row.offset.toString(16).toUpperCase().padStart(6, '0')}
                </span>

                {/* Hex Bytes */}
                <div className="flex-1 grid grid-cols-16 text-center tabular-nums">
                  {Array.from({ length: 16 }).map((_, i) => {
                    const byte = row.bytes[i];
                    if (byte === undefined) {
                      return <span key={i} className="text-slate-700">..</span>;
                    }
                    const globalOffset = row.offset + i;
                    const colorClass = getByteColorClass(globalOffset);
                    return (
                      <span key={i} className={colorClass}>
                        {byte.toString(16).toUpperCase().padStart(2, '0')}
                      </span>
                    );
                  })}
                </div>

                {/* ASCII */}
                <span className="w-36 shrink-0 pl-4 text-slate-400 tracking-wider">
                  {Array.from({ length: 16 }).map((_, i) => {
                    const byte = row.bytes[i];
                    if (byte === undefined) return ' ';
                    return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
                  }).join('')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
