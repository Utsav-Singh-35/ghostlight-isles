# Design Document: Fort assault

## Overview
| Where | What changes |
|---|---|
| `sim/balance.ts` | `WEAPONS.mortar`, `DEFENSES.vault` and `DEFENSES.powder`, `DAMAGE_VS.pumpkin`, `COSTS.mortar`, `FORTS.vaults`, `FORTS.powderStores`, `FORTS.vaultGold`, `REWARDS.towerBounty`, `REWARDS.speedBonus`, `REWARDS.islandGhostGold` |
| `sim/battle.ts` | `BattleInput.target`; input events gain an optional fifth number, the locked target; `FLAG.mortar`; the mortar; bonus targets as structures; powder blasts with chain reactions; a `powder` event |
| `sim/layout.ts` | `fortLayout` adds bonus targets on a ring at `LAYOUT.treasureRing` of the radius, from the island's seed; the setup carries them as `extras` |
| `sim/captureRewards.ts` | `captureRewards(state, level)`: the reward breakdown from a finished battle |
| `sim/base.ts`, `sim/profile.ts` | the `mortar` ship part (missing on old profiles means level 0) |
| `server/capture.ts` | pays `captureRewards` from its own replay and returns the breakdown |
| `game/app.ts`, `game/input.ts` | G fires the mortar, T cycles the lock, clicks on health bars lock; label clicks select an island; the fort report |
| `ui/battleHud.ts`, `ui/labels.ts`, `ui/prompt.ts`, `ui/basePanel.ts` | mortar meter, target line, clickable bars, clickable labels, report lines, the mortar at the shipwright |
| `render/` | pumpkin shells, vault and powder-store models, the lock marker, blasts |
| `audio/` | mortar thump, treasure clatter; powder blasts are explosions, which are never dropped |

## Input
`InputEvent = [tick, rudder, sailLevel, flags, target?]`. Old four-number events still replay, with no lock. `sanitizeEvents` keeps four- and five-number events and clamps the target to a whole number from 0 to 1000. A lock on something that isn't there, is destroyed or isn't revealed is ignored, so a bad lock can't change anything a lock-free battle couldn't.

## Numbers
| | |
|---|---|
| Mortar | range 15 to 100 m, 8 s cooldown, 1.6 s flight, damage 45 / 60 / 80, splash 6 / 7 / 8 m; 0.6 against ghosts; costs 500 gold + 20 ecto, 1,000 + 40, 2,000 + 80 |
| Treasure vault | health 90 / 130 / 180 by keep level; pays 80 / 120 / 180 / 260 / 360 gold by fort level |
| Powder store | health 50; blast 16 m, 90 damage to structures, 54 to the ship |
| Vaults per level | 1, 1, 1, 2, 2 |
| Powder stores per level | 0, 1, 1, 2, 2 |
| Rewards | base + 15 gold per tower level destroyed + up to 50% of base for time left + 8 ectoplasm and 15 gold per island ghost + vault gold |

The mortar's 100 m reach is just beyond a Bone Catapult's 96 m and well inside the distance at which island ghosts start hunting, so standing off is slow and, at higher levels, not safe.

## Correctness Properties

**Property 1: Rewards add up.** *For any* finished fort battle and level, every part of the reward is a whole number of at least 0, the total is the sum of the parts, the speed bonus never exceeds `REWARDS.speedBonus` of the base, and finishing with more time left never pays less.
**Validates: Requirement 5.1**

**Property 2: Locked targets are honoured.** *For any* battle and inputs with locks, whenever a broadside fires while its lock is standing, revealed, in range and in the arc, it aims at the lock; and a battle whose locks all point at nothing plays exactly like the same battle without locks.
**Validates: Requirements 2.2, 2.3**

**Property 3: The mortar only fires at what it can reach.** *For any* battle, every mortar shot is aimed at a target between the minimum and maximum range at the moment it fires, and no two mortar shots are closer together than the cooldown.
**Validates: Requirements 3.2, 3.3**

**Property 4: Powder stores blow up their neighbours.** *For any* battle, on a tick when a powder store goes off, every other structure within the blast radius loses at least the blast damage (or is destroyed) and nothing further away loses health from it; every powder store goes off at most once.
**Validates: Requirement 4.2**

**Property 5: Bonus targets don't decide the battle.** *For any* battle, destruction, stars and whether the fort has fallen are the same as if bonus targets weren't counted at all.
**Validates: Requirement 4.3**
