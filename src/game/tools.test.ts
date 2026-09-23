import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { gasEnergyLoss } from './economy';
import {
  buyUpgrade,
  canBuyUpgrade,
  modifiersFromProfile,
  newProfile,
  parseProfile,
  type Profile,
} from './progression';
import { createRun, tapCell, useTool } from './run';
import type { Content, RunState } from './types';

/** All-dirt floor with no contents; stairs in the bottom-right corner; every tool has 1 charge. */
function blankRun(): RunState {
  const run = createRun(7, { ...createRun(7).mods, toolCharges: { dynamite: 1, drill: 1, scanner: 1 } });
  run.floor.cells.forEach((c, i) => {
    if (i === run.floor.entrance) return;
    c.block = 'stone';
    c.hp = c.maxHp = 3;
    c.content = { kind: 'none' };
  });
  run.floor.cells[run.floor.cells.length - 1].content = { kind: 'stairs' };
  return run;
}

const cols = CONFIG.grid.cols;
const E = (run: RunState) => run.floor.entrance;
const below = (run: RunState) => E(run) + cols;
const set = (run: RunState, idx: number, content: Content) => (run.floor.cells[idx].content = content);
const openCells = (run: RunState) => run.floor.cells.flatMap((c, i) => (c.open ? [i] : []));

describe('dynamite', () => {
  it('breaks a 3×3 area for free and uses a charge', () => {
    const run = blankRun();
    const center = below(run);
    const r = useTool(run, 'dynamite', center);
    const expected = [center - cols - 1, center - cols, center - cols + 1, center - 1, center, center + 1,
      center + cols - 1, center + cols, center + cols + 1];
    expect(openCells(r.run).sort((a, b) => a - b)).toEqual(expected);
    expect(r.run.energy).toBe(run.energy);
    expect(r.run.tools.dynamite).toBe(0);
    expect(r.events[0]).toEqual({ type: 'tool', tool: 'dynamite', idx: center, cells: expected.filter((i) => i !== E(run)) });
  });

  it('does not release gas, but collects gems', () => {
    const run = blankRun();
    set(run, below(run), { kind: 'gas' });
    set(run, below(run) + 1, { kind: 'gem', tier: 'quartz' });
    const r = useTool(run, 'dynamite', below(run));
    expect(r.run.energy).toBe(run.energy);
    expect(r.events.some((e) => e.type === 'gas')).toBe(false);
    expect(r.run.gems).toBe(1);
  });

  it('is a no-op without charges or out of reach', () => {
    const run = blankRun();
    const empty = { ...run, tools: { ...run.tools, dynamite: 0 } };
    expect(useTool(empty, 'dynamite', below(run)).run).toBe(empty);
    expect(useTool(run, 'dynamite', run.floor.cells.length - 1).run).toBe(run);
  });

  it('two chests in one blast still give a single perk offer', () => {
    const run = { ...blankRun(), rngState: 1 };
    // Force every chest roll into a perk offer.
    const all = run.floor.cells.map((_, i) => i);
    for (const i of all.slice(1, 12)) if (i !== E(run)) set(run, i, { kind: 'chest' });
    let perkOffers = 0;
    for (let s = 0; s < 50; s++) {
      const r = useTool({ ...run, rngState: s * 7919 }, 'dynamite', below(run));
      const offers = r.events.filter((e) => e.type === 'perkOffer').length;
      expect(offers).toBeLessThanOrEqual(1);
      perkOffers += offers;
    }
    expect(perkOffers).toBeGreaterThan(0);
  });
});

describe('drill', () => {
  it('breaks the whole row and does release gas', () => {
    const run = blankRun();
    const row = below(run) - (below(run) % cols);
    set(run, row, { kind: 'gas' });
    const r = useTool(run, 'drill', below(run));
    for (let c = 0; c < cols; c++) expect(r.run.floor.cells[row + c].open).toBe(true);
    expect(r.run.floor.cells[row + cols].open).toBe(false);
    expect(r.run.energy).toBe(run.energy - gasEnergyLoss(run.depth));
    expect(r.run.tools.drill).toBe(0);
  });

  it('can reveal stairs, which then work as usual', () => {
    const run = blankRun();
    // Open a shaft down the last column so the bottom row is reachable.
    const last = run.floor.cells.length - 1;
    for (let i = cols - 1; i < last; i += cols) run.floor.cells[i].open = true;
    const r = useTool(run, 'drill', last - 2);
    // Out of reach: last - 2 has no open neighbour. The stairs cell itself is reachable from the shaft.
    expect(r.run).toBe(run);
    const d = useTool(run, 'drill', last);
    expect(d.events).toContainEqual({ type: 'stairsRevealed', idx: last });
    expect(tapCell(d.run, last).run.depth).toBe(2);
  });
});

describe('scanner', () => {
  it('reveals a 3×3 area without breaking or costing energy', () => {
    const run = blankRun();
    const target = below(run);
    const r = useTool(run, 'scanner', target);
    expect(openCells(r.run)).toEqual([E(run)]);
    expect(r.run.floor.cells[target].scanned).toBe(true);
    expect(r.run.floor.cells[target + cols + 1].scanned).toBe(true);
    expect(r.run.floor.cells[target + 2 * cols].scanned).toBeFalsy();
    expect(r.run.energy).toBe(run.energy);
    expect(r.run.tools.scanner).toBe(0);
  });

  it('does not waste a charge on an area that is already known', () => {
    const run = { ...blankRun(), tools: { dynamite: 1, drill: 1, scanner: 2 } };
    const once = useTool(run, 'scanner', below(run)).run;
    expect(useTool(once, 'scanner', below(run)).run).toBe(once);
  });
});

describe('tool upgrades', () => {
  const rich = (): Profile => ({ ...newProfile(), gems: 1e6 });

  it('dynamite starts unlocked with 1 charge; drill and scanner start locked', () => {
    expect(modifiersFromProfile(newProfile()).toolCharges).toEqual({ dynamite: 1, drill: 0, scanner: 0 });
    expect(createRun(1, modifiersFromProfile(newProfile())).tools).toEqual({ dynamite: 1, drill: 0, scanner: 0 });
  });

  it('charge upgrades need the tool unlocked first', () => {
    let p = rich();
    expect(canBuyUpgrade(p, 'drill')).toBe(false);
    expect(buyUpgrade(p, 'drill')).toBe(p);
    p = buyUpgrade(p, 'drillUnlock');
    expect(p.gems).toBe(1e6 - CONFIG.upgrades.items.drillUnlock.baseCost);
    expect(modifiersFromProfile(p).toolCharges.drill).toBe(CONFIG.tools.drill.baseCharges);
    expect(canBuyUpgrade(p, 'drillUnlock')).toBe(false);
    p = buyUpgrade(buyUpgrade(p, 'drill'), 'dynamite');
    expect(modifiersFromProfile(p).toolCharges).toEqual({ dynamite: 2, drill: 2, scanner: 0 });
  });

  it('loads v1 saves with tool upgrades at 0 and drops charges for locked tools', () => {
    const v1 = parseProfile({ version: 1, gems: 10, upgrades: { power: 2 } });
    expect(v1.upgrades).toMatchObject({ power: 2, dynamite: 0, drillUnlock: 0, drill: 0 });
    expect(parseProfile({ upgrades: { scanner: 3 } }).upgrades.scanner).toBe(0);
    expect(parseProfile({ upgrades: { scannerUnlock: 1, scanner: 3 } }).upgrades.scanner).toBe(3);
  });
});
