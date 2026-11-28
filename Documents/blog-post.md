# Blog post: draft

Publish on an external blog (dev.to, Medium, Hashnode or your own site) during the submission period, then put its URL in the Devpost form. The Bonus Blog Prize requires the post to say it was written for Kiroween 2026; the first and last paragraphs both do. Add two or three screenshots from `Documents/screenshots/` where marked.

---

# Keep your lanterns lit: building a haunted pirate game with Kiro

*I wrote this post for Kiroween 2026, the Kiro hackathon on Devpost. My entry, Ghostlight Isles, is in the Costume Contest category.*

Ghostlight Isles is a 3D pirate game that runs in a browser tab. You get one small ship, two crew and one lit island. Every other island is haunted. You capture islands by breaking their forts, which get harder the further you sail, build defenses at home, raid other players' islands while they're offline, and every twenty minutes the Blood Moon rises and a ghost fleet sails for your lighthouse.

[Screenshot: `02-sailing.png`, the ship sailing at night toward a haunted island]

## Halloween that does a job

The Costume Contest is judged on a polished, spooky interface where the spooky design helps the app work. So I set one rule early: never add a spooky effect that hides information the player needs. Every effect had to carry meaning.

- **Fog hides ghosts.** Your guns can't aim at a ghost until a lantern lights it: your ship's stern lantern, a Spirit Lantern on your island, or a swarm of bats. Light becomes a weapon.
- **Warm is alive, green is dead.** Living ships and towers glow lantern orange, and ghosts glow spectral green. Because color can't be the only cue, ghosts are also see-through, shimmer and trail wisps, and island labels say "haunted" or "yours" in words.
- **The Blood Moon warns you.** The sky, sea and fog turn red, a ship's bell tolls and a heartbeat starts. You know the fleet is coming before you read anything.
- **Sinking feels like sinking.** When your ship goes down you wake in Davy Jones' Locker: the picture turns teal and blurs, bubbles rise, and every sound is muffled as if under water.

[Screenshot: `14-siege.png`, the ghost fleet besieging Last Light under the Blood Moon]

## Fair raids without live multiplayer

Real-time multiplayer was too much for one person in a week, but I wanted players to fight each other. The answer was asynchronous raids: you attack a saved copy of someone's island, and its defenses fight on their own.

That raises a problem. If the browser reports "I won", anyone can cheat. So the battle rules are a deterministic simulation: pure functions, a fixed 30 ticks per second, and randomness only from a seed. A battle is fully decided by its seed, the defender's layout and the attacker's inputs. The browser sends its inputs, the server replays the whole battle, and loot is paid only for what the replay says happened.

The same server code runs in three places: as a Netlify Function that saves captains in Netlify Blobs, inside the local dev server, and in the browser when there's no connection. Judges never meet a broken page.

## Spec first, with Kiro

I built the game with Kiro, the AI IDE, and the most useful habit was writing each system down before any code. Every system, from sailing to the Locker, got a spec: requirements, a design with numbered "correctness properties", and tasks. Each property is a sentence like "a sunk ship can't capture, raid or fight a siege", and each one became a property-based test with the same number. The game has 70 of them.

Property-based tests run a rule over hundreds of random inputs, and they found things I would never have written examples for. My favorite: the wave math returned exactly 2π instead of something just below it when the time was 5e-324 seconds, the smallest number a double can hold, because subtracting it from 2π rounds back to 2π. The test shrank its failure down to that one value, and it's now a regression test.

Not every bug needs randomness. A test of a scripted captain attacking the first fort found that it could sink every tower but never the keep at the island's heart, because broadsides didn't reach that far from the shore. The fix raised the ranges and added a property: every keep is within reach. Later, a balance report ran a new captain against every fort in the sea and found the same problem on the biggest islands for a ship sailing just off the shore. The property got stronger, and the report became a test.

## Hooks that remember for me

Kiro's agent hooks run on events, and I set up four:

- a **session brief** that starts each session with the time left and the next feature;
- a **commit gate** that blocks a commit unless the tests, the type check and the asset-credit check pass;
- a **test run after every change to the game rules**, which asks the agent to read any failing property's counterexample and decide whether the code, the property or the requirement is wrong;
- a **credit check** for any new art or sound file.

The commit gate paid for itself on the first feature. Every test failed when the test runner started from a path with a lowercase drive letter, `c:\` instead of `C:\`, because the runner loaded itself twice under two spellings. The tests had passed in my own terminal, so I would have committed a suite that only worked on some machines.

## Bugs only a browser shows

The last task of every spec is a smoke test that plays the real build in Chrome and saves screenshots. It found bugs that unit tests can't see: the glowing beam in the Lantern Lines puzzle was drawn on top of the mirrors and swallowed clicks, and the full-screen Davy Jones' Locker layer covered its own escape puzzle. Looking at its screenshots, I also found an island label left floating over a battle.

[Screenshot: `15-davy-jones-locker.png`, the Ferryman's offer]

## Sound with no sound files

Every sound in the game is made in code with the Web Audio API: the sea is filtered noise that swells, cannons are a noise burst over a falling tone, and a sinking ghost is a sine wave sliding down with a wobble and a long echo. There are no files to download or license. The rule that decides which sounds play in a busy frame has its own property: sinkings, explosions and mines are never dropped, because they carry news.

## What I'd do again

Write the rules down first, give each one a number and a test, and let hooks run the tests. The agent writes code quickly; the specs and checks are what made it safe to accept that code.

You can play Ghostlight Isles at **[your URL]**, and the code, specs and hooks are at https://github.com/Utsav-Singh-35/ghostlight-isles. Thanks for reading, and thanks to the Kiroween 2026 organizers for the excuse to build something spooky.
