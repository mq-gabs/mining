// Balance simulator. Bots play whole careers (run -> shop -> run ...) and report,
// per run number, the average depth reached, gems kept, and upgrades bought.
// Usage: npm run sim [-- players runs]
import { CONFIG, UPGRADE_IDS } from '../src/config';
import { clearEnergyForDepth, tapsToBreak } from '../src/game/economy';
import { toColRow } from '../src/game/grid';
import { computeHints } from '../src/game/hints';
import {
  applyRunResult,
  buyUpgrade,
  canBuyUpgrade,
  modifiersFromProfile,
  newProfile,
  upgradeCost,
  type Profile,
} from '../src/game/progression';
import { canTarget, choosePerk, createRun, endRun, runMultiplier, tapCell, tickRun, toolArea, useTool } from '../src/game/run';
import type { Cell, PerkId, RunState, RunSummary, ToolId } from '../src/game/types';

/** Bot's perk preference, best first. */
const PERK_PRIORITY: PerkId[] = [
  'secondWind', 'deepBreath', 'sharpEdge', 'efficientSwing', 'tremor', 'gasMask',
  'luckyStrike', 'treasureSense', 'prospector', 'greed',
];

declare const process: { argv: string[]; env: Record<string, string | undefined> };

/** Play time per bot action, for the Rush clock. ~3 taps a second: a quick human. Tunable. */
const BOT_MS_PER_TAP = 300;

/**
 * Cleaning policy (tunables): clean a floor when the energy left after clearing it would still cover
 * `CLEAN_MARGIN` average floors, and give up if energy drops under `CLEAN_ABORT` average floors.
 */
const CLEAN_MARGIN = 2;
const CLEAN_ABORT = 1.2;
/**
 * Which floors the bot cleans: 'none'; 'leave' (only the floor it's about to leave the mine from, since its
 * leftover energy is worthless then); 'deep' (the default: also any floor from `CLEAN_MIN_DEPTH` it can
 * afford); 'all'. `SIM_CLEAN=none` gives the pure-diving baseline.
 * Override with the SIM_CLEAN env var.
 */
const CLEAN_POLICY = (process.env.SIM_CLEAN ?? 'deep') as 'none' | 'leave' | 'deep' | 'all';
const CLEAN_MIN_DEPTH = Number(process.env.SIM_CLEAN_MIN_DEPTH ?? 6);
/** Floor cost guess before the bot has finished a floor. */
const FIRST_FLOOR_COST = 20;

interface RunResult {
  summary: RunSummary;
  /** Sum of the depths of the floors cleaned (for their average depth). */
  cleanDepths: number;
  rushes: number;
  rushBlocks: number;
  rushGems: number;
}

type Rand = () => number;

/** What the bot thinks of a scanned block's content (negative = worth going for). */
function scannedScore(c: Cell): number {
  if (!c.scanned) return 0;
  switch (c.content.kind) {
    case 'gem': return -1.5;
    case 'crystal': case 'chest': return -1;
    case 'gas': case 'caveIn': return 3;
    default: return 0;
  }
}

/** Energy the pickaxe would spend to break every block left on the floor. */
function clearCost(run: RunState): number {
  return run.floor.cells.filter((c) => !c.open).reduce((sum, c) => sum + tapsToBreak(c.hp, run.mods.power), 0);
}

/** Clean this floor on the way down (mid-run), per `CLEAN_POLICY`. */
function shouldClean(run: RunState, avgCost: number): boolean {
  if (runMultiplier(run) >= CONFIG.cleanBonus.maxMult) return false;
  if (CLEAN_POLICY === 'none' || CLEAN_POLICY === 'leave') return false;
  if (CLEAN_POLICY === 'deep' && run.depth < CLEAN_MIN_DEPTH) return false;
  // The clear refund pays back part of the cost.
  return run.energy - clearCost(run) + clearEnergyForDepth(run.depth) >= avgCost * CLEAN_MARGIN;
}

/** `cleaning`: ignore the stairs and just take the cheapest block until the floor is clear. */
function pickTarget(run: RunState, rand: Rand, cleaning = false): number | undefined {
  const f = run.floor;
  const stairsOpen = f.cells.findIndex((c) => c.open && c.content.kind === 'stairs');
  if (stairsOpen >= 0 && !(cleaning && !f.cleared)) return stairsOpen;
  const searchRow = f.rows - CONFIG.grid.stairsBottomRows;
  const knownStairs = f.cells.findIndex((c) => c.scanned && c.content.kind === 'stairs');
  let best: number | undefined;
  let bestScore = Infinity;
  const hints = computeHints(f);
  f.cells.forEach((c, i) => {
    const hint = hints[i];
    if (!hint) return;
    const { row, col } = toColRow(f, i);
    let depthPenalty = row < searchRow ? (searchRow - row) * 0.8 : 0;
    if (cleaning) depthPenalty = 0;
    else if (knownStairs >= 0) {
      const s = toColRow(f, knownStairs);
      depthPenalty = (Math.abs(s.row - row) + Math.abs(s.col - col)) * 1.5;
    }
    // Mild hint use: sparkles are worth a detour, dust is worth avoiding.
    const hintScore = (hint.gemNear ? -0.7 : 0) + (hint.hazardNear ? 0.7 : 0) + scannedScore(c);
    const score = tapsToBreak(c.hp, run.mods.power) + depthPenalty + hintScore + rand() * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Taps the pickaxe would need to clear a tool's area (the value of using the tool there). */
function areaTaps(run: RunState, tool: ToolId, idx: number): number {
  return toolArea(run.floor, tool, idx)
    .map((n) => run.floor.cells[n])
    .filter((c) => !c.open)
    .reduce((sum, c) => sum + tapsToBreak(c.hp, run.mods.power), 0);
}

/**
 * A simple tool policy: scan when entering the stairs zone, drill a stairs-zone row when it's
 * expensive, and dynamite a hard target. Returns undefined to fall back to the pickaxe.
 */
function pickTool(run: RunState, target: number, cleaning = false): { tool: ToolId; idx: number } | undefined {
  const f = run.floor;
  const t = f.cells[target];
  if (t.open) return undefined;
  const searchRow = f.rows - CONFIG.grid.stairsBottomRows;
  const { row } = toColRow(f, target);
  const stairsKnown = f.cells.some((c) => c.scanned && c.content.kind === 'stairs');
  const unscanned = toolArea(f, 'scanner', target).filter((n) => !f.cells[n].open && !f.cells[n].scanned).length;
  if (!cleaning && run.tools.scanner > 0 && !stairsKnown && row >= searchRow - 1 && unscanned >= 4) {
    return { tool: 'scanner', idx: target };
  }
  if (run.tools.drill > 0 && !stairsKnown && row >= searchRow && areaTaps(run, 'drill', target) >= 6) {
    return { tool: 'drill', idx: target };
  }
  if (run.tools.dynamite > 0 && tapsToBreak(t.hp, run.mods.power) >= 2 && areaTaps(run, 'dynamite', target) >= 8) {
    return { tool: 'dynamite', idx: target };
  }
  return undefined;
}

/** Plays one run. Leaves on arrival at a floor if energy looks too low to clear it. */
function playRun(seed: number, profile: Profile, rand: Rand): RunResult {
  let run = createRun(seed, modifiersFromProfile(profile));
  const rush = { rushBlocks: 0, rushGems: 0 };
  let cleanDepths = 0;
  const result = (reason: 'left' | 'exhausted'): RunResult => ({
    summary: endRun(run, reason).summary,
    cleanDepths,
    rushes: run.stats.rushes,
    // Include a Rush still running when the bot leaves.
    rushBlocks: rush.rushBlocks + (run.rush?.blocks ?? 0),
    rushGems: rush.rushGems + (run.rush?.gems ?? 0),
  });
  let energyAtFloorStart = run.energy;
  const floorCosts: number[] = [];
  const avgCost = () => (floorCosts.length ? floorCosts.reduce((a, b) => a + b, 0) / floorCosts.length : FIRST_FLOOR_COST);
  let cleaning = shouldClean(run, avgCost());
  /** Clearing the last floor before leaving: never abort, and leave once it's clear. */
  let leaving = false;
  let steps = 0;
  while (run.status === 'playing' || run.status === 'choosingPerk') {
    if (++steps > 5000) {
      throw new Error(`run did not end: seed ${seed} depth ${run.depth} energy ${run.energy} status ${run.status} perks ${JSON.stringify(run.perks)} mods ${JSON.stringify(run.mods)} upgrades ${JSON.stringify(profile.upgrades)}`);
    }
    if (run.status === 'choosingPerk') {
      const choices = run.perkOffer!.choices;
      const pick = PERK_PRIORITY.find((p) => choices.includes(p)) ?? choices[0];
      run = choosePerk(run, pick).run;
      continue;
    }
    if (cleaning && !leaving && !run.rush && run.energy < avgCost() * CLEAN_ABORT) cleaning = false;
    const t = pickTarget(run, rand, cleaning);
    if (t === undefined) break;
    const depth = run.depth;
    const tool = pickTool(run, t, cleaning);
    const next = tool && canTarget(run.floor, tool.idx) ? useTool(run, tool.tool, tool.idx).run : tapCell(run, t).run;
    if (next === run) {
      throw new Error(`bot stuck: seed ${seed} depth ${run.depth} cell ${t} ${JSON.stringify(run.floor.cells[t])}`);
    }
    const ticked = tickRun(next, BOT_MS_PER_TAP);
    for (const e of ticked.events) {
      if (e.type !== 'rushEnd') continue;
      rush.rushBlocks += e.blocks;
      rush.rushGems += e.gems;
    }
    const wasCleared = run.floor.cleared;
    run = ticked.run;
    if (run.depth === depth && run.floor.cleared && !wasCleared) cleanDepths += depth;
    if (run.depth > depth) {
      // Cleaned floors cost far more than a normal one, so they'd skew the estimate.
      if (!cleaning) floorCosts.push(energyAtFloorStart - run.energy);
      energyAtFloorStart = run.energy;
      // Deeper floors are harder, so be a little conservative.
      if (run.energy < avgCost() * 0.9 && !run.rush) {
        // About to leave: spend the leftover energy clearing this floor first, if it's enough.
        if (CLEAN_POLICY === 'none' || runMultiplier(run) >= CONFIG.cleanBonus.maxMult || clearCost(run) > run.energy) {
          // (The refund only comes once the floor is clear, so the bot must afford the whole cost up front.)
          return result('left');
        }
        cleaning = true;
        leaving = true;
        continue;
      }
      cleaning = shouldClean(run, avgCost());
    } else if (leaving && run.floor.cleared) {
      return result('left');
    }
  }
  return result('exhausted');
}

/** Buys the cheapest affordable upgrade until nothing is affordable. Returns count bought. */
function shop(profile: Profile): { profile: Profile; bought: number } {
  let bought = 0;
  for (;;) {
    const options = UPGRADE_IDS.filter((id) => canBuyUpgrade(profile, id));
    if (options.length === 0) return { profile, bought };
    options.sort((a, b) => upgradeCost(a, profile.upgrades[a])! - upgradeCost(b, profile.upgrades[b])!);
    profile = buyUpgrade(profile, options[0]);
    bought++;
  }
}

function simulateCareers(players: number, runs: number) {
  let rs = 1;
  const rand: Rand = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  const rows = Array.from({ length: runs }, () => ({
    depth: 0, kept: 0, bought: 0, left: 0, lvl: 0, tools: 0, rushes: 0, rushBlocks: 0, rushGems: 0, gems: 0,
    clean: 0, cleanDepths: 0, mult: 0, bonus: 0,
  }));
  for (let p = 0; p < players; p++) {
    let profile = newProfile();
    for (let r = 0; r < runs; r++) {
      const { summary, rushes, rushBlocks, rushGems, cleanDepths } = playRun((p * 1000 + r + 1) * 2654435761, profile, rand);
      profile = applyRunResult(profile, summary).profile;
      const res = shop(profile);
      profile = res.profile;
      const row = rows[r];
      row.depth += summary.depth / players;
      row.kept += summary.gemsKept / players;
      row.bought += res.bought / players;
      row.left += (summary.reason === 'left' ? 1 : 0) / players;
      row.lvl += Object.values(profile.upgrades).reduce((a, b) => a + b, 0) / players;
      const charges = modifiersFromProfile(profile).toolCharges;
      row.tools += (charges.dynamite + charges.drill + charges.scanner) / players;
      row.rushes += rushes;
      row.rushBlocks += rushBlocks;
      row.rushGems += rushGems;
      row.gems += summary.gemsFound;
      row.clean += summary.cleanFloors;
      row.cleanDepths += cleanDepths;
      row.mult += summary.multiplier / players;
      row.bonus += summary.bonusGems;
    }
  }
  console.log(
    'run | avg depth | gems kept | upgrades bought | total levels | left voluntarily | tool charges | rushes | floors/rush | blocks/rush | rush gems' +
      ' | clean/run | clean depth | mult | bonus gems',
  );
  rows.forEach((r, i) => {
    const perRush = (x: number) => (r.rushes ? (x / r.rushes).toFixed(1) : '–');
    console.log(
      `${String(i + 1).padStart(3)} | ${r.depth.toFixed(1).padStart(9)} | ${r.kept.toFixed(0).padStart(9)} | ` +
        `${r.bought.toFixed(2).padStart(15)} | ${r.lvl.toFixed(1).padStart(12)} | ${(r.left * 100).toFixed(0).padStart(3)}% | ${r.tools.toFixed(1).padStart(4)} | ` +
        `${(r.rushes / players).toFixed(2).padStart(6)} | ${perRush(r.depth * players).padStart(11)} | ${perRush(r.rushBlocks).padStart(11)} | ` +
        `${((r.rushGems / Math.max(1, r.gems)) * 100).toFixed(0).padStart(8)}% | ` +
        `${(r.clean / players).toFixed(2).padStart(9)} | ${(r.clean ? (r.cleanDepths / r.clean).toFixed(1) : '–').padStart(11)} | ` +
        `${r.mult.toFixed(2).padStart(4)} | ${((r.bonus / Math.max(1, r.kept * players)) * 100).toFixed(0).padStart(9)}%`,
    );
  });
}

simulateCareers(Number(process.argv[2] ?? 200), Number(process.argv[3] ?? 15));
