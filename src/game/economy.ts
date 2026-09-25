import { CONFIG, type GemTier } from '../config';
import type { EndReason } from './types';

/** Value of one gem after multipliers. Always a whole number, at least 1. */
export function gemValue(tier: GemTier, valueMult = 1): number {
  return Math.max(1, Math.round(CONFIG.gems.tiers[tier].value * valueMult));
}

/**
 * Gems the player keeps at the end of a run. The clean floor `multiplier` applies first (rounded), then the
 * exhausted penalty.
 */
export function gemsKept(runGems: number, reason: EndReason, multiplier = 1): number {
  const total = Math.round(runGems * multiplier);
  if (reason !== 'exhausted') return total;
  return Math.floor(total * CONFIG.run.exhaustedKeepRatio);
}

/** Multiplier bonus for cleaning a floor at `depth`: deeper floors are worth more. */
export function bonusForDepth(depth: number): number {
  const c = CONFIG.cleanBonus;
  return c.perFloorBase + c.perDepth * (Math.max(1, depth) - 1);
}

/** Energy refunded for clearing a floor at `depth` (before the max energy cap). */
export function clearEnergyForDepth(depth: number): number {
  const c = CONFIG.cleanBonus;
  return Math.min(c.energyMax, Math.round(c.energyBase + c.energyPerDepth * (Math.max(1, depth) - 1)));
}

/** The run's gem multiplier from the summed clean floor bonuses, capped at `maxMult`. */
export function cleanMultiplier(cleanBonus: number): number {
  return Math.min(CONFIG.cleanBonus.maxMult, 1 + cleanBonus);
}

/** Energy after a tap. Never negative. */
export function energyAfterTap(energy: number): number {
  return Math.max(0, energy - CONFIG.energy.tapCost);
}

/** Taps needed to break a block of `hp` with a pickaxe of `power`. */
export function tapsToBreak(hp: number, power: number): number {
  return Math.ceil(hp / Math.max(1, power));
}

/** Energy a gas pocket takes on this floor (before Gas Mask stacks and the current-energy cap). */
export function gasEnergyLoss(depth: number): number {
  const g = CONFIG.hazards.gasEnergyLoss;
  return g.base + Math.floor(depth * g.perDepth);
}
