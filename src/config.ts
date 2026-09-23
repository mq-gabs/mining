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

export interface UpgradeDef {
  name: string;
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
    gas: { fromDepth: 2, base: 0.03, perDepth: 0.004, min: 0, max: 0.07 },
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
    gasEnergyLoss: 5,
    /** Max open cells (8-neighbourhood of the cave-in) turned back into dirt. */
    caveInCells: 3,
  },

  run: {
    /** Share of run gems kept when carried out with no energy. */
    exhaustedKeepRatio: 0.5,
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
      power: { name: 'Pickaxe Power', icon: '⛏️', baseCost: 20, maxLevel: 10, perLevel: 1 },
      energy: { name: 'Max Energy', icon: '⚡', baseCost: 15, maxLevel: 15, perLevel: 10 },
      luck: { name: 'Luck', icon: '🍀', baseCost: 30, maxLevel: 10, perLevel: 0.05 },
      gemValue: { name: 'Gem Value', icon: '💎', baseCost: 40, maxLevel: 10, perLevel: 0.1 },
      dynamite: { name: 'Dynamite Charges', icon: '🧨', baseCost: 50, maxLevel: 5, perLevel: 1 },
      drillUnlock: { name: 'Unlock Drill', icon: '🔩', baseCost: 150, maxLevel: 1, perLevel: 1, unlocks: 'drill' },
      drill: { name: 'Drill Charges', icon: '🔩', baseCost: 60, maxLevel: 5, perLevel: 1, requires: 'drillUnlock' },
      scannerUnlock: { name: 'Unlock Scanner', icon: '📡', baseCost: 250, maxLevel: 1, perLevel: 1, unlocks: 'scanner' },
      scanner: { name: 'Scanner Charges', icon: '📡', baseCost: 60, maxLevel: 5, perLevel: 1, requires: 'scannerUnlock' },
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
