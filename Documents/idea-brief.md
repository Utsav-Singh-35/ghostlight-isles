# Ghostlight Isles: idea brief

**One line:** a 3D pirate game in the browser where you capture haunted islands, build a base on your home island, raid other players, and keep your lanterns lit against the ghost fleet that sails under the Blood Moon.

**Hackathon:** Kiroween 2026 on Devpost. Category: **Costume Contest**. Solo build by Utsav Singh, Nov 27 to Dec 4, 2026.

## The story (for the intro and the video)
On Samhain, the Gaelic festival that Halloween partly grew from, the wall between the living and the dead was said to grow thin. In the Ghostlight Isles it never closed. Every night the dead sail out of the fog, and only islands that keep their lanterns lit survive. You start with a small ship, two crew and one lit island called Last Light.

## The core loop
1. **Sail** a fog-covered sea at night. Lantern glows through the fog show where islands are: warm light is yours, spectral green is haunted.
2. **Capture** a haunted island by beating its fort in a ship battle or by solving its Lantern Lines puzzle.
3. **Build** defenses on your home island with the gold and ectoplasm you collect.
4. **Raid** other players' islands. You fight a saved copy of their base, so they can be offline.
5. **Survive** the ghost fleet. When the Blood Moon rises, it attacks the weakest island that isn't protected.

## What makes it different
- **Two kinds of enemy need two kinds of defense.** Ghost ships take half damage from cannons, and only Spirit Lanterns and Salt Shot hit them at full strength. A base built only against players falls to ghosts, and a base built only against ghosts falls to players.
- **The Blood Moon is a shared clock.** Every 20 minutes the moon turns red for 3 minutes for every player at once, so the world feels shared without live multiplayer.
- **Cursed gold is a choice.** Ghost loot pays double, but the fleet hunts islands holding the most of it. Spend it fast or cleanse it at a chapel.
- **Dead crew come back.** A crew member killed in battle returns as a ghost for 3 battles with a stronger ability, then fades unless you spend ectoplasm to keep them.
- **Davy Jones' Locker.** When your ship sinks, you wake on the seabed and solve an escape puzzle, or pay the Ferryman, to sail back.
- **The spooky look does a job.** Fog hides information, lanterns reveal it, and the Blood Moon raises the danger. This is what the Costume Contest category asks for.

Comparable games, for our own reference only: island-base strategy games already have bases on islands and attacks from a gunboat, and pirate adventure games already have ghost fleets. None of them combine base building with ghosts that need their own defenses, a shared Blood Moon clock and cursed loot. These comparisons stay out of the game, the README, the video and the Devpost page.

## Prizes we aim for
| Prize | Amount | What it needs |
|---|---|---|
| Overall 1st, 2nd or 3rd | $30K, $20K, $10K | High scores on all five criteria |
| Best Costume Contest | $5K | Best spooky, polished interface in the category |
| Best Demo | $1K | Best Presentation score among the top 10% |
| Bonus Blog Prize | 2,000 Kiro credits | A blog post about building it with Kiro, published during the submission period |
| Social Blitz | 3 months of Kiro Pro+ | A post starting with #KiroweenHackathon26 |
| Best Kiro Crew App | $1K | Only if we are ahead of schedule: a "Ghost Admiral" Crew app that posts raid warnings |

A project wins either an overall prize or a category prize, plus any bonus prizes.

## How each judging criterion is covered (20% each)
- **Potential Impact:** real players during the week (friends, the Kiro Discord), shown on the leaderboard in the video. Guest login so anyone can play in seconds.
- **Technological Implementation:** specs for every system, steering for rules and balance numbers, property-based tests on the simulation, hooks that run tests and guard commits, the Netlify and Supabase powers, and a server that replays raids to catch cheaters.
- **Design:** one consistent low-poly night look, readable at a glance (warm = living, green = dead, never color alone), a 2-minute path to the first fun moment.
- **Innovation:** the two-threat defense, the shared Blood Moon, cursed gold and returning ghost crew.
- **Presentation:** a video under 3 minutes that shows sailing, a capture, a raid and a Blood Moon attack, with no third-party trademarks or music.

## Scope
- **In:** 3D sailing, capturing islands, base building, raids with reports and protection, the ghost fleet, the Blood Moon, cursed gold, Davy Jones' Locker, the weapons and defenses in `game-design.md`, guest login, a leaderboard.
- **If ahead:** Possession, Trick or Treat, Mary Celeste drifters, the Kiro Crew app.
- **After the hackathon:** live ship-to-ship play, clans, chat, the Hollow Sea, the Flying Dutchman, bargaining with ghost captains through an LLM.

## Risks
| Risk | What we do about it |
|---|---|
| 3D takes longer than planned | Checkpoint Saturday Nov 28 night: if the 3D battle view isn't working, switch the renderer to 2D. The simulation doesn't change. |
| Cheating in raids | The server replays every raid from its seed, layout and inputs. |
| Empty world for judges | About 10 bot islands, plus demo buttons such as "Summon the Blood Moon". |
| Slow on judges' laptops | Performance budget in steering, a Low graphics setting, and a smoke test that fails if the budget is broken. |
| Running out of time | The cut list in `build-plan.md`. |
