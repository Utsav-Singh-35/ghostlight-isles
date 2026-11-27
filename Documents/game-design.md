# Ghostlight Isles: game design

Numbers marked **(code)** are live in `src/sim/balance.ts`; the code wins if the two disagree. All other numbers are starting values to tune when each system is built.

## The world
- A round sea **1,100 m** in radius (code), generated from a seed. **14 islands** (code): your home island, Last Light, at the centre, and 13 haunted islands.
- Islands keep at least **70 m** of open water between their shores and stay **140 m** inside the edge of the world (code). The first haunted island always sits 220 to 280 m ahead of where you start, so it shows through the fog straight away.
- Night by default. Fog hides islands beyond about 300 m, but their lantern glows show through it: warm amber for living islands, spectral green for haunted ones.

## Sailing
| Value | Number |
|---|---|
| Sail settings | Furled, Half sail, Full sail (W / S, one step per press) |
| Top speed at full sail | 14 m/s, about 27 knots (code) |
| Acceleration / slowing | 2.2 / 3.0 m/s² (code) |
| Sails unfurl or furl at | 60% per second (code) |
| Fastest turn, rudder hard over | 0.5 rad/s, about 29°/s (code) |
| Steering at rest | 30% of full strength, full strength from 6 m/s (code) |
| Speed lost with rudder hard over | 25% (code) |
| Rudder swing | 2.5 rudder units per second (code) |
| Ship collision radius | 4 m (code) |

Hitting an island stops a head-on ship. A glancing hit slides it along the shore at up to **40%** of top speed (code). The edge of the world works the same way.

## Resources
| Resource | From | Spent on |
|---|---|---|
| Gold | Captured islands (trickle per hour), raids, ghost wrecks | Building and upgrading |
| Cursed gold | Beating ghost ships: double value, but see below | Same as gold, once cleansed or spent |
| Ectoplasm | Beating ghost raids and ghost ships | Spirit Lanterns, keeping ghost crew, paying the Ferryman |

Storage caps per home-island level. Raids can take at most **30%** of what is in storage.

## Ship weapons (3 upgrade levels each)
| Weapon | Effect vs living | Effect vs ghosts | Notes |
|---|---|---|---|
| Cannon | Full damage, one target | Half damage | Broadsides with Q (port) and E (starboard), sides reload separately |
| Salt Shot | 40% damage | Full damage, slows ghosts | Salt is an old folk charm against spirits |
| Witchfire Barrel | Burns an area | Burns an area | Green fire, thrown over the stern |
| Bat Swarm | No damage | No damage | Shows a base's layout and hidden mines before an attack |

## Island defenses (3 upgrade levels each)
| Defense | Strong against | Notes |
|---|---|---|
| Cannon Tower | Living ships | Half damage to ghosts |
| Spirit Lantern | Ghosts | Full damage to ghosts and reveals them in fog. Weak against living ships |
| Bone Catapult | Groups | Area damage, slow, misses fast ships |
| Jack-o'-lantern Mines | Anything | Floating pumpkins that explode near ships. Hidden in fog until bats find them |

## Battles (code)
- One deterministic simulation runs every fight in a 240 m arena around the island, for up to **150 s**.
- **Assault** (fort captures and raids): your ship against the island's defenses. **Siege** (ghost raids): ghost ships against your island; your towers and your ship fight back.
- Broadsides: Q fires port, E fires starboard. **3 / 4 / 5** shots per side by cannon level, **14 / 17 / 21** damage each, range **64 m**, reload **2 s** (Gunner: ×0.8, ghost Gunner: ×0.65). Broadsides aim themselves at the nearest target within 55° of the beam.
- R swaps cannonballs and Salt Shot. F throws a Witchfire Barrel (burns for 6 s, 9 s cooldown). B sends the Bat Swarm (reveals everything for 6 to 10 s, 25 s cooldown).
- Towers: Cannon Tower **6 / 9 / 13** damage, range 70 m; Spirit Lantern **9 / 12 / 16**, range 60 m; Bone Catapult **22 / 28 / 36** splash, range 96 m, doesn't lead its target. Mines: **30 / 40 / 52** damage when a hostile ship comes within 7 m.
- Ghost ships: **55 to 150** health and **7 to 15** damage by fleet level, range 66 m. They circle the island 8 m outside its shore.
- Ghosts are **veiled** in fog: only Spirit Lanterns can aim at them, unless a lantern, your ship's lantern (20 m, 30 m with a Navigator, 45 m with a ghost Navigator) or the Bat Swarm reveals them.
- Scoring: destruction counts every structure once and the keep three times. One star for 50%, one for the keep, one for 100%.

## Crew
- You start with two: a **Gunner** (reloads 20% faster) and a **Navigator** (sees 30% further through fog).
- A crew member who dies in battle returns as a **ghost** for 3 battles with a stronger ability (Gunner: shots pass through ghost hulls; Navigator: reveals mines). After that they fade unless you spend ectoplasm.

## Capturing islands
Each haunted island can be captured in one of two ways:
1. **Fort battle:** sink the island's towers from your ship.
2. **Lantern Lines puzzle:** rotate mirror tiles on a 5×5 grid to carry one beam of lantern light from the lighthouse to every spirit totem. Puzzles are generated from the island's seed and always have a solution. The same puzzle type is used to escape Davy Jones' Locker, with a time limit.

## Raids (asynchronous multiplayer)
- You attack a saved copy of another player's island. Its defenses fight on their own.
- The client sends the seed and your inputs. The server replays the battle and rejects any result that doesn't match.
- After being raided, an island gets **4 hours** of protection. The owner reads a raid report later.

## The ghost fleet and the Blood Moon
- Every **20 minutes** the moon turns red for **3 minutes**, for every player at once. Fog thickens, a bell tolls and a stronger ghost fleet sails.
- The fleet picks the weakest island that isn't protected, weighted by how much cursed gold it holds. The map shows fog creeping toward the target with a countdown.
- Judges and new players get a **"Summon the Blood Moon"** button so they don't have to wait.

## Cursed gold
- Ghost loot pays double, but it is cursed. The more cursed gold an island holds, the more likely the fleet targets it.
- Cleanse it at a chapel (takes time) or spend it quickly.

## Davy Jones' Locker
- When your ship sinks, you wake on the seabed. Solve a Lantern Lines puzzle before the time runs out, or pay the Ferryman in ectoplasm, to sail back with your ship repaired.

## If we are ahead of schedule
- **Possession:** a ghost crew member takes over one enemy tower per battle for 5 seconds.
- **Trick or Treat:** the defender can set out a treat chest; an attacker who takes it leaves in peace and both gain reputation.
- **Mary Celeste drifters:** empty ships drift across the map; board one and follow the captain's log to buried treasure. The real Mary Celeste was found adrift and empty on 4 December 1872.
