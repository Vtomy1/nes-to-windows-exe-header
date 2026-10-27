/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Tv,
  Save,
  Upload,
  Gamepad2,
  Camera,
  Plus,
  Trash2,
  Download,
  FolderInput,
  Edit2,
  Check,
  PackageCheck,
  Clock,
  Sparkles,
} from 'lucide-react';
import { NesRomData, WindowsExeConfig, RomSaveState } from '../types/nes';
import { NesSystem } from '../emulator/nes';

interface EmulatorViewProps {
  rom: NesRomData;
  config: WindowsExeConfig;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCaptureIcon: () => void;
  saveStates: RomSaveState[];
  onSaveStatesChange: (states: RomSaveState[]) => void;
  selectedSaveStateId?: string;
  onSelectSaveStateId: (id: string | undefined) => void;
  onOpenExportModal: () => void;
}

export const EmulatorView: React.FC<EmulatorViewProps> = ({
  rom,
  config,
  canvasRef,
  onCaptureIcon,
  saveStates,
  onSaveStatesChange,
  selectedSaveStateId,
  onSelectSaveStateId,
  onOpenExportModal,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(config.masterVolume);
  const [crtFilter, setCrtFilter] = useState<boolean>(config.enableCrtShader);
  const [crtGlow, setCrtGlow] = useState<boolean>(true);
  const [aspectMode, setAspectMode] = useState<'4-3' | 'pixel-perfect' | 'fill'>('4-3');
  const [gamepadConnected, setGamepadConnected] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(60);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Editing state title
  const [editingStateId, setEditingStateId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  const nesRef = useRef<NesSystem | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cached frame ImageData to avoid GC pressure
  const imgDataRef = useRef<ImageData | null>(null);
  const buf32Ref = useRef<Uint32Array | null>(null);

  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(null), 3000);
  };

  // Initialize or reinitialize emulator when ROM changes
  useEffect(() => {
    try {
      const nes = new NesSystem(rom);
      nesRef.current = nes;
      nes.apu.setVolume(volume);
      nes.apu.setMuted(isMuted);

      // Reset image buffer
      imgDataRef.current = null;
      buf32Ref.current = null;
    } catch (e) {
      console.error('Failed to initialize NES system:', e);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [rom]);

  // Volume & Mute sync
  useEffect(() => {
    if (nesRef.current) {
      nesRef.current.apu.setVolume(volume);
      nesRef.current.apu.setMuted(isMuted);
    }
  }, [volume, isMuted]);

  // Gamepad polling
  const pollGamepads = useCallback(() => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (gp && nesRef.current) {
      if (gamepadConnected !== gp.id) setGamepadConnected(gp.id);

      const c = nesRef.current.controller1;
      c.a = gp.buttons[0]?.pressed || false;
      c.b = gp.buttons[1]?.pressed || gp.buttons[2]?.pressed || false;
      c.select = gp.buttons[8]?.pressed || false;
      c.start = gp.buttons[9]?.pressed || false;

      const dUp = gp.buttons[12]?.pressed || (gp.axes[1] && gp.axes[1] < -0.5);
      const dDown = gp.buttons[13]?.pressed || (gp.axes[1] && gp.axes[1] > 0.5);
      const dLeft = gp.buttons[14]?.pressed || (gp.axes[0] && gp.axes[0] < -0.5);
      const dRight = gp.buttons[15]?.pressed || (gp.axes[0] && gp.axes[0] > 0.5);

      c.up = !!dUp;
      c.down = !!dDown;
      c.left = !!dLeft;
      c.right = !!dRight;
    } else if (gamepadConnected) {
      setGamepadConnected(null);
    }
  }, [gamepadConnected]);

  // Capture thumbnail preview from canvas
  const captureThumbnail = (): string | undefined => {
    if (!canvasRef.current) return undefined;
    try {
      return canvasRef.current.toDataURL('image/jpeg', 0.85);
    } catch {
      return undefined;
    }
  };

  // Create a new Save State
  const handleCreateSaveState = (customTitle?: string) => {
    if (!nesRef.current) return;
    const stateJson = nesRef.current.saveState();
    const thumb = captureThumbnail();
    const nextSlot = saveStates.length + 1;
    const title = customTitle || `Checkpoint ${nextSlot}`;

    const newState: RomSaveState = {
      id: `state_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: title,
      slotNumber: nextSlot,
      timestamp: Date.now(),
      thumbnailUrl: thumb,
      stateJson,
      romCrc32: rom.crc32,
    };

    const updated = [newState, ...saveStates];
    onSaveStatesChange(updated);
    onSelectSaveStateId(newState.id);
    showToast(`Created Save State: "${title}"`);
  };

  // Load a Save State
  const handleLoadSaveState = (state: RomSaveState) => {
    if (!nesRef.current) return;
    const ok = nesRef.current.loadState(state.stateJson);
    if (ok) {
      showToast(`Resumed: "${state.name}"`);
    } else {
      showToast('Error loading save state');
    }
  };

  // Delete a Save State
  const handleDeleteSaveState = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = saveStates.filter((s) => s.id !== id);
    onSaveStatesChange(updated);
    if (selectedSaveStateId === id) {
      onSelectSaveStateId(updated[0]?.id);
    }
    showToast('Save state deleted');
  };

  // Download a Save State file (.state)
  const handleDownloadSaveState = (state: RomSaveState, e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([state.stateJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.state`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported "${state.name}.state"`);
  };

  // Import Save State file from user's computer
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.cpu || !parsed.ram) {
          throw new Error('Invalid state structure');
        }

        const newState: RomSaveState = {
          id: `state_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          slotNumber: saveStates.length + 1,
          timestamp: Date.now(),
          stateJson: text,
          romCrc32: rom.crc32,
        };

        const updated = [newState, ...saveStates];
        onSaveStatesChange(updated);
        onSelectSaveStateId(newState.id);
        showToast(`Imported "${newState.name}"`);
      } catch (err) {
        showToast('Failed to import file: Invalid save state format');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Save state title editing
  const handleStartRename = (state: RomSaveState, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStateId(state.id);
    setEditingTitle(state.name);
  };

  const handleSaveRename = (stateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingTitle.trim()) return;
    const updated = saveStates.map((s) => (s.id === stateId ? { ...s, name: editingTitle.trim() } : s));
    onSaveStatesChange(updated);
    setEditingStateId(null);
    showToast('State renamed');
  };

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!nesRef.current) return;
      const c = nesRef.current.controller1;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          c.up = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          c.down = true;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          c.left = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          c.right = true;
          break;
        case 'KeyZ':
        case 'KeyJ':
          c.a = true;
          break;
        case 'KeyX':
        case 'KeyK':
          c.b = true;
          break;
        case 'Enter':
          c.start = true;
          break;
        case 'ShiftRight':
        case 'ShiftLeft':
          c.select = true;
          break;
        case 'F1':
          e.preventDefault();
          handleCreateSaveState();
          break;
        case 'F2':
          e.preventDefault();
          if (saveStates.length > 0) {
            const target = saveStates.find((s) => s.id === selectedSaveStateId) || saveStates[0];
            handleLoadSaveState(target);
          } else if (nesRef.current) {
            const ok = nesRef.current.loadState();
            showToast(ok ? 'Quick State Loaded' : 'No Save State Found');
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!nesRef.current) return;
      const c = nesRef.current.controller1;

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          c.up = false;
          break;
        case 'ArrowDown':
        case 'KeyS':
          c.down = false;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          c.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          c.right = false;
          break;
        case 'KeyZ':
        case 'KeyJ':
          c.a = false;
          break;
        case 'KeyX':
        case 'KeyK':
          c.b = false;
          break;
        case 'Enter':
          c.start = false;
          break;
        case 'ShiftRight':
        case 'ShiftLeft':
          c.select = false;
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [saveStates, selectedSaveStateId]);

  // Main Render & Emulation Loop (60 FPS)
  useEffect(() => {
    let active = true;

    const render = () => {
      if (!active) return;

      if (isPlaying && nesRef.current && canvasRef.current) {
        pollGamepads();

        // Step one video frame
        nesRef.current.stepFrame();

        // Draw framebuffer to Canvas
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (!imgDataRef.current) {
            imgDataRef.current = ctx.createImageData(256, 240);
            buf32Ref.current = new Uint32Array(imgDataRef.current.data.buffer);
          }
          if (buf32Ref.current && imgDataRef.current) {
            buf32Ref.current.set(nesRef.current.ppu.frameBuffer);
            ctx.putImageData(imgDataRef.current, 0, 0);
          }
        }

        // Calculate real FPS
        frameCountRef.current++;
        const now = performance.now();
        if (now - lastTimeRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastTimeRef.current = now;
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, pollGamepads]);

  const handleReset = () => {
    if (nesRef.current) {
      nesRef.current.reset();
      showToast('System Reset');
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const selectedStateObj = saveStates.find((s) => s.id === selectedSaveStateId);

  return (
    <div className="space-y-6">
      {/* Emulator Canvas Screen Area */}
      <div
        ref={containerRef}
        className="relative bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col items-center justify-center p-3 sm:p-6"
      >
        {/* Screen Frame Container */}
        <div
          className={`relative max-w-full flex items-center justify-center transition-all ${
            crtGlow ? 'crt-glow' : ''
          }`}
          style={{
            aspectRatio: aspectMode === '4-3' ? '4/3' : undefined,
          }}
        >
          {/* Main 256x240 NES Canvas */}
          <canvas
            ref={canvasRef}
            width={256}
            height={240}
            className={`block rounded transition-all image-rendering-pixelated ${
              aspectMode === 'pixel-perfect'
                ? 'w-[512px] h-[480px] max-w-full'
                : aspectMode === '4-3'
                ? 'w-full h-auto max-h-[540px] aspect-[4/3]'
                : 'w-full h-auto max-h-[540px]'
            }`}
            style={{ imageRendering: 'pixelated' }}
          />

          {/* CRT Scanline Overlay */}
          {crtFilter && <div className="absolute inset-0 crt-scanlines rounded pointer-events-none" />}

          {/* Notification Toast */}
          {toastNotice && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg bg-amber-500 text-slate-950 font-mono text-xs font-bold shadow-xl animate-bounce z-20 whitespace-nowrap">
              {toastNotice}
            </div>
          )}

          {/* Pause Overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-amber-400 gap-2">
              <Pause className="w-10 h-10" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider">
                Emulation Paused
              </span>
            </div>
          )}
        </div>

        {/* In-Game Status Bar */}
        <div className="w-full flex items-center justify-between text-[11px] text-slate-400 font-mono mt-3 px-2">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-bold tabular-nums">{fps} FPS</span>
            <span>·</span>
            <span>{rom.mapperName.split(' (')[0]}</span>
            <span>·</span>
            <span>NTSC 60Hz</span>
          </div>

          <div className="flex items-center gap-3">
            {gamepadConnected ? (
              <span className="text-amber-400 flex items-center gap-1">
                <Gamepad2 className="w-3.5 h-3.5" />
                Gamepad Active
              </span>
            ) : (
              <span className="text-slate-400">Controls: WASD/Arrows + Z/X</span>
            )}
          </div>
        </div>
      </div>

      {/* Control Deck */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Reset Console (Back to title)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1"></div>

          <button
            onClick={() => handleCreateSaveState()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 transition-colors cursor-pointer"
            title="Snapshot Save State (F1)"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save State (F1)</span>
          </button>

          <button
            onClick={() => {
              if (selectedStateObj) {
                handleLoadSaveState(selectedStateObj);
              } else if (saveStates.length > 0) {
                handleLoadSaveState(saveStates[0]);
              }
            }}
            disabled={saveStates.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Quick Load Selected State (F2)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Load State (F2)</span>
          </button>
        </div>

        {/* Display & CRT Filter Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCrtFilter(!crtFilter)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              crtFilter
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>CRT Scanlines</span>
          </button>

          <button
            onClick={onCaptureIcon}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Capture current screen frame as Windows EXE icon"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>Snap Icon</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Audio Volume Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseInt(e.target.value) || 0);
              if (isMuted) setIsMuted(false);
            }}
            className="w-20 accent-amber-500 cursor-pointer"
          />
        </div>
      </div>

      {/* SAVE STATE MANAGEMENT SECTION */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Save className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Save State Checkpoint Manager
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Capture your exact in-game progress. Select any checkpoint to embed it into your standalone Windows executable.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".state,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>Import .state</span>
            </button>

            <button
              onClick={() => handleCreateSaveState()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Save State</span>
            </button>
          </div>
        </div>

        {/* Embedded State Banner (if active) */}
        {selectedStateObj && (
          <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <PackageCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Active for Desktop Packaging: <strong className="text-white">"{selectedStateObj.name}"</strong> will be embedded into your Windows EXE payload.
              </span>
            </div>

            <button
              onClick={onOpenExportModal}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap cursor-pointer transition-colors"
            >
              Export EXE with this State
            </button>
          </div>
        )}

        {/* Save States Cards Grid */}
        {saveStates.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-xs font-semibold text-slate-300">No Save States Created Yet</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Play the game and press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">F1</kbd> or click <strong>New Save State</strong> to snapshot your exact score, lives, and progress before exporting the desktop executable.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {saveStates.map((state) => {
              const isSelected = selectedSaveStateId === state.id;
              const isEditing = editingStateId === state.id;

              return (
                <div
                  key={state.id}
                  onClick={() => onSelectSaveStateId(state.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-slate-950 border-amber-500 shadow-md ring-1 ring-amber-500/30'
                      : 'bg-slate-950/60 hover:bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Thumbnail + Slot header */}
                    <div className="relative aspect-[4/3] w-full rounded-lg bg-black overflow-hidden border border-slate-800">
                      {state.thumbnailUrl ? (
                        <img
                          src={state.thumbnailUrl}
                          alt={state.name}
                          className="w-full h-full object-cover image-rendering-pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-mono">
                          NES Snapshot
                        </div>
                      )}

                      {/* Embed badge */}
                      {isSelected && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px] shadow">
                          Embedded for EXE
                        </div>
                      )}

                      {/* Slot number badge */}
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-slate-300 font-mono text-[10px]">
                        Slot {state.slotNumber}
                      </div>
                    </div>

                    {/* Title & Rename input */}
                    <div>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(state.id, e as any);
                            }}
                            className="flex-1 px-2 py-1 text-xs rounded bg-slate-900 border border-amber-500 text-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={(e) => handleSaveRename(state.id, e)}
                            className="p-1 rounded bg-amber-500 text-slate-950 hover:bg-amber-400"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white truncate max-w-[170px]">
                            {state.name}
                          </span>
                          <button
                            onClick={(e) => handleStartRename(state, e)}
                            className="p-1 text-slate-400 hover:text-white transition-colors"
                            title="Rename"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(state.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span>·</span>
                        <span>{new Date(state.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadSaveState(state);
                      }}
                      className="flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3 h-3 text-emerald-400" />
                      <span>Resume</span>
                    </button>

                    <button
                      onClick={(e) => handleDownloadSaveState(state, e)}
                      className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                      title="Download .state file"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => handleDeleteSaveState(state.id, e)}
                      className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors"
                      title="Delete checkpoint"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controller Guide */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-300">Player 1 Controls:</span>
          <span>D-Pad: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">WASD</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">Arrows</kbd></span>
          <span>·</span>
          <span>Button A: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">Z</kbd></span>
          <span>·</span>
          <span>Button B: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">X</kbd></span>
          <span>·</span>
          <span>Save: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">F1</kbd></span>
          <span>·</span>
          <span>Load: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">F2</kbd></span>
        </div>
      </div>
    </div>
  );
};
