# Rush balance report (2026-09-23)

**Decision:** keep the current Rush values for now, even though they overshoot the depth targets.
The gems-only change at the end of this report later brought run 10 back to about the top of the target.

## Setup

- Sim: `scripts/sim.ts`, 100 players × 12 runs each. The bot plays near-perfectly and ticks `BOT_MS_PER_TAP` (300 ms)
  after each action, so it taps nonstop at about 3 taps/s.
- Current values (`CONFIG.rush`): fill dirt 0.08 / stone 0.1 / hard 0.13 / obsidian 0.17, `fillDecay` 0.5,
  `drainPerSec` 0.08, `durationSec` 5, `powerMult` 2.
- Comparisons: "Rush off" sets every `fill` value to 0; "Rush 3 s" changes only `durationSec`.
- Bot targets (from CLAUDE.md, about 1–2 floors above the human targets): run 1 about floor 4–6, run 10 about floor 11–14.
  The number of upgrades bought per run should slow down over a career.

## Results

| | Rush off | Rush 3 s | Current (5 s) |
|---|---|---|---|
| Depth, run 1 | 4.2 | 4.9 | 5.6 |
| Depth, run 10 | 11.5 | 14.5 | 19.4 |
| Gems kept, run 10 | 639 | 1047 | 2268 |
| Upgrade levels owned by run 10 | 19.9 | 26.8 | 36.0 |
| Upgrades bought per run, run 1 → 10 | 0.9 → 2.8 | 1.1 → 3.7 | 1.4 → 4.6 |
| Rushes per run, run 1 → 12 | – | 1.3 → 2.4 | 1.3 → 2.4 |
| Floors between Rushes, run 1 → 12 | – | 3.7 → 6.2 | 4.3 → 8.0 |
| Blocks broken per Rush | – | ~10 | ~18–21 |
| Share of gems earned during Rushes, run 1 → 12 | – | 13% → 3% | 16% → 3% |
| Runs where the bot left by choice | 26–40% | 9–29% | 5–23% |

The maxed-out bot (the test in `roguelike.test.ts`) still runs out of energy: on floor 18, against floor 15 without Rush.

## Findings

- **Run 1 is on target; later runs are not.** The gap opens around run 3–4 and keeps growing. By run 10 the bot is
  about 8 floors deeper than without Rush and keeps about 3.5× the gems.
- **The cause is energy, not gems.** Only 3–16% of gems are earned during Rushes. What matters is the energy saved by
  18–21 free, double-power breaks per Rush. That energy buys more floors, deeper floors give better gems, better gems
  buy more upgrades, and the effect compounds.
- **Rushes are rarer than the original goal.** They come every 4–8 floors, not every 2–3. Because each Rush halves the
  next fill (`fillDecay` 0.5), a run gets about 2.5 Rushes at most, so deep floors hardly get any.
- **Upgrades keep speeding up.** The number bought per run rose over a career even before Rush (0.9 → 2.8); now it is 1.4 → 4.6.
- **Bots leave the mine by choice less often**, but still earn much more: more of their runs end in exhaustion.

## Caveats

- The bot taps nonstop and never pauses to read hints, so it fills the meter more easily than a person will.
- The bot never uses the any-block reach during a Rush, which real players will (for example by digging straight
  toward the stairs). That makes real Rushes worth more than the sim shows.

## If we rebalance

1. Lower the Rush's energy value first: `powerMult` 1.5, or cap the number of free taps per Rush.
2. Making Rushes rarer (higher `drainPerSec`, lower `fill`, stronger `fillDecay`) also brings depth down, but moves
   further from the every-2–3-floors goal.
3. Rerun the sim and compare against the "Rush off" column above.

## Update: gems-only Rush

Later the same day, the Rush was changed so that **only gems change** during it:
- crystals, gas and cave-ins do nothing and are lost;
- chests pay gems but never offer a perk;
- perks are ignored (Sharp Edge, Tremor, Lucky Strike, Greed, Efficient Swing, Deep Breath);
- a floor perk offer that comes due mid-Rush is made when the Rush ends.

The other values are unchanged (5 s, `powerMult` 2). Same sim, 100 players × 12 runs:

| | Rush off | 5 s, before | **Gems-only (5 s)** |
|---|---|---|---|
| Depth, run 1 | 4.2 | 5.6 | **4.9** |
| Depth, run 10 | 11.5 | 19.4 | **14.5** |
| Gems kept, run 10 | 639 | 2268 | **980** |
| Upgrade levels owned by run 10 | 19.9 | 36.0 | **24.4** |
| Upgrades bought per run, run 1 → 10 | 0.9 → 2.8 | 1.4 → 4.6 | **1.2 → 4.0** |
| Rushes per run, run 1 → 12 | – | 1.3 → 2.4 | **1.2 → 2.3** |
| Floors between Rushes, run 1 → 12 | – | 4.3 → 8.0 | **4.0 → 6.9** |
| Blocks broken per Rush | – | ~18–21 | **~16** |
| Share of gems earned during Rushes, run 1 → 12 | – | 16% → 3% | **15% → 5%** |
| Runs where the bot left by choice | 26–40% | 5–23% | **14–36%** |

- Run 10 is now at the top of the bot target (about 14), down from about 19. Run 1 is on target.
- Two things cut the overshoot. Losing crystals during a Rush gives back part of the energy it saves, and with no
  Tremor or Sharp Edge each Rush breaks fewer blocks. The gap to "Rush off" drops from about 8 floors to 3.
- Rushes still come every 4–7 floors, not every 2–3.
- The maxed-out bot still runs out of energy, on floor 18.
