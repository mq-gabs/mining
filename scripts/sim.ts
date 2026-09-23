// Balance simulator. Bots play whole careers (run -> shop -> run ...) and report,
// per run number, the average depth reached, gems kept, and upgrades bought.
// Usage: npm run sim [-- players runs]
import { CONFIG, UPGRADE_IDS } from '../src/config';
import { tapsToBreak } from '../src/game/economy';
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
import { choosePerk, createRun, endRun, tapCell } from '../src/game/run';
import type { PerkId, RunState, RunSummary } from '../src/game/types';

/** Bot's perk preference, best first. */
const PERK_PRIORITY: PerkId[] = [
  'secondWind', 'deepBreath', 'sharpEdge', 'efficientSwing', 'tremor', 'gasMask',
  'luckyStrike', 'treasureSense', 'prospector', 'greed',
];

declare const process: { argv: string[] };

type Rand = () => number;

function pickTarget(run: RunState, rand: Rand): number | undefined {
  const f = run.floor;
  const stairsOpen = f.cells.findIndex((c) => c.open && c.content.kind === 'stairs');
  if (stairsOpen >= 0) return stairsOpen;
  const searchRow = f.rows - CONFIG.grid.stairsBottomRows;
  let best: number | undefined;
  let bestScore = Infinity;
  const hints = computeHints(f);
  f.cells.forEach((c, i) => {
    const hint = hints[i];
    if (!hint) return;
    const { row } = toColRow(f, i);
    const depthPenalty = row < searchRow ? (searchRow - row) * 0.8 : 0;
    // Mild hint use: sparkles are worth a detour, dust is worth avoiding.
    const hintScore = (hint.gemNear ? -0.7 : 0) + (hint.hazardNear ? 0.7 : 0);
    const score = tapsToBreak(c.hp, run.mods.power) + depthPenalty + hintScore + rand() * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Plays one run. Leaves on arrival at a floor if energy looks too low to clear it. */
function playRun(seed: number, profile: Profile, rand: Rand): RunSummary {
  let run = createRun(seed, modifiersFromProfile(profile));
  let energyAtFloorStart = run.energy;
  const floorCosts: number[] = [];
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
    const t = pickTarget(run, rand);
    if (t === undefined) break;
    const depth = run.depth;
    const next = tapCell(run, t).run;
    if (next === run) {
      throw new Error(`bot stuck: seed ${seed} depth ${run.depth} cell ${t} ${JSON.stringify(run.floor.cells[t])}`);
    }
    run = next;
    if (run.depth > depth) {
      floorCosts.push(energyAtFloorStart - run.energy);
      energyAtFloorStart = run.energy;
      const avgCost = floorCosts.reduce((a, b) => a + b, 0) / floorCosts.length;
      // Deeper floors are harder, so be a little conservative.
      if (run.energy < avgCost * 0.9) return endRun(run, 'left').summary;
    }
  }
  return endRun(run, 'exhausted').summary;
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
  const rows = Array.from({ length: runs }, () => ({ depth: 0, kept: 0, bought: 0, left: 0, lvl: 0 }));
  for (let p = 0; p < players; p++) {
    let profile = newProfile();
    for (let r = 0; r < runs; r++) {
      const summary = playRun((p * 1000 + r + 1) * 2654435761, profile, rand);
      profile = applyRunResult(profile, summary).profile;
      const res = shop(profile);
      profile = res.profile;
      const row = rows[r];
      row.depth += summary.depth / players;
      row.kept += summary.gemsKept / players;
      row.bought += res.bought / players;
      row.left += (summary.reason === 'left' ? 1 : 0) / players;
      row.lvl += Object.values(profile.upgrades).reduce((a, b) => a + b, 0) / players;
    }
  }
  console.log('run | avg depth | gems kept | upgrades bought | total levels | left voluntarily');
  rows.forEach((r, i) =>
    console.log(
      `${String(i + 1).padStart(3)} | ${r.depth.toFixed(1).padStart(9)} | ${r.kept.toFixed(0).padStart(9)} | ` +
        `${r.bought.toFixed(2).padStart(15)} | ${r.lvl.toFixed(1).padStart(12)} | ${(r.left * 100).toFixed(0).padStart(3)}%`,
    ),
  );
}

simulateCareers(Number(process.argv[2] ?? 200), Number(process.argv[3] ?? 15));
