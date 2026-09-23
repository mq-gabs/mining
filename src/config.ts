// All balance numbers live here. Tune freely; game logic reads from this file only.

export type BlockType = 'dirt' | 'stone' | 'hard' | 'obsidian';
export type GemTier = 'quartz' | 'amethyst' | 'sapphire' | 'ruby' | 'diamond';
export type UpgradeId = 'power' | 'energy' | 'luck' | 'gemValue';

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
    { fromDepth: 5, weights: { dirt: 55, stone: 35, hard: 10, obsidian: 0 } },
    { fromDepth: 8, weights: { dirt: 45, stone: 35, hard: 15, obsidian: 5 } },
    { fromDepth: 12, weights: { dirt: 25, stone: 40, hard: 25, obsidian: 10 } },
    { fromDepth: 16, weights: { dirt: 15, stone: 35, hard: 32, obsidian: 18 } },
  ] satisfies { fromDepth: number; weights: Record<BlockType, number> }[],

  gems: {
    /** Base chance for any (non-stairs) block to contain a gem. */
    baseChance: 0.3,
    /** Extra gem chance per floor below floor 1 (additive), capped by `maxDepthChanceBonus`. */
    chancePerDepth: 0.01,
    maxDepthChanceBonus: 0.15,
    /**
     * Tier table. `weight` is relative among tiers unlocked at the current depth.
     * Each floor past a tier's `fromDepth` multiplies its weight by (1 - tierWeightDecayPerDepth),
     * so older tiers fade and newly unlocked tiers take over the deeper you go.
     */
    tiers: {
      quartz: { value: 1, fromDepth: 1, weight: 100 },
      amethyst: { value: 5, fromDepth: 3, weight: 60 },
      sapphire: { value: 20, fromDepth: 6, weight: 30 },
      ruby: { value: 60, fromDepth: 10, weight: 15 },
      diamond: { value: 200, fromDepth: 15, weight: 6 },
    } satisfies Record<GemTier, { value: number; fromDepth: number; weight: number }>,
    tierWeightDecayPerDepth: 0.2,
  },

  run: {
    /** Share of run gems kept when carried out with no energy. */
    exhaustedKeepRatio: 0.5,
  },

  /** Permanent upgrades bought on the surface. Cost of level n (0-based) = baseCost * costGrowth^n. */
  upgrades: {
    costGrowth: 1.6,
    items: {
      power: { name: 'Pickaxe Power', icon: '⛏️', baseCost: 20, maxLevel: 10, perLevel: 1 },
      energy: { name: 'Max Energy', icon: '⚡', baseCost: 15, maxLevel: 15, perLevel: 10 },
      luck: { name: 'Luck', icon: '🍀', baseCost: 30, maxLevel: 10, perLevel: 0.05 },
      gemValue: { name: 'Gem Value', icon: '💎', baseCost: 40, maxLevel: 10, perLevel: 0.1 },
    } satisfies Record<
      UpgradeId,
      { name: string; icon: string; baseCost: number; maxLevel: number; perLevel: number }
    >,
  },
} as const;

export const BLOCK_TYPES: BlockType[] = ['dirt', 'stone', 'hard', 'obsidian'];
export const GEM_TIERS: GemTier[] = ['quartz', 'amethyst', 'sapphire', 'ruby', 'diamond'];
export const UPGRADE_IDS: UpgradeId[] = ['power', 'energy', 'luck', 'gemValue'];
