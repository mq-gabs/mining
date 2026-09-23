import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { energyAfterTap, gemsKept, gemValue, tapsToBreak } from './economy';
import { addEnergy, createRun, defaultModifiers, endRun, tapCell } from './run';
import type { RunState } from './types';

/** A run whose floor is all empty dirt (plus stairs) except the cells we set, for predictable tests. */
function testRun(overrides: Partial<RunState['mods']> = {}): RunState {
  const run = createRun(123, { ...defaultModifiers(), ...overrides });
  for (const c of run.floor.cells) {
    if (c.open) continue;
    c.block = 'dirt';
    c.hp = c.maxHp = 1;
    if (c.content.kind !== 'stairs') c.content = { kind: 'none' };
  }
  return run;
}

describe('economy', () => {
  it('gem values apply multipliers and round', () => {
    expect(gemValue('quartz')).toBe(1);
    expect(gemValue('amethyst', 1.5)).toBe(8); // 7.5 -> 8
    expect(gemValue('quartz', 0.1)).toBe(1); // never below 1
    expect(gemValue('diamond', 1.1)).toBe(220);
  });

  it('keeps all gems when leaving, half (floored) when exhausted', () => {
    expect(gemsKept(37, 'left')).toBe(37);
    expect(gemsKept(37, 'exhausted')).toBe(Math.floor(37 * CONFIG.run.exhaustedKeepRatio));
  });

  it('energy never goes negative', () => {
    expect(energyAfterTap(5)).toBe(5 - CONFIG.energy.tapCost);
    expect(energyAfterTap(0)).toBe(0);
  });

  it('taps to break scale with power', () => {
    expect(tapsToBreak(12, 1)).toBe(12);
    expect(tapsToBreak(12, 5)).toBe(3);
    expect(tapsToBreak(1, 3)).toBe(1);
  });
});

describe('tapCell', () => {
  it('costs 1 energy per tap even when the block does not break', () => {
    const run = testRun();
    const idx = run.floor.entrance + run.floor.cols;
    run.floor.cells[idx] = { ...run.floor.cells[idx], block: 'stone', hp: 3, maxHp: 3 };
    const { run: after, events } = tapCell(run, idx);
    expect(after.energy).toBe(run.energy - 1);
    expect(after.floor.cells[idx].hp).toBe(2);
    expect(after.floor.cells[idx].open).toBe(false);
    expect(events.map((e) => e.type)).toEqual(['hit']);
    expect(run.floor.cells[idx].hp).toBe(3); // input state untouched
  });

  it('deals damage equal to pickaxe power', () => {
    const run = testRun({ power: 2 });
    const idx = run.floor.entrance + run.floor.cols;
    run.floor.cells[idx] = { ...run.floor.cells[idx], block: 'hard', hp: 6, maxHp: 6 };
    let r = run;
    for (let i = 0; i < 3; i++) r = tapCell(r, idx).run;
    expect(r.floor.cells[idx].open).toBe(true);
    expect(r.energy).toBe(run.energy - 3);
  });

  it('ignores blocks not adjacent to an open cell', () => {
    const run = testRun();
    const far = run.floor.cells.length - 1;
    const res = tapCell(run, far);
    expect(res.run).toBe(run);
    expect(res.events).toEqual([]);
  });

  it('collects gems with the value multiplier', () => {
    const run = testRun({ gemValueMult: 2 });
    const idx = run.floor.entrance + 1;
    run.floor.cells[idx].content = { kind: 'gem', tier: 'amethyst' };
    const { run: after, events } = tapCell(run, idx);
    expect(after.gems).toBe(10);
    expect(after.floor.cells[idx].content.kind).toBe('none');
    expect(events).toContainEqual({ type: 'gem', idx, tier: 'amethyst', value: 10, doubled: false });
  });

  it('reveals stairs, and tapping them descends to a new floor for free', () => {
    const run = testRun();
    const idx = run.floor.entrance + 1;
    for (const c of run.floor.cells) if (c.content.kind === 'stairs') c.content = { kind: 'none' };
    run.floor.cells[idx].content = { kind: 'stairs' };
    const revealed = tapCell(run, idx);
    expect(revealed.events).toContainEqual({ type: 'stairsRevealed', idx });
    const down = tapCell(revealed.run, idx);
    expect(down.run.depth).toBe(2);
    expect(down.run.energy).toBe(revealed.run.energy);
    expect(down.run.floor.depth).toBe(2);
  });

  it('runs out of energy and can be revived with extra energy', () => {
    const run = testRun();
    run.energy = 1;
    const { run: dry, events } = tapCell(run, run.floor.entrance + 1);
    expect(dry.status).toBe('outOfEnergy');
    expect(events.at(-1)).toEqual({ type: 'outOfEnergy' });
    expect(tapCell(dry, dry.floor.entrance - 1).run).toBe(dry); // no more taps
    const revived = addEnergy(dry, 20);
    expect(revived.status).toBe('playing');
    expect(revived.energy).toBe(20);
  });

  it('endRun reports kept gems by reason', () => {
    const run = { ...testRun(), gems: 21, depth: 4 };
    expect(endRun(run, 'left').summary).toMatchObject({ depth: 4, gemsFound: 21, gemsKept: 21 });
    expect(endRun(run, 'exhausted').summary).toMatchObject({ gemsFound: 21, gemsKept: 10 });
  });
});
