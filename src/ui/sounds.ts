import { CONFIG, GEM_TIERS, type BlockType, type ToolId } from '../config';
import type { RunEvent, RunState } from '../game/types';
import { Synth } from '../platform/audio';
import type { GemLook } from './theme';

/** Harder blocks sound higher and brighter. */
const BLOCK_PITCH: Record<BlockType, number> = { dirt: 700, stone: 1500, hard: 2300, obsidian: 3200 };
/** Base pitch of each gem tier's ding (A5 up to G6). */
const GEM_PITCH: Record<GemLook, number> = { quartz: 880, amethyst: 988, sapphire: 1175, ruby: 1319, legendary: 1568 };
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
  gem(tier: GemLook, n = 0) {
    // The Legendary Diamond ranks above every tier.
    const rank = tier === 'legendary' ? GEM_TIERS.length : GEM_TIERS.indexOf(tier);
    const freq = GEM_PITCH[tier] * (1 + 0.06 * n);
    const delay = n * 0.05;
    this.synth.tone({ freq, to: freq * 1.5, dur: 0.22 + rank * 0.04, vol: 0.22, delay });
    this.synth.tone({ freq: freq * 2, dur: 0.15, type: 'triangle', vol: 0.06, delay });
    if (rank >= 2) this.synth.tone({ freq: freq * 1.5, to: freq * 3, dur: 0.3, vol: 0.08, delay: delay + 0.06 });
    if (rank >= GEM_TIERS.length) arpeggio(this.synth, [freq * 2, freq * 2.5, freq * 3], 0.05, 'sine', 0.06);
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

  /**
   * Crossfades from a sharp hiss (no mask) to a muffled puff by `protection` (0..1). Any mask sounds one
   * step softer than its share, so the first mask is already a clear relief, and a full set goes past the
   * plain puff to a quieter, duller one.
   */
  gas(protection: number) {
    const step = CONFIG.perks.gasMask.reduction;
    const soft = protection > 0 ? protection + step : 0;
    const hiss = Math.max(0, 1 - soft);
    /** 0..1 over the step past a plain puff. */
    const extra = Math.min(1, Math.max(0, soft - 1) / step);
    if (hiss > 0) {
      this.synth.noise({ dur: 0.3 + 0.15 * hiss, filter: 'highpass', freq: 2500, to: 2500 + 2500 * hiss, vol: 0.3 * hiss });
    }
    if (soft > 0) {
      const vol = 0.12 * Math.min(1, soft) * (1 - 0.45 * extra);
      this.synth.noise({ dur: 0.3 - 0.05 * extra, freq: 700 - 250 * extra, vol });
    }
  }

  /** A block broke open on an item: a soft glint, so the player knows there's something to pick up. */
  reveal() {
    this.synth.tone({ freq: 1760, dur: 0.08, type: 'triangle', vol: 0.07, delay: 0.05 });
    this.synth.tone({ freq: 2349, dur: 0.1, type: 'triangle', vol: 0.05, delay: 0.1 });
  }

  /** The Legendary Diamond is revealed (the music has just stopped): a gasp of air, then a bright shimmering chord. */
  legendaryReveal() {
    this.synth.noise({ dur: 0.5, filter: 'highpass', freq: 3000, to: 8000, vol: 0.12 });
    this.synth.tone({ freq: 196, to: 392, dur: 0.5, type: 'triangle', vol: 0.18 });
    [1047, 1319, 1568, 2093, 2637].forEach((freq, i) => {
      this.synth.tone({ freq, dur: 1.4 - i * 0.12, type: 'sine', vol: 0.1, delay: 0.35 + i * 0.07 });
      this.synth.tone({ freq: freq * 1.005, dur: 1.2 - i * 0.1, type: 'triangle', vol: 0.04, delay: 0.38 + i * 0.07 });
    });
  }

  caveIn() {
    this.synth.noise({ dur: 0.55, freq: 400, to: 60, vol: 0.8 });
    this.synth.tone({ freq: 70, to: 30, dur: 0.45, vol: 0.5 });
  }

  /** A hole took gems: a falling whoop, then coins clinking down (no clink when nothing was lost). */
  hole(gemsLost: number) {
    this.synth.tone({ freq: 520, to: 90, dur: 0.35, type: 'triangle', vol: 0.2 });
    if (gemsLost === 0) return;
    [1760, 1480, 1245].forEach((freq, i) => this.synth.tone({ freq, dur: 0.12, type: 'triangle', vol: 0.07, delay: 0.22 + i * 0.07 }));
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
    // Once per action, even when a blast reveals several items.
    const revealed = events.filter((e) => e.type === 'itemRevealed');
    if (revealed.some((e) => e.content.kind === 'legendary')) this.legendaryReveal();
    else if (revealed.length) this.reveal();
    let dings = 0;
    for (const e of events) {
      switch (e.type) {
        case 'gem':
          if (dings < MAX_DINGS) this.gem(e.tier, dings++);
          break;
        case 'legendary':
          // The usual pickup sound; the ending brings the victory song.
          this.gem('legendary');
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
          if (e.source === 'chest' && e.idx !== undefined) this.chestPerk();
          break;
        case 'perkOfferHeld':
          this.chestPerk();
          break;
        case 'gas':
          this.gas(e.protection);
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
        case 'hole':
          this.hole(e.gemsLost);
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
