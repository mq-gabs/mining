import { describe, expect, it } from 'vitest';
import { CONFIG, type BlockType } from '../config';
import { moodFor } from '../ui/music';
import { createRun, descend, hasRush, tapCell as tap, tickRun, useTool } from './run';
import type { Content, RunEvent, RunState } from './types';

const R = CONFIG.rush;
const RUSH_MS = R.durationSec * 1000;

/** All-dirt floor (1 HP), no contents except stairs in the bottom-right corner. */
function blankRun(): RunState {
  const run = createRun(7);
  run.floor.cells.forEach((c, i) => {
    if (i === run.floor.entrance) return;
    c.open = false;
    c.block = 'dirt';
    c.hp = c.maxHp = 1;
    c.content = { kind: 'none' };
  });
  run.floor.cells[run.floor.cells.length - 1].content = { kind: 'stairs' };
  return run;
}

const E = (run: RunState) => run.floor.entrance;
const below = (run: RunState) => E(run) + run.floor.cols;
const set = (run: RunState, idx: number, block: BlockType, hp = 1, content: Content = { kind: 'none' }) =>
  Object.assign(run.floor.cells[idx], { block, hp, maxHp: hp, content });
const rushing = (run: RunState, msLeft = RUSH_MS): RunState => ({ ...run, rush: { msLeft, blocks: 0, gems: 0 } });
const types = (events: RunEvent[]) => events.map((e) => e.type);

/** Taps `idx` after putting `content` in it (on a copy of the run). */
function tapCell(run: RunState, idx: number, content?: Content) {
  if (!content) return tap(run, idx);
  const copy = structuredClone(run);
  copy.floor.cells[idx].content = content;
  return tap(copy, idx);
}

describe('momentum meter', () => {
  it('fills per block type, only when a block breaks', () => {
    for (const block of ['dirt', 'stone', 'hard', 'obsidian'] as BlockType[]) {
      const run = blankRun();
      set(run, below(run), block, 1);
      const r = tapCell(run, below(run));
      expect(r.run.momentum).toBeCloseTo(R.fill[block]);
      expect(r.events).toContainEqual({ type: 'momentum', idx: below(run), level: r.run.momentum });
    }
    const run = blankRun();
    set(run, below(run), 'stone', 3);
    expect(tapCell(run, below(run)).run.momentum).toBe(0);
  });

  it('tools add nothing', () => {
    const run = blankRun();
    const r = useTool(run, 'dynamite', below(run));
    expect(r.run.floor.cells[below(run)].open).toBe(true);
    expect(r.run.momentum).toBe(0);
  });

  it('Tremor breaks count', () => {
    const run = blankRun();
    run.perks.tremor = 1;
    const r = tapCell(run, below(run));
    const breaks = r.events.filter((e) => e.type === 'break').length;
    expect(breaks).toBeGreaterThan(1);
    expect(r.run.momentum).toBeCloseTo(breaks * R.fill.dirt);
  });

  it('drains with tickRun down to 0, and a no-op tick returns the same object', () => {
    const run = { ...blankRun(), momentum: 0.5 };
    expect(tickRun(run, 1000).run.momentum).toBeCloseTo(0.5 - R.drainPerSec);
    expect(tickRun(run, 60_000).run.momentum).toBe(0);
    const empty = blankRun();
    expect(tickRun(empty, 1000).run).toBe(empty);
    expect(tickRun(run, 0).run).toBe(run);
    expect(tickRun({ ...run, status: 'choosingPerk' }, 1000).run.momentum).toBe(0.5);
  });

  it('filling the meter starts a Rush and resets momentum', () => {
    const run = { ...blankRun(), momentum: 1 - R.fill.dirt / 2 };
    const r = tapCell(run, below(run));
    expect(hasRush(r.run)).toBe(true);
    expect(r.run.rush).toEqual({ msLeft: RUSH_MS, blocks: 0, gems: 0 });
    expect(r.run.momentum).toBe(0);
    expect(r.events).toContainEqual({ type: 'rushStart', idx: below(run) });
    expect(types(r.events)).not.toContain('momentum');
  });
});

describe('rush', () => {
  it('makes taps free and multiplies pickaxe power', () => {
    const run = rushing(blankRun());
    set(run, below(run), 'hard', run.mods.power * R.powerMult);
    const r = tapCell(run, below(run));
    expect(r.run.energy).toBe(run.energy);
    expect(r.run.floor.cells[below(run)].open).toBe(true);
    expect(r.events).toContainEqual({ type: 'break', idx: below(run), block: 'hard', combo: 1 });
  });

  it('can mine any block, not only ones next to an open cell', () => {
    const run = blankRun();
    const far = run.floor.cells.length - 2;
    expect(tapCell(run, far).run).toBe(run);
    const r = tapCell(rushing(run), far);
    expect(r.run.floor.cells[far].open).toBe(true);
    expect(tapCell(rushing(run), E(run)).run.floor).toEqual(run.floor);
  });

  it('does not fill the meter', () => {
    const run = rushing(blankRun());
    expect(tapCell(run, below(run)).run.momentum).toBe(0);
  });

  it('only collects gems: crystals, gas and cave-ins do nothing and are lost', () => {
    const run = rushing({ ...blankRun(), energy: 20 });
    // Cave-in candidates: an open neighbour it could refill.
    run.floor.cells[below(run) + 1].open = true;
    for (const content of [{ kind: 'crystal' }, { kind: 'gas' }, { kind: 'caveIn' }] as Content[]) {
      const r = tapCell(structuredClone(run), below(run), content);
      expect(r.run.energy).toBe(20);
      expect(r.run.floor.cells[below(run)].content).toEqual({ kind: 'none' });
      expect(r.run.floor.cells[below(run) + 1].open).toBe(true);
      expect(types(r.events)).toEqual(['hit', 'break']);
    }
  });

  it('chests pay gems but never offer a perk', () => {
    let offers = 0;
    for (let seed = 0; seed < 60; seed++) {
      const run = rushing({ ...blankRun(), rngState: seed });
      const r = tapCell(run, below(run), { kind: 'chest' });
      expect(r.run.status).toBe('playing');
      expect(r.run.gems).toBeGreaterThan(0);
      expect(r.run.rush?.gems).toBe(r.run.gems);
      if (r.events.some((e) => e.type === 'perkOffer')) offers++;
    }
    expect(offers).toBe(0);
  });

  it('ignores perks: Sharp Edge, Tremor, Lucky Strike and Greed', () => {
    const run = rushing(blankRun());
    run.perks = { sharpEdge: 1, tremor: 1, luckyStrike: 1, greed: 1 };
    run.mods.power += CONFIG.perks.sharpEdge.power;
    run.mods.gemValueMult += CONFIG.perks.greed.gemValueBonus;
    set(run, below(run), 'hard', R.powerMult + 1);
    const hit = tapCell(run, below(run));
    expect(hit.run.floor.cells[below(run)].open).toBe(false);
    expect(types(hit.events)).toEqual(['hit']);

    for (let seed = 0; seed < 40; seed++) {
      const r = tapCell({ ...run, rngState: seed }, E(run) + 1, { kind: 'gem', tier: 'amethyst' });
      expect(r.run.gems).toBe(CONFIG.gems.tiers.amethyst.value);
      expect(types(r.events)).toEqual(['hit', 'break', 'gem']);
    }
  });

  it('skips Deep Breath and holds a floor perk offer until the Rush ends', () => {
    const run = rushing({ ...blankRun(), energy: 10, depth: CONFIG.perks.offerEveryFloors - 1 });
    run.perks.deepBreath = 1;
    const down = descend(run);
    expect(down.run.energy).toBe(10);
    expect(down.run.status).toBe('playing');
    expect(types(down.events)).not.toContain('perkOffer');

    const end = tickRun(down.run, RUSH_MS);
    expect(end.run.status).toBe('choosingPerk');
    expect(types(end.events)).toEqual(['rushEnd', 'perkOffer']);
  });

  it('survives going down the stairs, and so does the meter', () => {
    const r = descend(rushing(blankRun(), 1234)).run;
    expect(r.depth).toBe(2);
    expect(r.rush?.msLeft).toBe(1234);
    expect(descend({ ...blankRun(), momentum: 0.4 }).run.momentum).toBe(0.4);
  });

  it('ends after durationSec of ticks with its blocks and gems', () => {
    let run = rushing(blankRun());
    set(run, below(run), 'dirt', 1, { kind: 'gem', tier: 'quartz' });
    set(run, E(run) + 1, 'dirt', 1, { kind: 'chest' });
    run = tapCell(run, below(run)).run;
    run = tapCell(run, E(run) + 1).run;
    const gems = run.gems;
    expect(run.rush).toMatchObject({ blocks: 2, gems });

    let events: RunEvent[] = [];
    for (let t = 0; t < RUSH_MS; t += 100) {
      const r = tickRun(run, 100);
      run = r.run;
      events = events.concat(r.events);
    }
    expect(run.rush).toBeUndefined();
    expect(run.momentum).toBe(0);
    expect(events).toEqual([{ type: 'rushEnd', blocks: 2, gems, energy: 0 }]);
    expect(tickRun(run, 100).run).toBe(run);
  });

  it('energy 0 during a Rush does not end the run, but the run ends right after it', () => {
    // The tap that empties energy also fills the meter.
    let run = { ...blankRun(), energy: 1, momentum: 1 - R.fill.dirt / 2 };
    run = tapCell(run, below(run)).run;
    expect(run.energy).toBe(0);
    expect(run.status).toBe('playing');
    expect(hasRush(run)).toBe(true);

    const more = tapCell(run, below(run) + run.floor.cols);
    expect(more.run.floor.cells[below(run) + run.floor.cols].open).toBe(true);
    run = more.run;

    const end = tickRun(run, RUSH_MS);
    expect(end.run.status).toBe('outOfEnergy');
    expect(types(end.events)).toEqual(['rushEnd', 'outOfEnergy']);
  });

  it('the rush mood overrides depth and low energy', () => {
    const rush = moodFor({ scene: 'run', depth: 1, lowEnergy: false, rush: true });
    expect(moodFor({ scene: 'run', depth: 23, lowEnergy: true, rush: true })).toEqual(rush);
    expect(rush.rush).toBe(true);
    expect(rush.bpm).toBe(CONFIG.music.rush.bpm);
    expect(rush.arpChance).toBe(1);
    expect(rush.heartbeat).toBe(false);
    expect(moodFor({ scene: 'run', depth: 1, lowEnergy: false, rush: false }).rush).toBe(false);
  });
});
