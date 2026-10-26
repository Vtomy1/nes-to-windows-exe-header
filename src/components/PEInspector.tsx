/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Cpu, Layers, HardDrive, Terminal, ShieldCheck, Box } from 'lucide-react';
import { PeHeaderSummary, WindowsExeConfig } from '../types/nes';

interface PEInspectorProps {
  peSummary: PeHeaderSummary;
  config: WindowsExeConfig;
}

export const PEInspector: React.FC<PEInspectorProps> = ({ peSummary, config }) => {
  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Windows Portable Executable (PE32+) Header Architecture
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Standard: Windows 10/11 Win32 GUI Native Subsystem · Target: {peSummary.machine} · Total File Size:{' '}
            <span className="font-mono tabular-nums text-slate-200">
              {(peSummary.totalFileSize / 1024).toFixed(1)} KB ({peSummary.totalFileSize.toLocaleString()} bytes)
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium">
            SUBSYSTEM_WINDOWS_GUI
          </span>
          <span className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-medium">
            {config.targetArchitecture.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Header Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            DOS Header Signature
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-400">0x5A4D</span>
            <span className="text-xs font-mono text-slate-400">"MZ" (Mark Zbikowski)</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            16-bit DOS real-mode header pointing to e_lfanew at offset 0x80.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            PE Signature & Machine
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-400">0x00004550</span>
            <span className="text-xs font-mono text-slate-400">"PE\0\0"</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Machine ID: {config.targetArchitecture === 'x64' ? '0x8664 (AMD64)' : '0x014C (I386)'}.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Entry Point RVA
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-400">
              0x{peSummary.entryPointRva.toString(16).toUpperCase().padStart(8, '0')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Relative Virtual Address where native bootstrap execution begins.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
            Alignment Spec
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-400">4096 / 512</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Section Alignment: 0x1000 · File Sector Alignment: 0x200 bytes.
          </p>
        </div>
      </div>

      {/* Section Table Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Synthesized Executable Section Table ({peSummary.sections.length} Sections)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">IMAGE_SECTION_HEADER</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Section</th>
                <th className="py-3 px-4 font-semibold font-mono">Virtual Size</th>
                <th className="py-3 px-4 font-semibold font-mono">Virtual Address (RVA)</th>
                <th className="py-3 px-4 font-semibold font-mono">Raw Size</th>
                <th className="py-3 px-4 font-semibold font-mono">Raw Offset</th>
                <th className="py-3 px-4 font-semibold">Characteristics</th>
                <th className="py-3 px-4 font-semibold">Purpose & Contents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
              {peSummary.sections.map((sec, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-bold text-amber-400 font-sans">
                    {sec.name}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    0x{sec.virtualSize.toString(16).toUpperCase()} ({sec.virtualSize} B)
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    0x{sec.virtualAddress.toString(16).toUpperCase()}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    0x{sec.rawSize.toString(16).toUpperCase()} ({sec.rawSize} B)
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    0x{sec.rawOffset.toString(16).toUpperCase()}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    0x{sec.characteristics.toString(16).toUpperCase()}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-sans text-xs">
                    {sec.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deep Technical Explanation of Why This Works Seamlessly */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Seamless Launch & Subsystem GUI</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            By setting Subsystem to <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">IMAGE_SUBSYSTEM_WINDOWS_GUI (0x0002)</code>,
            Windows executes the binary without allocating or flashing a black command prompt console window.
            The window is initialized immediately with Direct3D/GDI double-buffering.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Box className="w-4 h-4 text-amber-400" />
            <span>.nesrom Payload Section Embedding</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Rather than relying on external files or insecure temp extraction, the sanitized NES cartridge ROM
            and the runtime configuration header are mapped directly into a dedicated PE section named
            <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded ml-1">.nesrom</code>. The launcher
            maps this section directly from memory into the CPU/PPU bus.
          </p>
        </div>
      </div>
    </div>
  );
};
