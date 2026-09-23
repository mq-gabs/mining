import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { contentChanceForDepth, generateFloor } from './floor';
import { computeHints } from './hints';
import { availablePerks, PERK_IDS, rollPerkOffer } from './perks';
import { Rng } from './rng';
import { choosePerk, createRun, descend, tapCell } from './run';
import type { Content, PerkId, RunState } from './types';

/** All-dirt floor, no contents except stairs moved out of the way (bottom-right corner). */
function blankRun(perks: PerkId[] = []): RunState {
  const run = createRun(99);
  run.floor.cells.forEach((c, i) => {
    if (i === run.floor.entrance) return;
    c.block = 'dirt';
    c.hp = c.maxHp = 1;
    c.content = { kind: 'none' };
  });
  run.floor.cells[run.floor.cells.length - 1].content = { kind: 'stairs' };
  for (const p of perks) run.perks[p] = 1;
  return run;
}

const E = (run: RunState) => run.floor.entrance;
const below = (run: RunState) => E(run) + run.floor.cols;
const set = (run: RunState, idx: number, content: Content) => (run.floor.cells[idx].content = content);

describe('floor contents', () => {
  it('hazards only appear from their configured depth', () => {
    expect(contentChanceForDepth('gas', CONFIG.contents.gas.fromDepth - 1)).toBe(0);
    for (let s = 1; s < 100; s++) {
      const kinds = generateFloor(s, 1).cells.map((c) => c.content.kind);
      if (CONFIG.contents.gas.fromDepth > 1) expect(kinds).not.toContain('gas');
      if (CONFIG.contents.caveIn.fromDepth > 1) expect(kinds).not.toContain('caveIn');
    }
  });

  it('generates crystals, chests and hazards at depth', () => {
    const kinds = new Set<string>();
    for (let s = 1; s < 50; s++) generateFloor(s, 6).cells.forEach((c) => kinds.add(c.content.kind));
    for (const k of ['gem', 'crystal', 'chest', 'gas', 'caveIn', 'stairs', 'none']) expect(kinds).toContain(k);
  });
});

describe('pickups and hazards', () => {
  it('energy crystal restores energy, capped at max', () => {
    const run = blankRun();
    run.energy = 20;
    set(run, E(run) + 1, { kind: 'crystal' });
    const r = tapCell(run, E(run) + 1);
    expect(r.run.energy).toBe(20 - 1 + CONFIG.crystal.energy);
    expect(r.events).toContainEqual({ type: 'crystal', idx: E(run) + 1, energy: CONFIG.crystal.energy });

    const full = blankRun();
    set(full, E(full) + 1, { kind: 'crystal' });
    expect(tapCell(full, E(full) + 1).run.energy).toBe(full.mods.maxEnergy);
  });

  it('gas pocket drains energy unless wearing a gas mask', () => {
    const run = blankRun();
    set(run, below(run), { kind: 'gas' });
    expect(tapCell(run, below(run)).run.energy).toBe(run.energy - 1 - CONFIG.hazards.gasEnergyLoss);
    const masked = blankRun(['gasMask']);
    set(masked, below(masked), { kind: 'gas' });
    const r = tapCell(masked, below(masked));
    expect(r.run.energy).toBe(masked.energy - 1);
    expect(r.events).toContainEqual({ type: 'gas', idx: below(masked), energyLost: 0, masked: true });
  });

  it('gas can knock you out of energy', () => {
    const run = blankRun();
    run.energy = 3;
    set(run, below(run), { kind: 'gas' });
    const r = tapCell(run, below(run));
    expect(r.run.energy).toBe(0);
    expect(r.run.status).toBe('outOfEnergy');
  });

  it('cave-in refills up to 3 nearby open cells with dirt, sparing entrance and stairs', () => {
    const run = blankRun();
    // Open a 3-wide corridor under the entrance: cols 2..4, rows 1..2.
    for (const i of [below(run) - 1, below(run), below(run) + 1, below(run) + run.floor.cols]) {
      run.floor.cells[i].open = true;
      run.floor.cells[i].hp = 0;
    }
    const target = below(run) + run.floor.cols - 1; // row 2, col 2
    set(run, target, { kind: 'caveIn' });
    const { run: after, events } = tapCell(run, target);
    const ev = events.find((e) => e.type === 'caveIn');
    expect(ev?.type === 'caveIn' && ev.filled.length).toBe(3);
    if (ev?.type !== 'caveIn') return;
    for (const i of ev.filled) {
      expect(after.floor.cells[i]).toMatchObject({ open: false, block: 'dirt', hp: 1 });
      expect(i).not.toBe(after.floor.entrance);
    }
    expect(after.floor.cells[target].open).toBe(true);
  });

  it('chest gives gems scaled by depth and gem value', () => {
    const run = blankRun();
    run.depth = 5;
    run.mods.gemValueMult = 2;
    run.rngState = 1234;
    set(run, E(run) + 1, { kind: 'chest' });
    const r = tapCell(run, E(run) + 1);
    const chest = r.events.find((e) => e.type === 'chest');
    const offer = r.events.find((e) => e.type === 'perkOffer');
    expect(chest || offer).toBeTruthy();
    if (chest?.type === 'chest') {
      const c = CONFIG.chest;
      const extra = Math.floor(5 * c.gemsPerDepth);
      expect(chest.gems).toBeGreaterThanOrEqual((c.gemsMin + extra) * 2);
      expect(chest.gems).toBeLessThanOrEqual((c.gemsMax + extra) * 2);
      expect(r.run.gems).toBe(chest.gems);
    }
  });

  it('chests sometimes offer a perk instead', () => {
    let offers = 0;
    for (let s = 0; s < 200; s++) {
      const run = blankRun();
      run.rngState = s * 7919;
      set(run, E(run) + 1, { kind: 'chest' });
      const r = tapCell(run, E(run) + 1);
      if (r.run.status === 'choosingPerk') {
        offers++;
        expect(r.run.perkOffer?.source).toBe('chest');
      }
    }
    expect(offers / 200).toBeGreaterThan(CONFIG.chest.perkChance * 0.5);
    expect(offers / 200).toBeLessThan(CONFIG.chest.perkChance * 1.6);
  });
});

describe('hints', () => {
  it('exposed blocks next to a gem sparkle with its tier; next to hazards show dust', () => {
    const run = blankRun();
    const f = run.floor;
    const left = E(run) - 1;
    set(run, left - 1, { kind: 'gem', tier: 'amethyst' }); // not exposed, neighbour of `left`
    set(run, below(run) + f.cols, { kind: 'gas' }); // neighbour of `below`
    const hints = computeHints(f);
    expect(hints[left]).toMatchObject({ gemNear: 'amethyst', hazardNear: false });
    expect(hints[below(run)]).toMatchObject({ gemNear: undefined, hazardNear: true });
    expect(hints[left - 1]).toBeUndefined(); // not exposed yet
    expect(hints[E(run)]).toBeUndefined(); // open
  });

  it('reports the highest neighbouring tier and flags chests', () => {
    const run = blankRun();
    const right = E(run) + 1;
    set(run, right + 1, { kind: 'gem', tier: 'quartz' });
    set(run, right + run.floor.cols, { kind: 'gem', tier: 'ruby' });
    set(run, right, { kind: 'chest' });
    const h = computeHints(run.floor)[right];
    expect(h).toMatchObject({ gemNear: 'ruby', chest: true });
  });
});

describe('perks', () => {
  it('floor 3, 6, 9 offer 3 distinct perks and pause the run', () => {
    let run = blankRun();
    run.depth = 2;
    const r = descend(run);
    expect(r.run.depth).toBe(3);
    expect(r.run.status).toBe('choosingPerk');
    const choices = r.run.perkOffer!.choices;
    expect(new Set(choices).size).toBe(CONFIG.perks.offerCount);
    // Can't mine while choosing.
    expect(tapCell(r.run, r.run.floor.entrance + 1).run).toBe(r.run);
    run = choosePerk(r.run, choices[0]).run;
    expect(run.status).toBe('playing');
    expect(run.perks[choices[0]]).toBe(1);
    expect(descend({ ...run, depth: 3 }).run.status).toBe('playing'); // floor 4: no offer
  });

  it('rejects perks that were not offered', () => {
    const r = descend({ ...blankRun(), depth: 2 });
    const notOffered = PERK_IDS.find((p) => !r.run.perkOffer!.choices.includes(p))!;
    expect(choosePerk(r.run, notOffered).run).toBe(r.run);
  });

  it('non-stackable perks are not offered twice; stackable ones can be', () => {
    const owned = { luckyStrike: 1, sharpEdge: 2 } as const;
    const pool = availablePerks({ perks: owned });
    expect(pool).not.toContain('luckyStrike');
    expect(pool).toContain('sharpEdge');
    const rng = new Rng(5);
    for (let i = 0; i < 100; i++) expect(rollPerkOffer({ perks: owned }, rng)).not.toContain('luckyStrike');
  });

  it('stackable perks stop being offered at their stack cap', () => {
    const capped = { sharpEdge: CONFIG.perks.sharpEdge.maxStacks };
    expect(availablePerks({ perks: capped })).not.toContain('sharpEdge');
    const everything = Object.fromEntries(PERK_IDS.map((p) => [p, 99]));
    expect(availablePerks({ perks: everything })).toEqual([]);
    // With nothing left to offer, floors don't pause the run.
    const run = { ...blankRun(), depth: 2, perks: everything };
    expect(descend(run).run.status).toBe('playing');
  });

  it('runs always end: a bot with every perk and max upgrades still runs dry', () => {
    let run = createRun(4242, {
      maxEnergy: 200,
      power: 11,
      gemChanceBonus: 0.5,
      gemValueMult: 2,
      toolCharges: { dynamite: 6, drill: 6, scanner: 6 },
    });
    for (let steps = 0; run.status !== 'outOfEnergy' && steps < 20000; steps++) {
      if (run.status === 'choosingPerk') {
        const c = run.perkOffer!.choices;
        run = choosePerk(run, c.includes('secondWind') ? 'secondWind' : c[0]).run;
        continue;
      }
      const f = run.floor;
      const stairs = f.cells.findIndex((c) => c.open && c.content.kind === 'stairs');
      const hints = computeHints(f);
      run = tapCell(run, stairs >= 0 ? stairs : Math.max(...hints.map((h, i) => (h ? i : -1)))).run;
    }
    expect(run.status).toBe('outOfEnergy');
  });

  it('Sharp Edge, Second Wind and Greed apply immediately', () => {
    const take = (perk: PerkId, run = blankRun()) =>
      choosePerk({ ...run, status: 'choosingPerk', perkOffer: { source: 'floor', choices: [perk] } }, perk).run;
    expect(take('sharpEdge').mods.power).toBe(2);
    expect(take('sharpEdge', take('sharpEdge')).perks.sharpEdge).toBe(2);
    expect(take('secondWind', { ...blankRun(), energy: 10 }).energy).toBe(10 + CONFIG.perks.secondWind.energy);
    const greedy = take('greed');
    expect(greedy.mods.gemValueMult).toBeCloseTo(1 + CONFIG.perks.greed.gemValueBonus);
    expect(greedy.mods.maxEnergy).toBe(CONFIG.energy.start - CONFIG.perks.greed.maxEnergyPenalty);
    expect(greedy.energy).toBe(greedy.mods.maxEnergy);
  });

  it('Deep Breath restores energy on each new floor', () => {
    const run = { ...blankRun(['deepBreath']), energy: 10 };
    const r = descend(run);
    expect(r.run.energy).toBe(10 + CONFIG.perks.deepBreath.energy);
  });

  it('Tremor damages the orthogonal neighbours of a broken block', () => {
    const run = blankRun(['tremor']);
    const target = below(run);
    for (const n of [target - 1, target + 1, target + run.floor.cols]) {
      run.floor.cells[n] = { ...run.floor.cells[n], block: 'stone', hp: 3, maxHp: 3 };
    }
    const after = tapCell(run, target).run;
    expect(after.floor.cells[target - 1].hp).toBe(2);
    expect(after.floor.cells[target + 1].hp).toBe(2);
    expect(after.floor.cells[target + run.floor.cols].hp).toBe(2);
    expect(after.energy).toBe(run.energy - 1);
  });

  it('Efficient Swing sometimes makes taps free; Lucky Strike sometimes doubles gems', () => {
    let free = 0;
    let doubled = 0;
    for (let s = 0; s < 400; s++) {
      const run = { ...blankRun(['efficientSwing', 'luckyStrike']), rngState: s * 104729 };
      set(run, E(run) + 1, { kind: 'gem', tier: 'quartz' });
      const r = tapCell(run, E(run) + 1);
      if (r.run.energy === run.energy) free++;
      if (r.run.gems === 2) doubled++;
    }
    expect(free / 400).toBeCloseTo(CONFIG.perks.efficientSwing.chance, 1);
    expect(doubled / 400).toBeCloseTo(CONFIG.perks.luckyStrike.chance, 1);
  });

  it('choosing Second Wind at 0 energy (chest perk) resumes play; other perks end in outOfEnergy', () => {
    const run = { ...blankRun(), energy: 0, status: 'choosingPerk' as const };
    const withOffer = (p: PerkId) => ({ ...run, perkOffer: { source: 'chest' as const, choices: [p] } });
    expect(choosePerk(withOffer('secondWind'), 'secondWind').run.status).toBe('playing');
    expect(choosePerk(withOffer('gasMask'), 'gasMask').run.status).toBe('outOfEnergy');
  });
});
