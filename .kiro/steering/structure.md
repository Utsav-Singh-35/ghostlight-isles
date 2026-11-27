---
inclusion: always
---
# Project structure

| Path | Contents |
|---|---|
| `.kiro/` | Kiro steering, specs and hooks. Always committed. |
| `Documents/` | Idea brief, game design, build plan, submission checklist, Kiro usage log, credits, screenshots |
| `public/` | Static files served as they are: models in `public/models/<pack>/`, the favicon |
| `scripts/` | Node scripts: asset check, browser smoke test, hook helpers in `scripts/hooks/` |
| `src/main.ts` | Entry point: checks WebGL 2, then wires the simulation, renderer, input and HUD together |
| `src/sim/` | Game rules. Pure and deterministic. Tests sit next to the code as `*.test.ts` |
| `src/render/` | Three.js scene, ocean, sky, islands, ships, camera. Reads simulation state only |
| `src/audio/` | Sound made in code with Web Audio: cue planning (pure), the synth, the game-facing `Sound`. Reads simulation events only |
| `src/game/` | Glue: the fixed-timestep loop, keyboard input, interpolation between simulation states |
| `src/ui/` | DOM overlay: HUD, menus, buttons |
| `src/server/` | The game server's rules: router, accounts, and one module per feature. Pure web standards |
| `src/net/` | Client side of the server: online or offline backend, the signed-in session |
| `netlify/functions/` | The Netlify Function that runs `src/server/api.ts` with Netlify Blobs |

## Import rules
- `sim` imports nothing from `render`, `game`, `ui` or `three`.
- `render` may import types and pure helpers from `sim`.
- `audio` may import types from `sim`, and nothing from `render`, `ui` or `three`.
- `game` connects `sim`, `render`, `audio` and `ui`.
- `ui` uses plain DOM, with no UI framework.
- `server` imports `sim` only. Feature routes register themselves with `route()` from `server/router.ts`, and `server/api.ts` imports each feature module.
- `net` imports `server` (for offline play) and `sim` types.

## Naming
- Source files use camelCase (`shipMesh.ts`), one main export per file.
- Tests are `name.test.ts` next to the file they test. Property tests start their name with `Property N:`, matching the numbered properties in the spec's design.md.
- Spec folders in `.kiro/specs/` use kebab-case, one folder per game system.
