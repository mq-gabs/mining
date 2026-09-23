import { CONFIG } from '../config';
import { energyAfterTap, gemsKept, gemValue } from './economy';
import { generateFloor } from './floor';
import { isMinable, neighbors4, neighbors8, rowOf, square } from './grid';
import { hasPerk, PERKS, rollPerkOffer } from './perks';
import { toolChargesFor } from './progression';
import { hashSeed, Rng } from './rng';
import type {
  EndReason,
  Floor,
  PerkId,
  PerkOfferSource,
  RunEvent,
  RunModifiers,
  RunState,
  RunSummary,
  ToolId,
} from './types';

export interface ActionResult {
  run: RunState;
  events: RunEvent[];
}

export function defaultModifiers(): RunModifiers {
  return {
    maxEnergy: CONFIG.energy.start,
    power: CONFIG.pickaxe.basePower,
    gemChanceBonus: 0,
    gemValueMult: 1,
    toolCharges: toolChargesFor({}),
  };
}

export function createRun(seed: number, mods: RunModifiers = defaultModifiers()): RunState {
  return {
    seed,
    depth: 1,
    floor: generateFloor(seed, 1, { gemChanceBonus: mods.gemChanceBonus }),
    energy: mods.maxEnergy,
    mods: structuredClone(mods),
    tools: { ...mods.toolCharges },
    gems: 0,
    perks: {},
    energyAdUsed: false,
    rngState: hashSeed(seed, 0x5eed),
    status: 'playing',
    stats: { taps: 0, blocksBroken: 0 },
  };
}

/** Mutable context for one action: a cloned run, its RNG, and the events it produces. */
interface Ctx {
  run: RunState;
  rng: Rng;
  events: RunEvent[];
}

function begin(prev: RunState): Ctx {
  const run = structuredClone(prev);
  return { run, rng: new Rng(run.rngState), events: [] };
}

function finish(ctx: Ctx): ActionResult {
  ctx.run.rngState = ctx.rng.state;
  if (ctx.run.status === 'playing' && ctx.run.energy <= 0) {
    ctx.run.status = 'outOfEnergy';
    ctx.events.push({ type: 'outOfEnergy' });
  }
  return { run: ctx.run, events: ctx.events };
}

/** What happens when the player taps cell `idx` with the pickaxe. Returns a new state. */
export function tapCell(prev: RunState, idx: number): ActionResult {
  if (prev.status !== 'playing') return { run: prev, events: [] };
  const target = prev.floor.cells[idx];
  if (!target) return { run: prev, events: [] };

  // Tapping revealed stairs takes you down (free).
  if (target.open && target.content.kind === 'stairs') return descend(prev);
  if (!isMinable(prev.floor, idx) || prev.energy <= 0) return { run: prev, events: [] };

  const ctx = begin(prev);
  const { run, rng, events } = ctx;

  if (hasPerk(run, 'efficientSwing') && rng.chance(CONFIG.perks.efficientSwing.chance)) {
    events.push({ type: 'freeSwing', idx });
  } else {
    run.energy = energyAfterTap(run.energy);
  }
  run.stats.taps++;

  // Tremor hits blocks that were already closed, not ones a cave-in just dropped.
  const tremorTargets = neighbors4(run.floor, idx).filter((n) => !run.floor.cells[n].open);
  if (damageBlock(ctx, idx, run.mods.power) && hasPerk(run, 'tremor')) {
    for (const n of tremorTargets) damageBlock(ctx, n, CONFIG.perks.tremor.damage);
  }
  return finish(ctx);
}

/** Tools can target any open cell or any block the pickaxe could reach. */
export function canTarget(floor: Floor, idx: number): boolean {
  const cell = floor.cells[idx];
  return !!cell && (cell.open || isMinable(floor, idx));
}

/** Cells a tool aimed at `idx` would affect (before filtering out open/already-scanned ones). */
export function toolArea(floor: Floor, tool: ToolId, idx: number): number[] {
  switch (tool) {
    case 'dynamite':
      return square(floor, idx, CONFIG.tools.dynamite.radius);
    case 'drill':
      return rowOf(floor, idx);
    case 'scanner':
      return square(floor, idx, CONFIG.tools.scanner.radius);
  }
}

/**
 * Uses one charge of a tool on cell `idx`. Tools cost no energy. Returns the same state (no-op) when
 * the tool has no charges, the target is out of reach, or the tool would affect nothing.
 */
export function useTool(prev: RunState, tool: ToolId, idx: number): ActionResult {
  const noop = { run: prev, events: [] };
  if (prev.status !== 'playing' || prev.tools[tool] <= 0 || !canTarget(prev.floor, idx)) return noop;
  const cells = toolArea(prev.floor, tool, idx).filter((n) => {
    const c = prev.floor.cells[n];
    return !c.open && !(tool === 'scanner' && c.scanned);
  });
  if (cells.length === 0) return noop;

  const ctx = begin(prev);
  const { run } = ctx;
  run.tools[tool]--;
  ctx.events.push({ type: 'tool', tool, idx, cells });
  for (const n of cells) {
    const cell = run.floor.cells[n];
    if (tool === 'scanner') cell.scanned = true;
    // A cave-in earlier in the same blast can refill cells; those stay closed.
    else if (!cell.open) breakBlock(ctx, n, { triggerGas: tool !== 'dynamite' });
  }
  return finish(ctx);
}

/** Deals damage to a closed block, breaking it at 0 HP. Returns true if it broke. */
function damageBlock(ctx: Ctx, idx: number, amount: number, opts: BreakOptions = {}): boolean {
  const cell = ctx.run.floor.cells[idx];
  if (cell.open) return false;
  const damage = Math.min(cell.hp, amount);
  cell.hp -= damage;
  ctx.events.push({ type: 'hit', idx, damage });
  if (cell.hp > 0) return false;
  breakBlock(ctx, idx, opts);
  return true;
}

interface BreakOptions {
  /** Dynamite breaks gas pockets without releasing them. */
  triggerGas?: boolean;
}

/** Opens a block and resolves its content. Used by the pickaxe, tremor, and tools. */
function breakBlock(ctx: Ctx, idx: number, opts: BreakOptions = {}) {
  const { run, rng, events } = ctx;
  const cell = run.floor.cells[idx];
  cell.open = true;
  cell.hp = 0;
  run.stats.blocksBroken++;
  events.push({ type: 'break', idx, block: cell.block });

  const content = cell.content;
  if (content.kind !== 'stairs') cell.content = { kind: 'none' };

  switch (content.kind) {
    case 'gem': {
      let value = gemValue(content.tier, run.mods.gemValueMult);
      const doubled = hasPerk(run, 'luckyStrike') && rng.chance(CONFIG.perks.luckyStrike.chance);
      if (doubled) value *= 2;
      run.gems += value;
      events.push({ type: 'gem', idx, tier: content.tier, value, doubled });
      break;
    }
    case 'crystal': {
      const before = run.energy;
      run.energy = Math.min(run.mods.maxEnergy, run.energy + CONFIG.crystal.energy);
      events.push({ type: 'crystal', idx, energy: run.energy - before });
      break;
    }
    case 'chest': {
      if (rng.chance(CONFIG.chest.perkChance) && offerPerk(ctx, 'chest')) break;
      const c = CONFIG.chest;
      const base = c.gemsMin + rng.int(c.gemsMax - c.gemsMin + 1) + Math.floor(run.depth * c.gemsPerDepth);
      const gems = Math.max(1, Math.round(base * run.mods.gemValueMult));
      run.gems += gems;
      events.push({ type: 'chest', idx, gems });
      break;
    }
    case 'gas': {
      if (opts.triggerGas === false) break;
      const masked = hasPerk(run, 'gasMask');
      const loss = masked ? 0 : Math.min(run.energy, CONFIG.hazards.gasEnergyLoss);
      run.energy -= loss;
      events.push({ type: 'gas', idx, energyLost: loss, masked });
      break;
    }
    case 'caveIn': {
      const candidates = neighbors8(run.floor, idx).filter((n) => {
        const c = run.floor.cells[n];
        return c.open && n !== run.floor.entrance && c.content.kind !== 'stairs';
      });
      const filled: number[] = [];
      while (filled.length < CONFIG.hazards.caveInCells && candidates.length > 0) {
        const n = candidates.splice(rng.int(candidates.length), 1)[0];
        const hp = CONFIG.blocks.dirt.hp;
        run.floor.cells[n] = { open: false, block: 'dirt', hp, maxHp: hp, content: { kind: 'none' } };
        filled.push(n);
      }
      events.push({ type: 'caveIn', idx, filled });
      break;
    }
    case 'stairs':
      events.push({ type: 'stairsRevealed', idx });
      break;
  }
}

/** Pauses the run for a perk choice. Returns false if no perks are left or one is already pending. */
function offerPerk(ctx: Ctx, source: PerkOfferSource): boolean {
  if (ctx.run.status !== 'playing') return false;
  const choices = rollPerkOffer(ctx.run, ctx.rng);
  if (choices.length === 0) return false;
  ctx.run.status = 'choosingPerk';
  ctx.run.perkOffer = { source, choices };
  ctx.events.push({ type: 'perkOffer', source, choices });
  return true;
}

export function descend(prev: RunState): ActionResult {
  const ctx = begin(prev);
  const { run, events } = ctx;
  run.depth++;
  run.floor = generateFloor(run.seed, run.depth, { gemChanceBonus: run.mods.gemChanceBonus });

  let restored = 0;
  if (hasPerk(run, 'deepBreath')) {
    const before = run.energy;
    run.energy = Math.min(run.mods.maxEnergy, run.energy + CONFIG.perks.deepBreath.energy);
    restored = run.energy - before;
  }
  events.push({ type: 'descend', depth: run.depth, energyRestored: restored });

  if (run.depth % CONFIG.perks.offerEveryFloors === 0) offerPerk(ctx, 'floor');
  return finish(ctx);
}

/** Takes one of the offered perks and resumes the run. */
export function choosePerk(prev: RunState, perk: PerkId): ActionResult {
  if (prev.status !== 'choosingPerk' || !prev.perkOffer?.choices.includes(perk)) {
    return { run: prev, events: [] };
  }
  const ctx = begin(prev);
  const { run } = ctx;
  run.perks[perk] = (run.perks[perk] ?? 0) + 1;
  PERKS[perk].onTake?.(run);
  run.perkOffer = undefined;
  run.status = 'playing';
  ctx.events.push({ type: 'perkChosen', perk });
  return finish(ctx);
}

/** Whether a run that ran dry can still be saved by the rewarded energy ad. */
export function canUseEnergyAd(run: RunState): boolean {
  return run.status === 'outOfEnergy' && !run.energyAdUsed;
}

/** Reward for the out-of-energy ad: energy and a resumed run. Same state if not allowed. */
export function grantAdEnergy(prev: RunState): RunState {
  if (!canUseEnergyAd(prev)) return prev;
  return { ...addEnergy(prev, CONFIG.ads.rewardedEnergy), energyAdUsed: true };
}

/** Grants energy (e.g. rewarded ad) and resumes a run that ran dry. */
export function addEnergy(prev: RunState, amount: number): RunState {
  const run = structuredClone(prev);
  run.energy = Math.min(run.mods.maxEnergy, run.energy + amount);
  if (run.status === 'outOfEnergy' && run.energy > 0) run.status = 'playing';
  return run;
}

export function endRun(prev: RunState, reason: EndReason): { run: RunState; summary: RunSummary } {
  const run = { ...prev, status: 'ended' as const };
  return {
    run,
    summary: {
      seed: run.seed,
      reason,
      depth: run.depth,
      gemsFound: run.gems,
      gemsKept: gemsKept(run.gems, reason),
      blocksBroken: run.stats.blocksBroken,
    },
  };
}
