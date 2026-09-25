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
  let mix: Record<GemTier, number> = CONFIG.gems.tierMix[0].weights;
  for (const band of CONFIG.gems.tierMix) {
    if (depth >= band.fromDepth) mix = band.weights;
  }
  const weights: Partial<Record<GemTier, number>> = {};
  for (const tier of GEM_TIERS) {
    if (depth >= CONFIG.gems.tiers[tier].fromDepth && mix[tier] > 0) weights[tier] = mix[tier];
  }
  return weights;
}

type ExtraContent = keyof typeof CONFIG.contents;
const EXTRA_CONTENTS = Object.keys(CONFIG.contents) as ExtraContent[];

/** Chance for a block on this floor to hold a crystal, chest or hazard. */
export function contentChanceForDepth(kind: ExtraContent, depth: number): number {
  const c = CONFIG.contents[kind];
  if (depth < c.fromDepth) return 0;
  return Math.max(c.min, Math.min(c.max, c.base + c.perDepth * (depth - 1)));
}

/** Chance for a block on this floor to hold a gem, before stairs/other contents. */
export function gemChanceForDepth(depth: number, bonus = 0): number {
  const depthBonus = Math.min(CONFIG.gems.maxDepthChanceBonus, (depth - 1) * CONFIG.gems.chancePerDepth);
  return Math.min(1, CONFIG.gems.baseChance + depthBonus + bonus);
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
  const gemChance = gemChanceForDepth(depth, opts.gemChanceBonus);

  const cells: Cell[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const block = rng.weighted(blockWeights) ?? BLOCK_TYPES[0];
    const hp = CONFIG.blocks[block].hp;
    cells.push({ open: false, block, hp, maxHp: hp, content: { kind: 'none' } });
  }

  const entrance = toIndex({ cols }, Math.floor(cols / 2), 0);
  cells[entrance] = { ...cells[entrance], open: true, hp: 0, content: { kind: 'none' } };

  // The goal floor has no stairs: the Legendary Diamond takes their place.
  const stairsRow = rows - stairsBottomRows + rng.int(stairsBottomRows);
  const stairs = toIndex({ cols }, rng.int(cols), stairsRow);
  cells[stairs].content = depth === CONFIG.goal.depth ? { kind: 'legendary' } : { kind: 'stairs' };

  const extraChances = EXTRA_CONTENTS.map((kind) => [kind, contentChanceForDepth(kind, depth)] as const);
  for (let i = 0; i < cells.length; i++) {
    if (i === entrance || i === stairs) continue;
    cells[i].content = rollContent(rng, gemChance, gemWeights, extraChances);
  }

  return { depth, seed, cols, rows, cells, entrance };
}

function rollContent(
  rng: Rng,
  gemChance: number,
  gemWeights: Partial<Record<GemTier, number>>,
  extraChances: readonly (readonly [ExtraContent, number])[],
): Content {
  let roll = rng.next();
  if (roll < gemChance) {
    const tier = rng.weighted(gemWeights);
    if (tier) return { kind: 'gem', tier };
  }
  roll -= gemChance;
  for (const [kind, chance] of extraChances) {
    if (roll < chance) return { kind };
    roll -= chance;
  }
  return { kind: 'none' };
}
