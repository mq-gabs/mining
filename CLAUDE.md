# Deep Dig

Mobile-first roguelike mining game. TypeScript + Vite + Canvas, no game framework, no runtime dependencies.
The full spec is in `ORIGINAL-PROMPT.md`. It is built milestone by milestone; stop after each one and summarize.

## Status

- Done: M1 core loop, M2 surface/shop/save, M3 roguelike layer (hints, hazards, chests, crystals, perks),
  M4 tools (Dynamite, Drill, Scanner via `useTool` in `run.ts`; unlocks/charges as upgrades with `requires`),
  M5 juice (canvas particles/pops/rings/floor slide in `gridRenderer.ts`, DOM gem flights in `ui/fx.ts`),
  synthesized sound (`platform/audio.ts` synth, recipes + event mapping in `ui/sounds.ts`), mute toggle,
  responsive pass (narrow phones, landscape side-by-side layout).
- Next: M6 ads (`AdService` mock).

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
  differences (e.g. dynamite doesn't trigger gas).
- Randomness: floors come from `hashSeed(runSeed, depth)`, so they are deterministic per seed. In-run randomness
  (perk procs, cave-ins, perk offers) uses `run.rngState`. Never use `Math.random()` in `src/game/`.
- Perks are data-driven in `src/game/perks.ts` (`PERKS` table + `PerkId` union); passive perks are checked
  with `hasPerk` where they apply. Upgrades are data-driven via `CONFIG.upgrades.items` + `UPGRADE_IDS`.
- Browser services live in `src/platform/` (localStorage `ProfileStore` with in-memory fallback). Saves are
  parsed through `parseProfile`, which clamps and fills defaults. Bump `PROFILE_VERSION` on shape changes.
- Sounds are generated with Web Audio, never loaded from files. Device prefs (mute) live in `SettingsStore`,
  separate from the profile, so "Reset progress" keeps them. Sound, like other juice, hangs off `RunEvent`s.
- Ads (M6) must stay behind an `AdService` interface so the mock can be swapped for the CrazyGames/Poki SDK.

## Deliberate deviations from the spec (keep unless the user says otherwise)

- Stackable perks have `maxStacks` (3 for Sharp Edge and Second Wind). Unlimited Second Wind made runs endless.
- The gem tier distribution is a per-depth `gems.tierMix` table (like `blockMix`). An earlier per-floor
  "decay" multiplier was a no-op because it scaled all tiers equally. Don't reintroduce that pattern.
- Crystals thin out with depth, and the block mix keeps hardening past floor 16. Both are energy sinks
  that guarantee runs end.
- Hints use orthogonal neighbours (same as mining adjacency); cave-ins use the 8-neighbourhood.
- Tools can only target open cells or blocks the pickaxe could reach, so they can't skip exploration.
  A tool that would affect nothing (e.g. rescanning a known area) is a no-op and keeps its charge.
- Only one perk offer can be pending: a second perk chest in the same dynamite blast pays out gems instead.

## Balance workflow

- Targets: first run reaches floor 3–4; by run 10, floor 10–12; an upgrade is affordable after almost
  every early run, slowing later. The sim bot plays near-perfectly, so aim the bot about 1–2 floors *above* the
  human targets.
- After any change to mechanics or config, rerun the sim and report the table. A test in `roguelike.test.ts`
  asserts that a maxed-out player still runs out of energy. Keep it passing.
- Known open issue: upgrades bought per run rise over time instead of slowing down (~1.0 → 4.1 by run 10
  since M4 added five cheap tool upgrades; it was ~0.8 → 2.7 before).

## Testing gotchas

- Dev builds expose `window.__deepDig` (`run` get/set, `tap(idx)`, `tool(toolId, idx)`, `hints()`) for scripted browser tests.
  It is not active in production builds.
- For browser checks, Playwright lives in the session scratchpad, not in this project. Don't add it as a dependency.
- Don't `pkill -f vite-node` or `pkill -f vite`: the pattern matches your own shell command and kills it.
  Use a bracket pattern like `pkill -f "[v]ite --port 5199"`, or kill by PID.
- The user often has their own `npm run dev` (`vite --host`) running; leave it alone.

## Style

- Match the existing code: small pure functions, JSDoc on non-obvious exports, no framework, plain DOM for
  screens, canvas for the grid. Tap targets ≥ 44px; animations < 300 ms.
