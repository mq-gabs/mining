import { describe, expect, it } from 'vitest';
import { CONFIG, GEM_TIERS } from '../config';
import { blockWeightsForDepth, generateFloor, gemWeightsForDepth } from './floor';
import { isMinable, toColRow } from './grid';

const seeds = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

describe('generateFloor', () => {
  it('is deterministic for the same seed and depth', () => {
    expect(generateFloor(42, 3)).toEqual(generateFloor(42, 3));
  });

  it('differs between depths and seeds', () => {
    expect(generateFloor(42, 3).cells).not.toEqual(generateFloor(42, 4).cells);
    expect(generateFloor(42, 3).cells).not.toEqual(generateFloor(43, 3).cells);
  });

  it('has the configured size and an open entrance at top center', () => {
    const f = generateFloor(1, 1);
    expect(f.cells).toHaveLength(CONFIG.grid.cols * CONFIG.grid.rows);
    expect(toColRow(f, f.entrance)).toEqual({ col: Math.floor(CONFIG.grid.cols / 2), row: 0 });
    expect(f.cells[f.entrance].open).toBe(true);
    expect(f.cells.filter((c) => c.open)).toHaveLength(1);
  });

  it('places exactly one stairs block (the Legendary Diamond on the goal floor), in the bottom rows', () => {
    for (const seed of seeds) {
      const depth = 1 + (seed % CONFIG.goal.depth);
      const f = generateFloor(seed, depth);
      const kind = depth === CONFIG.goal.depth ? 'legendary' : 'stairs';
      expect(f.cells.some((c) => c.content.kind === (kind === 'stairs' ? 'legendary' : 'stairs'))).toBe(false);
      const stairs = f.cells
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.content.kind === kind);
      expect(stairs).toHaveLength(1);
      const { row } = toColRow(f, stairs[0].i);
      expect(row).toBeGreaterThanOrEqual(CONFIG.grid.rows - CONFIG.grid.stairsBottomRows);
      expect(stairs[0].c.open).toBe(false);
    }
  });

  it('only generates gem tiers unlocked at that depth', () => {
    for (const seed of seeds) {
      for (const depth of [1, 2, 5, 9, 14]) {
        for (const c of generateFloor(seed, depth).cells) {
          if (c.content.kind === 'gem') {
            expect(CONFIG.gems.tiers[c.content.tier].fromDepth).toBeLessThanOrEqual(depth);
          }
        }
      }
    }
  });

  it('only generates obsidian from its configured depth', () => {
    const firstObsidian = CONFIG.blockMix.find((b) => b.weights.obsidian > 0)!.fromDepth;
    for (const seed of seeds) {
      const f = generateFloor(seed, firstObsidian - 1);
      expect(f.cells.some((c) => c.block === 'obsidian')).toBe(false);
    }
    expect(blockWeightsForDepth(firstObsidian).obsidian).toBeGreaterThan(0);
  });

  it('gives every block its type HP', () => {
    const f = generateFloor(9, 10);
    for (const c of f.cells) {
      if (!c.open) expect(c.hp).toBe(CONFIG.blocks[c.block].hp);
    }
  });

  it('gem chance bonus increases gem count', () => {
    const count = (bonus: number) =>
      seeds.reduce(
        (n, s) =>
          n + generateFloor(s, 1, { gemChanceBonus: bonus }).cells.filter((c) => c.content.kind === 'gem').length,
        0,
      );
    expect(count(0.3)).toBeGreaterThan(count(0));
  });

  it('only the blocks around the entrance start minable', () => {
    const f = generateFloor(5, 1);
    const minable = f.cells.map((_, i) => i).filter((i) => isMinable(f, i));
    expect(minable.sort((a, b) => a - b)).toEqual([f.entrance - 1, f.entrance + 1, f.entrance + f.cols]);
  });

  it('every tier in the mix is unlocked by the time its weight is non-zero', () => {
    for (const band of CONFIG.gems.tierMix) {
      for (const [tier, w] of Object.entries(band.weights)) {
        if (w > 0) expect(CONFIG.gems.tiers[tier as keyof typeof CONFIG.gems.tiers].fromDepth).toBeLessThanOrEqual(band.fromDepth);
      }
    }
  });

  it('gem tier weights unlock by depth', () => {
    expect(Object.keys(gemWeightsForDepth(1))).toEqual(['quartz']);
    expect(Object.keys(gemWeightsForDepth(CONFIG.gems.tiers.ruby.fromDepth))).toEqual(GEM_TIERS);
  });
});
