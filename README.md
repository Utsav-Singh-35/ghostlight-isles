# Ghostlight Isles

A 3D pirate game that runs in the browser. Sail a fog-covered sea at night, capture haunted islands, build defenses on your home island, raid other players, and keep your lanterns lit against the ghost fleet that sails under the Blood Moon.

Built solo with [Kiro](https://kiro.dev) for [Kiroween 2026](https://kiroween.devpost.com/), in the **Costume Contest** category.

![Sailing at night toward a haunted island](Documents/screenshots/02-sailing.png)

**Play:** live link coming soon (deployed from `main` on Netlify).

## What works so far
- A faceted night sea with moonlight glitter, stars, fog and lantern light pooling on the water
- 14 islands generated from a seed: your home island, Last Light, with its lighthouse, and 13 haunted islands with graveyards, dead trees and drifting green ghost lights
- A small ship with two crew that floats on the waves, leans into turns and leaves a foam wake
- Sails with three settings, steering with momentum, solid shores and a solid edge of the world
- Island labels that say in words whether an island is yours or haunted, and how far away it is
- High and Low graphics; 60 fps on Intel Iris Xe integrated graphics

Coming next: ship battles, capturing islands, base building, raids on other players, the ghost fleet and the Blood Moon. See [the build plan](Documents/build-plan.md).

## Controls
| Key | Action |
|---|---|
| W / S | Raise or lower the sails (Furled, Half sail, Full sail) |
| A / D | Steer to port or starboard |
| Mouse drag | Look around the ship |
| Scroll | Zoom |

URL options: `?seed=any-text` for a different archipelago, `?quality=low` for Low graphics, `?skipIntro` to skip the title screen.

## Run it locally
You need Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm test` | All tests, including the property-based tests |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Production build into `dist/` |
| `npm run smoke` | Opens the build in your installed Chrome or Edge, plays it, checks the performance budget and saves screenshots |
| `npm run check:assets` | Checks that every third-party asset is credited with an allowed license |

## How it's built
- **TypeScript, Three.js and Vite.** No game engine. Every model is built in code, so the first download is about 160 KB gzipped.
- **A deterministic simulation** in `src/sim/`: pure functions, a fixed 30 ticks per second and seeded randomness only. This is what will let the server replay raids and reject cheated results.
- **The renderer only reads the simulation.** Waves, bobbing, wakes and glows are visual, computed from the simulation state and a render clock.

## How Kiro is used
Everything Kiro uses lives in [`.kiro/`](.kiro), and a running log is in [Documents/kiro-usage-log.md](Documents/kiro-usage-log.md).
- **Specs:** one per game system, written before the code. The [sailing spec](.kiro/specs/sailing) has EARS requirements, a design with 14 numbered correctness properties, and tasks.
- **Property-based tests:** each correctness property is a fast-check test with the same number. They already caught a floating-point bug in the wave phases.
- **Steering:** product, tech and structure rules always load; simulation, rendering and testing rules load only for matching files; the game design loads automatically when gameplay is discussed.
- **Hooks:** a session brief with the time left and the next feature, a commit gate that blocks commits when tests fail, a test run after every change to the game rules, and a credit check for new assets.

## Project documents
The idea brief, game design, build plan, submission checklist and credits are in [Documents/](Documents).

## License
[MIT](LICENSE). Third-party credits are in [Documents/credits.md](Documents/credits.md).
