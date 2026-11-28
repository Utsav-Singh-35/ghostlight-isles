# Requirements Document

## Introduction
Captains now have a crew of fighters as well as a ship. Each crew member is posted either **aboard** (the landing party, which rows ashore to fight on an enemy island) or **ashore** on Last Light (the garrison, which fights ghost boarders and repairs towers). Haunted forts have their own ghost troops behind walls with one gate. Support boats sail with the ship and fire grapeshot at troops on the beach, never at towers. Every troop fight runs in the same deterministic battle simulation as the ships, so the server replays it exactly.

## Glossary
- **Troop**: one fighter in a battle. Living troops are the player's (or a rival captain's); ghost troops defend forts and board Last Light.
- **Landing party**: the troops posted aboard. They stay aboard until the captain lands them.
- **Garrison**: the troops on an island: a fort's ghost troops, a raided captain's island troops, or your own island troops in a siege.
- **Space**: how much room a troop takes. The ship's space rises with its hull; the island's with its home level.
- **Wall ring**: a haunted fort's wall, as a circle the troops can't cross except through the gate.
- **Support boat**: a small gunboat bought at the shipwright. Up to two sail with the ship.

## Requirements

### Requirement 1: Recruiting and posting
**User Story:** As a captain, I want to recruit fighters and choose who sails and who guards home, so that my attacks and my defense both have people in them.

#### Acceptance Criteria
1. THE Tavern SHALL recruit Deckhands, Cutlass Buccaneers, Shieldbearers, Lantern Archers, Powder Monkeys, Anchor Brutes and Ship's Surgeons for the gold (and ectoplasm) in `TROOPS`; Anchor Brutes need home level 2.
2. WHEN a captain recruits or moves a troop, THE Server SHALL refuse it, changing nothing, if the ship's or island's space would be exceeded, the captain can't pay, or the troop type is unknown.
3. THE Server SHALL let a captain move a troop between the ship and the island for free, and dismiss one for nothing back.
4. WHEN a captain is created, THE Profile SHALL hold a starting crew (3 Buccaneers and an Archer aboard, 2 Buccaneers and a Deckhand ashore).

### Requirement 2: Landing
**User Story:** As a captain attacking a fort or a base, I want to row my landing party ashore at the right moment, so that they can take what my guns can't.

#### Acceptance Criteria
1. WHEN the captain presses L within `TROOPS.landReach` metres of the shore (`TROOPS.boatLandReach` with a support boat afloat), THE Battle SHALL land every troop aboard except Deckhands on the shore nearest the ship, `TROOPS.rowSeconds` later. Farther out, L does nothing.
2. THE Battle SHALL land a party at most once per battle.
3. WHILE Deckhands are aboard, THE Ship SHALL be repaired by `TROOPS.deckhandShipRepair` health per second each, never above its maximum.

### Requirement 3: Fighting ashore
**User Story:** As a player, I want each troop to behave the way it looks, so that choosing a crew is a real decision.

#### Acceptance Criteria
1. THE Battle SHALL keep every troop on land, inside the island's beach.
2. Buccaneers SHALL attack the nearest enemy; Shieldbearers SHALL go for enemy troops and draw every enemy troop within `TROOPS.tauntRadius` to themselves; Archers SHALL shoot troops first from range; Powder Monkeys SHALL run at the gate (or the nearest structure), blow it and die; Anchor Brutes SHALL attack only structures and the gate; Surgeons SHALL heal the most hurt ally in reach and never above full health.
3. A fort's ghost troops SHALL guard their posts inside the walls and fight enemy troops that come near.
4. THE Island's towers SHALL fire at enemy troops as well as ships, at TROOPS.shotDamageShare of their damage; the player's broadsides, mortar and ghost ships SHALL not.
5. No troop SHALL ever damage its own side.

### Requirement 4: Walls and the gate
**User Story:** As a captain, I want a fort's walls to matter, so that breaking the gate is a goal of its own.

#### Acceptance Criteria
1. THE Battle SHALL place a haunted fort's wall ring and gate where the fort draws them, from the island's seed and level.
2. No troop SHALL cross the wall ring except through the gate's opening, and none SHALL pass the gate while it stands.
3. WHEN the gate's health reaches zero, THE Battle SHALL open it for both sides.
4. Ranged troops SHALL shoot over the walls.

### Requirement 5: Sieges
**User Story:** As the keeper of Last Light, I want my garrison to fight ghost boarders, so that the island is more than its towers.

#### Acceptance Criteria
1. WHEN a ghost ship first reaches the island in a siege, THE Battle SHALL land `setup.boarders` ghost troops on the shore nearest it.
2. Ghost boarders SHALL attack the island's troops and structures; the garrison SHALL fight them, and Deckhands ashore SHALL repair damaged towers (never the keep or treasure).

### Requirement 6: Support boats
**User Story:** As a captain, I want gunboats that clear the beach, so that my landing party survives the landing.

#### Acceptance Criteria
1. THE Shipwright SHALL sell up to `TROOPS.maxBoats` support boats.
2. Support boats SHALL follow the ship, take station off the shore once the party lands or the ship nears the island, and fire grapeshot only at enemy troops within range; they SHALL never damage a structure.
3. THE Island's towers and ghost ships SHALL be able to sink support boats; a sunk boat is back at the next battle.

### Requirement 7: After the battle
**User Story:** As a captain, I want to know who I lost, so that I can recruit again.

#### Acceptance Criteria
1. WHEN a battle ends, THE Server SHALL remove exactly the troops of the captain's that died in it: party troops in attacks, garrison troops in sieges, and never more than the captain had.
2. A raided captain SHALL lose no troops: raiders fight a saved copy of their island.
3. THE Result card SHALL list the troops lost.
