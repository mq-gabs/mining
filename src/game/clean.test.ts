import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { bonusForDepth, cleanMultiplier, clearEnergyForDepth, gemsKept } from './economy';
import { doubleRunGems, newProfile } from './progression';
import { createRun, descend, endRun, runMultiplier, tapCell, tickRun, useTool } from './run';
import type { Content, RunEvent, RunState } from './types';

const C = CONFIG.cleanBonus;

/** A run whose floor is all open except `closed` (1 HP dirt with no content unless given). */
function almostClean(closed: number[], contents: Record<number, Content> = {}): RunState {
  const run = createRun(11);
  run.floor.cells.forEach((c, i) => {
    c.open = !closed.includes(i);
    c.block = 'dirt';
    c.hp = c.maxHp = c.open ? 0 : 1;
    c.content = contents[i] ?? { kind: 'none' };
  });
  return run;
}

const E = (run: RunState) => run.floor.entrance;
const cleared = (events: RunEvent[]) => events.filter((e) => e.type === 'floorCleared');

describe('clean floors', () => {
  it('counts a floor once, when its last block breaks', () => {
    const base = createRun(11);
    const a = E(base) + base.floor.cols;
    const b = a + base.floor.cols;
    let run = { ...almostClean([a, b]), energy: 10 };
    const first = tapCell(run, a);
    expect(cleared(first.events)).toEqual([]);
    run = first.run;
    const last = tapCell(run, b);
    expect(cleared(last.events)).toEqual([
      {
        type: 'floorCleared',
        depth: 1,
        bonus: bonusForDepth(1),
        multiplier: 1 + bonusForDepth(1),
        energy: clearEnergyForDepth(1),
        energyPending: 0,
      },
    ]);
    expect(last.run.energy).toBe(10 - 2 * CONFIG.energy.tapCost + clearEnergyForDepth(1));
    expect(last.run.cleanFloors).toBe(1);
    expect(last.run.floor.cleared).toBe(true);
    expect(runMultiplier(last.run)).toBeCloseTo(1 + C.perFloorBase);
  });

  it('a cave-in on the last block means the floor is not clean until the refill breaks', () => {
    const base = createRun(11);
    const a = E(base) + base.floor.cols;
    let run = almostClean([a], { [a]: { kind: 'caveIn' } });
    const r = tapCell(run, a);
    const cave = r.events.find((e) => e.type === 'caveIn');
    expect(cave && cave.type === 'caveIn' && cave.filled.length).toBeGreaterThan(0);
    expect(cleared(r.events)).toEqual([]);
    run = r.run;
    const refilled = cave!.type === 'caveIn' ? cave!.filled : [];
    for (const n of refilled) run = tapCell(run, n).run;
    expect(run.cleanFloors).toBe(1);
  });

  it('counts breaks from tools and during a Rush', () => {
    const base = createRun(11);
    const a = E(base) + base.floor.cols;
    const byTool = useTool(almostClean([a, a + 1]), 'dynamite', a);
    expect(cleared(byTool.events)).toHaveLength(1);

    const far = base.floor.cells.length - 1;
    const rushing = { ...almostClean([far]), rush: { msLeft: 1000, blocks: 0, gems: 0 } };
    expect(cleared(tapCell(rushing, far).events)).toHaveLength(1);
  });

  it('going down early does not count; cleaning then leaving does', () => {
    const early = descend(createRun(11)).run;
    expect(early.cleanFloors).toBe(0);
    expect(early.floor.cleared).toBeUndefined();

    const base = createRun(11);
    const run = tapCell({ ...almostClean([E(base) + base.floor.cols]), gems: 40 }, E(base) + base.floor.cols).run;
    const { summary } = endRun(run, 'left');
    expect(summary.cleanFloors).toBe(1);
    expect(summary.multiplier).toBeCloseTo(1 + C.perFloorBase);
    expect(summary.gemsKept).toBe(Math.round(40 * summary.multiplier));
    expect(summary.bonusGems).toBe(summary.gemsKept - 40);
  });
});

describe('clear energy refund', () => {
  const base = createRun(11);
  const a = E(base) + base.floor.cols;

  it('grows with depth and is capped at max energy', () => {
    expect(clearEnergyForDepth(10)).toBeGreaterThan(clearEnergyForDepth(1));
    // Always less than a floor's blocks (each costs at least one tap), so cleaning can't pay for itself.
    expect(clearEnergyForDepth(10_000)).toBe(C.energyMax);
    expect(C.energyMax).toBeLessThan(CONFIG.grid.cols * CONFIG.grid.rows - 1);
    const full = tapCell(almostClean([a]), a).run;
    expect(full.energy).toBe(full.mods.maxEnergy);
  });

  it('is held during a Rush and granted when it ends, which can save a run at 0 energy', () => {
    const run = { ...almostClean([a]), energy: 0, rush: { msLeft: 1000, blocks: 0, gems: 0 } };
    const r = tapCell(run, a);
    expect(r.run.energy).toBe(0);
    expect(cleared(r.events)[0]).toMatchObject({ energy: 0, energyPending: clearEnergyForDepth(1) });

    const end = tickRun(r.run, 1000);
    expect(end.run.energy).toBe(clearEnergyForDepth(1));
    expect(end.run.status).toBe('playing');
    expect(end.events).toContainEqual(expect.objectContaining({ type: 'rushEnd', energy: clearEnergyForDepth(1) }));
  });
});

describe('clean multiplier', () => {
  it('deeper floors are worth more', () => {
    expect(bonusForDepth(1)).toBeCloseTo(C.perFloorBase);
    expect(bonusForDepth(5)).toBeCloseTo(C.perFloorBase + 4 * C.perDepth);
    expect(bonusForDepth(10)).toBeGreaterThan(bonusForDepth(3));
  });

  it('sums bonuses and never goes above the cap', () => {
    expect(cleanMultiplier(0)).toBe(1);
    expect(cleanMultiplier(0.12)).toBeCloseTo(1.12);
    expect(cleanMultiplier(5)).toBe(C.maxMult);
  });

  it('applies before the exhausted penalty, and the ad doubles the result', () => {
    expect(gemsKept(37, 'left', 1.12)).toBe(41); // round(41.44)
    expect(gemsKept(37, 'exhausted', 1.12)).toBe(Math.floor(41 * CONFIG.run.exhaustedKeepRatio));
    expect(gemsKept(37, 'exhausted')).toBe(Math.floor(37 * CONFIG.run.exhaustedKeepRatio));

    const run = { ...createRun(11), gems: 37, cleanBonus: 0.12, cleanFloors: 2 };
    const { summary } = endRun(run, 'exhausted');
    expect(summary.bonusGems).toBe(summary.gemsKept - gemsKept(37, 'exhausted'));
    const doubled = doubleRunGems(newProfile(), summary).summary;
    expect(doubled.gemsKept).toBe(summary.gemsKept * CONFIG.ads.gemMultiplier);
  });
});
