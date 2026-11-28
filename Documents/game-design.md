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
| Pumpkin Mortar | 80% damage, splash | 60% damage, splash | G lobs a burning pumpkin over walls: **45 / 60 / 80** damage, splash **6 / 7 / 8 m**, range **15 to 100 m**, 1.6 s flight, 8 s cooldown. Full damage to structures |

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
- Broadsides: Q fires port, E fires starboard. **3 / 4 / 5** shots per side by cannon level, **14 / 17 / 21** damage each, range **64 m** (**86 m** against the keep, which stands at the island's heart), reload **2 s** (Gunner: ×0.8, ghost Gunner: ×0.65). Broadsides aim themselves at the nearest target within 55° of the beam.
- R swaps cannonballs and Salt Shot. F throws a Witchfire Barrel (burns for 6 s, 9 s cooldown). B sends the Bat Swarm (reveals everything for 6 to 10 s, 25 s cooldown). G fires the Pumpkin Mortar.
- **Target lock:** T cycles a lock through the targets your guns can see, and clicking a health bar locks that one. Broadsides fire at the lock when it is in their arc, and the mortar fires at the lock or the nearest structure in reach. The lock is part of each recorded input, so the server's replay aims the same way.
- Towers: Cannon Tower **6 / 9 / 13** damage, range 70 m; Spirit Lantern **9 / 12 / 16**, range 60 m; Bone Catapult **22 / 28 / 36** splash, range 96 m, doesn't lead its target. Mines: **30 / 40 / 52** damage when a hostile ship comes within 7 m.
- Ghost ships: **55 to 150** health and **7 to 15** damage by fleet level, range 66 m. They circle the island 8 m outside its shore.
- Ghosts are **veiled** in fog: only Spirit Lanterns can aim at them, unless a lantern, your ship's lantern (20 m, 30 m with a Navigator, 45 m with a ghost Navigator) or the Bat Swarm reveals them.
- Scoring: destruction counts every structure once and the keep three times. One star for 50%, one for the keep, one for 100%.

## Base building (code)
| Home level | Tower slots | Mine slots | Gold storage | Ectoplasm storage | Upgrade cost |
|---|---|---|---|---|---|
| 1 | 6 | 3 | 3,000 | 300 | (start) |
| 2 | 9 | 4 | 7,000 | 700 | 1,500 gold |
| 3 | 12 | 5 | 15,000 | 1,500 | 4,000 gold, 120 ectoplasm |

| Defense | Build | Level 2 | Level 3 | Needs home level |
|---|---|---|---|---|
| Cannon Tower | 200 gold | 450 gold | 900 gold | 1 |
| Spirit Lantern | 150 gold, 20 ecto | 350 gold, 40 ecto | 700 gold, 90 ecto | 1 |
| Bone Catapult | 450 gold | 900 gold | 1,700 gold | 2 |
| Jack-o'-lantern Mine | 100 gold | 220 gold | 450 gold | 1 |

Removing a defense refunds half of everything spent on it. Shipwright: Hull 700 / 1,800 gold (+60 ecto) for 210 / 270 health; Cannons 600 / 1,500 gold; Salt Shot 300 + 30 ecto / 900 + 80 ecto; Witchfire Barrel unlock 400, then 800 / 1,600 gold; Bat Swarm unlock 60 ecto, then 120 / 240 ecto; Pumpkin Mortar 500 gold + 20 ecto, then 1,000 + 40 / 2,000 + 80. A new captain starts with 600 gold, 30 ectoplasm, one Cannon Tower, cannons and Salt Shot at level 1.

## Crew (code)
- You start with two: a **Gunner** (reloads 20% faster) and a **Navigator** (your lantern shows ghosts **30 m** off in the fog instead of 20 m).
- When your ship sinks, one living crew member drowns and returns as a **ghost** for **3 battles** with a stronger ability. Ghost Gunner: reloads 35% faster and cannonballs hit ghosts at full strength. Ghost Navigator: shows ghosts 45 m off and every hidden mine.
- Each battle uses up one of a ghost's battles; then the post is empty. Keep a ghost for 3 more battles for **40 ectoplasm**, or hire a new living crew member for an empty post for **150 gold** (shipwright, in the base panel).

## Capturing islands (code)
Haunted islands are taken by battle only: destroy every tower and the keep (the ghost light at the island's heart) before dawn. Forts get harder the further they lie from Last Light. The level is `1 + floor((distance / 900 m)² × 5)`, so each level covers about a fifth of the sea, and the first island ahead of the start is always level 1.

| Level | Island radius | Towers | Tower levels | Mines | Keep level | Island ghosts | Dawn in | Pays |
|---|---|---|---|---|---|---|---|---|
| 1 | 26 to 34 m | 3 | 1 | 0 | 1 | none | 2:30 | 300 gold, 10 ectoplasm |
| 2 | 32 to 42 m | 4 | 1 to 2 | 1 | 1 | 1 at level 1 | 2:45 | 450 gold, 18 ectoplasm |
| 3 | 38 to 50 m | 5 | 2 | 2 | 2 | 2 at level 1 | 3:00 | 650 gold, 28 ectoplasm |
| 4 | 46 to 58 m | 6 | 2 to 3 | 3 | 3 | 2 at level 2 | 3:15 | 900 gold, 40 ectoplasm |
| 5 | 54 to 66 m | 7 | 2 to 3 | 3 | 3 | 3 at level 2 | 3:45 | 1200 gold, 55 ectoplasm |

- The first tower is always a Cannon Tower; the rest are Cannon Towers, Spirit Lanterns and, from level 2, Bone Catapults.
- **Island ghosts** rise on a ring around the island. They patrol it, hunt the attacker once it comes within 70 m of the ring (circling it 24 m away, inside a Navigator's lantern light) and fire only at the attacker. Your shots can sink them; cannonballs do half damage, Salt Shot full damage.
- Broadsides reach the keep 22 m further than other targets (86 m), so you needn't scrape the shore of a big island to hit it.
- Balance with the scripted autopilot: a new ship takes every level-1 fort and most level-2 forts, loses at level 3 (a ship with level-2 cannons, Salt Shot and hull takes it), and level 4 and 5 need a fully refitted ship.
- Each captured island pays 12 gold a minute in tribute, whatever its level.
- **Picking a fort:** click a haunted island's name for its fort report (towers, ghosts, treasure, dawn clock and pay). Press 1 to attack it from within 140 m.
- **Bonus targets** stand between the towers and never fire. **Treasure vaults** (health 90 / 130 / 180) pay **80 / 120 / 180 / 260 / 360** gold by fort level when cracked; levels 1 to 5 have 1, 1, 1, 2, 2 of them. **Powder stores** (health 50; levels 2 to 5 have 1, 1, 2, 2) blow up when destroyed: 90 damage to structures and 54 to your ship within 16 m, and one blast can set off the next. Neither counts toward destruction, stars or the end of the battle.
- **The reward** for a captured fort is the table's pay, plus **15 gold per tower level destroyed** ("guns silenced"), a speed bonus of up to **50%** of the base gold by the share of the dawn clock left, **15 gold** per island ghost sunk and the gold of every vault cracked. The server works it out from its own replay; if your storage is full, the result card says so.
- **How forts look** comes from the island's seed: a wooden stockade (levels 1 and 2 only), a ruin, a curtain wall or a star fort (mostly at levels 3 to 5), in one of four stones, with gibbets on the beach from level 2. The keep is a ghost spire at levels 1 and 2, a broken lighthouse at level 3 and a horned skull tower with burning eyes at levels 4 and 5. Forts show their towers and treasure from the open sea.

The Lantern Lines puzzle is now only the escape from Davy Jones' Locker: rotate mirror tiles on a 5×5 grid to carry one beam of lantern light from the lighthouse to every spirit totem. The server picks a new seed for every escape, and every generated puzzle has a solution.

## Raids (asynchronous multiplayer)
- You attack a saved copy of another player's island. Its defenses fight on their own.
- The client sends the seed and your inputs. The server replays the battle and rejects any result that doesn't match.
- After being raided, an island gets **4 hours** of protection. The owner reads a raid report later.

## The ghost fleet and the Blood Moon (code)
- Every **20 minutes** (counted from the Unix epoch) the moon turns red for **3 minutes**, for every player at once. The sky, sea and fog turn red and the fog thickens.
- When the Blood Moon rises, the fleet sails for **your** Last Light: a warning and a **20 s** countdown, then the siege (or press "Defend now"). After a siege the island **rests for 10 minutes**, so each Blood Moon brings one siege.
- Fleet size: **2** ships, **+1 per 150 cursed gold** you hold, **+1 per home level above 1**, up to 8. Fleet level: your home level, **+1 per 3 sieges repelled**, up to 5.
- Each ghost ship sunk pays **40 cursed gold and 8 ectoplasm** and 5 infamy. If the ghosts destroy part of the island they take up to 30% of storage by destruction, cursed gold first.
- **"Summon the Blood Moon"** (HUD and title screen) raises a personal Blood Moon at once, for judges and the impatient; the fleet arrives 5 s later. Once every 2 minutes.

## Cursed gold (code)
- Ghost loot is cursed gold. It counts as gold for building and is spent first, but every 150 held adds a ship to the next fleet.
- The chapel (base panel) takes all your cursed gold and returns it as plain gold after **10 minutes**.

## Davy Jones' Locker (code)
- When your ship sinks (in a fort battle, a raid or a siege), you wake on the seabed. While it lies there you can't capture, raid or fight a siege, and the ghost fleet leaves Last Light alone.
- **Escape:** solve a Lantern Lines puzzle within **90 s** and you wash up beside Last Light with nothing lost. If time runs out or you give up, the sea takes **20% of your gold** (cursed gold first), and you still wash up.
- **Pay the Ferryman:** **30 ectoplasm** and you go at once.
- The server issues each escape puzzle as a single-use ticket and checks the answer itself.

## If we are ahead of schedule
- **Possession:** a ghost crew member takes over one enemy tower per battle for 5 seconds.
- **Trick or Treat:** the defender can set out a treat chest; an attacker who takes it leaves in peace and both gain reputation.
- **Mary Celeste drifters:** empty ships drift across the map; board one and follow the captain's log to buried treasure. The real Mary Celeste was found adrift and empty on 4 December 1872.
