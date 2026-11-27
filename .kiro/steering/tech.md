---
inclusion: always
---
# Tech stack and architecture

## Stack
- TypeScript (strict), bundled by Vite. Node 22 for tooling.
- Three.js with `WebGLRenderer` (WebGL 2 only). Import addons from `three/addons/...`.
- Vitest for tests, fast-check for property-based tests.
- Netlify for hosting. The game server is one Netlify Function (`netlify/functions/api.mts`) that stores profiles in Netlify Blobs. We chose Blobs over Supabase on Nov 27 because Blobs needs no extra account or keys, so deploying stays a one-click job. Use the Kiro power for Netlify when working on deployment.
- The server's rules live in `src/server/` and use only web standards (`Request`, `Response`, `crypto`), so the same handler runs on Netlify, in Vite's dev and preview servers (`src/server/devMiddleware.ts`) and in the browser when offline (`src/net/backend.ts`). Never use Node-only APIs in `src/server/` except in `devMiddleware.ts`.

## Commands
| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| All tests | `npm test` |
| Simulation tests only | `npm run test:sim` |
| Type check | `npm run typecheck` |
| Production build | `npm run build` (type check, then Vite build into `dist/`) |
| Browser smoke test with screenshots | `npm run build`, then `npm run smoke` |
| Asset credit check | `npm run check:assets` |

## Architecture rules
1. `src/sim/` holds the game's rules: pure, deterministic TypeScript. It must not import Three.js or touch the DOM, and must not use `Math.random`, `Date`, `performance.now` or timers. Randomness comes from `createRng(seed)`; time comes from the tick count. `src/sim/purity.test.ts` enforces this.
2. The simulation runs at a fixed 30 ticks per second (`TICK_SECONDS` in `src/sim/balance.ts`). Rendering runs at the display's frame rate and interpolates between the last two simulation states.
3. `src/render/` draws the simulation state and never changes it. Anything that only looks nice (waves, bobbing, leaning, particles) lives in the renderer.
4. Every gameplay number lives in `src/sim/balance.ts`. Do not hard-code speeds, damage, costs or timers anywhere else.
5. Battles must be reproducible from the seed, the defender's layout and the attacker's inputs, so the server can replay them. Think about this before adding any state that is not derived from those three.

## Performance budget
- 60 fps on a laptop with integrated graphics at 1080p, using the Low graphics setting if needed.
- First download under 15 MB. Each model file under 300 KB.
- At most 150 draw calls and 4 point lights per frame. Repeated props (trees, rocks, tombstones) use `InstancedMesh` or merged geometry.
- Dispose geometries, materials and textures when a scene is torn down.
- The smoke test reads draw calls and point lights from the debug API and fails if the budget is broken.

## Security
- No secrets in the repo. Keys go in Netlify or Supabase environment variables.
- The client is untrusted. The server validates every raid result, cost and reward. Supabase tables use row-level security.
- Build DOM with `textContent`, never by putting player-supplied text into `innerHTML`.
