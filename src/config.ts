// All balance numbers live here. Tune freely; game logic reads from this file only.

export type BlockType = 'dirt' | 'stone' | 'hard' | 'obsidian';
export type GemTier = 'quartz' | 'amethyst' | 'sapphire' | 'ruby' | 'diamond';

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
  ] satisfies { fromDepth: number; weights: Record<BlockType, number> }[],

  gems: {
    /** Base chance for any (non-stairs) block to contain a gem. */
    baseChance: 0.22,
    /** Tier table. `weight` is relative among tiers unlocked at the current depth. */
    tiers: {
      quartz: { value: 1, fromDepth: 1, weight: 100 },
      amethyst: { value: 5, fromDepth: 3, weight: 35 },
      sapphire: { value: 20, fromDepth: 6, weight: 12 },
      ruby: { value: 60, fromDepth: 10, weight: 5 },
      diamond: { value: 200, fromDepth: 15, weight: 2 },
    } satisfies Record<GemTier, { value: number; fromDepth: number; weight: number }>,
  },

  run: {
    /** Share of run gems kept when carried out with no energy. */
    exhaustedKeepRatio: 0.5,
  },
} as const;

export const BLOCK_TYPES: BlockType[] = ['dirt', 'stone', 'hard', 'obsidian'];
export const GEM_TIERS: GemTier[] = ['quartz', 'amethyst', 'sapphire', 'ruby', 'diamond'];
