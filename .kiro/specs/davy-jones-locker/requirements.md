# Requirements Document

## Introduction
What happens when a ship sinks. The ship goes down to Davy Jones' Locker, where the captain either solves a timed Lantern Lines escape or pays the Ferryman in ectoplasm. One living crew member drowns and comes back as a ghost: stronger for a few battles, then fading unless kept with ectoplasm. Lost crew can be replaced at the tavern.

## Glossary
- **Locker**: the state of a sunk ship (`profile.sunk`). A ship in the Locker can't capture, raid or defend.
- **Ghost crew**: a crew member with `state: 'ghost'` and a number of battles left. A ghost Gunner reloads faster and its cannonballs hit ghosts at full strength; a ghost Navigator sees ghosts and mines much further.

## Requirements

### Requirement 1: Sinking
**User Story:** As a captain, I want sinking to matter without ending my game, so that risk feels real but fair.

#### Acceptance Criteria
1. WHEN the player's ship sinks in any battle the server replays, THE Handler SHALL send it to the Locker.
2. WHEN a ship sinks with living crew aboard, THE Handler SHALL turn one of them, chosen from the battle's seed, into a ghost with `CREW.ghostBattles` battles left.
3. WHILE the ship is in the Locker, THE Handler SHALL refuse captures, raids and sieges.

### Requirement 2: Escaping
**User Story:** As a sunk captain, I want a way back that I can earn or buy, so that I'm never stuck.

#### Acceptance Criteria
1. WHEN the captain chooses the escape, THE Handler SHALL hand out a Lantern Lines puzzle with `LOCKER.puzzleSeconds` to solve it.
2. WHEN the escape is solved in time, THE Handler SHALL free the ship with nothing lost.
3. WHEN the escape fails, runs out of time or is abandoned, THE Handler SHALL free the ship and take `LOCKER.goldLostOnFailure` of the captain's gold, cursed gold first.
4. WHEN the captain pays the Ferryman, THE Handler SHALL charge `LOCKER.ferrymanCost` and free the ship, or refuse if they can't afford it.
5. THE Game SHALL return a freed ship to Last Light.

### Requirement 3: Ghost crew
**User Story:** As a captain, I want my drowned crew to come back, so that losses turn into a story.

#### Acceptance Criteria
1. WHEN any battle finishes, THE Handler SHALL take one battle from each ghost crew member, and a ghost with none left SHALL fade.
2. WHEN the captain keeps a ghost crew member, THE Handler SHALL charge `CREW.keepGhostCost` and add `CREW.ghostBattles` battles.
3. WHEN the captain hires for an empty post, THE Handler SHALL charge `CREW.hireCost` and add a living crew member.
4. THE shipwright SHALL show each crew member's state, what they do and the actions open to them.
