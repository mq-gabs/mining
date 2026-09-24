# Rush Dig

Mobile-first roguelike mining game (renamed from "Deep Dig"; internal ids such as the `deep-dig/*` save keys,
`__deepDig` and the `[deep-dig]` log prefix keep the old name on purpose, so existing saves still load). TypeScript + Vite + Canvas, no game framework, no runtime dependencies.
The full spec is in `ORIGINAL-PROMPT.md`. It is built milestone by milestone; stop after each one and summarize.

## Status

- Done: M1 core loop, M2 surface/shop/save, M3 roguelike layer (hints, hazards, chests, crystals, perks),
  M4 tools (Dynamite, Drill, Scanner via `useTool` in `run.ts`; unlocks/charges as upgrades with `requires`),
  M5 juice (canvas particles/pops/rings/floor slide in `gridRenderer.ts`, DOM gem flights in `ui/fx.ts`),
  synthesized sound (`platform/audio.ts` synth, recipes + event mapping in `ui/sounds.ts`), mute toggle,
  responsive pass (narrow phones, landscape side-by-side layout),
  M6 ads (`AdService` + `MockAdService` in `platform/ads.ts`, behind the `ads` feature flag).
- All six milestones of the spec are done. Extra: procedural adaptive background music (`ui/music.ts`),
  Rush (see the Rush section below), the clean floor bonus (see its section below),
  language support (English and pt-BR, `src/i18n/`), stackable Gas Mask (see the deviations below), and a dev tools
  panel (`ui/devPanel.ts`, behind the `devTools` flag).

## Commands

- `npm run dev`: dev server (`--host`, reachable from a phone on the LAN)
- `npm test`: Vitest. `npm run typecheck`, `npm run build` (tsc + vite build)
- `npm run sim -- <players> <runs>`: balance simulator (bots play full careers). Use ~80–100 players.
  It takes about a minute, so run it with a timeout (`timeout -s KILL 110 node node_modules/.bin/vite-node scripts/sim.ts 80 12`).

## Architecture rules

- `src/config.ts` holds **every** balance number. Never hardcode tunables in logic or UI.
- `src/game/` is pure logic with no DOM. Actions take a `RunState` and return `{ run, events }` with a new
  (structuredClone'd) state. Returning the *same object* means "no-op"; callers and the sim rely on that.
- The UI (`src/ui/`) never mutates game state. It calls game functions, then reacts to `RunEvent`s for
  effects and follow-up modals (`App.apply`). New feedback/juice should hang off events, not state diffs.
- All block breaking goes through `breakBlock` in `run.ts` (pickaxe, Tremor, and future tools), so content
  resolution (gems, crystals, chests, hazards, stairs) stays in one place. `BreakOptions` handles per-source
  differences (e.g. dynamite doesn't trigger gas). Items are picked up separately by `collect` (see Two-step items).
- Randomness: floors come from `hashSeed(runSeed, depth)`, so they are deterministic per seed. In-run randomness
  (perk procs, cave-ins, perk offers) uses `run.rngState`. Never use `Math.random()` in `src/game/`.
- Perks are data-driven in `src/game/perks.ts` (`PERKS` table + `PerkId` union); passive perks are checked
  with `hasPerk` where they apply. Upgrades are data-driven via `CONFIG.upgrades.items` + `UPGRADE_IDS`.
- Browser services live in `src/platform/` (localStorage `ProfileStore` with in-memory fallback). Saves are
  parsed through `parseProfile`, which clamps and fills defaults. Bump `PROFILE_VERSION` on shape changes.
- Music is procedural (`MusicEngine` in `ui/music.ts`): a lookahead scheduler on the `Synth`'s music bus.
  The mood is a pure function of the scene (`moodFor`: hub, or run depth + low energy, or Rush) and changes crossfade.
  All music tuning lives in `CONFIG.music`. Audio "holds" (`Synth.hold('hidden' | 'ad')`) suspend the whole
  context, so a hidden tab or an ad pauses music and SFX together.
- Sounds are generated with Web Audio, never loaded from files. Device prefs (mute, volumes, language) live in `SettingsStore`,
  separate from the profile, so "Reset progress" keeps them. Sound, like other juice, hangs off `RunEvent`s.
- Ads must stay behind the `AdService` interface so the mock can be swapped for the CrazyGames/Poki SDK
  (only `createAdService()` changes). Game audio is paused while an ad plays (`Synth.paused`).
  Ad rules are pure and tested: `grantAdEnergy`/`canUseEnergyAd` (run.ts), `doubleRunGems`/`shouldShowInterstitial`
  (progression.ts). The interstitial shows after every 3rd completed run (`runsCompleted % N`), so no extra save state.
- UI text is translated (English and pt-BR, `src/i18n/`). Never hardcode player-facing text: add a key to
  `en.ts` and `pt-BR.ts` (the types force both) and use `t()` / `tn()`. Format numbers with `fmtNumber` / `fmtPct`
  (pt-BR uses decimal commas). Perk, tool, upgrade and gem names live in the tables (via `ui/names.ts`), not in
  game data. Static HTML texts use `data-i18n` / `data-i18n-aria`. The language is a device setting in
  `SettingsStore`, picked in the ⚙️ dialog, and follows the browser by default. pt-BR conventions: informal
  "você", gender-neutral phrasing where natural ("Saia com vida", "Resgate"), and fixed terms: perk = bônus
  (masculine, same plural), run = expedição, floor = andar, upgrade = melhoria, Rush stays "Rush".
- Feature flags live only in `src/flags.ts` (`DEFAULT_FLAGS`, overridable with `VITE_FLAGS` or dev-only `?flags=`).
  Check them with `isEnabled()` in UI/platform code, never in `src/game/` (keep logic flag-free and testable).
  When `ads` is off, `createAdService()` returns undefined and the UI shows no ad offers. `devTools` defaults to
  `import.meta.env.DEV` (on in dev, off in production builds unless `VITE_FLAGS=devTools`).

## Deliberate deviations from the spec (keep unless the user says otherwise)

- Stackable perks have `maxStacks` (3 for Sharp Edge and Second Wind, 4 for Gas Mask). Unlimited Second Wind made
  runs endless.
- The Gas Mask softens gas instead of blocking it. The spec's mask made gas harmless, which made gas trivial. Each
  stack cuts the loss by `perks.gasMask.reduction` (25%, `gasLossFactor`), so only all 4 stacks make gas harmless.
  Gas costs 12 energy (was 8), and pockets are rarer (max 5%, was 7%), so each one is a real hit. The `gas` event
  carries `protection` (the share blocked, 0..1). The float stays red (`😷−6⚡`) unless the loss is 0 ("masked",
  in green). The sound crossfades from a hiss to a muffled puff, and each mask level plays one step softer than its
  share, with a quieter, duller puff at 4 stacks (`Sounds.gas`). On the grid a green cloud billows out, rises
  and dissipates over ~1.3 s (`GridRenderer.gasCloud`, longer than other effects on purpose: it's the hazard's
  main cue). Each mask level makes it smaller and fainter, down to a thin wisp.
  **Balance, open:** this moved bot run 10 from floor 12.5 to about 9.3 (run 1 unchanged at 4.7), below the bot
  target. The mask change alone accounts for most of it (9.8 with gas still at 8). Levers: gas at 10, or 33% per
  stack (immune at 3).
- The gem tier distribution is a per-depth `gems.tierMix` table (like `blockMix`). An earlier per-floor
  "decay" multiplier was a no-op because it scaled all tiers equally. Don't reintroduce that pattern.
- Crystals thin out with depth, and the block mix keeps hardening past floor 16. Both are energy sinks
  that guarantee runs end.
- Hints use orthogonal neighbours (same as mining adjacency); cave-ins use the 8-neighbourhood.
- Tools can only target open cells or blocks the pickaxe could reach, so they can't skip exploration.
  A tool that would affect nothing (e.g. rescanning a known area) is a no-op and keeps its charge.
- Only one perk offer can be pending. Since chests are opened one tap at a time (two-step items), a blast can no
  longer open two at once; `offerPerk` still refuses a second offer as a safeguard.

## Rush

A burst of speed in an otherwise careful game: it rewards a steady pace but shouldn't punish a short pause
to read hints. Tuning lives in `CONFIG.rush` and `CONFIG.music.rush`; tests are in `rush.test.ts`.

- **Meter** (`run.momentum`, 0..1): each block broken by the pickaxe or Tremor adds `rush.fill[block]` (harder
  gives more). Tool breaks add nothing (`BreakOptions.source`). It always drains at `drainPerSec`, with no idle
  delay, and carries over between floors. Each Rush already had this run scales the fill by `fillDecay` (0.5).
  Without the decay, a player who one-shots blocks chains Rushes forever and runs never end.
- **Rush** (`run.rush`): starts the moment the meter is full, even mid-tap. It lasts `durationSec` (5 s, the
  user's choice). During it, taps cost no energy, power is ×`powerMult`, and any closed block can be mined
  without adjacency. **Breaks** reveal items as usual (two-step, see below); gas and cave-ins do nothing and are
  lost. Breaking ignores perks (Sharp Edge, Tremor, Efficient Swing; see `powerWithoutPerks`), and Deep Breath is
  skipped. **Pickups** during a Rush follow the normal rules (the user's choice): crystals give energy, Lucky
  Strike and Greed apply, and gems count toward `rush.gems`. Perk offers wait for the Rush to end
  (`rush.perkOfferPending`, the source, at most one): a floor offer that comes due, or a chest that rolls one
  (`perkOfferHeld` event: the "Perk!" float and jingle now, the choice later). A second chest perk while one is
  held pays gems, and a floor offer replaces a held chest one. A floor-clear energy refund also waits
  (`rush.energyPending`). Stairs still work, and the Rush carries over them. Tools work as normal. The meter
  doesn't fill.
  Energy 0 doesn't end the run during a Rush; when the Rush ends, the normal out-of-energy flow starts (after any
  held perk choice).
- **Time:** `tickRun(run, dtMs)` is the only clock. It returns the same object when nothing changes. The `App`
  loop ticks it only while playable (no modal, tab visible, no floor slide), with `dt` clamped to 100 ms. Plain
  drain frames skip `apply`. The sim ticks `BOT_MS_PER_TAP` (300) per action. Tests that play whole runs must
  tick too, or a Rush never ends.
- **Events:** `momentum` (meter tick SFX), `rushStart`, `rushEnd` (blocks and gems, for the result float),
  and `break.combo` (combo float and rising pitch). The gold block palette is `RUSH_BLOCK_COLORS`
  (`DrawView.rush`). Reduced motion drops the flash, shimmer and shake.
- **Music:** the `rush` mood (150 BPM kick, hat, bass and arp on a separate bus) overrides depth and low energy,
  with a 0.3 s crossfade.
- **Balance, open:** Rush frequency (the original goal was one every 2–3 floors) and the depth targets conflict,
  because free taps compound through upgrades. With the gems-only rules the bot reaches floor 4.9 on run 1 and
  14.5 on run 10, at the top of its target (19.4 on run 10 before gems-only, 11.5 with Rush off). Rushes come every
  4–7 floors. The bot doesn't use the any-block reach, so real players may gain more than the sim shows.
  The gems-only rules are also the balance fix: before them, run 10 overshot to floor 19. The full sim report and
  next levers to try are in `docs/reports/2026-09-23-rush-balance.md`. (Numbers from before the Gas Mask and
  two-step changes; see those sections for the current ones. Now that pickups take Rush time, a Rush breaks
  about 11 blocks instead of 16, and Rush gems are ~5% of the total instead of ~10%.)

## Two-step items

Gems, crystals and chests (`isCollectible`) take two taps: breaking the block reveals the item, which then lies
in the open cell until tapped. Hazards (gas, cave-in) still go off on break, and stairs were already two-step.

- **Pickup** (`collect` in `run.ts`, reached through `tapCell` on an open item cell): free, no energy. Lucky Strike,
  Greed and the chest perk roll apply at pickup. A chest perk offer carries the chest's `idx` (for the float).
- **Events:** a break emits `itemRevealed` (a ring and a soft glint sound, once per action). Pickup emits the usual
  `gem` / `crystal` / `chest` events, so gem flights and floats work as before. Items are drawn in open cells
  with a glow and a bob (`GridRenderer.drawItem`; no bob with reduced motion).
- **Rush:** two-step too. Items can be picked up during a Rush with the normal rules (see the Rush section).
- **Tools:** blasts only reveal. A tap on an item (or stairs) picks it up even with a tool armed, and the tool
  stays armed. Tools can't hit open cells, so they never touch lying items.
- **Side effects (user decisions):** a cave-in that refills a cell destroys the item lying there. Breaking a
  crystal with the last energy runs the run dry right away; the crystal stays on the floor and can be picked up
  after the rewarded energy ad. Items left behind when descending or leaving are lost. A floor counts as clean
  once every block is broken, even with items still lying around.
- **Sim:** the bot picks up every revealed item first, Rush or not. Each pickup costs a 300 ms tick, so the meter
  drains more between breaks and a Rush breaks fewer blocks. With two-step in Rush too: run 1 floor 4.7, run 10
  floor 9.3, ~1.8 Rushes per run by run 10 (2.25 before two-step items). Tests are in `roguelike.test.ts`
  (`two-step items`) and `rush.test.ts`.

## Clean floor bonus

Breaking every block on a floor adds `bonusForDepth(depth)` (deeper is worth more) to `run.cleanBonus`. The
run multiplier `cleanMultiplier` (capped at `cleanBonus.maxMult` = 1.5) applies to the gems kept, before the
exhausted penalty (`gemsKept(gems, reason, multiplier)`). `checkCleared` runs at the end of `breakBlock` for
every breaking source, after content resolves, so cave-in refills block it. `Floor.cleared` makes it count once.
There's no "blocks left" counter (a user decision). Clearing a floor also refunds energy
(`clearEnergyForDepth`: 15 + 1.5 per floor, at most `energyMax` 40). During a Rush the refund is held in
`rush.energyPending` and paid when the Rush ends. `energyMax` must stay below the ~60 blocks a floor costs to
clear (a test checks it), or cleaning could pay for itself and runs would never end.

- **UI:** a `floorCleared` event (bonus, new multiplier, energy now or pending) drives the "Floor cleared!"
  banner (`.floor-banner.long`, which wraps on narrow phones), a sound and a sparkle. The `🧹 ×1.12` HUD chip shows
  once a floor is clean; tapping it explains the rule. The leave and out-of-energy modals and the summary
  (`cleanFloors`, `multiplier`, `bonusGems`) show gems after the multiplier. Tests are in `clean.test.ts`.

- **Sim:** `SIM_CLEAN` picks the bot's policy: `deep` (the default: clean any affordable floor from
  `SIM_CLEAN_MIN_DEPTH` = 6), `all`, `leave` (only the floor it leaves from, which in practice never happens), or
  `none` (the pure-diving baseline).
- **Balance:** without the refund, cleaning was a net loss (run 10: 460–590 gems against 980 for diving).
  With it, cleaning is a fair trade. Cleaning bots end run 10 about 1.5–3 floors shallower (11.7–13.2, against
  14.5) with about the same or more gems (1000–1500, against 980). Double the refund made cleaning dominant
  (about 2800). Gems kept swing ±30–50% between nearly identical settings, because careers compound, so
  compare depth and trends, not single gem numbers.

## Balance workflow

- Targets: first run reaches floor 3–4; by run 10, floor 10–12; an upgrade is affordable after almost
  every early run, slowing later. The sim bot plays near-perfectly, so aim the bot about 1–2 floors *above* the
  human targets. The bot cleans floors by default (`SIM_CLEAN=deep`), which costs it some depth. Compare
  against `SIM_CLEAN=none` when a change isn't about cleaning.
- After any change to mechanics or config, rerun the sim and report the table. A test in `roguelike.test.ts`
  asserts that a maxed-out player still runs out of energy. Keep it passing.
- Longer balance analyses go in `docs/reports/YYYY-MM-DD-<topic>.md` (setup, table, findings, next levers).
  Append an update section when a follow-up change is measured, instead of a new file.
- Known open issue: upgrades bought per run rise over time instead of slowing down (~1.2 → 5.1 by run 10
  with the cleaning bot, ~1.2 → 4.0 with Rush and no cleaning, ~0.9 → 2.9 before Rush, with gas at 8 energy and an all-blocking Gas Mask. With the stackable mask and gas at 12 it's ~1.0 → 2.3, but runs
  are shallower; it was ~1.0 → 4.1 with gas at 5, and ~0.8 → 2.7 before M4's tool upgrades).

## Testing gotchas

- Dev tools panel: the `devTools` flag shows a 🛠 tab (top centre, or the ` key) that opens `ui/devPanel.ts`.
  Hide it in dev with `?flags=-devTools`. Add manual test tools there as a new `DevSection` (the first one plays the
  gas cloud and sound at each mask level, on the grid when a run is open). Its texts are plain English (not player-facing, not translated). Its buttons use
  `.dev-sfx`, which the global click sound skips.
- Dev builds expose `window.__deepDig` (`run` get/set, `tap(idx)`, `tool(toolId, idx)`, `tick(ms)`, `hints()`) for
  scripted browser tests. It is not active in production builds.
- The UI language follows the browser until one is picked, so a Playwright context with a Portuguese locale
  sees pt-BR texts. Set `locale: 'en-US'` on the context when a test matches English text.
- For browser checks, Playwright lives in the session scratchpad, not in this project. Don't add it as a dependency.
- Don't `pkill -f vite-node` or `pkill -f vite`: the pattern matches your own shell command and kills it.
  Use a bracket pattern like `pkill -f "[v]ite --port 5199"`, or kill by PID.
- The user often has their own `npm run dev` (`vite --host`) running; leave it alone.

## Style

- Match the existing code: small pure functions, JSDoc on non-obvious exports, no framework, plain DOM for
  screens, canvas for the grid. Tap targets ≥ 44px; animations < 300 ms.
- Portuguese runs 20–30% longer than English: check new texts in both languages at 390 px width, especially
  in tight spots (tool bar, canvas floats, banners, buttons).
