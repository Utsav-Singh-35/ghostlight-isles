# Devpost project page: draft

Paste each section into the matching Devpost field. Replace the **[fill in]** items before submitting.

**Project name:** Ghostlight Isles

**Tagline (under 200 characters):** A 3D pirate game in your browser: capture haunted islands, build a base, raid other captains, and keep your lighthouse lit when the ghost fleet sails under the Blood Moon.

**Category:** Costume Contest

**Links**
- Play: **[fill in: Netlify URL]**
- Code: https://github.com/Utsav-Singh-35/ghostlight-isles
- Video: **[fill in: YouTube URL]**

**Built with:** typescript, three.js, vite, web-audio-api, netlify, netlify-functions, mongodb, vitest, fast-check, playwright, kiro

---

## Inspiration

I love base-building strategy games and pirate stories, but most of them need an install and an account before you can play. I wanted one that opens in a browser tab, gives you a ship in seconds, and uses Halloween for more than decoration. Folklore says that on Samhain the wall between the living and the dead grows thin. In Ghostlight Isles it never closed: every night the dead sail out of the fog, and only islands that keep their lanterns lit survive.

## What it does

You start with one small ship, two crew and one lit island, Last Light. Every other island is haunted.

- **Sail** a foggy night sea in 3D. Island labels say in words whether an island is yours or haunted, and how far away it is.
- **Capture islands** by breaking their forts from your ship before dawn. Captured islands pay gold every minute.
- **Forts get harder the further you sail.** Five fort levels: harder islands are bigger, with taller walls, more and stronger towers, mines, a bigger keep, a longer dawn clock and ghost ships that rise from the island to hunt you. A new ship takes the first forts; the last ones need a fully refitted ship.
- **Build your base** on Last Light: Cannon Towers, Spirit Lanterns, Bone Catapults and Jack-o'-lantern Mines, three levels each. Refit your ship with a stronger hull, more cannons, Salt Shot, Witchfire barrels and a Bat Swarm.
- **Raid other captains** while they're away. You fight a saved copy of their island, and the server replays the battle from its seed and your inputs before paying any loot. Raided islands get 4 hours of protection and a report. Ten rival captains keep the sea busy from the first minute, and a leaderboard ranks everyone by infamy.
- **Survive the Blood Moon.** Every 20 minutes the moon turns red for every player at once and a ghost fleet sails for your island. Ghosts take half damage from cannonballs; Salt Shot and Spirit Lanterns hit them at full strength. A base built only against players falls to ghosts.
- **Mind your cursed gold.** Ghost loot spends like gold, but every 150 you hold adds a ship to the next fleet, until the chapel cleanses it.
- **Escape Davy Jones' Locker.** When your ship sinks you wake on the seabed: solve a timed Lantern Lines escape or pay the Ferryman. One crew member drowns and comes back as a ghost, stronger for three battles.

A **Captain's orders** card walks new players through all of it, ticking each step off as they do it. Judges can press **Summon the Blood Moon** at any time instead of waiting for the shared one.

### How the spooky design does a job

- Fog hides ghosts, and your guns can't aim at them until a lantern lights them, so light is a weapon.
- Living things glow lantern orange; the dead glow spectral green. Color is never the only cue: ghosts are see-through, shimmer, trail wisps and have their own silhouette.
- When the Blood Moon rises, the sky, sea and fog turn red, a ship's bell tolls and a heartbeat starts, so you know the fleet is coming before you read anything.
- Every sound is made in code, and the important ones (a ship sinking, a tower falling, a ghost's wail) always play and pan toward where they happened.
- In Davy Jones' Locker the picture turns teal and blurs, bubbles rise and every sound is muffled.

## How I built it

- **TypeScript, Three.js and Vite**, with no game engine. Every model, texture and sound is made in code, so the whole game is about 200 KB gzipped and needs no asset downloads.
- **A deterministic simulation:** pure functions at 30 ticks per second with seeded randomness, so a battle is fully decided by its seed, the defender's layout and the attacker's inputs. The renderer and the sound only read it.
- **One server in three places:** the game's server rules use only web standards, so the same code runs as a Netlify Function with MongoDB, inside Vite's dev server, and in the browser when offline.
- **Kiro, spec first:** 13 specs written before their code, 88 numbered correctness properties, each one a fast-check property test, hooks that run tests on every rules change and block bad commits, and steering that holds the architecture rules, the performance budget and the game's numbers. More in the "How I used Kiro" section.

## Challenges I ran into

- **Keeps out of reach.** A test of a scripted captain attacking the first fort showed it could sink every tower but never the keep: broadsides didn't reach an island's centre from its shore. Later, a balance report showed the same on big islands for a captain sailing a little off the shore. Both times the fix came with a stronger property, so a balance change can't make forts untakeable again.
- **Trusting nobody.** The client is untrusted, so every capture, raid and siege is replayed on the server, puzzles are checked there, and every cost is charged there. Making the simulation deterministic enough for that took discipline: no `Math.random`, no clock, no DOM in the rules, enforced by a test.
- **Bugs only a browser shows.** The puzzle's glowing beam swallowed clicks, and the Locker's full-screen layer covered its own escape puzzle. A smoke test that plays the real build in Chrome found both.
- **Staying fast on a laptop.** The target was 60 fps on integrated graphics. The game draws 18 to 38 draw calls (budget 150) with 3 point lights (budget 4), and the smoke test fails if that budget is broken.

## Accomplishments that I'm proud of

- A complete loop (sail, capture, build, raid, survive, sink, escape) that a new player can try in two minutes.
- Fair asynchronous multiplayer with no way to fake a result.
- A spooky look and sound that carry real information.
- Sound with no audio files at all.

## What I learned

Writing rules down as numbered properties before the code made the work faster, not slower: each failing test pointed at one sentence in a spec, and the fix was either the code or that sentence. Hooks that run the checks automatically meant I never had to remember to.

## What's next for Ghostlight Isles

Playtests with real players first. After that: live ship-to-ship battles, clans and chat, the Flying Dutchman, and bargaining with ghost captains.

## Prior work

None. Everything in the repo was written during the hackathon, apart from open-source libraries.
