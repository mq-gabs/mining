import { CONFIG } from '../config';
import type { Synth } from '../platform/audio';

const M = CONFIG.music;

/** What the music should reflect right now. */
export type MusicScene = { scene: 'hub' } | { scene: 'run'; depth: number; lowEnergy: boolean; rush: boolean };

/** Everything the engine needs to sound a scene. Two scenes with equal moods sound the same. */
export interface Mood {
  /** MIDI note of the key's root. */
  root: number;
  bpm: number;
  /** Low-pass cutoff (Hz) over drone, pads, arpeggio and drips. Lower = darker. */
  cutoff: number;
  arpChance: number;
  arpWave: OscillatorType;
  heartbeat: boolean;
  /** The Rush track: kick, hat, bass and a lead arp instead of drone, pads and drips. */
  rush: boolean;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** MIDI note of a scale degree above `root`. Degrees past the scale wrap into higher (or lower) octaves. */
export function scaleNote(root: number, degree: number, scale: readonly number[] = M.scale): number {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  return root + octave * 12 + scale[((degree % n) + n) % n];
}

/**
 * Pure: the mood for a scene. Runs get darker (lower root, closed filter) every few floors. A Rush
 * overrides depth and low energy with a fixed, bright track.
 */
export function moodFor(scene: MusicScene): Mood {
  if (scene.scene === 'hub') {
    const h = M.hub;
    return { root: h.root, bpm: h.bpm, cutoff: h.cutoff, arpChance: h.arpChance, arpWave: h.arpWave, heartbeat: false, rush: false };
  }
  if (scene.rush) {
    const r = M.rush;
    return { root: r.root, bpm: r.bpm, cutoff: r.cutoff, arpChance: 1, arpWave: r.arpWave, heartbeat: false, rush: true };
  }
  const r = M.run;
  const d = M.darken;
  const steps = Math.floor((Math.max(1, scene.depth) - 1) / d.everyFloors);
  return {
    root: Math.max(d.minRoot, r.root - steps * d.semitones),
    bpm: r.bpm * (scene.lowEnergy ? M.lowEnergy.tempoMult : 1),
    cutoff: Math.max(d.minCutoff, r.cutoff * d.cutoffMult ** steps),
    arpChance: r.arpChance,
    arpWave: r.arpWave,
    heartbeat: scene.lowEnergy,
    rush: false,
  };
}

const LOOKAHEAD_SEC = 0.25;
const TICK_MS = 50;

interface Drone {
  root: number;
  gain: GainNode;
  oscs: OscillatorNode[];
}

/**
 * Procedural ambient music on top of the `Synth`'s music bus. A lookahead scheduler places notes a
 * little ahead of the audio clock, so timing stays tight even when the main thread is busy. When the
 * context is suspended (tab hidden, ad) the clock stops, and the scheduler simply waits.
 */
export class MusicEngine {
  private mood: Mood = moodFor({ scene: 'hub' });
  private started = false;
  private ctx?: AudioContext;
  /** Mood filter: every ambient layer passes through it. */
  private filter?: BiquadFilterNode;
  /** Ambient layers (drone, pads, arp, drips, heartbeat) and the Rush track, crossfaded against each other. */
  private ambientBus?: GainNode;
  private rushBus?: GainNode;
  private bassFilter?: BiquadFilterNode;
  private dripIn?: GainNode;
  private heartbeatGain?: GainNode;
  private drone?: Drone;
  private nextStepTime = 0;
  private step = 0;
  private arpDegree = 0;

  constructor(private synth: Synth) {}

  /** Starts the music. Needs an unlocked `Synth` (call from a user gesture); later calls do nothing. */
  start() {
    if (this.started) return;
    const out = this.synth.musicOutput();
    if (!out) return;
    this.started = true;
    const { ctx } = out;
    this.ctx = ctx;

    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = this.mood.rush ? 0 : 1;
    this.ambientBus.connect(out.out);
    this.rushBus = ctx.createGain();
    this.rushBus.gain.value = this.mood.rush ? 1 : 0;
    this.rushBus.connect(out.out);
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = M.rush.bass.cutoff;
    this.bassFilter.connect(this.rushBus);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.7;
    this.filter.frequency.value = this.mood.cutoff;
    this.filter.connect(this.ambientBus);

    // Drips: dry signal plus an echo loop (delay → feedback → delay).
    const drip = M.layers.drip;
    this.dripIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = drip.delaySec;
    const feedback = ctx.createGain();
    feedback.gain.value = drip.feedback;
    this.dripIn.connect(this.filter);
    this.dripIn.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.filter);

    this.heartbeatGain = ctx.createGain();
    this.heartbeatGain.gain.value = this.mood.heartbeat ? 1 : 0;
    this.heartbeatGain.connect(this.ambientBus);

    this.drone = this.makeDrone(this.mood.root, ctx.currentTime);
    this.nextStepTime = ctx.currentTime + 0.1;
    setInterval(() => this.tick(), TICK_MS);
  }

  /**
   * Moves to the mood of `scene`, crossfading over `crossfadeSec` (`rush.crossfadeSec` into or out of a
   * Rush). Cheap to call on every state change.
   */
  setScene(scene: MusicScene) {
    const next = moodFor(scene);
    const prev = this.mood;
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    this.mood = next;
    if (!this.ctx || !this.filter || !this.heartbeatGain || !this.ambientBus || !this.rushBus) return;
    const t = this.ctx.currentTime;
    const fade = next.rush !== prev.rush ? M.rush.crossfadeSec : M.crossfadeSec;
    // setTargetAtTime reaches ~95% after 3 time constants.
    this.ambientBus.gain.setTargetAtTime(next.rush ? 0 : 1, t, fade / 3);
    this.rushBus.gain.setTargetAtTime(next.rush ? 1 : 0, t, fade / 3);
    // The Rush has its own layers: leave the ambient ones (muted meanwhile) where they were.
    if (next.rush) return;
    this.filter.frequency.setTargetAtTime(next.cutoff, t, fade / 3);
    this.heartbeatGain.gain.setTargetAtTime(next.heartbeat ? 1 : 0, t, fade / 3);
    if (this.drone && next.root !== this.drone.root) {
      const old = this.drone;
      old.gain.gain.setTargetAtTime(0, t, fade / 3);
      for (const o of old.oscs) o.stop(t + fade * 2);
      this.drone = this.makeDrone(next.root, t);
    }
  }

  /** A short, hopeful chord (the perk screen). Not filtered, so it shines even on dark floors. */
  perkChord() {
    const out = this.synth.musicOutput();
    if (!out || !this.started) return;
    const c = M.perkChord;
    const t = out.ctx.currentTime;
    for (const semi of c.semitones) {
      const freq = midiToHz(this.mood.root + semi);
      this.voice(out.out, t, freq, c.durSec, 'triangle', c.gain, 0.25);
      this.voice(out.out, t, freq * 2, c.durSec * 0.7, 'sine', c.gain * 0.3, 0.25);
    }
  }

  private makeDrone(root: number, t: number): Drone {
    const ctx = this.ctx!;
    const d = M.layers.drone;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(d.gain, t, M.crossfadeSec / 3);
    gain.connect(this.filter!);
    const base = root + d.octave * 12;
    // Root twice (detuned apart for a slow beating shimmer) and a soft fifth.
    const oscs = [
      { midi: base, detune: -d.detuneCents, level: 0.6 },
      { midi: base, detune: d.detuneCents, level: 0.6 },
      { midi: base + 7, detune: 0, level: 0.35 },
    ].map(({ midi, detune, level }) => {
      const osc = ctx.createOscillator();
      osc.type = d.wave;
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(gain);
      osc.start(t);
      return osc;
    });
    return { root, gain, oscs };
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.synth.isMuted) return;
    // After a pause (hidden tab), don't try to catch up on missed steps.
    if (this.nextStepTime < ctx.currentTime - 0.1) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_SEC) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += 60 / (this.mood.bpm * M.stepsPerBeat);
      this.step++;
    }
  }

  private scheduleStep(step: number, t: number) {
    if (this.mood.rush) return this.scheduleRushStep(step, t);
    const L = M.layers;
    const mood = this.mood;
    const stepsPerBar = M.stepsPerBeat * M.beatsPerBar;
    const barStart = step % stepsPerBar === 0;
    const bar = Math.floor(step / stepsPerBar);

    if (barStart && bar % L.pad.everyBars === 0) {
      // Three stacked scale degrees from a random starting degree: always consonant in pentatonic.
      const base = [0, 1, 2, 3][Math.floor(Math.random() * 4)];
      const barSec = (60 / mood.bpm) * M.beatsPerBar;
      const dur = barSec * L.pad.everyBars + L.pad.releaseSec;
      for (const deg of [base, base + 2, base + 4]) {
        this.voice(this.filter!, t, midiToHz(scaleNote(mood.root, deg)), dur, 'triangle', L.pad.gain, L.pad.attackSec);
      }
    }

    if (Math.random() < mood.arpChance) {
      const leap = Math.floor(Math.random() * (2 * L.arp.maxLeap + 1)) - L.arp.maxLeap;
      this.arpDegree = Math.max(0, Math.min(L.arp.degreeRange, this.arpDegree + leap));
      const midi = scaleNote(mood.root + L.arp.octave * 12, this.arpDegree);
      this.voice(this.filter!, t, midiToHz(midi), L.arp.durSec, mood.arpWave, L.arp.gain, 0.005);
    }

    if (Math.random() < L.drip.chance) {
      const deg = Math.floor(Math.random() * M.scale.length);
      const midi = scaleNote(mood.root + L.drip.octave * 12, deg);
      this.voice(this.dripIn!, t, midiToHz(midi), 0.12, 'sine', L.drip.gain, 0.002);
    }

    // Heartbeat "lub-dub" on every beat's first step; its bus gain fades it in and out.
    if (step % M.stepsPerBeat === 0 && (mood.heartbeat || this.heartbeatGain!.gain.value > 0.01)) {
      const hz = M.lowEnergy.heartbeatHz;
      const g = M.lowEnergy.heartbeatGain;
      if ((step / M.stepsPerBeat) % 2 === 0) {
        this.voice(this.heartbeatGain!, t, hz, 0.14, 'sine', g, 0.005);
        this.voice(this.heartbeatGain!, t + 0.17, hz * 0.9, 0.16, 'sine', g * 0.7, 0.005);
      }
    }
  }

  /** The Rush track: kick on the beat, hat on the off-beat, root/fifth bass and a lead arp on every step. */
  private scheduleRushStep(step: number, t: number) {
    const r = M.rush;
    const out = this.rushBus!;
    const onBeat = step % M.stepsPerBeat === 0;
    if (onBeat) this.kick(t);
    else this.hat(t);

    // Root, root, fifth, root... per eighth note, fifth on every 4th step.
    const bassMidi = r.root + r.bass.octave * 12 + (step % 4 === 2 ? 7 : 0);
    this.voice(this.bassFilter!, t, midiToHz(bassMidi), r.bass.durSec, r.bass.wave, r.bass.gain, 0.004);

    const L = M.layers.arp;
    const leap = Math.floor(Math.random() * (2 * L.maxLeap + 1)) - L.maxLeap;
    this.arpDegree = Math.max(0, Math.min(L.degreeRange, this.arpDegree + leap));
    const midi = scaleNote(r.root + r.arp.octave * 12, this.arpDegree);
    this.voice(out, t, midiToHz(midi), r.arp.durSec, this.mood.arpWave, r.arp.gain, 0.003);
  }

  /** Sine with a fast pitch drop. */
  private kick(t: number) {
    const k = M.rush.kick;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(k.fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(k.toHz, t + k.durSec * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(k.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + k.durSec);
    osc.connect(g).connect(this.rushBus!);
    osc.start(t);
    osc.stop(t + k.durSec + 0.02);
  }

  /** A short burst of highpassed noise (the `Synth`'s shared noise buffer). */
  private hat(t: number) {
    const buffer = this.synth.sharedNoise();
    if (!buffer) return;
    const h = M.rush.hat;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = h.hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(h.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + h.durSec);
    src.connect(f).connect(g).connect(this.rushBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + h.durSec + 0.02);
  }

  /** One note: attack to `gain`, then an exponential fade over the rest of `dur`. */
  private voice(dest: AudioNode, t: number, freq: number, dur: number, type: OscillatorType, gain: number, attack: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.05));
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + Math.max(dur, attack + 0.05) + 0.05);
  }
}
