import { GEM_TIERS, type BlockType, type GemTier, type ToolId } from '../config';
import type { RunEvent, RunState } from '../game/types';
import { Synth } from '../platform/audio';

/** Harder blocks sound higher and brighter. */
const BLOCK_PITCH: Record<BlockType, number> = { dirt: 700, stone: 1500, hard: 2300, obsidian: 3200 };
/** Base pitch of each gem tier's ding (A5 up to G6). */
const GEM_PITCH: Record<GemTier, number> = { quartz: 880, amethyst: 988, sapphire: 1175, ruby: 1319, diamond: 1568 };
/** At most this many gem dings per action (a big blast shouldn't be a wall of noise). */
const MAX_DINGS = 5;
/** Rush breaks rise in pitch with the combo, up to this many steps. */
const MAX_COMBO_PITCH = 12;

/** Plays each note of a chord with a short gap, like an arpeggio. */
function arpeggio(s: Synth, freqs: number[], gap: number, type: OscillatorType, vol: number, dur = 0.18) {
  freqs.forEach((freq, i) => s.tone({ freq, dur, type, vol, delay: i * gap }));
}

/** Every sound effect in the game, as a small synthesis recipe. */
export class Sounds {
  readonly synth = new Synth();

  hit(block: BlockType) {
    this.synth.noise({ dur: 0.06, filter: 'bandpass', freq: BLOCK_PITCH[block], q: 2, vol: 0.5 });
    this.synth.tone({ freq: 140, to: 70, dur: 0.05, type: 'square', vol: 0.06 });
  }

  /** `combo` (during a Rush) pitches the break up a little per block, with a cap. */
  break(block: BlockType, combo = 0) {
    const up = 1 + 0.04 * Math.min(combo, MAX_COMBO_PITCH);
    this.synth.noise({ dur: 0.16, freq: BLOCK_PITCH[block] * 1.5 * up, to: 250 * up, vol: 0.45 });
    this.synth.tone({ freq: 320 * up, to: 110 * up, dur: 0.1, vol: 0.25 });
  }

  /** Soft tick when the Rush meter fills; higher as it gets fuller (`level` 0..1). */
  momentum(level: number) {
    this.synth.tone({ freq: 600 * 2 ** level, dur: 0.04, type: 'triangle', vol: 0.05, delay: 0.03 });
  }

  /** Rising sweep, then a bright chord stab. */
  rushStart() {
    this.synth.noise({ dur: 0.35, filter: 'bandpass', freq: 400, to: 5000, q: 2, vol: 0.35 });
    this.synth.tone({ freq: 220, to: 880, dur: 0.3, type: 'sawtooth', vol: 0.08 });
    for (const freq of [880, 1109, 1319, 1760]) this.synth.tone({ freq, dur: 0.35, type: 'square', vol: 0.05, delay: 0.28 });
  }

  /** Bright rising sweep: every block on the floor is broken. */
  floorCleared() {
    this.synth.noise({ dur: 0.3, filter: 'highpass', freq: 3000, to: 8000, vol: 0.12 });
    arpeggio(this.synth, [659, 784, 988, 1319, 1568], 0.05, 'triangle', 0.14, 0.28);
  }

  /** Short falling whoosh. */
  rushEnd() {
    this.synth.noise({ dur: 0.4, filter: 'bandpass', freq: 3000, to: 300, q: 1.5, vol: 0.3 });
    this.synth.tone({ freq: 660, to: 220, dur: 0.3, type: 'triangle', vol: 0.1 });
  }

  /** Rising ding; higher tiers are higher, and the top tiers add a shimmer. `n` staggers a combo upward. */
  gem(tier: GemTier, n = 0) {
    const rank = GEM_TIERS.indexOf(tier);
    const freq = GEM_PITCH[tier] * (1 + 0.06 * n);
    const delay = n * 0.05;
    this.synth.tone({ freq, to: freq * 1.5, dur: 0.22 + rank * 0.04, vol: 0.22, delay });
    this.synth.tone({ freq: freq * 2, dur: 0.15, type: 'triangle', vol: 0.06, delay });
    if (rank >= 2) this.synth.tone({ freq: freq * 1.5, to: freq * 3, dur: 0.3, vol: 0.08, delay: delay + 0.06 });
    if (rank >= 4) arpeggio(this.synth, [freq * 2, freq * 2.5, freq * 3], 0.05, 'sine', 0.06);
  }

  crystal() {
    this.synth.tone({ freq: 440, to: 880, dur: 0.15, type: 'triangle', vol: 0.2 });
    this.synth.tone({ freq: 660, to: 1320, dur: 0.18, type: 'triangle', vol: 0.15, delay: 0.06 });
  }

  chest() {
    this.synth.noise({ dur: 0.08, freq: 1200, vol: 0.2 });
    arpeggio(this.synth, [1047, 1319, 1568, 2093], 0.04, 'square', 0.05, 0.1);
  }

  chestPerk() {
    this.synth.noise({ dur: 0.08, freq: 1200, vol: 0.2 });
    arpeggio(this.synth, [523, 659, 784, 1047, 1319], 0.05, 'triangle', 0.15, 0.25);
  }

  gas(masked: boolean) {
    if (masked) this.synth.noise({ dur: 0.3, freq: 700, vol: 0.12 });
    else this.synth.noise({ dur: 0.45, filter: 'highpass', freq: 2500, to: 5000, vol: 0.3 });
  }

  caveIn() {
    this.synth.noise({ dur: 0.55, freq: 400, to: 60, vol: 0.8 });
    this.synth.tone({ freq: 70, to: 30, dur: 0.45, vol: 0.5 });
  }

  stairs() {
    this.synth.tone({ freq: 220, to: 660, dur: 0.3, type: 'triangle', vol: 0.2 });
    arpeggio(this.synth, [784, 1047, 1568], 0.08, 'sine', 0.12, 0.35);
  }

  descend() {
    this.synth.noise({ dur: 0.3, filter: 'bandpass', freq: 1400, to: 200, q: 1.5, vol: 0.4 });
    this.synth.tone({ freq: 440, to: 150, dur: 0.25, type: 'triangle', vol: 0.12 });
  }

  freeSwing() {
    this.synth.tone({ freq: 1600, to: 2200, dur: 0.1, vol: 0.1 });
  }

  toolArm() {
    this.synth.tone({ freq: 660, to: 880, dur: 0.05, type: 'square', vol: 0.06 });
  }

  reject() {
    this.synth.tone({ freq: 170, dur: 0.08, type: 'square', vol: 0.1 });
    this.synth.tone({ freq: 140, dur: 0.1, type: 'square', vol: 0.1, delay: 0.08 });
  }

  tool(tool: ToolId) {
    switch (tool) {
      case 'dynamite':
        this.synth.noise({ dur: 0.7, freq: 2500, to: 50, vol: 1 });
        this.synth.tone({ freq: 110, to: 28, dur: 0.55, vol: 0.7 });
        break;
      case 'drill':
        this.synth.tone({ freq: 90, to: 180, dur: 0.35, type: 'sawtooth', vol: 0.12 });
        this.synth.noise({ dur: 0.35, filter: 'bandpass', freq: 600, to: 2400, q: 3, vol: 0.4 });
        break;
      case 'scanner':
        this.synth.tone({ freq: 1250, dur: 0.3, vol: 0.2 });
        this.synth.tone({ freq: 1250, dur: 0.3, vol: 0.07, delay: 0.16 });
        break;
    }
  }

  perkOffer() {
    arpeggio(this.synth, [523, 659, 784, 1047], 0.07, 'triangle', 0.16, 0.3);
  }

  perkChosen() {
    this.synth.tone({ freq: 784, to: 1175, dur: 0.15, type: 'triangle', vol: 0.18 });
  }

  /** Two soft thumps, like a heartbeat. */
  lowEnergy() {
    this.synth.tone({ freq: 90, to: 60, dur: 0.1, vol: 0.4 });
    this.synth.tone({ freq: 80, to: 55, dur: 0.12, vol: 0.3, delay: 0.16 });
  }

  outOfEnergy() {
    this.synth.tone({ freq: 440, to: 110, dur: 0.6, type: 'sawtooth', vol: 0.1 });
  }

  buy() {
    this.synth.noise({ dur: 0.05, filter: 'highpass', freq: 4000, vol: 0.2 });
    arpeggio(this.synth, [1319, 1760], 0.07, 'square', 0.07, 0.15);
  }

  click() {
    this.synth.tone({ freq: 900, dur: 0.03, type: 'triangle', vol: 0.08 });
  }

  runEnd(success: boolean) {
    if (success) arpeggio(this.synth, [523, 659, 784], 0.09, 'triangle', 0.18, 0.3);
    else arpeggio(this.synth, [392, 330, 262], 0.14, 'triangle', 0.16, 0.35);
  }

  /** An ad's reward was granted. */
  reward() {
    arpeggio(this.synth, [784, 988, 1175, 1568], 0.06, 'triangle', 0.16, 0.25);
    this.synth.noise({ dur: 0.25, filter: 'highpass', freq: 5000, vol: 0.08, delay: 0.1 });
  }

  newBest() {
    arpeggio(this.synth, [523, 659, 784, 1047, 1319], 0.08, 'square', 0.07, 0.3);
  }

  /**
   * Sounds for the events of one action. Hits and breaks play once per action (the first one),
   * and a tool's own sound replaces them.
   */
  playEvents(events: RunEvent[], prev: RunState, run: RunState, lowEnergyRatio: number) {
    const block = (idx: number) => run.floor.cells[idx]?.block ?? 'dirt';
    const tool = events.find((e) => e.type === 'tool');
    if (tool) this.tool(tool.tool);
    else {
      const brk = events.find((e) => e.type === 'break');
      const hit = events.find((e) => e.type === 'hit');
      if (brk) this.break(brk.block, brk.combo);
      else if (hit) this.hit(block(hit.idx));
    }
    let dings = 0;
    for (const e of events) {
      switch (e.type) {
        case 'gem':
          if (dings < MAX_DINGS) this.gem(e.tier, dings++);
          break;
        case 'freeSwing':
          this.freeSwing();
          break;
        case 'crystal':
          this.crystal();
          break;
        case 'chest':
          this.chest();
          break;
        case 'perkOffer':
          if (e.source === 'chest') this.chestPerk();
          break;
        case 'gas':
          this.gas(e.masked);
          break;
        case 'momentum':
          this.momentum(e.level);
          break;
        case 'rushStart':
          this.rushStart();
          break;
        case 'rushEnd':
          this.rushEnd();
          break;
        case 'floorCleared':
          this.floorCleared();
          break;
        case 'caveIn':
          this.caveIn();
          break;
        case 'stairsRevealed':
          this.stairs();
          break;
        case 'descend':
          this.descend();
          break;
        case 'perkChosen':
          this.perkChosen();
          break;
        case 'outOfEnergy':
          this.outOfEnergy();
          break;
      }
    }
    const wasLow = prev.energy / prev.mods.maxEnergy < lowEnergyRatio;
    const isLow = run.energy / run.mods.maxEnergy < lowEnergyRatio;
    if (isLow && !wasLow && run.energy > 0) this.lowEnergy();
  }
}
