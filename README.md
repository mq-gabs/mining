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
| `npm run sim [-- 1000]` | Balance simulator: a bot plays N runs and reports average depth and gems |

Add `?seed=12345` to the URL to replay a specific run. Each run logs its seed to the console and shows it on the summary screen.

## Layout

- `src/config.ts`: every balance number (grid size, HP, block mix per depth, gem tiers, energy).
- `src/game/`: pure game logic and state (no DOM). `run.ts` takes a state and returns a new state plus events.
- `src/ui/`: canvas renderer, HUD, screens, modals. Reads game state and reacts to events.
