# Demo video script (target 2:45, hard limit 3:00)

Judges may stop at 3:00, so the game is on screen within the first five seconds and the whole loop is shown by 2:20. Record on the laptop the game was built on (Intel Iris Xe), in Chrome at 1920×1080, with the game's own sound. Use no music you didn't make; the game's sea, bells and wails are enough.

## Before recording

- Deploy first and record the live URL, so the video shows what judges will open.
- Open the game once in a fresh browser profile so the Captain's orders start at 1 of 7.
- Use `?calm` so the shared Blood Moon doesn't start a siege in the middle of another scene. "Summon the Blood Moon" still works.
- For retakes, `?skipIntro` skips the title screen. Taking Coffin Rock takes about 40 seconds of real play; record all of it and cut to the best 20 seconds.
- Keep the mouse still unless a shot needs it. Hide the bookmarks bar; use full screen (F11).

## Script

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:10 | Title screen: the lighthouse, the ship, the tagline | "The dead sail at night. Keep your lanterns lit. This is Ghostlight Isles, a 3D pirate base-building game that runs in a browser tab." |
| 0:10–0:22 | Click **Set sail**. Point at the Captain's orders card and the captain's name, gold and ectoplasm | "There's nothing to install. Your captain is created the moment you arrive, and the Captain's orders card tells you what to try next." |
| 0:22–0:42 | Raise sails (W, W), steer (A/D) toward Coffin Rock through the fog; the labels read "Haunted · 200 m" | "Fog hides the islands. Warm light is yours, spectral green is haunted, and every label also says it in words, so color is never the only cue." |
| 0:42–1:05 | At Coffin Rock press **1**; circle the fort firing Q and E; a tower explodes, the ghost light falls; result card. Then a quick shot of a far island's label, "Haunted · fort 5" | "To take an island you break its fort before dawn. The further you sail, the harder the forts: bigger islands, taller walls, more towers, and ghost ships that rise from the island to hunt you. The server replays the battle before the island is yours." |
| 1:05–1:20 | Press **Tab**, build a Spirit Lantern on Last Light; the camera flies home | "Back home on Last Light you build defenses. Spirit Lanterns matter, because ghosts hide in the fog until a lantern lights them." |
| 1:20–1:55 | Press **Summon the Blood Moon**: the night turns red, the bell tolls, the siege starts. Sail at a faint ghost until your lantern lights it, fire Q/E with Salt Shot, a ghost wails and sinks | "Every twenty minutes the Blood Moon rises for every player at once, and the ghost fleet comes for your island. You don't need to read the warning: the sky turns red and the bell tolls. Cannonballs do half damage to ghosts; Salt Shot does full damage, but only once your lantern finds them." |
| 1:55–2:15 | After the siege press **R**, raid a rival; show a broadside, the result card with stars, then **L** for the leaderboard | "You can raid other captains while they're offline. You fight a saved copy of their island, and the server replays your battle from its seed and your inputs before it pays any loot, so results can't be faked." |
| 2:15–2:25 | Cut to a sunk ship waking in Davy Jones' Locker: teal, blurred, bubbles, the Ferryman's offer | "Sink, and you wake in Davy Jones' Locker. Solve the escape in ninety seconds, or pay the Ferryman." |
| 2:25–2:48 | Kiro: the `.kiro/specs` folder, one spec's numbered properties, tests passing, the commit gate hook, the smoke test's screenshot folder | "I built it with Kiro, spec first. Twelve specs, seventy-seven numbered properties, each one a property-based test. Hooks run the tests on every rules change and block bad commits, and a browser smoke test plays every feature in real Chrome." |
| 2:48–2:55 | The live URL and the repo on screen over the sailing view | "Ghostlight Isles. Play it free at [your URL]. Built for Kiroween 2026." |

About 330 words of voice-over, which fits 2:45 at a calm pace. If a take runs long, shorten the raid scene first.

## Shots to capture separately

- A Davy Jones' Locker shot (2:15). The quickest way: raid the strongest rival from the raid list with a new captain and sit under its guns until the ship sinks.
- A close-up of a ghost sinking with its wail, for the siege scene.
- The terminal running `npm test`, and the commit gate hook in `.kiro/hooks/commit-gate.json`, for the Kiro scene.
