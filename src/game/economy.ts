import { CONFIG, type GemTier } from '../config';
import type { EndReason } from './types';

/** Value of one gem after multipliers. Always a whole number, at least 1. */
export function gemValue(tier: GemTier, valueMult = 1): number {
  return Math.max(1, Math.round(CONFIG.gems.tiers[tier].value * valueMult));
}

/** Gems the player keeps at the end of a run. */
export function gemsKept(runGems: number, reason: EndReason): number {
  if (reason === 'left') return runGems;
  return Math.floor(runGems * CONFIG.run.exhaustedKeepRatio);
}

/** Energy after a tap. Never negative. */
export function energyAfterTap(energy: number): number {
  return Math.max(0, energy - CONFIG.energy.tapCost);
}

/** Taps needed to break a block of `hp` with a pickaxe of `power`. */
export function tapsToBreak(hp: number, power: number): number {
  return Math.ceil(hp / Math.max(1, power));
}
