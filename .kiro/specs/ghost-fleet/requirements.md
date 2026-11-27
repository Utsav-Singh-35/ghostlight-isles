# Requirements Document

## Introduction
The Blood Moon and the ghost fleet. On a shared clock, the moon turns red for every player at once and the ghost fleet sails for Last Light. Players defend it in a siege; Spirit Lanterns, Salt Shot and the ship decide the outcome. Ghost loot is cursed gold: worth having, but it makes the next fleet bigger until it is spent or cleansed at the chapel.

## Glossary
- **Blood Moon window**: `BLOOD_MOON.durationSeconds` out of every `BLOOD_MOON.periodSeconds`, counted from the Unix epoch, the same for everyone.
- **Summoned moon**: a personal Blood Moon a player can call up, at most once per `BLOOD_MOON.summonCooldownSeconds` (for judges and the impatient).
- **Rest**: after a ghost raid the fleet leaves the island alone for `BLOOD_MOON.restMinutes`, unless summoned.

## Requirements

### Requirement 1: The shared clock
**User Story:** As a player, I want the Blood Moon to rise for everyone at the same time, so that the world feels shared.

#### Acceptance Criteria
1. THE Clock SHALL be a Blood Moon exactly during the first `durationSeconds` of every `periodSeconds`, counted from the Unix epoch.
2. THE Game SHALL show how long until the next Blood Moon, or how long the current one lasts.
3. WHILE a Blood Moon is up, THE Renderer SHALL turn the moon, sky and fog red and thicken the fog.

### Requirement 2: The ghost fleet
**User Story:** As a captain, I want the fleet to come for my island, so that my defenses matter.

#### Acceptance Criteria
1. WHEN a Blood Moon rises and the island is not resting, THE Game SHALL warn the player and start the siege of Last Light after a short countdown, unless they start it sooner.
2. WHEN a siege starts, THE Handler SHALL build it from the captain's own defenses, ship and a fleet of `baseFleet` ships, plus one per `cursedGoldPerExtraShip` cursed gold held, plus one per home level above 1, up to `GHOSTS.maxFleet`.
3. THE fleet level SHALL be the home level plus one for every three ghost raids repelled, up to `GHOSTS.maxLevel`.
4. THE Handler SHALL refuse a siege outside a Blood Moon, or while the island rests unless the moon was summoned.
5. WHEN the captain summons the Blood Moon, THE Handler SHALL raise it at once for that captain only, at most once per cooldown.

### Requirement 3: Outcomes
**User Story:** As a defender, I want sinking ghosts to pay and losing to hurt, so that defending is worth it.

#### Acceptance Criteria
1. WHEN a siege finishes, THE Handler SHALL replay it and pay `REWARDS.ghostShipCursedGold` cursed gold and `REWARDS.ghostShipEctoplasm` ectoplasm per ghost ship sunk, up to the storage cap, and `REWARDS.infamyPerGhostShip` infamy each.
2. WHEN the ghosts destroyed part of the island, THE Handler SHALL take `REWARDS.raidShare × destruction` of storage, cursed gold first.
3. WHEN a siege finishes, THE Handler SHALL rest the island for `restMinutes` and end any summoned moon.

### Requirement 4: Cursed gold
**User Story:** As a captain, I want to decide what to do with cursed gold, so that greed has a cost.

#### Acceptance Criteria
1. THE Economy SHALL spend cursed gold before plain gold.
2. WHEN the captain cleanses at the chapel, THE Handler SHALL take all their cursed gold and return it as plain gold after `BLOOD_MOON.cleanseSeconds`, once, up to the storage cap.
3. THE base panel SHALL show the next fleet's size and how cursed gold changes it.
