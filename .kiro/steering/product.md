---
inclusion: always
---
# Product: Ghostlight Isles

Ghostlight Isles is a 3D multiplayer pirate game that runs in the browser. Players sail a fog-covered sea at night, capture haunted islands, build defenses on their home island, raid other players' saved islands, and survive raids from a ghost fleet that sails under the Blood Moon.

It is our entry to Kiroween 2026 on Devpost, in the **Costume Contest** category. That category is judged on a polished, spooky interface where the spooky design helps the app work.

The full brief is in `Documents/idea-brief.md`. Rules and starting numbers are in `Documents/game-design.md`.

## Who uses it
- Players who like base-building strategy games and pirate games, and want to play in a browser without installing anything.
- Hackathon judges, who will give the game a few minutes. A judge must reach a fun moment within 2 minutes: guest login, a short tutorial, bot islands so the world is never empty, and demo buttons such as "Summon the Blood Moon".

## Design pillars
1. **The spooky look does a job.** Fog hides islands and ships, lanterns reveal ghosts, night and the Blood Moon raise the danger. Never add a spooky effect that hides information the player needs.
2. **Readable at a glance.** Living things use warm lantern light (`#FFB347`), the dead use spectral green (`#5CFFB0`). Never rely on color alone: ghosts also shimmer, trail wisps and have a distinct silhouette.
3. **Fair multiplayer.** Raids are asynchronous: the attacker fights a saved copy of the defender's island. The server replays every battle from its seed and inputs, and rejects results that do not match.

## Scope for the hackathon (deadline Dec 4, 2026, 2:00 PM PT)
- **In:** 3D sailing, capturing islands (fort battle or the Lantern Lines puzzle), base building, raids with reports and protection, the ghost fleet, the Blood Moon, cursed gold, Davy Jones' Locker, the Halloween weapons and defenses in the design doc, guest login, a leaderboard.
- **Only if ahead:** Possession, Trick or Treat, Mary Celeste drifters, the Kiro Crew app.
- **Out until after the hackathon:** live ship-to-ship multiplayer, clans, chat, the Hollow Sea, the Flying Dutchman, LLM parley.

## Content rules
- Never use other games' names, logos, screenshots or footage in the game, the README, the video or the Devpost page. Folklore (Davy Jones' Locker, the Flying Dutchman, Samhain, the Black Spot) is fine. Disney's Pirates of the Caribbean designs are not.
- Every third-party asset must be CC0, CC-BY, OFL or MIT, and must be listed in `Documents/credits.md` before it is committed.
- Use plain English in the UI: short labels, and no jokes that hide what a button does.
