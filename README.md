# Deep Dig

A mobile-first roguelike mining game. TypeScript + Vite + Canvas, no framework.

## Run it

```sh
npm install
npm run dev        # open the printed URL; --host also exposes it on your LAN for phone testing
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Vitest unit tests (floor generation, energy/gem math) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run sim [-- players runs]` | Balance simulator: bots play whole careers (run → shop → run) and report depth, gems and upgrades per run |

In dev builds, `window.__deepDig` exposes the run state (`__deepDig.run`, settable), `__deepDig.tap(idx)` and `__deepDig.hints()` for debugging from the console.

## Feature flags

Optional features are switched on or off in one place, `src/flags.ts` (`DEFAULT_FLAGS`). Code checks them with
`isEnabled('ads')`. Overrides take a comma-separated list where `name` turns a flag on and `-name` turns it off:

| Where | Example | Applies to |
| --- | --- | --- |
| `VITE_FLAGS` env var | `VITE_FLAGS=-ads npm run build` | Any build (baked in at build time) |
| `?flags=` URL param | `http://localhost:5173/?flags=-ads` | Dev builds only |

Current flags:

| Flag | Default | What it controls |
| --- | --- | --- |
| `ads` | on | Rewarded ads (+energy when out of energy, double gems on the summary) and interstitials. When off, no ad offers appear at all. |

## Ads

The game only talks to ads through the `AdService` interface in `src/platform/ads.ts`. It currently uses
`MockAdService` (a 2-second fake ad that always grants the reward). To ship on CrazyGames or Poki, implement
`AdService` with their SDK and return it from `createAdService()`. Nothing else needs to change. Ad rewards and
pacing (`rewardedEnergy`, `gemMultiplier`, `interstitialEveryRuns`) are in `CONFIG.ads`.

Add `?seed=12345` to the URL to replay a specific run. Each run logs its seed to the console and shows it on the summary screen.

## Layout

- `src/config.ts`: every balance number (grid size, HP, block mix per depth, gem tiers, energy, ad rewards).
- `src/flags.ts`: feature flags.
- `src/game/`: pure game logic and state (no DOM). `run.ts` takes a state and returns a new state plus events.
- `src/platform/`: browser services (localStorage save with in-memory fallback, Web Audio synth, ad service).
- `src/ui/`: canvas renderer, HUD, screens, modals. Reads game state and reacts to events.

Progress is saved to localStorage under `deep-dig/profile`. Use "Reset progress" on the hub to wipe it.
