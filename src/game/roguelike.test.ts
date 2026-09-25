import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { gasEnergyLoss } from './economy';
import { contentChanceForDepth, generateFloor } from './floor';
import { computeHints } from './hints';
import { availablePerks, PERK_IDS, rollPerkOffer } from './perks';
import { Rng } from './rng';
import { choosePerk, createRun, descend, endRun, grantAdEnergy, tapCell, tickRun, useTool } from './run';
import type { Content, PerkId, RunEvent, RunState } from './types';

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

/** Breaks the (1 HP) block at `idx`, then taps again to pick up what it revealed. */
function breakAndCollect(run: RunState, idx: number) {
  return tapCell(tapCell(run, idx).run, idx);
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
      if (CONFIG.contents.hole.fromDepth > 1) expect(kinds).not.toContain('hole');
    }
  });

  it('generates crystals, chests and hazards at depth', () => {
    const kinds = new Set<string>();
    for (let s = 1; s < 50; s++) generateFloor(s, 6).cells.forEach((c) => kinds.add(c.content.kind));
    for (const k of ['gem', 'crystal', 'chest', 'gas', 'caveIn', 'hole', 'stairs', 'none']) expect(kinds).toContain(k);
  });
});

describe('the Legendary Diamond (goal)', () => {
  /** A blank run on the goal floor with the diamond right below the entrance. */
  const goalRun = () => {
    const run = { ...blankRun(), depth: CONFIG.goal.depth, gems: 40, energy: 20 };
    set(run, below(run), { kind: 'legendary' });
    return run;
  };

  it('breaking it reveals it; picking it up (free) wins the run', () => {
    const run = goalRun();
    const broken = tapCell(run, below(run));
    expect(broken.events).toContainEqual({ type: 'itemRevealed', idx: below(run), content: { kind: 'legendary' } });
    expect(broken.run.status).toBe('playing');
    const won = tapCell(broken.run, below(run));
    expect(won.events).toContainEqual({ type: 'legendary', idx: below(run) });
    expect(won.run.status).toBe('won');
    expect(won.run.energy).toBe(broken.run.energy);
    // Nothing else can happen once won, and the gems are all kept.
    expect(tapCell(won.run, E(run) + 1).run).toBe(won.run);
    expect(tickRun({ ...won.run, momentum: 0.5 }, 100).events).toEqual([]);
    expect(endRun(won.run, 'won').summary).toMatchObject({ reason: 'won', gemsKept: 40, depth: CONFIG.goal.depth });
  });

  it("doesn't run dry while the revealed diamond lies on the floor", () => {
    const run = { ...goalRun(), energy: 1 };
    const broken = tapCell(run, below(run));
    expect(broken.run.energy).toBe(0);
    expect(broken.run.status).toBe('playing');
    expect(tapCell(broken.run, below(run)).run.status).toBe('won');
    // Without the diamond, the last energy runs the run dry as usual.
    const plain = { ...blankRun(), energy: 1 };
    expect(tapCell(plain, below(plain)).run.status).toBe('outOfEnergy');
  });

  it('a cave-in never covers the revealed diamond', () => {
    const run = goalRun();
    const revealed = tapCell(run, below(run)).run;
    const next = below(run) + run.floor.cols;
    set(revealed, next, { kind: 'caveIn' });
    const r = tapCell(revealed, next);
    expect(r.run.floor.cells[below(run)]).toMatchObject({ open: true, content: { kind: 'legendary' } });
  });
});

describe('holes', () => {
  const holeRun = (gems: number) => {
    const run = { ...blankRun(), depth: 2, gems, energy: 20 };
    set(run, E(run) + 1, { kind: 'hole' });
    return run;
  };
  const lost = (events: RunEvent[]) => events.filter((e) => e.type === 'hole').map((e) => e.type === 'hole' && e.gemsLost);

  it('breaking a hole takes 10% of the gems carried (rounded); it stays and each tap takes 10% again, free', () => {
    const broken = tapCell(holeRun(37), E(holeRun(37)) + 1);
    expect(broken.run.gems).toBe(33);
    expect(lost(broken.events)).toEqual([4]);
    const idx = E(broken.run) + 1;
    expect(broken.run.floor.cells[idx]).toMatchObject({ open: true, content: { kind: 'hole' } });
    const again = tapCell(broken.run, idx);
    expect(again.run.gems).toBe(30);
    expect(lost(again.events)).toEqual([3]);
    expect(again.run.energy).toBe(broken.run.energy);
    expect(again.run.floor.cells[idx].content.kind).toBe('hole');
  });

  it('takes at least 1 gem while any are carried, and nothing with none', () => {
    for (const [gems, loss] of [[0, 0], [1, 1], [4, 1], [14, 1], [15, 2]]) {
      const r = tapCell(holeRun(gems), E(holeRun(gems)) + 1);
      expect(r.run.gems).toBe(gems - loss);
      expect(lost(r.events)).toEqual([loss]);
    }
  });

  it('does nothing during a Rush: a hole broken in a Rush is lost, and tapping one is a no-op', () => {
    const rush = { msLeft: 5000, blocks: 0, gems: 0 };
    const run = { ...holeRun(50), rush };
    const r = tapCell(run, E(run) + 1);
    expect(r.run.gems).toBe(50);
    expect(r.run.floor.cells[E(run) + 1].content.kind).toBe('none');
    const holed = { ...tapCell(holeRun(50), E(run) + 1).run, rush };
    expect(tapCell(holed, E(run) + 1).run).toBe(holed);
  });

  it('tools only reveal a hole; a later tap takes gems', () => {
    const run = holeRun(50);
    run.tools.dynamite = 1;
    const blast = useTool(run, 'dynamite', E(run) + 1);
    expect(blast.run.gems).toBe(50);
    expect(lost(blast.events)).toEqual([]);
    expect(blast.run.floor.cells[E(run) + 1]).toMatchObject({ open: true, content: { kind: 'hole' } });
    expect(tapCell(blast.run, E(run) + 1).run.gems).toBe(45);
  });

  it('blocks next to a hole show the hazard hint', () => {
    const run = holeRun(0);
    set(run, below(run) + 1, { kind: 'hole' });
    expect(computeHints(run.floor)[below(run)]?.hazardNear).toBe(true);
  });
});

describe('pickups and hazards', () => {
  it('energy crystal restores energy, capped at max', () => {
    const run = blankRun();
    run.energy = 20;
    set(run, E(run) + 1, { kind: 'crystal' });
    const r = breakAndCollect(run, E(run) + 1);
    expect(r.run.energy).toBe(20 - 1 + CONFIG.crystal.energy);
    expect(r.events).toContainEqual({ type: 'crystal', idx: E(run) + 1, energy: CONFIG.crystal.energy });

    const full = blankRun();
    set(full, E(full) + 1, { kind: 'crystal' });
    expect(breakAndCollect(full, E(full) + 1).run.energy).toBe(full.mods.maxEnergy);
  });

  it('gas pocket drains energy; each Gas Mask stack softens it, and a full set cancels it', () => {
    const run = blankRun();
    set(run, below(run), { kind: 'gas' });
    expect(tapCell(run, below(run)).run.energy).toBe(run.energy - 1 - gasEnergyLoss(run.depth));
    const { reduction, maxStacks } = CONFIG.perks.gasMask;
    let prev = gasEnergyLoss(run.depth);
    for (let stacks = 1; stacks <= maxStacks; stacks++) {
      const masked = blankRun();
      masked.perks.gasMask = stacks;
      set(masked, below(masked), { kind: 'gas' });
      const r = tapCell(masked, below(masked));
      const loss = Math.round(gasEnergyLoss(masked.depth) * (1 - stacks * reduction));
      expect(loss).toBeLessThan(prev);
      if (stacks === maxStacks) expect(loss).toBe(0);
      expect(r.run.energy).toBe(masked.energy - 1 - loss);
      expect(r.events).toContainEqual({ type: 'gas', idx: below(masked), energyLost: loss, protection: stacks * reduction });
      prev = loss;
    }
  });

  it('Gas Mask stacks up to maxStacks', () => {
    const run = blankRun();
    run.perks.gasMask = CONFIG.perks.gasMask.maxStacks - 1;
    expect(availablePerks(run)).toContain('gasMask');
    run.perks.gasMask = CONFIG.perks.gasMask.maxStacks;
    expect(availablePerks(run)).not.toContain('gasMask');
  });

  it('gas can knock you out of energy', () => {
    const run = blankRun();
    run.energy = 3;
    set(run, below(run), { kind: 'gas' });
    const r = tapCell(run, below(run));
    expect(r.run.energy).toBe(0);
    expect(r.run.status).toBe('outOfEnergy');
  });

  it('cave-in refills itself and up to 3 nearby open cells with dirt, sparing entrance, stairs and holes', () => {
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
    expect(ev?.type === 'caveIn' && ev.filled.length).toBe(4);
    if (ev?.type !== 'caveIn') return;
    expect(ev.filled).toContain(target);
    for (const i of ev.filled) {
      expect(after.floor.cells[i]).toMatchObject({ open: false, block: 'dirt', hp: 1, content: { kind: 'none' } });
      expect(i).not.toBe(after.floor.entrance);
    }
    // The refilled cave-in cell is plain dirt: breaking it again sets nothing off. (Right below the entrance,
    // which never refills, so it stays reachable.)
    const lone = blankRun();
    set(lone, below(lone), { kind: 'caveIn' });
    const caved = tapCell(lone, below(lone));
    expect(caved.events).toContainEqual({ type: 'caveIn', idx: below(lone), filled: [below(lone)] });
    const again = tapCell(caved.run, below(lone));
    expect(again.run.floor.cells[below(lone)].open).toBe(true);
    expect(again.events.map((e) => e.type)).not.toContain('caveIn');

    // Holes (like stairs) are never covered up.
    const holed = blankRun();
    for (const i of [below(holed) - 1, below(holed), below(holed) + 1]) {
      holed.floor.cells[i].open = true;
      holed.floor.cells[i].content = { kind: 'hole' };
    }
    const next = below(holed) + holed.floor.cols;
    set(holed, next, { kind: 'caveIn' });
    const r = tapCell(holed, next);
    const cave = r.events.find((e) => e.type === 'caveIn');
    expect(cave?.type === 'caveIn' && cave.filled).toEqual([next]);
  });

  it('a floor is not clean until a refilled cave-in cell is broken again', () => {
    const run = blankRun();
    const target = below(run);
    run.floor.cells.forEach((c, i) => {
      if (i !== target) Object.assign(c, { open: true, hp: 0, content: { kind: 'none' } });
    });
    set(run, target, { kind: 'caveIn' });
    const caved = tapCell(run, target).run;
    expect(caved.floor.cleared).toBeFalsy();
    let r = caved;
    for (let i = 0; i < 20 && !r.floor.cleared; i++) {
      const closed = r.floor.cells.findIndex((c) => !c.open);
      r = tapCell(r, closed).run;
    }
    expect(r.floor.cleared).toBe(true);
  });

  it('chest gives gems scaled by depth and gem value', () => {
    const run = blankRun();
    run.depth = 5;
    run.mods.gemValueMult = 2;
    run.rngState = 1234;
    set(run, E(run) + 1, { kind: 'chest' });
    const r = breakAndCollect(run, E(run) + 1);
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
      const r = breakAndCollect(run, E(run) + 1);
      if (r.run.status === 'choosingPerk') {
        offers++;
        expect(r.run.perkOffer?.source).toBe('chest');
        expect(r.events).toContainEqual(expect.objectContaining({ type: 'perkOffer', idx: E(run) + 1 }));
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

  it('runs always end: a bot with every perk and max upgrades runs dry or wins on the goal floor', () => {
    let run = createRun(4242, {
      maxEnergy: 200,
      power: 11,
      gemChanceBonus: 0.5,
      gemValueMult: 2,
      toolCharges: { dynamite: 6, drill: 6, scanner: 6 },
    });
    for (let steps = 0; run.status !== 'outOfEnergy' && run.status !== 'won' && steps < 20000; steps++) {
      if (run.status === 'choosingPerk') {
        const c = run.perkOffer!.choices;
        run = choosePerk(run, c.includes('secondWind') ? 'secondWind' : c[0]).run;
        continue;
      }
      const f = run.floor;
      const stairs = f.cells.findIndex((c) => c.open && (c.content.kind === 'stairs' || c.content.kind === 'legendary'));
      const hints = computeHints(f);
      run = tapCell(run, stairs >= 0 ? stairs : Math.max(...hints.map((h, i) => (h ? i : -1)))).run;
      // A quick player (~3 taps a second): the Rush timer and meter drain run in play time.
      run = tickRun(run, 300).run;
    }
    expect(['outOfEnergy', 'won']).toContain(run.status);
    if (run.status === 'won') expect(run.depth).toBe(CONFIG.goal.depth);
  });

  it('Sharp Edge and Second Wind apply immediately', () => {
    const take = (perk: PerkId, run = blankRun()) =>
      choosePerk({ ...run, status: 'choosingPerk', perkOffer: { source: 'floor', choices: [perk] } }, perk).run;
    expect(take('sharpEdge').mods.power).toBe(2);
    expect(take('sharpEdge', take('sharpEdge')).perks.sharpEdge).toBe(2);
    expect(take('secondWind', { ...blankRun(), energy: 10 }).energy).toBe(10 + CONFIG.perks.secondWind.energy);
  });

  it('Gold Fever: a chance per gem picked up to gain energy, once even when doubled, capped at max', () => {
    const gain = CONFIG.perks.goldFever.energy;
    const run = { ...blankRun(['goldFever', 'luckyStrike']), energy: 20 };
    set(run, E(run) + 1, { kind: 'gem', tier: 'quartz' });
    let fevers = 0;
    let doubledFevers = 0;
    for (let s = 0; s < 400; s++) {
      const broken = tapCell({ ...run, rngState: s * 7919 }, E(run) + 1).run;
      const r = tapCell(broken, E(run) + 1);
      const gem = r.events.find((e) => e.type === 'gem');
      if (gem?.type !== 'gem') throw new Error('no gem event');
      expect([0, gain]).toContain(gem.energy);
      expect(r.run.energy).toBe(broken.energy + gem.energy);
      if (gem.energy > 0) fevers++;
      if (gem.energy > 0 && gem.doubled) doubledFevers++;
    }
    expect(fevers / 400).toBeCloseTo(CONFIG.perks.goldFever.chance, 1);
    expect(doubledFevers).toBeGreaterThan(0);

    const full = { ...blankRun(['goldFever']), energy: CONFIG.energy.start };
    set(full, E(full) + 1, { kind: 'gem', tier: 'quartz' });
    for (let s = 0; s < 20; s++) {
      const broken = tapCell({ ...full, rngState: s * 7919 }, E(full) + 1).run;
      expect(tapCell(broken, E(full) + 1).run.energy).toBeLessThanOrEqual(full.mods.maxEnergy);
    }

    // Chest gems don't count, and without the perk a gem gives no energy.
    const plain = { ...blankRun(), energy: 20 };
    set(plain, E(plain) + 1, { kind: 'gem', tier: 'quartz' });
    const r = breakAndCollect(plain, E(plain) + 1);
    expect(r.run.energy).toBe(19);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'gem', energy: 0 }));
    const chest = { ...blankRun(['goldFever']), energy: 20, rngState: 5 };
    set(chest, E(chest) + 1, { kind: 'chest' });
    const opened = breakAndCollect(chest, E(chest) + 1);
    if (opened.events.some((e) => e.type === 'chest')) expect(opened.run.energy).toBe(19);
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
      const r = breakAndCollect(run, E(run) + 1);
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

describe('two-step items', () => {
  it('a break reveals the item; a free tap picks it up; tapping again does nothing', () => {
    for (const content of [{ kind: 'gem', tier: 'quartz' }, { kind: 'crystal' }, { kind: 'chest' }] as Content[]) {
      const run = blankRun();
      run.energy = 20;
      set(run, below(run), content);
      const broken = tapCell(run, below(run));
      expect(broken.run.floor.cells[below(run)]).toMatchObject({ open: true, content });
      expect(broken.run.gems).toBe(0);
      expect(broken.run.energy).toBe(19);
      const picked = tapCell(broken.run, below(run));
      expect(picked.run.floor.cells[below(run)].content.kind).toBe('none');
      expect(picked.run.energy).toBeGreaterThanOrEqual(19);
      if (picked.run.status === 'playing') expect(tapCell(picked.run, below(run)).run).toBe(picked.run);
    }
  });

  it('a cave-in next to an uncollected item buries and destroys it', () => {
    const run = blankRun();
    const gem = below(run);
    set(run, gem, { kind: 'gem', tier: 'quartz' });
    set(run, gem + 1, { kind: 'caveIn' });
    const revealed = tapCell(run, gem).run;
    // Seek an RNG state whose cave-in picks the gem's cell.
    for (let s = 0; s < 50; s++) {
      const r = tapCell({ ...revealed, rngState: s * 7919 }, gem + 1);
      const caveIn = r.events.find((e) => e.type === 'caveIn');
      if (caveIn?.type !== 'caveIn' || !caveIn.filled.includes(gem)) continue;
      expect(r.run.floor.cells[gem]).toMatchObject({ open: false, block: 'dirt', content: { kind: 'none' } });
      return;
    }
    throw new Error('no cave-in covered the gem');
  });

  it('breaking a crystal with the last energy still runs dry; the crystal waits for an energy refill', () => {
    const run = blankRun();
    run.energy = 1;
    set(run, below(run), { kind: 'crystal' });
    const r = tapCell(run, below(run));
    expect(r.run.status).toBe('outOfEnergy');
    expect(r.run.floor.cells[below(run)].content.kind).toBe('crystal');
    const resumed = grantAdEnergy(r.run);
    expect(tapCell(resumed, below(run)).run.energy).toBe(resumed.energy + CONFIG.crystal.energy);
  });

  it('breaking every block counts the floor as clean even with items still lying around', () => {
    const run = blankRun();
    run.energy = 1000;
    set(run, below(run), { kind: 'gem', tier: 'quartz' });
    let r = { run, events: [] as RunEvent[] };
    let cleared = false;
    for (let pass = 0; pass < run.floor.cells.length && !cleared; pass++) {
      for (let i = 0; i < r.run.floor.cells.length; i++) {
        const c = r.run.floor.cells[i];
        if (c.open) continue;
        r = tapCell(r.run, i);
        if (r.events.some((e) => e.type === 'floorCleared')) cleared = true;
      }
    }
    expect(cleared).toBe(true);
    expect(r.run.floor.cells[below(run)].content.kind).toBe('gem');
  });
});
