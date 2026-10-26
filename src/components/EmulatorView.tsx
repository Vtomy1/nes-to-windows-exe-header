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
  Sparkles,
  Camera,
} from 'lucide-react';
import { NesRomData, WindowsExeConfig } from '../types/nes';
import { NesSystem } from '../emulator/nes';

interface EmulatorViewProps {
  rom: NesRomData;
  config: WindowsExeConfig;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCaptureIcon: () => void;
}

export const EmulatorView: React.FC<EmulatorViewProps> = ({
  rom,
  config,
  canvasRef,
  onCaptureIcon,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(config.masterVolume);
  const [crtFilter, setCrtFilter] = useState<boolean>(config.enableCrtShader);
  const [crtGlow, setCrtGlow] = useState<boolean>(true);
  const [aspectMode, setAspectMode] = useState<'4-3' | 'pixel-perfect' | 'fill'>('4-3');
  const [gamepadConnected, setGamepadConnected] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(60);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  const nesRef = useRef<NesSystem | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);

  // Initialize or reinitialize emulator when ROM changes
  useEffect(() => {
    try {
      const nes = new NesSystem(rom);
      nesRef.current = nes;
      nes.apu.setVolume(volume);
      nes.apu.setMuted(isMuted);
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
      
      // Standard mapping:
      // Buttons: 0=A, 1=B, 8=Select, 9=Start, 12=Up, 13=Down, 14=Left, 15=Right
      const c = nesRef.current.controller1;
      c.a = gp.buttons[0]?.pressed || false;
      c.b = gp.buttons[1]?.pressed || gp.buttons[2]?.pressed || false;
      c.select = gp.buttons[8]?.pressed || false;
      c.start = gp.buttons[9]?.pressed || false;

      // D-Pad or Left Analog
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

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!nesRef.current) return;
      const c = nesRef.current.controller1;

      // Avoid scrolling page with arrows during gameplay
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
          handleQuickSave();
          break;
        case 'F2':
          e.preventDefault();
          handleQuickLoad();
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
  }, []);

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
          const imgData = ctx.createImageData(256, 240);
          const buf32 = new Uint32Array(imgData.data.buffer);
          buf32.set(nesRef.current.ppu.frameBuffer);
          ctx.putImageData(imgData, 0, 0);
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
      setSaveNotification('System Reset');
      setTimeout(() => setSaveNotification(null), 2000);
    }
  };

  const handleQuickSave = () => {
    if (nesRef.current) {
      nesRef.current.saveState();
      setSaveNotification('State Saved (Slot 1)');
      setTimeout(() => setSaveNotification(null), 2500);
    }
  };

  const handleQuickLoad = () => {
    if (nesRef.current) {
      const ok = nesRef.current.loadState();
      setSaveNotification(ok ? 'State Loaded' : 'No Save State Found');
      setTimeout(() => setSaveNotification(null), 2500);
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

  return (
    <div className="space-y-4">
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
          {crtFilter && <div className="absolute inset-0 crt-scanlines rounded" />}

          {/* Notification Toast */}
          {saveNotification && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-amber-500/90 text-slate-950 font-mono text-xs font-bold shadow-lg animate-bounce">
              {saveNotification}
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

        {/* In-Game Status Indicators */}
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
              <span className="text-slate-400">Keyboard (WASD/Arrows + Z/X)</span>
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
            onClick={handleQuickSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Quick Save State (F1)"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save (F1)</span>
          </button>

          <button
            onClick={handleQuickLoad}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Quick Load State (F2)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Load (F2)</span>
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

      {/* Controller Guide Pill Box */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-300">Player 1 Controls:</span>
          <span>D-Pad: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">WASD</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">Arrows</kbd></span>
          <span>·</span>
          <span>Button A: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">Z</kbd></span>
          <span>·</span>
          <span>Button B: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">X</kbd></span>
          <span>·</span>
          <span>Start: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">Enter</kbd></span>
          <span>·</span>
          <span>Select: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">RShift</kbd></span>
        </div>
      </div>
    </div>
  );
};
