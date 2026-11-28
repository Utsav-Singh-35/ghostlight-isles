# How I used Kiro to build Ghostlight Isles

Draft for the Devpost "How I used Kiro" field. Facts come from `Documents/kiro-usage-log.md` and the repo. Lines marked **[check]** need your own answer before you paste this in.

---

I built Ghostlight Isles solo for Kiroween 2026: a 3D pirate base-building game in the browser with asynchronous raids, a ghost fleet and a server that replays every battle. I brought the idea and made the calls (3D over 2D, MongoDB accounts, asynchronous raids over live multiplayer). Kiro's agent wrote the specs, the code, the tests and the tooling, and checked its own work in a real browser.

The repo shows the result: 13 specs with 88 numbered correctness properties, 154 unit and property tests, a 73-check browser smoke test, and one commit per working feature.

## Kiro surfaces

I worked in the **Kiro IDE**, in chat with the agent, from the first brainstorm to the final README. **[check]** If you also used Kiro CLI, Web or Crew, say where and how it differed; otherwise keep this to the IDE.

## Spec-driven development

Every game system got a spec in `.kiro/specs/` before any of its code: sailing, combat, persistence, island capture, base building, raids, the ghost fleet, Davy Jones' Locker, sound and the tutorial. Each has requirements in EARS form, a design with numbered correctness properties, and a task list that ends in a browser smoke test.

The game needed this more than most projects. Raids are asynchronous: you attack a saved copy of another player's island, and the server replays your battle from its seed and your inputs before paying any loot. That only works if the rules are deterministic and written down exactly. A spec turned "the server replays raids" into checkable statements, such as "loot is bounded and conserved" and "a sunk ship can't capture, raid or fight a siege".

Compared with prompting feature by feature, specs changed three things:

- **The tests came first, in plain words.** Each property in a design became a fast-check test with the same number and name, so a failure points back to a sentence in the spec.
- **Requirements were revised on purpose.** When a test showed a rule was wrong, the spec changed with the code. Property 9 of the combat spec ("every keep is within reach") was added after an example test found forts whose keeps no ship could hit, and widened later when a balance report found the same problem on big islands.
- **Scope stayed honest.** Each spec says what is in and what is out, so features that weren't needed for judging stayed out.

## Property-based testing

fast-check runs every rule over hundreds of random inputs. Things it caught or guarded:

- **A floating-point bug in the waves** (sailing spec). `wavePhases` returned exactly 2π for t = 5e-324 s, because −5e-324 + 2π rounds to 2π. No hand-written example would try that time. The shrunk counterexample is now a regression test.
- **The server and the rules can't drift apart** (base-building Property 4). Random sequences of build, upgrade and remove commands go through the real request handler, and the saved profile must equal the pure rules applied in order, down to the refusal messages.
- **A shared clock with no server timer** (ghost-fleet Property 1). The Blood Moon is computed from the time alone, and the property checks it over 500 random times from 1970 to 2100.
- **Important sounds are never dropped** (sound Property 4). When a busy battle frame has more sounds than voices, sinkings, explosions and mines always play.

One lesson: calling `expect()` on every tick of thousands of simulated battles made a property take 12.7 s. Plain comparisons per tick and one `expect()` per run brought the battle suite to about 2.5 s.

## Agent hooks

Four hooks in `.kiro/hooks/` automate the checks I would otherwise forget:

- **Session brief** (session start): the time left before the deadline and the next feature in the build plan.
- **Commit gate** (before shell commands): blocks `git commit` unless tests, the type check and the asset-credit check pass. On the first feature commit it caught a real problem: every test failed when the suite started from a lowercase `c:\` path, because Vitest loaded itself twice. The tests had passed in my own terminal. A small wrapper script fixed it.
- **Simulation tests on save** (after saving a file in `src/sim/`): runs the simulation tests and asks the agent to read any shrunk counterexample, decide whether the code, the property or the requirement is wrong, and log it. During the balance pass it ran after every change to the battle rules.
- **Asset credits** (after creating a file under `public/`): checks that every third-party asset is credited with an allowed license.

## Steering

- **Always included:** `product.md` (pillars, scope, content rules), `tech.md` (stack, architecture rules, performance budget, security) and `structure.md` (folders and import rules).
- **Included by file match:** simulation conventions for `src/sim/`, rendering rules for `src/render/`, testing conventions for test files. They load only when they matter, which keeps context small.
- **Included automatically for gameplay work:** `game-design.md`, which pulls in the live design document, so balance numbers are always at hand.
- **Manual:** `hackathon.md`, which pulls in the submission checklist and the usage log for writing the README, the video script and this text.

What worked best was recording decisions with their reasons. Once `tech.md` said "we chose Netlify Blobs over Supabase on Nov 27 because Blobs needs no extra account or keys", later sessions followed it instead of reopening it. The performance budget in steering (150 draw calls, 4 point lights) became an automatic check in the smoke test.

## The browser smoke test

The last task of every spec is a smoke test in real Chrome (Playwright), which plays the feature and saves screenshots. It caught bugs no unit test could:

- the glowing puzzle beam was drawn over the mirrors and swallowed clicks;
- the full-screen Davy Jones' Locker layer covered its own escape puzzle;
- reviewing the screenshots showed an island label left floating over a siege.

## Custom agents, MCP and powers

- **Custom agents:** none. Steering and specs gave the built-in agent the project knowledge it needed. **[check]**
- **MCP:** none. The game needs no outside services during development, and every check runs as a local script through hooks. **[check]** If you use the Netlify power or an MCP server when deploying, describe it here.
- **Powers:** **[check]** `tech.md` says to use the Kiro power for Netlify when deploying. Fill this in after you deploy.

## What I'd tell another builder

Write the rules down before the code, and give every rule a number and a test. Then let hooks run those tests for you. The agent moves fast, and the specs, property tests and hooks are what made that speed safe.
