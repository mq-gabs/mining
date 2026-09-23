// Balance simulator: a greedy bot plays many runs and reports depth/gem stats.
// Usage: npm run sim [-- runs]
import { tapsToBreak } from '../src/game/economy';
import { isMinable, toColRow } from '../src/game/grid';
import { createRun, defaultModifiers, endRun, tapCell } from '../src/game/run';
import type { RunModifiers, RunState } from '../src/game/types';
import { CONFIG } from '../src/config';

function pickTarget(run: RunState, rand: () => number): number | undefined {
  const f = run.floor;
  const stairsOpen = f.cells.findIndex((c) => c.open && c.content.kind === 'stairs');
  if (stairsOpen >= 0) return stairsOpen;
  const searchRow = f.rows - CONFIG.grid.stairsBottomRows;
  let best: number | undefined;
  let bestScore = Infinity;
  f.cells.forEach((c, i) => {
    if (!isMinable(f, i)) return;
    const { row } = toColRow(f, i);
    const depthPenalty = row < searchRow ? (searchRow - row) * 0.8 : 0;
    const score = tapsToBreak(c.hp, run.mods.power) + depthPenalty + rand() * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function simulate(runs: number, mods: RunModifiers) {
  let rs = 1;
  const rand = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const depths: number[] = [];
  const kept: number[] = [];
  for (let s = 1; s <= runs; s++) {
    let run = createRun(s * 2654435761, mods);
    while (run.status === 'playing') {
      const t = pickTarget(run, rand);
      if (t === undefined) break;
      run = tapCell(run, t).run;
    }
    const { summary } = endRun(run, 'exhausted');
    depths.push(summary.depth);
    kept.push(summary.gemsKept);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const hist: Record<number, number> = {};
  for (const d of depths) hist[d] = (hist[d] ?? 0) + 1;
  return { avgDepth: avg(depths), avgGemsKept: avg(kept), hist };
}

declare const process: { argv: string[] };
const runs = Number(process.argv[2] ?? 500);
console.log('Base stats:', simulate(runs, defaultModifiers()));
