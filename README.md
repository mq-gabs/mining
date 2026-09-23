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

Add `?seed=12345` to the URL to replay a specific run. Each run logs its seed to the console and shows it on the summary screen.

## Layout

- `src/config.ts`: every balance number (grid size, HP, block mix per depth, gem tiers, energy).
- `src/game/`: pure game logic and state (no DOM). `run.ts` takes a state and returns a new state plus events.
- `src/platform/`: browser services (localStorage save with in-memory fallback).
- `src/ui/`: canvas renderer, HUD, screens, modals. Reads game state and reacts to events.

Progress is saved to localStorage under `deep-dig/profile`. Use "Reset progress" on the hub to wipe it.
