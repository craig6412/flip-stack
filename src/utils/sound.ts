/** Placeholder sounds via WebAudio — no assets needed.
 *  SOUND_PACK hook: when real files land in public/audio/, load and play
 *  those instead of the synth versions (same method names). */
export const SOUND_PACK: Record<string, string> | null = null;

export class SoundFX {
  private ctx: AudioContext | null = null;
  enabled = true;
  volume = 0.9; // master volume 0..1 (Settings slider)

  private ac(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private out(ctx: AudioContext, gainValue: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = gainValue * this.volume;
    g.connect(ctx.destination);
    return g;
  }

  sizzle(): void {
    const ctx = this.ac();
    if (!ctx) return;
    const dur = 0.35;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.12;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    src.connect(filter).connect(this.out(ctx, 0.5));
    src.start();
  }

  whoosh(spin = 0.1): void {
    const ctx = this.ac();
    if (!ctx) return;
    const dur = 0.28;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * 0.16;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500 + Math.min(1, Math.abs(spin) / 0.12) * 1400;
    filter.Q.value = 1.4;
    src.connect(filter).connect(this.out(ctx, 0.6));
    src.start();
  }

  plop(perfect = false, combo = 0): void {
    const ctx = this.ac();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = this.out(ctx, 1);
    // route osc through its own envelope gain
    const env = ctx.createGain();
    osc.connect(env).connect(gain);
    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(perfect ? 520 : 300, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    env.gain.setValueAtTime(0.35, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
    if (perfect) {
      // Two-note chime, pitch rises with combo.
      const base = 660 * Math.pow(1.059, Math.min(combo, 8));
      [base, base * 1.335].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const tt = t + 0.06 + i * 0.07;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.18, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, tt + 0.22);
        o.connect(g).connect(this.out(ctx, 1));
        o.start(tt);
        o.stop(tt + 0.25);
      });
    }
  }

  creak(): void {
    const ctx = this.ac();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env).connect(this.out(ctx, 1));
    osc.type = 'sawtooth';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(82, t);
    osc.frequency.linearRampToValueAtTime(64, t + 0.28);
    env.gain.setValueAtTime(0.1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  crash(): void {
    this.thud();
    const ctx = this.ac();
    if (!ctx) return;
    const dur = 0.3;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.2;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    src.connect(filter).connect(this.out(ctx, 0.7));
    src.start();
  }

  thud(): void {
    const ctx = this.ac();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env).connect(this.out(ctx, 1));
    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    env.gain.setValueAtTime(0.4, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  click(): void {
    const ctx = this.ac();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env).connect(this.out(ctx, 1));
    osc.type = 'square';
    osc.frequency.value = 800;
    const t = ctx.currentTime;
    env.gain.setValueAtTime(0.08, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.start(t);
    osc.stop(t + 0.06);
  }
}

export const sfx = new SoundFX();
