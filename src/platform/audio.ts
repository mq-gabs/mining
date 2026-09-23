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
/** Time constant (s) for volume/mute changes, short enough to feel instant but click-free. */
const LEVEL_SMOOTHING = 0.03;

/** Why audio is suspended right now (the context resumes only when there are none). */
export type AudioHold = 'hidden' | 'ad';

/**
 * Tiny Web Audio synthesizer: every sound is generated, nothing is loaded. Browsers only allow
 * audio after a user gesture, so `unlock()` must run from one (the app calls it on every pointerdown).
 * Any failure (no Web Audio, suspended context) makes it silent instead of throwing.
 *
 * Routing: sound effects → sfx bus ┐
 *          music        → music bus ┴→ master (mute) → speakers
 */
export class Synth {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private musicBus?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private holds = new Set<AudioHold>();
  private muted = false;
  private volumes = { music: 1, sfx: 1 };

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.applyLevels();
      }
      if (this.ctx.state === 'suspended' && this.holds.size === 0) void this.ctx.resume();
    } catch {
      // No audio on this device; stay silent.
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyLevels();
  }

  /** Bus levels, 0..1. `music` is the final music bus gain (the caller applies any mix factor). */
  setVolumes(volumes: { music: number; sfx: number }) {
    this.volumes = { ...volumes };
    this.applyLevels();
  }

  /** Suspends all audio while any hold is active (tab hidden, ad playing); resumes when all clear. */
  hold(reason: AudioHold, active: boolean) {
    if (active) this.holds.add(reason);
    else this.holds.delete(reason);
    if (!this.ctx) return;
    if (this.holds.size > 0) void this.ctx.suspend().catch(() => {});
    else void this.ctx.resume().catch(() => {});
  }

  /** The shared white-noise buffer (for the music's hi-hats too); undefined until unlocked. */
  sharedNoise(): AudioBuffer | undefined {
    return this.ctx ? this.noise1s(this.ctx) : undefined;
  }

  /** The context and music bus, for the music engine; undefined until unlocked. */
  musicOutput(): { ctx: AudioContext; out: GainNode } | undefined {
    if (!this.ctx || !this.musicBus) return undefined;
    return { ctx: this.ctx, out: this.musicBus };
  }

  private applyLevels() {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, LEVEL_SMOOTHING);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, LEVEL_SMOOTHING);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, LEVEL_SMOOTHING);
  }

  private live(): { ctx: AudioContext; out: GainNode } | undefined {
    if (this.muted || this.holds.size > 0 || !this.ctx || !this.sfxBus || this.ctx.state !== 'running') {
      return undefined;
    }
    return { ctx: this.ctx, out: this.sfxBus };
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
