import { CONFIG } from '../config';
import { energyAfterTap, gemsKept, gemValue } from './economy';
import { generateFloor } from './floor';
import { isMinable } from './grid';
import { hashSeed } from './rng';
import type { EndReason, RunEvent, RunModifiers, RunState, RunSummary } from './types';

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
  };
}

export function createRun(seed: number, mods: RunModifiers = defaultModifiers()): RunState {
  return {
    seed,
    depth: 1,
    floor: generateFloor(seed, 1, { gemChanceBonus: mods.gemChanceBonus }),
    energy: mods.maxEnergy,
    mods,
    gems: 0,
    rngState: hashSeed(seed, 0x5eed),
    status: 'playing',
    stats: { taps: 0, blocksBroken: 0 },
  };
}

/** What happens when the player taps cell `idx` with the pickaxe. Returns a new state. */
export function tapCell(prev: RunState, idx: number): ActionResult {
  if (prev.status !== 'playing') return { run: prev, events: [] };
  const target = prev.floor.cells[idx];
  if (!target) return { run: prev, events: [] };

  // Tapping revealed stairs takes you down (free).
  if (target.open && target.content.kind === 'stairs') return descend(prev);
  if (!isMinable(prev.floor, idx) || prev.energy <= 0) return { run: prev, events: [] };

  const run = structuredClone(prev);
  const cell = run.floor.cells[idx];
  const events: RunEvent[] = [];

  run.energy = energyAfterTap(run.energy);
  run.stats.taps++;
  const damage = Math.min(cell.hp, run.mods.power);
  cell.hp -= damage;
  events.push({ type: 'hit', idx, damage });

  if (cell.hp <= 0) {
    cell.open = true;
    cell.hp = 0;
    run.stats.blocksBroken++;
    events.push({ type: 'break', idx, block: cell.block });

    const content = cell.content;
    if (content.kind === 'gem') {
      const value = gemValue(content.tier, run.mods.gemValueMult);
      run.gems += value;
      cell.content = { kind: 'none' };
      events.push({ type: 'gem', idx, tier: content.tier, value });
    } else if (content.kind === 'stairs') {
      events.push({ type: 'stairsRevealed', idx });
    }
  }

  if (run.energy <= 0) {
    run.status = 'outOfEnergy';
    events.push({ type: 'outOfEnergy' });
  }
  return { run, events };
}

export function descend(prev: RunState): ActionResult {
  const run = structuredClone(prev);
  run.depth++;
  run.floor = generateFloor(run.seed, run.depth, { gemChanceBonus: run.mods.gemChanceBonus });
  return { run, events: [{ type: 'descend', depth: run.depth }] };
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
