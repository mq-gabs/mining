# Build: "Deep Dig", a roguelike mining browser game

Build a mobile-first browser game where the player mines a grid to find gems, goes deeper floor by floor, and spends gems between runs on permanent upgrades. Build it in milestones (listed at the end) so each one ends in something playable. Stop after each milestone and summarize what's done.

## Tech requirements

- TypeScript + Vite, no game framework. Render the grid with HTML Canvas (or DOM/CSS grid if simpler). Keep the UI screens in plain HTML/CSS.
- Portrait layout, designed for a phone (about 390×844) but it must also work on desktop. Touch and mouse input. Tap targets at least 44px.
- Keep game logic separate from rendering: pure functions and state in `src/game/`, drawing and UI in `src/ui/`.
- Put all balance numbers in one file, `src/config.ts`, so they can be tuned without touching logic.
- Use a seeded RNG for floor generation so bugs can be reproduced.
- Save progress to localStorage (gems, upgrades, unlocks, best depth). Wrap it in try/catch and fall back to in-memory state.
- No external assets. Use shapes, gradients, and emoji or simple drawn icons. Generate sound effects with the Web Audio API, and add a mute toggle.
- Add a few unit tests (Vitest) for floor generation and the energy/gem math.

## Game structure

There are two loops:

1. **The run** (2–5 minutes): descend through floors, mine blocks, and collect gems until the player leaves or runs out of energy.
2. **The surface** (between runs): spend gems on permanent upgrades and unlock tools, then start a new run.

## The run

### Floor grid

- Each floor is a 7-column × 9-row grid of blocks.
- The player starts from an open "entrance" cell at the top center.
- **Only blocks next to an already-open cell (up, down, left, right) can be mined.** This makes the player choose a path instead of tapping anywhere.
- Block contents are hidden until the block breaks.
- Each floor has exactly one hidden **stairs** block, placed in the bottom 4 rows. Breaking it reveals the stairs. Tapping the stairs goes to the next floor.

### Mining and energy

- Every tap on a block costs **1 energy**, whether or not it breaks.
- Each tap deals damage equal to the pickaxe's **power**. A block breaks when its HP reaches 0.
- Show crack stages on damaged blocks (3 visual stages).
- Starting max energy is 50. Energy does not refill between floors, except through pickups and perks.

### Block types (HP)

- Dirt: 1
- Stone: 3
- Hard rock: 6
- Obsidian: 12 (appears from floor 8 onward)

Deeper floors shift the mix toward harder blocks. Define the distribution per depth range in config.

### What blocks can contain

- **Nothing** (most blocks)
- **Gems**, in tiers that unlock by depth:
  - Quartz: 1, from floor 1
  - Amethyst: 5, from floor 3
  - Sapphire: 20, from floor 6
  - Ruby: 60, from floor 10
  - Diamond: 200, from floor 15
- **Energy crystal**: +10 energy
- **Chest**: a handful of gems, or occasionally a free perk choice
- **Stairs**: one per floor
- **Hazards**:
  - Gas pocket: −5 energy when broken
  - Cave-in: up to 3 random adjacent open cells turn back into dirt

### Hints (light Minesweeper reasoning)

- A block adjacent to a gem-containing block shows a faint sparkle once that block is exposed (next to an open cell).
- A block adjacent to a hazard shows faint dust particles.
- The Scanner tool reveals contents directly (see Tools).

### Ending a run

- **Leave Mine** button, always available: the player returns to the surface and keeps 100% of the run's gems.
- **Out of energy**: the player is carried out and keeps 50% of the run's gems. Before applying this, show a rewarded-ad offer: "Watch an ad for +20 energy." This is available once per run.
- **Run summary screen**: depth reached, gems found, gems kept, new best depth if any, and a rewarded-ad offer to "Double gems from this run" (once per run).

### Perks (roguelike choices)

- On arriving at floors 3, 6, 9, and so on, pause and offer **3 random perks, pick 1**. Perks last only for the current run.
- Chests can occasionally offer a perk choice too.
- Starting perk pool (make this data-driven so more can be added):
  - Sharp Edge: +1 pickaxe power
  - Second Wind: +15 energy now
  - Lucky Strike: 20% chance each gem drop is doubled
  - Tremor: breaking a block deals 1 damage to adjacent blocks
  - Gas Mask: gas pockets are harmless
  - Prospector: gem sparkles also show the gem tier color
  - Efficient Swing: 15% chance a tap costs no energy
  - Treasure Sense: chests are highlighted once exposed
  - Deep Breath: each new floor restores 5 energy
  - Greed: gem values +50%, but max energy −10
- The same perk can't be offered twice in one run unless marked stackable. Sharp Edge and Second Wind are stackable.

## Tools

Tools are special abilities with a limited number of **charges per run**. They appear as buttons under the grid. Tapping a tool arms it, and the next tap on the grid uses it. They do not cost energy.

- **Pickaxe**: the default tap. Always available.
- **Dynamite**: breaks a 3×3 area (does not trigger gas pockets). Unlocked at the start with 1 charge.
- **Drill**: breaks an entire row from the tapped block outward in both directions. Unlocked in the shop.
- **Scanner**: reveals the contents of a 3×3 area without breaking it. Unlocked in the shop.

## The surface (between runs)

### Hub screen

- Total gems, best depth, a "Start Run" button, the upgrade shop, and a mute toggle.

### Permanent upgrades

Costs scale by ×1.6 per level. Keep all values in config.

- Pickaxe Power: +1 per level. Base cost 20, max level 10.
- Max Energy: +10 per level. Base cost 15, max level 15.
- Luck: +5% chance for any block to contain a gem. Base cost 30, max level 10.
- Gem Value: +10% gem value. Base cost 40, max level 10.
- Dynamite Charges: +1 per level. Base cost 50, max level 5.
- Unlock Drill: 150 gems (then Drill Charges upgrades: base cost 60, max level 5).
- Unlock Scanner: 250 gems (then Scanner Charges upgrades: base cost 60, max level 5).

### Balance goal

- A first run should reach about floor 3–4.
- After roughly 10 runs, a player who upgrades sensibly should reach about floor 10–12.
- Tune the config so an upgrade is affordable after almost every run early on (frequent rewards), and slows gradually later.

## Game feel (important; this is what makes it satisfying)

- Tap feedback: a small block shake, a crack sound, and debris particles.
- Block break: a pop animation and particles in the block's color.
- Gems: they fly from the block to the gem counter with a sparkle and a rising pitch "ding." Higher tiers get a bigger effect.
- Hazards: a screen shake for a cave-in, and a green puff for gas.
- Stairs reveal: a glow and a distinct sound.
- Energy bar: it pulses red below 20%.
- Floor transition: a quick slide-down animation with a "Floor N" label.
- Keep all animations short (under 300 ms) so the game never feels slow.

## Ads (stubbed for now)

- Create an `AdService` interface with `showRewarded(): Promise<boolean>` and `showInterstitial(): Promise<void>`.
- Implement a `MockAdService` that shows a 2-second fake ad overlay and then resolves `true`.
- Use rewarded ads only at the two points above: the energy refill and the gem doubling.
- Show an interstitial at most once every 3 runs, only on the way from the run summary back to the hub, and never during a run.
- Structure the code so the mock can later be replaced with the CrazyGames or Poki SDK without touching game logic.

## Milestones

1. **Core loop**: grid generation, adjacency mining, block HP, energy, gems, stairs, next floor, and Leave Mine / out-of-energy endings with a basic summary. Plain visuals are fine.
2. **Surface and progression**: hub screen, upgrade shop, saving to localStorage, depth-based block and gem scaling.
3. **Roguelike layer**: hints, hazards, chests, energy crystals, and the perk choice system.
4. **Tools**: Dynamite, Drill, Scanner, including unlocks and charges.
5. **Juice and polish**: animations, particles, sounds, transitions, responsive layout pass.
6. **Ads**: the AdService mock wired into the three placements.
