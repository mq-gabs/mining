/** One oscillator note with a quick attack and exponential fade. */
export interface ToneSpec {
  freq: number;
  /** Pitch at the end of the note (glide), if different from `freq`. */
  to?: number;
  /** Seconds. */
  dur: number;
  type?: OscillatorType;
  vol?: number;
  /** Seconds from now. */
  delay?: number;
}

/** A burst of white noise through a filter whose cutoff can sweep. */
export interface NoiseSpec {
  dur: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  vol?: number;
  delay?: number;
}

const MIN_GAIN = 0.0001;

/**
 * Tiny Web Audio synthesizer: every sound is generated, nothing is loaded. Browsers only allow
 * audio after a user gesture, so `unlock()` must run from one (the app calls it on every pointerdown).
 * Any failure (no Web Audio, suspended context) makes it silent instead of throwing.
 */
export class Synth {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuffer?: AudioBuffer;
  muted = false;

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // No audio on this device; stay silent.
    }
  }

  private live(): { ctx: AudioContext; out: GainNode } | undefined {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return undefined;
    return { ctx: this.ctx, out: this.master };
  }

  /** Gain node that rises in 5 ms and fades out over `dur`. */
  private envelope(ctx: AudioContext, out: AudioNode, start: number, dur: number, vol: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_GAIN, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, start + dur);
    g.connect(out);
    return g;
  }

  tone({ freq, to, dur, type = 'sine', vol = 0.3, delay = 0 }: ToneSpec) {
    const a = this.live();
    if (!a) return;
    const start = a.ctx.currentTime + delay;
    const osc = a.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    osc.connect(this.envelope(a.ctx, a.out, start, dur, vol));
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  noise({ dur, filter = 'lowpass', freq = 2000, to, q = 1, vol = 0.3, delay = 0 }: NoiseSpec) {
    const a = this.live();
    if (!a) return;
    const start = a.ctx.currentTime + delay;
    const src = a.ctx.createBufferSource();
    src.buffer = this.noise1s(a.ctx);
    const f = a.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, start);
    if (to !== undefined) f.frequency.exponentialRampToValueAtTime(to, start + dur);
    src.connect(f).connect(this.envelope(a.ctx, a.out, start, dur, vol));
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  /** One second of white noise, reused by every noise burst. */
  private noise1s(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }
}
