import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { gemChanceForDepth, gemWeightsForDepth } from './floor';
import {
  applyRunResult,
  buyUpgrade,
  modifiersFromProfile,
  newProfile,
  parseProfile,
  upgradeCost,
} from './progression';
import type { RunSummary } from './types';

const summary = (over: Partial<RunSummary> = {}): RunSummary => ({
  seed: 1,
  reason: 'left',
  depth: 3,
  gemsFound: 20,
  gemsKept: 20,
  cleanFloors: 0,
  multiplier: 1,
  bonusGems: 0,
  blocksBroken: 30,
  gemsByTier: {},
  ...over,
});

describe('upgrade costs', () => {
  it('start at the base cost and scale by the growth factor', () => {
    expect(upgradeCost('power', 0)).toBe(20);
    expect(upgradeCost('power', 1)).toBe(32);
    expect(upgradeCost('energy', 2)).toBe(Math.round(15 * 1.6 ** 2));
  });

  it('are undefined at max level', () => {
    expect(upgradeCost('power', CONFIG.upgrades.items.power.maxLevel)).toBeUndefined();
  });
});

describe('buyUpgrade', () => {
  it('spends gems and raises the level', () => {
    const p = { ...newProfile(), gems: 50 };
    const after = buyUpgrade(p, 'power');
    expect(after.gems).toBe(30);
    expect(after.upgrades.power).toBe(1);
    expect(p.upgrades.power).toBe(0); // immutable
  });

  it('refuses when too poor or maxed', () => {
    const poor = { ...newProfile(), gems: 5 };
    expect(buyUpgrade(poor, 'power')).toBe(poor);
    const maxed = { ...newProfile(), gems: 1e9, upgrades: { ...newProfile().upgrades, luck: 10 } };
    expect(buyUpgrade(maxed, 'luck')).toBe(maxed);
  });
});

describe('modifiersFromProfile', () => {
  it('matches base stats with no upgrades', () => {
    expect(modifiersFromProfile(newProfile())).toEqual({
      maxEnergy: 50,
      power: 1,
      gemChanceBonus: 0,
      gemValueMult: 1,
      toolCharges: { dynamite: 1, drill: 0, scanner: 0 },
    });
  });

  it('applies per-level effects', () => {
    const p = { ...newProfile(), upgrades: { ...newProfile().upgrades, power: 2, energy: 3, luck: 4, gemValue: 5 } };
    const m = modifiersFromProfile(p);
    expect(m.power).toBe(3);
    expect(m.maxEnergy).toBe(80);
    expect(m.gemChanceBonus).toBeCloseTo(0.2);
    expect(m.gemValueMult).toBeCloseTo(1.5);
  });
});

describe('applyRunResult', () => {
  it('adds kept gems, counts runs, and tracks best depth', () => {
    const first = applyRunResult(newProfile(), summary({ depth: 4, gemsKept: 12 }));
    expect(first.newBest).toBe(true);
    expect(first.profile).toMatchObject({ gems: 12, bestDepth: 4, runsCompleted: 1 });
    const second = applyRunResult(first.profile, summary({ depth: 2, gemsKept: 3 }));
    expect(second.newBest).toBe(false);
    expect(second.profile).toMatchObject({ gems: 15, bestDepth: 4, runsCompleted: 2 });
  });
});

describe('parseProfile', () => {
  it('round-trips a saved profile', () => {
    const p = { ...newProfile(), gems: 99, bestDepth: 7, upgrades: { ...newProfile().upgrades, power: 1, energy: 2, luck: 0, gemValue: 3 } };
    expect(parseProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('falls back to defaults for garbage and clamps bad values', () => {
    expect(parseProfile(null)).toEqual(newProfile());
    expect(parseProfile('nope')).toEqual(newProfile());
    const p = parseProfile({ gems: -5, bestDepth: 'x', upgrades: { power: 999, energy: 2.7, bogus: 3 } });
    expect(p.gems).toBe(0);
    expect(p.bestDepth).toBe(0);
    expect(p.upgrades.power).toBe(CONFIG.upgrades.items.power.maxLevel);
    expect(p.upgrades.energy).toBe(2);
    expect(p.upgrades).not.toHaveProperty('bogus');
  });
});

describe('depth scaling', () => {
  it('gem chance grows with depth up to a cap', () => {
    expect(gemChanceForDepth(5)).toBeGreaterThan(gemChanceForDepth(1));
    expect(gemChanceForDepth(500)).toBeCloseTo(CONFIG.gems.baseChance + CONFIG.gems.maxDepthChanceBonus);
    expect(gemChanceForDepth(1, 0.1)).toBeCloseTo(CONFIG.gems.baseChance + 0.1);
  });

  it('newer gem tiers become relatively more common deeper down', () => {
    const share = (d: number) => {
      const w = gemWeightsForDepth(d);
      return w.amethyst! / Object.values(w).reduce((a, b) => a + b!, 0)!;
    };
    expect(share(8)).toBeGreaterThan(share(3));
    expect(share(3)).toBeGreaterThan(0);
  });
});
