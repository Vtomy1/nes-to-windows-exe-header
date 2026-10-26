/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class Apu {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private pulse1Osc: OscillatorNode | null = null;
  private pulse1Gain: GainNode | null = null;
  private pulse2Osc: OscillatorNode | null = null;
  private pulse2Gain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;

  // Channel state
  private pulse1Period: number = 0;
  private pulse1Volume: number = 0;
  private pulse1Enabled: boolean = false;

  private pulse2Period: number = 0;
  private pulse2Volume: number = 0;
  private pulse2Enabled: boolean = false;

  constructor() {
    // Lazily initialized on first user interaction to comply with Web Audio autoplay policies
  }

  public initAudio(): void {
    if (this.audioCtx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume * 0.25, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);

      // Pulse 1
      this.pulse1Osc = this.audioCtx.createOscillator();
      this.pulse1Osc.type = 'square';
      this.pulse1Gain = this.audioCtx.createGain();
      this.pulse1Gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      this.pulse1Osc.connect(this.pulse1Gain);
      this.pulse1Gain.connect(this.masterGain);
      this.pulse1Osc.start();

      // Pulse 2
      this.pulse2Osc = this.audioCtx.createOscillator();
      this.pulse2Osc.type = 'square';
      this.pulse2Gain = this.audioCtx.createGain();
      this.pulse2Gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      this.pulse2Osc.connect(this.pulse2Gain);
      this.pulse2Gain.connect(this.masterGain);
      this.pulse2Osc.start();
    } catch {
      // AudioContext unavailable or blocked in environment
    }
  }

  public setVolume(volPercent: number): void {
    this.volume = Math.max(0, Math.min(100, volPercent)) / 100;
    if (this.masterGain && this.audioCtx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume * 0.25, this.audioCtx.currentTime);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume * 0.25, this.audioCtx.currentTime);
    }
  }

  public writeRegister(addr: number, val: number): void {
    this.initAudio();
    if (!this.audioCtx) return;

    switch (addr) {
      // Pulse 1
      case 0x4000:
        this.pulse1Volume = (val & 0x0f) / 15;
        this.updatePulse1();
        break;
      case 0x4002:
        this.pulse1Period = (this.pulse1Period & 0x0700) | val;
        this.updatePulse1();
        break;
      case 0x4003:
        this.pulse1Period = (this.pulse1Period & 0x00ff) | ((val & 0x07) << 8);
        this.updatePulse1();
        break;

      // Pulse 2
      case 0x4004:
        this.pulse2Volume = (val & 0x0f) / 15;
        this.updatePulse2();
        break;
      case 0x4006:
        this.pulse2Period = (this.pulse2Period & 0x0700) | val;
        this.updatePulse2();
        break;
      case 0x4007:
        this.pulse2Period = (this.pulse2Period & 0x00ff) | ((val & 0x07) << 8);
        this.updatePulse2();
        break;

      // Status $4015
      case 0x4015:
        this.pulse1Enabled = (val & 0x01) !== 0;
        this.pulse2Enabled = (val & 0x02) !== 0;
        this.updatePulse1();
        this.updatePulse2();
        break;
    }
  }

  private updatePulse1(): void {
    if (!this.pulse1Osc || !this.pulse1Gain || !this.audioCtx) return;
    if (!this.pulse1Enabled || this.pulse1Period < 8 || this.pulse1Volume <= 0) {
      this.pulse1Gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      return;
    }
    // Frequency formula for NES CPU clock (1.789773 MHz)
    // freq = 1789773 / (16 * (period + 1))
    const freq = 1789773 / (16 * (this.pulse1Period + 1));
    this.pulse1Osc.frequency.setValueAtTime(Math.min(10000, Math.max(20, freq)), this.audioCtx.currentTime);
    this.pulse1Gain.gain.setValueAtTime(this.pulse1Volume * 0.3, this.audioCtx.currentTime);
  }

  private updatePulse2(): void {
    if (!this.pulse2Osc || !this.pulse2Gain || !this.audioCtx) return;
    if (!this.pulse2Enabled || this.pulse2Period < 8 || this.pulse2Volume <= 0) {
      this.pulse2Gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      return;
    }
    const freq = 1789773 / (16 * (this.pulse2Period + 1));
    this.pulse2Osc.frequency.setValueAtTime(Math.min(10000, Math.max(20, freq)), this.audioCtx.currentTime);
    this.pulse2Gain.gain.setValueAtTime(this.pulse2Volume * 0.3, this.audioCtx.currentTime);
  }

  public reset(): void {
    this.pulse1Period = 0;
    this.pulse1Volume = 0;
    this.pulse1Enabled = false;
    this.pulse2Period = 0;
    this.pulse2Volume = 0;
    this.pulse2Enabled = false;
    this.updatePulse1();
    this.updatePulse2();
  }
}
