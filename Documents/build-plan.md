# Build plan

Deadline: **Fri Dec 4, 2:00 PM PT = Sat Dec 5, 3:30 AM IST.** Our target is to submit by **Fri Dec 4, 10:00 PM IST**.

## Features, in build order
Each feature gets its own spec in `.kiro/specs/`, passes its tests and the smoke test, and then gets one commit. Tick a box when the feature is committed.

- [x] **F1 Sailing** (spec `sailing`): 3D night sea, sky, fog, islands, a ship with two crew, sailing and steering, chase camera, HUD, intro screen, Low/High graphics. Fri Nov 27.
- [x] **F2 Combat core** (spec `combat`): deterministic battle simulation (cannons, towers, damage, sinking) with property tests, and the 3D battle view. Sat Nov 28.
- [x] **F3 Capturing islands** (spec `island-capture`): fort battles and the Lantern Lines puzzle. Sun Nov 29.
- [x] **F4 Accounts and saving** (spec `persistence`): guest login and saved progress, served by a Netlify Function with Netlify Blobs, or offline in the browser. Sun Nov 29.
- [ ] **F5 Base building** (spec `base-building`): place and upgrade defenses on the home island, resources and storage. Mon Nov 30.
- [ ] **F6 Raids** (spec `raids`): raid saved islands, server replay check in a Netlify Function, raid reports, protection timer, leaderboard. Tue Dec 1.
- [ ] **F7 Ghost fleet** (spec `ghost-fleet`): the Blood Moon clock, ghost raids on the weakest island, cursed gold, Salt Shot and Spirit Lanterns. Tue Dec 1.
- [ ] **F8 Davy Jones' Locker** (spec `davy-jones-locker`): sinking, the seabed escape puzzle, the Ferryman. Wed Dec 2.
- [ ] **F9 Polish**: sound, effects, tutorial, balance, bug fixes, playtests with real people. Wed Dec 2 to Thu Dec 3.
- [ ] **Submission**: README, blog post, social post, video, Devpost write-up. Thu Dec 3 to Fri Dec 4.

## Checkpoints
| When (IST) | Check | If it fails |
|---|---|---|
| Fri Nov 27, night | The live URL shows the ship sailing at 60 fps on the laptop | Fix performance before adding features |
| **Sat Nov 28, night** | The 3D battle view works | Switch the renderer to 2D. The simulation stays the same |
| Tue Dec 1, 12:00 noon | Raids work end to end | Drop the server replay check to a simple sanity check, keep raids |
| Tue Dec 1, before 11:30 PM | Free Kiro credits requested (closes Wed Dec 2, 1:30 AM IST) | |
| Thu Dec 3, night | Everything playable, bugs only from here | Cut features from the list below |

## Cut list (cut from the top first)
1. Possession, Trick or Treat, Mary Celeste drifters, Kiro Crew app
2. Davy Jones' Locker (a sunk ship just respawns at home)
3. Bat Swarm and Jack-o'-lantern Mines
4. Bone Catapult
5. The Lantern Lines puzzle (capture by fort battle only)

Never cut: the Blood Moon, the ghost fleet, raids, the two-threat defense. They are what makes the game different.

## Commit rules
- One commit per working feature, after `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke` and `npm run check:assets` pass.
- Commit messages say what the player can now do, for example "Add 3D night sea with a sailing ship".
- Push to `origin main` after each commit. Netlify redeploys the live URL from `main`.
