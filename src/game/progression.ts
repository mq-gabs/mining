import { CONFIG, TOOL_IDS, TOOL_UPGRADES, UPGRADE_IDS, type ToolId, type UpgradeDef, type UpgradeId } from '../config';
import type { RunModifiers, RunSummary } from './types';

/** v2: tool upgrades (dynamite, drill/scanner unlocks and charges). v1 saves load with those at 0. */
export const PROFILE_VERSION = 2;

export function upgradeDef(id: UpgradeId): UpgradeDef {
  return CONFIG.upgrades.items[id];
}

/** An upgrade is available once the upgrade it `requires` (if any) has been bought. */
export function isUpgradeAvailable(levels: Partial<Record<UpgradeId, number>>, id: UpgradeId): boolean {
  const req = upgradeDef(id).requires;
  return !req || (levels[req] ?? 0) > 0;
}

export function isToolUnlocked(levels: Partial<Record<UpgradeId, number>>, tool: ToolId): boolean {
  const unlock = TOOL_UPGRADES[tool].unlock;
  return !unlock || (levels[unlock] ?? 0) > 0;
}

/** Charges each tool starts a run with, from upgrade levels (0 when locked). */
export function toolChargesFor(levels: Partial<Record<UpgradeId, number>>): Record<ToolId, number> {
  const charges = {} as Record<ToolId, number>;
  for (const tool of TOOL_IDS) {
    const extra = (levels[TOOL_UPGRADES[tool].charges] ?? 0) * upgradeDef(TOOL_UPGRADES[tool].charges).perLevel;
    charges[tool] = isToolUnlocked(levels, tool) ? CONFIG.tools[tool].baseCharges + extra : 0;
  }
  return charges;
}

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
  for (const id of UPGRADE_IDS) {
    if (!isUpgradeAvailable(upgrades, id)) upgrades[id] = 0;
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
  if (!isUpgradeAvailable(profile.upgrades, id)) return false;
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
    toolCharges: toolChargesFor(lvl),
  };
}

/**
 * Reward for the summary's rewarded ad: multiplies the gems kept from a run that was already applied
 * with `applyRunResult`, so it adds the difference. Same objects back if already doubled or nothing kept.
 */
export function doubleRunGems(profile: Profile, summary: RunSummary): { profile: Profile; summary: RunSummary } {
  if (summary.gemsDoubled || summary.gemsKept <= 0) return { profile, summary };
  const kept = summary.gemsKept * CONFIG.ads.gemMultiplier;
  return {
    profile: { ...profile, gems: profile.gems + kept - summary.gemsKept },
    summary: { ...summary, gemsKept: kept, gemsDoubled: true },
  };
}

/** Interstitials show at most once every N runs: after runs N, 2N, 3N... (never during a run). */
export function shouldShowInterstitial(runsCompleted: number): boolean {
  const every = CONFIG.ads.interstitialEveryRuns;
  return runsCompleted > 0 && runsCompleted % every === 0;
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
