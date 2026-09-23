import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { applyRunResult, doubleRunGems, newProfile, shouldShowInterstitial } from './progression';
import { canUseEnergyAd, createRun, grantAdEnergy } from './run';
import type { RunSummary } from './types';

describe('rewarded energy ad', () => {
  it('only applies to a run that ran dry, once per run', () => {
    const playing = createRun(1);
    expect(canUseEnergyAd(playing)).toBe(false);
    expect(grantAdEnergy(playing)).toBe(playing);

    const dry = { ...playing, energy: 0, status: 'outOfEnergy' as const };
    const saved = grantAdEnergy(dry);
    expect(saved.energy).toBe(CONFIG.ads.rewardedEnergy);
    expect(saved.status).toBe('playing');
    expect(saved.energyAdUsed).toBe(true);

    const dryAgain = { ...saved, energy: 0, status: 'outOfEnergy' as const };
    expect(canUseEnergyAd(dryAgain)).toBe(false);
    expect(grantAdEnergy(dryAgain)).toBe(dryAgain);
  });

  it('is capped by max energy', () => {
    const run = createRun(1, { ...createRun(1).mods, maxEnergy: 10 });
    expect(grantAdEnergy({ ...run, energy: 0, status: 'outOfEnergy' }).energy).toBe(10);
  });
});

describe('gem doubling ad', () => {
  const summary: RunSummary = { seed: 1, reason: 'exhausted', depth: 3, gemsFound: 30, gemsKept: 15, blocksBroken: 9 };

  it('multiplies the gems kept on top of the already-applied run result, once', () => {
    const applied = applyRunResult({ ...newProfile(), gems: 100 }, summary).profile;
    expect(applied.gems).toBe(115);
    const doubled = doubleRunGems(applied, summary);
    expect(doubled.profile.gems).toBe(100 + 15 * CONFIG.ads.gemMultiplier);
    expect(doubled.summary).toMatchObject({ gemsKept: 15 * CONFIG.ads.gemMultiplier, gemsDoubled: true });
    expect(doubleRunGems(doubled.profile, doubled.summary).profile).toBe(doubled.profile);
  });

  it('does nothing when no gems were kept', () => {
    const p = newProfile();
    const empty = { ...summary, gemsKept: 0 };
    expect(doubleRunGems(p, empty)).toEqual({ profile: p, summary: empty });
  });
});

describe('interstitial pacing', () => {
  it('shows at most once every N runs', () => {
    const n = CONFIG.ads.interstitialEveryRuns;
    const shown = Array.from({ length: n * 3 + 1 }, (_, i) => shouldShowInterstitial(i));
    expect(shown.filter(Boolean)).toHaveLength(3);
    expect(shown[0]).toBe(false);
    expect(shown[n]).toBe(true);
    for (let i = 1; i < n; i++) expect(shown[i]).toBe(false);
  });
});
