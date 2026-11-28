# Requirements Document

## Introduction
Building up Last Light and the ship. The captain places defenses on the home island's tower and mine slots, upgrades them, raises the island's level for more slots and storage, and refits the ship at the shipwright. Every change goes through the server, which checks costs, slots and unlock levels.

## Glossary
- **Tower slot / mine slot**: fixed places on Last Light, from `slotPosition` and `mineSlotPosition`. Their number grows with the home level (`LAYOUT.homeSlots`, `LAYOUT.homeMineSlots`).
- **Spent**: everything paid for a defense so far (building plus upgrades).

## Requirements

### Requirement 1: Defenses
**User Story:** As a captain, I want to build and upgrade defenses, so that my island survives players and ghosts.

#### Acceptance Criteria
1. WHEN the captain builds a defense on an empty slot, THE Handler SHALL charge `COSTS[type][0]` and place it at level 1.
2. WHEN the captain upgrades a defense below level 3, THE Handler SHALL charge the cost of the next level.
3. WHEN the captain removes a defense, THE Handler SHALL refund `COSTS.refund` of everything spent on it, rounded down, up to the storage cap.
4. THE Handler SHALL refuse a slot outside the home level's slots, an occupied slot, a defense the home level hasn't unlocked (`COSTS.unlockLevel`), or a cost the captain can't afford, and change nothing.
5. THE Handler SHALL keep mines on mine slots and towers on tower slots.

### Requirement 2: The home island and the ship
**User Story:** As a captain, I want to grow my island and my ship, so that I can take on stronger forts and fleets.

#### Acceptance Criteria
1. WHEN the captain upgrades Last Light below level 3, THE Handler SHALL charge `ECONOMY.homeUpgrade` and raise the slots and storage.
2. WHEN the captain upgrades the hull, cannons, Salt Shot, Witchfire or the Bat Swarm below level 3, THE Handler SHALL charge the cost of the next level; the Witchfire Barrel and the Bat Swarm start locked at level 0.
3. THE Handler SHALL use the new levels in every battle setup it hands out afterwards.

### Requirement 3: The base view
**User Story:** As a captain, I want to see my island while I build, so that the base feels like mine.

#### Acceptance Criteria
1. WHEN the captain presses Tab or the Base button while sailing, THE Game SHALL fly the camera to Last Light and open the base panel; WHEN they close it, THE Game SHALL return to the ship.
2. THE base panel SHALL list every slot with its defense, level, what it is strong against, and the cost of each action in words.
3. THE Renderer SHALL draw the captain's defenses on Last Light, in the open sea and in battles, at the same slot positions.
4. THE panel SHALL explain why an action is unavailable (cost, unlock level, slot full).

### Requirement 4: A new captain's trial of every weapon
**User Story:** As a new player, I want to try every weapon in my first battles, so that I learn what each is for before I spend gold on it.

#### Acceptance Criteria
1. WHEN a captain is created, THE Profile SHALL hold `ECONOMY.trialBattles` (3) trial battles.
2. WHILE a captain has trial battles left, THE Loadout SHALL carry every ship weapon at level 1 or more (cannons, Salt Shot, Witchfire, Bat Swarm, Pumpkin Mortar), and never below the levels they own.
3. WHEN a battle finishes, THE Server SHALL use up one trial battle. Captains saved before trials existed have none.
4. THE Shipwright and the captain bar SHALL say how many trial battles are left, and the battle HUD SHALL show lent weapons as ready.
