---
inclusion: always
---
# Tech stack and architecture

## Stack
- TypeScript (strict), bundled by Vite. Node 22 for tooling.
- Three.js with `WebGLRenderer` (WebGL 2 only). Import addons from `three/addons/...`.
- Vitest for tests, fast-check for property-based tests.
- Netlify for hosting. The game server is one Netlify Function (`netlify/functions/api.mts`) that stores every record in MongoDB Atlas (database `ghostlight`) through `src/storage/mongoStore.ts`. On Nov 28 we moved from Netlify Blobs to MongoDB, at the owner's request, for real accounts: unique usernames need an atomic insert, and Atlas shows each captain as a readable document. The only server package is the `mongodb` driver: password hashes (PBKDF2) and login tokens (HS256 JWTs) use Web Crypto, with no extra libraries. Use the Kiro power for Netlify when working on deployment.
- The server's rules live in `src/server/` and use only web standards (`Request`, `Response`, `crypto`), so the same handler runs on Netlify, in Vite's dev and preview servers (`src/server/devMiddleware.ts`) and in the browser when offline (`src/net/backend.ts`). Never use Node-only APIs in `src/server/` except in `devMiddleware.ts`. Node-only storage (the MongoDB driver) lives in `src/storage/`, which the browser never imports.

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
- No secrets in the repo. `MONGODB_URI`, `MONGODB_DB` and `JWT_SECRET` go in Netlify's environment variables and a local `.env` (git ignores it; `.env.example` lists the names). Never print them, log them or paste them into tests.
- The client is untrusted. The server validates every raid result, cost and reward, and every token.
- Build DOM with `textContent`, never by putting player-supplied text into `innerHTML`.
