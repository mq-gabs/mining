import { CONFIG } from '../config';
import type { Rng } from './rng';
import type { PerkId, RunState } from './types';

export interface PerkDef {
  id: PerkId;
  name: string;
  icon: string;
  description: string;
  /** Stackable perks can be offered (and taken) more than once per run, up to `maxStacks`. */
  stackable: boolean;
  maxStacks?: number;
  /** Immediate effect when taken. Mutates the given (already cloned) run. */
  onTake?: (run: RunState) => void;
}

const P = CONFIG.perks;

/**
 * The perk pool. Add a perk by adding an entry here (and its id to `PerkId`).
 * Passive perks have no `onTake`; the run logic checks `hasPerk` where they apply.
 */
export const PERKS: Record<PerkId, PerkDef> = {
  sharpEdge: {
    id: 'sharpEdge',
    name: 'Sharp Edge',
    icon: '🗡️',
    description: `+${P.sharpEdge.power} pickaxe power.`,
    stackable: true,
    maxStacks: P.sharpEdge.maxStacks,
    onTake: (run) => {
      run.mods.power += P.sharpEdge.power;
    },
  },
  secondWind: {
    id: 'secondWind',
    name: 'Second Wind',
    icon: '💨',
    description: `+${P.secondWind.energy} energy now.`,
    stackable: true,
    maxStacks: P.secondWind.maxStacks,
    onTake: (run) => {
      run.energy = Math.min(run.mods.maxEnergy, run.energy + P.secondWind.energy);
    },
  },
  luckyStrike: {
    id: 'luckyStrike',
    name: 'Lucky Strike',
    icon: '🍀',
    description: `${pct(P.luckyStrike.chance)} chance each gem drop is doubled.`,
    stackable: false,
  },
  tremor: {
    id: 'tremor',
    name: 'Tremor',
    icon: '🌋',
    description: `Breaking a block deals ${P.tremor.damage} damage to the blocks next to it.`,
    stackable: false,
  },
  gasMask: {
    id: 'gasMask',
    name: 'Gas Mask',
    icon: '😷',
    description: 'Gas pockets are harmless.',
    stackable: false,
  },
  prospector: {
    id: 'prospector',
    name: 'Prospector',
    icon: '🔎',
    description: 'Gem sparkles show the color of the gem tier.',
    stackable: false,
  },
  efficientSwing: {
    id: 'efficientSwing',
    name: 'Efficient Swing',
    icon: '🌀',
    description: `${pct(P.efficientSwing.chance)} chance a tap costs no energy.`,
    stackable: false,
  },
  treasureSense: {
    id: 'treasureSense',
    name: 'Treasure Sense',
    icon: '🧭',
    description: 'Chests glow once exposed.',
    stackable: false,
  },
  deepBreath: {
    id: 'deepBreath',
    name: 'Deep Breath',
    icon: '🫁',
    description: `Each new floor restores ${P.deepBreath.energy} energy.`,
    stackable: false,
  },
  greed: {
    id: 'greed',
    name: 'Greed',
    icon: '💰',
    description: `Gem values +${pct(P.greed.gemValueBonus)}, but max energy −${P.greed.maxEnergyPenalty}.`,
    stackable: false,
    onTake: (run) => {
      run.mods.gemValueMult += P.greed.gemValueBonus;
      run.mods.maxEnergy -= P.greed.maxEnergyPenalty;
      run.energy = Math.min(run.energy, run.mods.maxEnergy);
    },
  },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

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

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
