import { BLOCK_TYPES, CONFIG, GEM_TIERS, type BlockType, type GemTier } from '../config';
import { toIndex } from './grid';
import { hashSeed, Rng } from './rng';
import type { Cell, Content, Floor } from './types';

export interface FloorOptions {
  /** Additive bonus to the base gem chance (Luck upgrade). */
  gemChanceBonus?: number;
}

export function blockWeightsForDepth(depth: number): Record<BlockType, number> {
  let weights: Record<BlockType, number> = CONFIG.blockMix[0].weights;
  for (const band of CONFIG.blockMix) {
    if (depth >= band.fromDepth) weights = band.weights;
  }
  return weights;
}

export function gemWeightsForDepth(depth: number): Partial<Record<GemTier, number>> {
  const weights: Partial<Record<GemTier, number>> = {};
  for (const tier of GEM_TIERS) {
    const t = CONFIG.gems.tiers[tier];
    if (depth >= t.fromDepth) weights[tier] = t.weight;
  }
  return weights;
}

export function floorSeed(runSeed: number, depth: number): number {
  return hashSeed(runSeed, depth);
}

/** Deterministic: the same (runSeed, depth, options) always yields the same floor. */
export function generateFloor(runSeed: number, depth: number, opts: FloorOptions = {}): Floor {
  const { cols, rows, stairsBottomRows } = CONFIG.grid;
  const seed = floorSeed(runSeed, depth);
  const rng = new Rng(seed);
  const blockWeights = blockWeightsForDepth(depth);
  const gemWeights = gemWeightsForDepth(depth);
  const gemChance = Math.min(1, CONFIG.gems.baseChance + (opts.gemChanceBonus ?? 0));

  const cells: Cell[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const block = rng.weighted(blockWeights) ?? BLOCK_TYPES[0];
    const hp = CONFIG.blocks[block].hp;
    cells.push({ open: false, block, hp, maxHp: hp, content: { kind: 'none' } });
  }

  const entrance = toIndex({ cols }, Math.floor(cols / 2), 0);
  cells[entrance] = { ...cells[entrance], open: true, hp: 0, content: { kind: 'none' } };

  const stairsRow = rows - stairsBottomRows + rng.int(stairsBottomRows);
  const stairs = toIndex({ cols }, rng.int(cols), stairsRow);
  cells[stairs].content = { kind: 'stairs' };

  for (let i = 0; i < cells.length; i++) {
    if (i === entrance || i === stairs) continue;
    cells[i].content = rollContent(rng, gemChance, gemWeights);
  }

  return { depth, seed, cols, rows, cells, entrance };
}

function rollContent(
  rng: Rng,
  gemChance: number,
  gemWeights: Partial<Record<GemTier, number>>,
): Content {
  if (rng.chance(gemChance)) {
    const tier = rng.weighted(gemWeights);
    if (tier) return { kind: 'gem', tier };
  }
  return { kind: 'none' };
}
