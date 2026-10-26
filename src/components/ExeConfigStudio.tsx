/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Monitor,
  Volume2,
  Gamepad2,
  Sliders,
  Check,
  Image as ImageIcon,
  HardDrive,
  Eye,
  Tv,
} from 'lucide-react';
import { WindowsExeConfig } from '../types/nes';
import { generateIcoFromCanvas } from '../utils/icoGenerator';

interface ExeConfigStudioProps {
  config: WindowsExeConfig;
  onConfigChange: (newConfig: WindowsExeConfig) => void;
  emulatorCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  customIcoBytes?: Uint8Array;
  onSetCustomIco: (bytes: Uint8Array | undefined) => void;
}

export const ExeConfigStudio: React.FC<ExeConfigStudioProps> = ({
  config,
  onConfigChange,
  emulatorCanvasRef,
  customIcoBytes,
  onSetCustomIco,
}) => {
  const [activeTab, setActiveTab] = useState<'app' | 'display' | 'audio' | 'input' | 'icon'>('app');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const updateField = <K extends keyof WindowsExeConfig>(key: K, value: WindowsExeConfig[K]) => {
    onConfigChange({
      ...config,
      [key]: value,
    });
  };

  const captureIconFromEmulator = () => {
    if (!emulatorCanvasRef?.current) {
      alert('Emulator is not running or no frame rendered yet.');
      return;
    }
    const ico = generateIcoFromCanvas(emulatorCanvasRef.current);
    onSetCustomIco(ico);
    setStatusMsg('Captured current gameplay frame as Windows .ico icon!');
    setTimeout(() => setStatusMsg(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            Windows Desktop Executable Studio
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure the native launcher behavior, display subsystem, audio fidelity, and embedded metadata.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
          <button
            onClick={() => setActiveTab('app')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'app' ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Application
          </button>
          <button
            onClick={() => setActiveTab('display')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'display' ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Display & CRT
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'audio' ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Audio
          </button>
          <button
            onClick={() => setActiveTab('input')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'input' ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Controls
          </button>
          <button
            onClick={() => setActiveTab('icon')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'icon' ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Desktop Icon
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Tab 1: Application Identity */}
      {activeTab === 'app' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" />
              Windows Executable Metadata
            </h3>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Game Title</label>
              <input
                type="text"
                value={config.gameTitle}
                onChange={(e) => updateField('gameTitle', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Publisher / Author</label>
              <input
                type="text"
                value={config.publisher}
                onChange={(e) => updateField('publisher', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Version String</label>
              <input
                type="text"
                value={config.version}
                onChange={(e) => updateField('version', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Application Description</label>
              <input
                type="text"
                value={config.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              Binary Subsystem & Target
            </h3>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Processor Architecture</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateField('targetArchitecture', 'x64')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    config.targetArchitecture === 'x64'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Windows x64 (AMD64 64-bit)
                </button>
                <button
                  type="button"
                  onClick={() => updateField('targetArchitecture', 'x86')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    config.targetArchitecture === 'x86'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Windows x86 (I386 32-bit)
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-400 space-y-2">
              <span className="font-semibold text-slate-200 block">Desktop Execution Invariants:</span>
              <p>• Output executable: <span className="text-amber-400 font-mono">{config.gameTitle.replace(/[^a-zA-Z0-9_\-]/g, '_')}.exe</span></p>
              <p>• Subsystem: <span className="text-emerald-400 font-mono">IMAGE_SUBSYSTEM_WINDOWS_GUI</span></p>
              <p>• High-DPI Aware: Enabled in XML manifest</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Display & CRT */}
      {activeTab === 'display' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-amber-400" />
              Window & Resolution Mode
            </h3>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Default Window Mode</label>
              <select
                value={config.defaultWindowMode}
                onChange={(e) => updateField('defaultWindowMode', e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="windowed-4-3">Windowed (4:3 Aspect Ratio with Black Pillarbox)</option>
                <option value="windowed-integer">Windowed Integer Scaling (Crisp Pixel Ratio)</option>
                <option value="fullscreen-4-3">Fullscreen (4:3 Aspect Ratio)</option>
                <option value="borderless-fill">Borderless Windowed Fullscreen</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Default Integer Scale (Windowed Mode): {config.defaultScale}x ({256 * config.defaultScale}x{240 * config.defaultScale} px)
              </label>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((scale) => (
                  <button
                    key={scale}
                    onClick={() => updateField('defaultScale', scale)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      config.defaultScale === scale
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {scale}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Tv className="w-4 h-4 text-amber-400" />
              Retro CRT & Rendering Shaders
            </h3>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200 block">Enable CRT Scanline Filter</span>
                <span className="text-[11px] text-slate-400">Phosphor shadow mask scanlines on launch</span>
              </div>
              <input
                type="checkbox"
                checked={config.enableCrtShader}
                onChange={(e) => updateField('enableCrtShader', e.target.checked)}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200 block">Vertical Sync (VSync)</span>
                <span className="text-[11px] text-slate-400">Lock to 60.0 Hz monitor refresh without screen tearing</span>
              </div>
              <input
                type="checkbox"
                checked={config.enableVsync}
                onChange={(e) => updateField('enableVsync', e.target.checked)}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200 block">Show FPS Counter</span>
                <span className="text-[11px] text-slate-400">Overlay tiny frame counter in corner</span>
              </div>
              <input
                type="checkbox"
                checked={config.showFps}
                onChange={(e) => updateField('showFps', e.target.checked)}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Audio */}
      {activeTab === 'audio' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-amber-400" />
              Audio Output Settings
            </h3>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Sample Rate</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateField('audioSampleRate', 48000)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    config.audioSampleRate === 48000
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  48,000 Hz (Windows DirectSound Native)
                </button>
                <button
                  type="button"
                  onClick={() => updateField('audioSampleRate', 44100)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    config.audioSampleRate === 44100
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  44,100 Hz (CD Audio)
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Master Volume: {config.masterVolume}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={config.masterVolume}
                onChange={(e) => updateField('masterVolume', parseInt(e.target.value) || 0)}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200 block">Low-Pass Filter (Authentic DAC)</span>
                <span className="text-[11px] text-slate-400">Emulate original NES analog output capacitor roll-off</span>
              </div>
              <input
                type="checkbox"
                checked={config.lowPassFilter}
                onChange={(e) => updateField('lowPassFilter', e.target.checked)}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Controls */}
      {activeTab === 'input' && (
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-amber-400" />
            Input & Gamepad Configuration
          </h3>

          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div>
              <span className="text-xs font-medium text-slate-200 block">XInput Gamepad Auto-Mapping</span>
              <span className="text-[11px] text-slate-400">Automatically map Xbox, DualSense, and 8BitDo gamepads to Player 1</span>
            </div>
            <input
              type="checkbox"
              checked={config.xinputAutoMap}
              onChange={(e) => updateField('xinputAutoMap', e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">D-Pad Up</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.up}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">D-Pad Down</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.down}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">D-Pad Left</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.left}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">D-Pad Right</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.right}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Button A</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.a}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Button B</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.b}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Select</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.select}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Start</span>
              <span className="font-mono text-amber-400 font-semibold">{config.keyBindings.start}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Desktop Icon */}
      {activeTab === 'icon' && (
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                Windows Application Icon (.ico)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Embedded directly into the <code className="text-amber-400">.rsrc</code> section of the Windows executable.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={captureIconFromEmulator}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                Capture from Gameplay Frame
              </button>
              {customIcoBytes && (
                <button
                  type="button"
                  onClick={() => onSetCustomIco(undefined)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Reset to Default Cartridge
                </button>
              )}
            </div>
          </div>

          {/* Desktop Mockup Preview */}
          <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-center gap-8 justify-center">
            {/* Desktop Icon view */}
            <div className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-slate-900/50 transition-colors cursor-pointer">
              <div className="w-16 h-16 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center p-2 shadow-md">
                <div className="w-12 h-12 bg-amber-500/20 border border-amber-500/30 rounded flex items-center justify-center text-amber-400 font-bold font-mono text-xs">
                  {customIcoBytes ? 'CUSTOM' : 'NES'}
                </div>
              </div>
              <span className="text-xs font-medium text-slate-200 text-center truncate max-w-[120px]">
                {config.gameTitle}.exe
              </span>
            </div>

            {/* Simulated Windows Taskbar item */}
            <div className="w-full max-w-sm p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center text-[10px] font-mono text-amber-400 font-bold">
                N
              </div>
              <div className="flex-1 truncate">
                <span className="text-xs font-medium text-white block truncate">{config.gameTitle}</span>
                <span className="text-[10px] text-slate-400 block">Direct3D 60 FPS</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
