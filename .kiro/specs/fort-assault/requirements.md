# Requirements Document

## Introduction
Richer fort battles. The captain can select a haunted island from afar and read its fort report, lock onto targets in battle, fire a new long-range Pumpkin Mortar, and shoot new kinds of target: treasure vaults that pay out and powder stores that blow up the towers beside them. Capturing a fort pays for how well it went: the guns silenced, the time left before dawn, the island's ghosts sunk and the treasure taken.

## Glossary
- **Fort report**: the panel for a selected haunted island: its level, what defends it, its treasure, its dawn clock and what it pays.
- **Locked target**: a structure or revealed ghost the player has chosen with T or a click. Broadsides and the mortar prefer it.
- **Treasure vault**: a fort structure that fires nothing; destroying it adds its gold to the capture reward.
- **Powder store**: a fort structure that fires nothing; when destroyed it explodes and damages every structure and the player's ship nearby.
- **Bonus target**: a treasure vault or powder store. Bonus targets don't count toward destruction, stars or the end of the battle.

## Requirements

### Requirement 1: Selecting a fort
**User Story:** As a captain, I want to choose which island to attack and see what I'm up against, so that I pick fights I can win.

#### Acceptance Criteria
1. WHEN the player clicks a haunted island's label, THE Game SHALL select that island and show its fort report while it is within label range.
2. THE fort report SHALL list the fort's level, its towers by type, mines, island ghosts, bonus targets, dawn clock and every part of its reward, in words.
3. WHILE the selected island is within 140 m of the ship, THE fort report SHALL offer to attack it (key 1); otherwise it SHALL say how far to sail.
4. WHEN no island is selected, THE Game SHALL report the nearest island within 140 m, as before.

### Requirement 2: Targeting
**User Story:** As a captain in battle, I want to choose what my guns shoot, so that I can take out the most dangerous tower or the powder store first.

#### Acceptance Criteria
1. WHEN the player presses T, THE Game SHALL lock the next target by distance among standing structures and revealed ghosts, and after the last one clear the lock; clicking a health bar SHALL lock that target.
2. THE locked target SHALL be part of the recorded input, so the server's replay aims the same way.
3. WHEN a broadside fires and the locked target is standing, revealed, within range and inside that side's arc, THE Simulation SHALL aim at it; otherwise at the nearest target as before.
4. THE Game SHALL mark the locked target and name it on the battle HUD.

### Requirement 3: The Pumpkin Mortar
**User Story:** As a captain, I want a heavy, slow weapon with reach, so that I can crack a tower from a distance.

#### Acceptance Criteria
1. THE shipwright SHALL sell the Pumpkin Mortar (locked at level 0, then levels 1 to 3) for `COSTS.mortar`.
2. WHEN the player presses G, the mortar is unlocked and ready, and a target is within `WEAPONS.mortar.minRange` to `WEAPONS.mortar.range`, THE Simulation SHALL lob a burning pumpkin at the locked target if it can, else at the nearest structure in reach, and start the cooldown.
3. THE mortar shell SHALL land where the target stood when it fired (it doesn't lead), and SHALL damage everything hostile within its splash radius.

### Requirement 4: Bonus targets
**User Story:** As a captain, I want things worth aiming for besides towers, so that battles reward thinking.

#### Acceptance Criteria
1. THE Fort generator SHALL give each level `FORTS.vaults` treasure vaults and `FORTS.powderStores` powder stores, placed from the island's seed.
2. WHEN a powder store is destroyed, THE Simulation SHALL deal `DEFENSES.powder.blastDamage` to every other structure within `DEFENSES.powder.blastRadius` and to the player's ship if it is that close, and powder stores caught in the blast SHALL go off in turn.
3. THE Simulation SHALL leave bonus targets out of destruction, stars and the end of an assault.

### Requirement 5: Rewards
**User Story:** As a captain, I want a capture to pay for how well I fought, so that skill is rewarded.

#### Acceptance Criteria
1. WHEN a fort is captured, THE Handler SHALL pay the fort's base reward plus: `REWARDS.towerBounty` gold per level of every tower destroyed, up to `REWARDS.speedBonus` of the base gold by the share of the dawn clock left, `REWARDS.ghostShipEctoplasm` ectoplasm and `REWARDS.islandGhostGold` gold per island ghost sunk, and `FORTS.vaultGold` per treasure vault destroyed, all from the server's replay.
2. THE result card SHALL show each part of the reward on its own line.
3. A battle that doesn't capture the fort SHALL pay nothing.
