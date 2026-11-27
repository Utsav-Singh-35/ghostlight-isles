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
