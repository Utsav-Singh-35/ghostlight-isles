# How we used Kiro: running log

Notes for the "How I used Kiro" write-up. Add an entry whenever a Kiro feature changes what we build or catches a problem.

## Setup
| Kiro feature | What we set up | Why |
|---|---|---|
| Steering (always) | `product.md`, `tech.md`, `structure.md` | Every session knows the product, the stack, the architecture rules and the performance budget |
| Steering (file match) | `simulation.md` for `src/sim/**`, `rendering.md` for `src/render/**`, `testing.md` for `*.test.ts` | Conventions load only when they matter, which keeps context small |
| Steering (auto) | `game-design.md`, which pulls in `Documents/game-design.md` with a live file reference | Balance numbers load whenever we work on gameplay |
| Steering (manual) | `hackathon.md`, which pulls in the submission checklist and this log | Used with `#hackathon` when writing the README, video script and Devpost text |
| Specs | One spec per game system in `.kiro/specs/`, starting with `sailing` | Requirements in EARS format, a design with numbered correctness properties, and tasks |
| Property-based testing | fast-check tests named after the spec's properties | The simulation must be deterministic for raid replays, so we test rules over thousands of random inputs |
| Hooks | Run simulation tests on save, credit check for new assets, commit gate, session brief | See `.kiro/hooks/` |

## Log
| Date (IST) | What happened | Kiro feature | Outcome |
|---|---|---|---|
| Nov 27 | Wrote the steering files and the `sailing` spec before any game code | Steering, specs | The spec's 14 correctness properties became the test plan |
| Nov 27 | Simulation core: Properties 1 to 12 passed on the first run, 21 tests in about 1 second | Property-based testing | Gave confidence that collisions, rates and determinism hold for random starts near shores and the world's edge |
| Nov 27 | A wave test found that `wavePhases` returned exactly 2π for t = 5e-324 s, because −5e-324 + 2π rounds to 2π | Property-based testing | Fixed the wrap and kept the shrunk counterexample as a regression test. An example-based test would never have tried that time |
| Nov 27 | Added four hooks: session brief (SessionStart), commit gate (PreToolUse, blocks `git commit` when tests, types or credits fail), sim tests on save (PostFileSave on `src/sim/`) and asset credit check (PostFileCreate under `public/`) | Hooks | Every session starts knowing the deadline and the next feature; a broken simulation can't be committed |
| Nov 27 | The smoke test drove the real build in Chrome on Intel Iris Xe: 60 fps, 22 draw calls (budget 150), 3 point lights (budget 4) | Steering (performance budget in `tech.md`) | The budget written into steering became an automatic check |
| Nov 27 | The commit gate hook blocked the first feature commit: every test file failed when `npm test` started from `c:\...` (lowercase drive), because Vitest loaded itself twice under two path spellings. Tests had passed from my own terminal | Hooks | Added `scripts/vitest.mjs`, which fixes the drive letter before starting Vitest. Without the gate, a test suite that only works from some terminals would have been committed |
| Nov 27 | Reviewed the smoke-test screenshots: the moon sat above the frame, the moon glitter and lantern pools were too bright, and hidden island labels still showed | Smoke test screenshots | Lowered the moon, tightened the glitter and fixed a CSS rule that overrode `hidden` |
