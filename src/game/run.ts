import { CONFIG } from '../config';
import { bonusForDepth, cleanMultiplier, clearEnergyForDepth, energyAfterTap, gasEnergyLoss, gemsKept, gemValue } from './economy';
import { generateFloor } from './floor';
import { isMinable, neighbors4, neighbors8, rowOf, square } from './grid';
import { availablePerks, gasLossFactor, hasPerk, PERKS, powerWithoutPerks, rollPerkOffer } from './perks';
import { toolChargesFor } from './progression';
import { hashSeed, Rng } from './rng';
import type {
  BlockType,
  Content,
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
    cleanFloors: 0,
    cleanBonus: 0,
    momentum: 0,
    rngState: hashSeed(seed, 0x5eed),
    status: 'playing',
    stats: { taps: 0, blocksBroken: 0, rushes: 0, gemsByTier: {} },
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
  // Taps are free during a Rush, so running dry only counts once it ends (see `tickRun`).
  if (ctx.run.status === 'playing' && ctx.run.energy <= 0 && !ctx.run.rush) {
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
  // Tapping a revealed item picks it up (free, normal rules even during a Rush).
  if (target.open && isCollectible(target.content)) return collect(prev, idx);
  // During a Rush any block can be mined, not just the ones next to an open cell.
  const reachable = prev.rush ? !target.open : isMinable(prev.floor, idx);
  if (!reachable || (prev.energy <= 0 && !prev.rush)) return { run: prev, events: [] };

  const ctx = begin(prev);
  const { run, rng, events } = ctx;

  const rushing = !!run.rush;
  if (rushing) {
    // Rush taps are free, and perks (Efficient Swing, Tremor, Sharp Edge) don't apply.
  } else if (hasPerk(run, 'efficientSwing') && rng.chance(CONFIG.perks.efficientSwing.chance)) {
    events.push({ type: 'freeSwing', idx });
  } else {
    run.energy = energyAfterTap(run.energy);
  }
  run.stats.taps++;

  // Tremor hits blocks that were already closed, not ones a cave-in just dropped.
  const tremorTargets = neighbors4(run.floor, idx).filter((n) => !run.floor.cells[n].open);
  const power = rushing ? powerWithoutPerks(run) * CONFIG.rush.powerMult : run.mods.power;
  if (damageBlock(ctx, idx, power) && !rushing && hasPerk(run, 'tremor')) {
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
    else if (!cell.open) breakBlock(ctx, n, { source: 'tool', triggerGas: tool !== 'dynamite' });
  }
  return finish(ctx);
}

/** Deals pickaxe (or Tremor) damage to a closed block, breaking it at 0 HP. Returns true if it broke. */
function damageBlock(ctx: Ctx, idx: number, amount: number): boolean {
  const cell = ctx.run.floor.cells[idx];
  if (cell.open) return false;
  const damage = Math.min(cell.hp, amount);
  cell.hp -= damage;
  ctx.events.push({ type: 'hit', idx, damage });
  if (cell.hp > 0) return false;
  breakBlock(ctx, idx, { source: 'pickaxe' });
  return true;
}

interface BreakOptions {
  /** Only pickaxe breaks (Tremor included) fill the Rush meter; tools would fill it in one blast. */
  source: 'pickaxe' | 'tool';
  /** Dynamite breaks gas pockets without releasing them. */
  triggerGas?: boolean;
}

/** Opens a block and resolves its content. Used by the pickaxe, tremor, and tools. */
function breakBlock(ctx: Ctx, idx: number, opts: BreakOptions) {
  openBlock(ctx, idx, opts);
  // After the content resolved, so a cave-in that refilled cells means the floor isn't clean yet.
  checkCleared(ctx);
}

/** Counts the floor as clean (once) when no closed block is left on it. */
function checkCleared(ctx: Ctx) {
  const { run } = ctx;
  const floor = run.floor;
  if (floor.cleared || floor.cells.some((c) => !c.open)) return;
  floor.cleared = true;
  const bonus = bonusForDepth(run.depth);
  run.cleanFloors++;
  run.cleanBonus += bonus;
  // Energy refund; during a Rush it waits for the Rush to end.
  const refund = clearEnergyForDepth(run.depth);
  let energy = 0;
  if (run.rush) run.rush.energyPending = (run.rush.energyPending ?? 0) + refund;
  else energy = gainEnergy(run, refund);
  ctx.events.push({
    type: 'floorCleared',
    depth: run.depth,
    bonus,
    multiplier: cleanMultiplier(run.cleanBonus),
    energy,
    energyPending: run.rush ? refund : 0,
  });
}

/** Adds energy up to max energy. Returns what was actually gained. */
function gainEnergy(run: RunState, amount: number): number {
  const before = run.energy;
  run.energy = Math.min(run.mods.maxEnergy, run.energy + amount);
  return run.energy - before;
}

function openBlock(ctx: Ctx, idx: number, opts: BreakOptions) {
  const { run, rng, events } = ctx;
  const cell = run.floor.cells[idx];
  const block = cell.block;
  cell.open = true;
  cell.hp = 0;
  run.stats.blocksBroken++;
  const rush = run.rush;
  if (rush) rush.blocks++;
  events.push(rush ? { type: 'break', idx, block, combo: rush.blocks } : { type: 'break', idx, block });

  const content = cell.content;
  // Items stay in the open cell until tapped (`collect`), Rush or not; hazards go off now.
  if (isCollectible(content)) events.push({ type: 'itemRevealed', idx, content });
  else if (content.kind !== 'stairs') cell.content = { kind: 'none' };
  // During a Rush gas and cave-ins do nothing (and are lost), and the meter doesn't fill.
  if (rush) {
    if (content.kind === 'stairs') events.push({ type: 'stairsRevealed', idx });
    return;
  }

  switch (content.kind) {
    case 'gas': {
      if (opts.triggerGas === false) break;
      const factor = gasLossFactor(run);
      const loss = Math.min(run.energy, Math.round(gasEnergyLoss(run.depth) * factor));
      run.energy -= loss;
      events.push({ type: 'gas', idx, energyLost: loss, protection: 1 - factor });
      break;
    }
    case 'caveIn': {
      const candidates = neighbors8(run.floor, idx).filter((n) => {
        const c = run.floor.cells[n];
        // Items lying in these cells are destroyed with them.
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

  if (opts.source === 'pickaxe') addMomentum(ctx, idx, momentumFill(run, block));
}

/** Gems, crystals and chests: revealed by a break, then picked up with a tap. */
export function isCollectible(content: Content): content is Extract<Content, { kind: 'gem' | 'crystal' | 'chest' }> {
  return content.kind === 'gem' || content.kind === 'crystal' || content.kind === 'chest';
}

/**
 * Picks up the item lying in open cell `idx` (free, no energy). Normal rules apply even during a Rush, except
 * that a chest's perk offer waits for the Rush to end. Same state if there's nothing to pick up.
 */
export function collect(prev: RunState, idx: number): ActionResult {
  const cell = prev.floor.cells[idx];
  if (prev.status !== 'playing' || !cell?.open || !isCollectible(cell.content)) {
    return { run: prev, events: [] };
  }
  const ctx = begin(prev);
  const { run, rng, events } = ctx;
  const content = run.floor.cells[idx].content;
  run.floor.cells[idx].content = { kind: 'none' };
  switch (content.kind) {
    case 'gem': {
      let value = gemValue(content.tier, run.mods.gemValueMult);
      const doubled = hasPerk(run, 'luckyStrike') && rng.chance(CONFIG.perks.luckyStrike.chance);
      if (doubled) value *= 2;
      run.gems += value;
      if (run.rush) run.rush.gems += value;
      run.stats.gemsByTier[content.tier] = (run.stats.gemsByTier[content.tier] ?? 0) + (doubled ? 2 : 1);
      events.push({ type: 'gem', idx, tier: content.tier, value, doubled });
      break;
    }
    case 'crystal':
      events.push({ type: 'crystal', idx, energy: gainEnergy(run, CONFIG.crystal.energy) });
      break;
    case 'chest': {
      if (rng.chance(CONFIG.chest.perkChance) && chestPerk(ctx, idx)) break;
      const gems = chestGems(run, rng, run.mods.gemValueMult);
      run.gems += gems;
      if (run.rush) run.rush.gems += gems;
      events.push({ type: 'chest', idx, gems });
      break;
    }
  }
  return finish(ctx);
}

/**
 * A chest's perk offer: now, or held until the current Rush ends. Returns false (the chest pays gems
 * instead) when no offer can be made or one is already held.
 */
function chestPerk(ctx: Ctx, idx: number): boolean {
  const rush = ctx.run.rush;
  if (!rush) return offerPerk(ctx, 'chest', idx);
  if (rush.perkOfferPending || availablePerks(ctx.run).length === 0) return false;
  rush.perkOfferPending = 'chest';
  ctx.events.push({ type: 'perkOfferHeld', idx });
  return true;
}

/** Gems in a chest: a random base plus a depth bonus, times `valueMult`. */
function chestGems(run: RunState, rng: Rng, valueMult: number): number {
  const c = CONFIG.chest;
  const base = c.gemsMin + rng.int(c.gemsMax - c.gemsMin + 1) + Math.floor(run.depth * c.gemsPerDepth);
  return Math.max(1, Math.round(base * valueMult));
}

/** Momentum a pickaxe break adds: harder blocks give more, and each Rush this run makes the next slower. */
export function momentumFill(run: RunState, block: BlockType): number {
  return CONFIG.rush.fill[block] * CONFIG.rush.fillDecay ** run.stats.rushes;
}

/** Fills the Rush meter; a full meter starts the Rush at once (even mid-tap, before Tremor hits). */
function addMomentum(ctx: Ctx, idx: number, amount: number) {
  const run = ctx.run;
  run.momentum = Math.min(1, run.momentum + amount);
  // Tolerance for float sums like 0.1 * 10.
  if (run.momentum < 1 - 1e-9) {
    ctx.events.push({ type: 'momentum', idx, level: run.momentum });
    return;
  }
  run.momentum = 0;
  run.stats.rushes++;
  run.rush = { msLeft: CONFIG.rush.durationSec * 1000, blocks: 0, gems: 0 };
  ctx.events.push({ type: 'rushStart', idx });
}

export function hasRush(run: RunState): boolean {
  return !!run.rush;
}

/**
 * Lets `dtMs` of play time pass: the meter drains, or the Rush timer runs down. When a Rush ends, a
 * run with no energy left runs dry. Only ticks while playing (modals pause it). Returns the same object
 * when nothing changes, so the UI can call it every frame.
 */
export function tickRun(prev: RunState, dtMs: number): ActionResult {
  const noop = { run: prev, events: [] };
  if (prev.status !== 'playing' || dtMs <= 0) return noop;
  const rush = prev.rush;
  if (!rush) {
    if (prev.momentum <= 0) return noop;
    // Shallow copy: only `momentum` changes, so there's no need to clone the floor every frame.
    const momentum = Math.max(0, prev.momentum - (CONFIG.rush.drainPerSec * dtMs) / 1000);
    return { run: { ...prev, momentum }, events: [] };
  }
  if (rush.msLeft > dtMs) return { run: { ...prev, rush: { ...rush, msLeft: rush.msLeft - dtMs } }, events: [] };

  const ctx = begin(prev);
  ctx.run.rush = undefined;
  ctx.run.momentum = 0;
  const energy = gainEnergy(ctx.run, rush.energyPending ?? 0);
  ctx.events.push({ type: 'rushEnd', blocks: rush.blocks, gems: rush.gems, energy });
  // A perk choice pauses the run, so running dry (if energy is 0) waits until the perk is picked.
  if (rush.perkOfferPending) offerPerk(ctx, rush.perkOfferPending);
  return finish(ctx);
}

/**
 * Pauses the run for a perk choice (`idx`: the chest it came from). Returns false if no perks are left or
 * one is already pending.
 */
function offerPerk(ctx: Ctx, source: PerkOfferSource, idx?: number): boolean {
  if (ctx.run.status !== 'playing') return false;
  const choices = rollPerkOffer(ctx.run, ctx.rng);
  if (choices.length === 0) return false;
  ctx.run.status = 'choosingPerk';
  ctx.run.perkOffer = { source, choices };
  ctx.events.push({ type: 'perkOffer', source, choices, ...(idx !== undefined && { idx }) });
  return true;
}

export function descend(prev: RunState): ActionResult {
  const ctx = begin(prev);
  const { run, events } = ctx;
  run.depth++;
  run.floor = generateFloor(run.seed, run.depth, { gemChanceBonus: run.mods.gemChanceBonus });

  // During a Rush: no Deep Breath, and a floor perk offer waits for the Rush to end.
  let restored = 0;
  if (hasPerk(run, 'deepBreath') && !run.rush) {
    const before = run.energy;
    run.energy = Math.min(run.mods.maxEnergy, run.energy + CONFIG.perks.deepBreath.energy);
    restored = run.energy - before;
  }
  events.push({ type: 'descend', depth: run.depth, energyRestored: restored });

  if (run.depth % CONFIG.perks.offerEveryFloors === 0) {
    // A held chest offer becomes the floor's (one choice either way).
    if (run.rush) run.rush.perkOfferPending = 'floor';
    else offerPerk(ctx, 'floor');
  }
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

/** The run's clean floor gem multiplier (1 with no clean floors). */
export function runMultiplier(run: RunState): number {
  return cleanMultiplier(run.cleanBonus);
}

export function endRun(prev: RunState, reason: EndReason): { run: RunState; summary: RunSummary } {
  const run = { ...prev, status: 'ended' as const };
  const multiplier = runMultiplier(run);
  const kept = gemsKept(run.gems, reason, multiplier);
  return {
    run,
    summary: {
      seed: run.seed,
      reason,
      depth: run.depth,
      gemsFound: run.gems,
      gemsKept: kept,
      cleanFloors: run.cleanFloors,
      multiplier,
      bonusGems: kept - gemsKept(run.gems, reason),
      blocksBroken: run.stats.blocksBroken,
      gemsByTier: { ...run.stats.gemsByTier },
    },
  };
}
