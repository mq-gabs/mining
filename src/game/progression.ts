import { CONFIG, UPGRADE_IDS, type UpgradeId } from '../config';
import type { RunModifiers, RunSummary } from './types';

export const PROFILE_VERSION = 1;

/** Everything that persists between runs. */
export interface Profile {
  version: number;
  gems: number;
  bestDepth: number;
  runsCompleted: number;
  upgrades: Record<UpgradeId, number>;
}

export function newProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    gems: 0,
    bestDepth: 0,
    runsCompleted: 0,
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>,
  };
}

/** Builds a valid profile from untrusted data (e.g. localStorage), falling back to defaults per field. */
export function parseProfile(raw: unknown): Profile {
  const base = newProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const count = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;

  const upgrades = { ...base.upgrades };
  const rawUpgrades = (r.upgrades ?? {}) as Record<string, unknown>;
  for (const id of UPGRADE_IDS) {
    upgrades[id] = count(rawUpgrades[id], CONFIG.upgrades.items[id].maxLevel);
  }
  return {
    version: PROFILE_VERSION,
    gems: count(r.gems),
    bestDepth: count(r.bestDepth),
    runsCompleted: count(r.runsCompleted),
    upgrades,
  };
}

/** Cost of the next level, or undefined when maxed. */
export function upgradeCost(id: UpgradeId, currentLevel: number): number | undefined {
  const item = CONFIG.upgrades.items[id];
  if (currentLevel >= item.maxLevel) return undefined;
  return Math.round(item.baseCost * Math.pow(CONFIG.upgrades.costGrowth, currentLevel));
}

export function canBuyUpgrade(profile: Profile, id: UpgradeId): boolean {
  const cost = upgradeCost(id, profile.upgrades[id]);
  return cost !== undefined && profile.gems >= cost;
}

/** Returns the updated profile, or the same object if the purchase isn't possible. */
export function buyUpgrade(profile: Profile, id: UpgradeId): Profile {
  if (!canBuyUpgrade(profile, id)) return profile;
  const cost = upgradeCost(id, profile.upgrades[id])!;
  return {
    ...profile,
    gems: profile.gems - cost,
    upgrades: { ...profile.upgrades, [id]: profile.upgrades[id] + 1 },
  };
}

/** Run stats derived from permanent upgrades. */
export function modifiersFromProfile(profile: Profile): RunModifiers {
  const lvl = profile.upgrades;
  const u = CONFIG.upgrades.items;
  return {
    maxEnergy: CONFIG.energy.start + lvl.energy * u.energy.perLevel,
    power: CONFIG.pickaxe.basePower + lvl.power * u.power.perLevel,
    gemChanceBonus: lvl.luck * u.luck.perLevel,
    gemValueMult: 1 + lvl.gemValue * u.gemValue.perLevel,
  };
}

export function applyRunResult(profile: Profile, summary: RunSummary): { profile: Profile; newBest: boolean } {
  const newBest = summary.depth > profile.bestDepth;
  return {
    newBest,
    profile: {
      ...profile,
      gems: profile.gems + summary.gemsKept,
      bestDepth: Math.max(profile.bestDepth, summary.depth),
      runsCompleted: profile.runsCompleted + 1,
    },
  };
}
