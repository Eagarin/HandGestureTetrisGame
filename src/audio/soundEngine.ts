class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.12,
    endFreq?: number,
    delay: number = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playPickup() {
    this.playTone(360, 0.09, 'triangle', 0.13, 620);
    this.playTone(720, 0.06, 'sine', 0.08, 880, 0.03);
  }

  public playMove() {
    this.playTone(220, 0.035, 'sine', 0.04, 240);
  }

  public playRotate() {
    this.playTone(520, 0.08, 'triangle', 0.1, 780);
  }

  public playPlace() {
    this.playTone(170, 0.12, 'triangle', 0.16, 95);
    this.playTone(440, 0.07, 'sine', 0.09, 320, 0.01);
  }

  public playCancel() {
    this.playTone(380, 0.09, 'sine', 0.09, 210);
  }

  public playInvalid() {
    this.playTone(150, 0.14, 'sawtooth', 0.09, 110);
    this.playTone(135, 0.14, 'sawtooth', 0.08, 95, 0.06);
  }

  public playLineClear(lines: number, combo: number) {
    const base = 440 + Math.min(combo, 6) * 55;
    const notes = lines >= 4 ? [0, 4, 7, 12, 16] : [0, 4, 7, 12];
    notes.forEach((semi, idx) => {
      const freq = base * Math.pow(2, semi / 12);
      this.playTone(freq, 0.22, 'triangle', 0.13, freq * 1.02, idx * 0.055);
    });
  }

  public playPause() {
    this.playTone(480, 0.1, 'sine', 0.1, 260);
  }

  public playResume() {
    this.playTone(320, 0.1, 'sine', 0.1, 560);
  }

  public playCalibrationSuccess() {
    this.playTone(523.25, 0.12, 'triangle', 0.12);
    this.playTone(659.25, 0.12, 'triangle', 0.12, undefined, 0.09);
    this.playTone(783.99, 0.18, 'triangle', 0.14, undefined, 0.18);
  }

  public playStageClear() {
    const fanfare = [523.25, 659.25, 783.99, 1046.5];
    fanfare.forEach((f, i) => {
      this.playTone(f, 0.24, 'triangle', 0.13, undefined, i * 0.09);
    });
  }

  public playGameOver() {
    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => {
      this.playTone(f, 0.26, 'sawtooth', 0.08, f * 0.92, i * 0.13);
    });
  }
}

export const soundEngine = new SoundEngine();
