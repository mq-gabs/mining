import { CONFIG } from '../config';
import type { Rng } from './rng';
import type { PerkId, RunState } from './types';

export interface PerkDef {
  id: PerkId;
  icon: string;
  /** Stackable perks can be offered (and taken) more than once per run, up to `maxStacks`. */
  stackable: boolean;
  maxStacks?: number;
  /** Immediate effect when taken. Mutates the given (already cloned) run. */
  onTake?: (run: RunState) => void;
}

const P = CONFIG.perks;

/**
 * The perk pool. Add a perk by adding an entry here (and its id to `PerkId`), and its name and
 * description to the translation tables (`src/i18n/`, `ui/names.ts`).
 * Passive perks have no `onTake`; the run logic checks `hasPerk` where they apply.
 */
export const PERKS: Record<PerkId, PerkDef> = {
  sharpEdge: {
    id: 'sharpEdge',
    icon: '🗡️',
    stackable: true,
    maxStacks: P.sharpEdge.maxStacks,
    onTake: (run) => {
      run.mods.power += P.sharpEdge.power;
    },
  },
  secondWind: {
    id: 'secondWind',
    icon: '💨',
    stackable: true,
    maxStacks: P.secondWind.maxStacks,
    onTake: (run) => {
      run.energy = Math.min(run.mods.maxEnergy, run.energy + P.secondWind.energy);
    },
  },
  luckyStrike: {
    id: 'luckyStrike',
    icon: '🍀',
    stackable: false,
  },
  tremor: {
    id: 'tremor',
    icon: '🌋',
    stackable: false,
  },
  gasMask: {
    id: 'gasMask',
    icon: '😷',
    stackable: true,
    maxStacks: P.gasMask.maxStacks,
  },
  prospector: {
    id: 'prospector',
    icon: '🔎',
    stackable: false,
  },
  efficientSwing: {
    id: 'efficientSwing',
    icon: '🌀',
    stackable: false,
  },
  treasureSense: {
    id: 'treasureSense',
    icon: '🧭',
    stackable: false,
  },
  deepBreath: {
    id: 'deepBreath',
    icon: '🫁',
    stackable: false,
  },
  greed: {
    id: 'greed',
    icon: '💰',
    stackable: false,
    onTake: (run) => {
      run.mods.gemValueMult += P.greed.gemValueBonus;
      run.mods.maxEnergy -= P.greed.maxEnergyPenalty;
      run.energy = Math.min(run.energy, run.mods.maxEnergy);
    },
  },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** Pickaxe power without Sharp Edge (a Rush ignores perks). */
export function powerWithoutPerks(run: Pick<RunState, 'perks' | 'mods'>): number {
  return run.mods.power - (run.perks.sharpEdge ?? 0) * P.sharpEdge.power;
}

/** Gem value multiplier without Greed (a Rush ignores perks). */
export function gemValueMultWithoutPerks(run: Pick<RunState, 'perks' | 'mods'>): number {
  return run.mods.gemValueMult - (hasPerk(run, 'greed') ? P.greed.gemValueBonus : 0);
}

/** Share of gas energy loss that gets through the Gas Mask stacks (1 without a mask). */
export function gasLossFactor(run: Pick<RunState, 'perks'>): number {
  return Math.max(0, 1 - (run.perks.gasMask ?? 0) * P.gasMask.reduction);
}

export function hasPerk(run: Pick<RunState, 'perks'>, id: PerkId): boolean {
  return (run.perks[id] ?? 0) > 0;
}

/** Perks that can still be offered this run. */
export function availablePerks(run: Pick<RunState, 'perks'>): PerkId[] {
  return PERK_IDS.filter((id) => {
    const def = PERKS[id];
    const max = def.stackable ? (def.maxStacks ?? Infinity) : 1;
    return (run.perks[id] ?? 0) < max;
  });
}

/** Up to `count` distinct random perks from the available pool. */
export function rollPerkOffer(run: Pick<RunState, 'perks'>, rng: Rng, count = CONFIG.perks.offerCount): PerkId[] {
  const pool = availablePerks(run);
  const choices: PerkId[] = [];
  while (choices.length < count && pool.length > 0) {
    choices.push(pool.splice(rng.int(pool.length), 1)[0]);
  }
  return choices;
}
