// All balance numbers live here. Tune freely; game logic reads from this file only.

export type BlockType = 'dirt' | 'stone' | 'hard' | 'obsidian';
export type GemTier = 'quartz' | 'amethyst' | 'sapphire' | 'ruby' | 'diamond';
export type ToolId = 'dynamite' | 'drill' | 'scanner';
export type UpgradeId =
  | 'power'
  | 'energy'
  | 'luck'
  | 'gemValue'
  | 'dynamite'
  | 'drillUnlock'
  | 'drill'
  | 'scannerUnlock'
  | 'scanner';

/** An upgrade's display name is in the translation tables (`upgrade.<id>`). */
export interface UpgradeDef {
  icon: string;
  baseCost: number;
  maxLevel: number;
  perLevel: number;
  /** Only buyable (and shown) once this upgrade has at least one level. */
  requires?: UpgradeId;
  /** A one-level upgrade that unlocks a tool. */
  unlocks?: ToolId;
}

export const CONFIG = {
  grid: {
    cols: 7,
    rows: 9,
    /** Stairs are placed somewhere in the bottom N rows. */
    stairsBottomRows: 4,
  },

  energy: {
    start: 50,
    tapCost: 1,
  },

  pickaxe: {
    basePower: 1,
  },

  blocks: {
    dirt: { hp: 1 },
    stone: { hp: 3 },
    hard: { hp: 6 },
    obsidian: { hp: 12 },
  } satisfies Record<BlockType, { hp: number }>,

  /**
   * Block mix per depth range. The last entry whose `fromDepth` <= depth applies.
   * Weights are relative (they don't need to sum to 100).
   */
  blockMix: [
    { fromDepth: 1, weights: { dirt: 85, stone: 15, hard: 0, obsidian: 0 } },
    { fromDepth: 3, weights: { dirt: 70, stone: 27, hard: 3, obsidian: 0 } },
    { fromDepth: 5, weights: { dirt: 45, stone: 40, hard: 15, obsidian: 0 } },
    { fromDepth: 8, weights: { dirt: 35, stone: 40, hard: 20, obsidian: 5 } },
    { fromDepth: 12, weights: { dirt: 25, stone: 40, hard: 25, obsidian: 10 } },
    { fromDepth: 16, weights: { dirt: 15, stone: 35, hard: 32, obsidian: 18 } },
    { fromDepth: 20, weights: { dirt: 10, stone: 25, hard: 35, obsidian: 30 } },
    { fromDepth: 25, weights: { dirt: 5, stone: 15, hard: 35, obsidian: 45 } },
  ] satisfies { fromDepth: number; weights: Record<BlockType, number> }[],

  gems: {
    /** Base chance for any (non-stairs) block to contain a gem. */
    baseChance: 0.18,
    /** Extra gem chance per floor below floor 1 (additive), capped by `maxDepthChanceBonus`. */
    chancePerDepth: 0.005,
    maxDepthChanceBonus: 0.08,
    /** Gem values, and the floor each tier starts appearing on. */
    tiers: {
      quartz: { value: 1, fromDepth: 1 },
      amethyst: { value: 5, fromDepth: 3 },
      sapphire: { value: 20, fromDepth: 6 },
      ruby: { value: 60, fromDepth: 10 },
      diamond: { value: 200, fromDepth: 15 },
    } satisfies Record<GemTier, { value: number; fromDepth: number }>,
    /**
     * Which tier a gem is, per depth range (like `blockMix`). The last entry whose `fromDepth` <= depth
     * applies. Relative weights; tiers not yet unlocked (see `tiers.fromDepth`) are ignored.
     */
    tierMix: [
      { fromDepth: 1, weights: { quartz: 100, amethyst: 0, sapphire: 0, ruby: 0, diamond: 0 } },
      { fromDepth: 3, weights: { quartz: 72, amethyst: 28, sapphire: 0, ruby: 0, diamond: 0 } },
      { fromDepth: 6, weights: { quartz: 66, amethyst: 28, sapphire: 6, ruby: 0, diamond: 0 } },
      { fromDepth: 8, weights: { quartz: 60, amethyst: 32, sapphire: 8, ruby: 0, diamond: 0 } },
      { fromDepth: 10, weights: { quartz: 55, amethyst: 32, sapphire: 10, ruby: 3, diamond: 0 } },
      { fromDepth: 13, weights: { quartz: 48, amethyst: 32, sapphire: 14, ruby: 6, diamond: 0 } },
      { fromDepth: 15, weights: { quartz: 40, amethyst: 32, sapphire: 17, ruby: 8, diamond: 3 } },
      { fromDepth: 20, weights: { quartz: 30, amethyst: 30, sapphire: 22, ruby: 12, diamond: 6 } },
    ] satisfies { fromDepth: number; weights: Record<GemTier, number> }[],
  },

  /**
   * Non-gem block contents. Each chance is `base + perDepth * (depth - 1)`, clamped to [min, max],
   * and only from `fromDepth`. Rolled after gems, so the chances simply add up.
   * Crystals thin out with depth so perk energy (Second Wind, Deep Breath) can't make a run endless.
   */
  contents: {
    crystal: { fromDepth: 1, base: 0.06, perDepth: -0.002, min: 0.025, max: 0.06 },
    chest: { fromDepth: 1, base: 0.025, perDepth: 0.001, min: 0, max: 0.04 },
    gas: { fromDepth: 2, base: 0.025, perDepth: 0.0025, min: 0, max: 0.05 },
    caveIn: { fromDepth: 2, base: 0.02, perDepth: 0.004, min: 0, max: 0.06 },
  } satisfies Record<string, { fromDepth: number; base: number; perDepth: number; min: number; max: number }>,

  crystal: { energy: 10 },
  chest: {
    /** Chance a chest offers a perk choice instead of gems. */
    perkChance: 0.2,
    /** Gems = random integer in [min, max] + floor(depth * perDepth), then the gem value multiplier. */
    gemsMin: 3,
    gemsMax: 8,
    gemsPerDepth: 0.4,
  },
  hazards: {
    /** Gas energy loss = base + floor(depth * perDepth), so it keeps biting as max energy grows. */
    gasEnergyLoss: { base: 12, perDepth: 0 },
    /** Max open cells (8-neighbourhood of the cave-in) turned back into dirt. */
    caveInCells: 3,
  },

  run: {
    /** Share of run gems kept when carried out with no energy. */
    exhaustedKeepRatio: 0.5,
  },

  /**
   * Clean floor bonus: breaking every block on a floor adds `perFloorBase + perDepth * (depth - 1)` to a run
   * multiplier on the gems paid out at the end (before the exhausted penalty). Deeper floors are worth more:
   * floor 1 is cheap to clean (dirt, and a Rush can mine any block), deep floors cost far more energy.
   */
  cleanBonus: {
    perFloorBase: 0.02,
    perDepth: 0.01,
    /** The run multiplier never goes above this. */
    maxMult: 1.5,
    /**
     * Energy refunded for clearing a floor: `energyBase + energyPerDepth * (depth - 1)`, at most `energyMax`
     * (and never above max energy). Clearing costs about 3 floors of energy; with the refund, cleaning and diving
     * earn about the same gems in the sim. `energyMax` stays below the ~60 blocks a floor costs to clear, so
     * cleaning can never pay for itself and make a run endless.
     */
    energyBase: 15,
    energyPerDepth: 1.5,
    energyMax: 40,
  },

  /**
   * Rush: pickaxe breaks fill a momentum meter (0..1) that always drains. When it's full, a Rush starts:
   * for `durationSec` taps are free and the pickaxe hits harder. Both carry over between floors.
   */
  rush: {
    /** Momentum added per block broken by the pickaxe (or Tremor), by block type. Tools add nothing. */
    fill: { dirt: 0.08, stone: 0.1, hard: 0.13, obsidian: 0.17 } satisfies Record<BlockType, number>,
    /**
     * Each Rush already had this run multiplies the fill by this, so a player who breaks a block on
     * every tap can't chain Rushes forever (it would make runs endless). Rushes per run are finite.
     */
    fillDecay: 0.5,
    /** Momentum lost per second, always (no idle delay). */
    drainPerSec: 0.08,
    /**
     * Kept short: free taps compound through the upgrade economy (the spec's 7 s pushed the sim bot's
     * run 10 from floor 12 to 54). See CLAUDE.md.
     */
    durationSec: 5,
    /** Pickaxe power multiplier during a Rush (which can also mine any block, reachable or not). */
    powerMult: 2,
  },

  /**
   * Procedural background music (Web Audio, no files). Pitches are MIDI note numbers (57 = A3).
   * Notes are always picked from `scale`, so they never clash; "degree" means an index into it.
   */
  music: {
    /** Music bus level relative to SFX, so music always sits under the effects. */
    mix: 0.35,
    /** Slider defaults (0..1) before the player changes them. */
    defaultVolume: { music: 0.7, sfx: 0.9 },
    /** Mood changes (screen, depth, low energy) crossfade over this many seconds. */
    crossfadeSec: 1,
    /** Minor pentatonic: semitones above the root. */
    scale: [0, 3, 5, 7, 10],
    stepsPerBeat: 2,
    beatsPerBar: 4,
    /** Surface: brighter (higher root, open filter), slower and sparser. */
    hub: { root: 57, bpm: 64, cutoff: 3400, arpChance: 0.3, arpWave: 'triangle' as OscillatorType },
    /** First floors of a run. Deeper floors darken from here (see `darken`). */
    run: { root: 55, bpm: 76, cutoff: 2200, arpChance: 0.45, arpWave: 'square' as OscillatorType },
    /** Every `everyFloors` floors: root drops by `semitones` and the filter closes by `cutoffMult`. */
    darken: { everyFloors: 5, semitones: 2, cutoffMult: 0.72, minCutoff: 420, minRoot: 43 },
    /** Below the low-energy threshold: a heartbeat pulse and a slightly faster tempo. */
    lowEnergy: { tempoMult: 1.15, heartbeatGain: 0.55, heartbeatHz: 52 },
    layers: {
      /** Continuous low root + fifth, slightly detuned against each other. Sine keeps it soft (no buzzy harmonics). */
      drone: { gain: 0.14, detuneCents: 7, octave: -1, wave: 'sine' as OscillatorType },
      /** Slow-swelling chord of three scale degrees, every `everyBars` bars. */
      pad: { gain: 0.07, everyBars: 2, attackSec: 1.6, releaseSec: 2.6 },
      /** Retro pluck doing a random walk through the scale (`maxLeap` degrees per note). */
      arp: { gain: 0.06, octave: 1, maxLeap: 2, degreeRange: 8, durSec: 0.28 },
      /** Rare high blips with an echo (delay + feedback), like water drips. */
      drip: { gain: 0.06, chance: 0.05, octave: 2, delaySec: 0.34, feedback: 0.45 },
    },
    /**
     * Rush track: fast and bright, four-on-the-floor. Replaces every other mood during a Rush, with a
     * short crossfade. The root is fixed (it doesn't darken with depth). No drone, pad or drips.
     */
    rush: {
      root: 57,
      bpm: 150,
      crossfadeSec: 0.3,
      /** Filter over the lead arp (open). */
      cutoff: 6000,
      arpWave: 'square' as OscillatorType,
      /** Sine with a fast pitch drop, on every beat. */
      kick: { gain: 0.5, fromHz: 150, toHz: 45, durSec: 0.16 },
      /** Highpassed noise bursts on the off-beats. */
      hat: { gain: 0.12, hz: 7000, durSec: 0.045 },
      /** Root and fifth in eighth notes, through a lowpass. */
      bass: { gain: 0.16, octave: -1, cutoff: 900, wave: 'sawtooth' as OscillatorType, durSec: 0.17 },
      /** Lead arp on every step, an octave above the run arp. */
      arp: { gain: 0.05, octave: 2, durSec: 0.14 },
    },
    /** Hopeful chord on the perk screen: the relative major triad (+3 semitones) with its octave. */
    perkChord: { gain: 0.12, durSec: 2.2, semitones: [3, 7, 10, 15] },
  },

  /** Ad rewards and pacing (only when the `ads` feature flag is on; see `src/flags.ts`). */
  ads: {
    /** Rewarded ad when out of energy, once per run. */
    rewardedEnergy: 20,
    /** Rewarded ad on the run summary multiplies the gems kept, once per run. */
    gemMultiplier: 2,
    /** An interstitial may show on the way back to the hub after every Nth completed run. */
    interstitialEveryRuns: 3,
  },

  perks: {
    /** A perk choice is offered on arriving at every Nth floor (3, 6, 9...). */
    offerEveryFloors: 3,
    offerCount: 3,
    /** Stackable perks can be taken up to `maxStacks` times per run. */
    sharpEdge: { power: 1, maxStacks: 3 },
    secondWind: { energy: 15, maxStacks: 3 },
    /** Each Gas Mask stack cuts gas energy loss by `reduction`; all 4 stacks make gas harmless. */
    gasMask: { reduction: 0.25, maxStacks: 4 },
    luckyStrike: { chance: 0.2 },
    tremor: { damage: 1 },
    efficientSwing: { chance: 0.15 },
    deepBreath: { energy: 5 },
    greed: { gemValueBonus: 0.5, maxEnergyPenalty: 10 },
  },

  /**
   * Tools: limited charges per run, no energy cost. `baseCharges` is what an unlocked tool starts
   * with before Charges upgrades. Which upgrade unlocks a tool is in `TOOL_UPGRADES` below.
   */
  tools: {
    /** Breaks every block within `radius` (1 = 3×3). Doesn't release gas. */
    dynamite: { baseCharges: 1, radius: 1 },
    /** Breaks the whole row of the target. */
    drill: { baseCharges: 1 },
    /** Reveals the contents of every block within `radius` without breaking them. */
    scanner: { baseCharges: 1, radius: 1 },
  } satisfies Record<ToolId, { baseCharges: number; radius?: number }>,

  /** Permanent upgrades bought on the surface. Cost of level n (0-based) = baseCost * costGrowth^n. */
  upgrades: {
    costGrowth: 1.6,
    items: {
      power: { icon: '⛏️', baseCost: 20, maxLevel: 10, perLevel: 1 },
      energy: { icon: '⚡', baseCost: 15, maxLevel: 15, perLevel: 10 },
      luck: { icon: '🍀', baseCost: 30, maxLevel: 10, perLevel: 0.05 },
      gemValue: { icon: '💎', baseCost: 40, maxLevel: 10, perLevel: 0.1 },
      dynamite: { icon: '🧨', baseCost: 50, maxLevel: 5, perLevel: 1 },
      drillUnlock: { icon: '🔩', baseCost: 150, maxLevel: 1, perLevel: 1, unlocks: 'drill' },
      drill: { icon: '🔩', baseCost: 60, maxLevel: 5, perLevel: 1, requires: 'drillUnlock' },
      scannerUnlock: { icon: '📡', baseCost: 250, maxLevel: 1, perLevel: 1, unlocks: 'scanner' },
      scanner: { icon: '📡', baseCost: 60, maxLevel: 5, perLevel: 1, requires: 'scannerUnlock' },
    } satisfies Record<UpgradeId, UpgradeDef>,
  },
} as const;

export const BLOCK_TYPES: BlockType[] = ['dirt', 'stone', 'hard', 'obsidian'];
export const GEM_TIERS: GemTier[] = ['quartz', 'amethyst', 'sapphire', 'ruby', 'diamond'];
export const UPGRADE_IDS: UpgradeId[] = [
  'power',
  'energy',
  'luck',
  'gemValue',
  'dynamite',
  'drillUnlock',
  'drill',
  'scannerUnlock',
  'scanner',
];
export const TOOL_IDS: ToolId[] = ['dynamite', 'drill', 'scanner'];
/** Upgrade that unlocks each tool (none: unlocked at start) and the one that adds charges. */
export const TOOL_UPGRADES: Record<ToolId, { unlock?: UpgradeId; charges: UpgradeId }> = {
  dynamite: { charges: 'dynamite' },
  drill: { unlock: 'drillUnlock', charges: 'drill' },
  scanner: { unlock: 'scannerUnlock', charges: 'scanner' },
};
