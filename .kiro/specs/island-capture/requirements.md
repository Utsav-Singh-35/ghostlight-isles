# Requirements Document

## Introduction
Capturing haunted islands. Each haunted island is taken by breaking its fort in a ship battle, and forts get harder the further they lie from Last Light: five fort levels with bigger islands, more and stronger towers, mines, ghost ships that rise from the island to hunt the attacker, and a dawn deadline. Captured islands turn warm, pay tribute and count toward infamy. The server decides every capture by replaying the battle itself.

The Lantern Lines puzzle is no longer a way to capture an island; it remains as the timed escape from Davy Jones' Locker (see the `davy-jones-locker` spec). Its generator stays in this spec.

## Glossary
- **Fort level**: 1 to 5, from the island's distance to Last Light. It sets the island's size and everything that defends it.
- **Island ghosts**: ghost ships that rise from a haunted island when its fort is attacked, and hunt the attacking ship.
- **Lantern Lines**: the puzzle. The beam enters from the lighthouse on the grid's left edge and travels in straight lines; mirrors (`/` or `\`) turn it; rocks stop it; totems light when the beam passes through them.
- **Capture ticket**: a pending fort battle the server has handed out, with a seed chosen by the server.

## Requirements

### Requirement 1: Lantern Lines puzzles
**User Story:** As a sunk captain, I want a puzzle I can solve to escape Davy Jones' Locker, so that I can earn my way out instead of paying.

#### Acceptance Criteria
1. THE Puzzle generator SHALL build a 5×5 puzzle from a seed, with `PUZZLE.totems` totems, rocks and decoy mirrors, and a beam path of at least `PUZZLE.minPath` cells and `PUZZLE.minTurns` turns.
2. THE Puzzle generator SHALL give every puzzle a solution, and SHALL never hand out a starting layout that is already solved.
3. WHEN the player clicks a mirror, THE Game SHALL rotate it and redraw the beam.
4. THE Puzzle SHALL count as solved WHEN the beam passes through every totem, whatever mirror layout does it.

### Requirement 2: Capturing
**User Story:** As a captain, I want to take islands by force, so that my waters grow and my ship's upgrades matter.

#### Acceptance Criteria
1. WHEN the ship is within 140 m of a haunted island's shore, THE Game SHALL show the fort's level, what defends it, its time limit and its reward, and offer to attack it (key 1).
2. WHEN a capture starts, THE Handler SHALL hand out a ticket with a server-chosen seed and the battle setup for the fort's level.
3. WHEN a capture finishes, THE Handler SHALL replay the battle from the recorded inputs and capture the island only if the replay destroys the keep.
4. THE Handler SHALL refuse any way of capturing other than a fort battle.
5. THE Handler SHALL refuse to capture Last Light, an unknown island or one already captured, and SHALL accept each ticket only once.
6. WHEN an island is captured, THE Handler SHALL pay `REWARDS.captureGold` and `REWARDS.captureEctoplasm` for the fort's level, add `REWARDS.infamyPerCapture` infamy and write a report.

### Requirement 3: Forts get harder
**User Story:** As a captain who has taken the easy islands, I want the next ones to fight back harder, so that the game keeps challenging me as I progress.

#### Acceptance Criteria
1. THE World SHALL give each haunted island a fort level from 1 to 5 by its distance from Last Light, so that an island further out never has a lower level than a nearer one.
2. THE World SHALL make each haunted island's shore radius fall inside `FORTS.islandRadius` for its level, so harder islands are bigger.
3. THE Fort generator SHALL give each level the towers, tower levels, mines and keep strength set in `FORTS`, each at least as strong as the level before.
4. WHEN a fort whose level has island ghosts is attacked, THE Battle setup SHALL include `FORTS.ghosts` for the level, and the Simulation SHALL raise them from the island to hunt the attacker.
5. THE fort battle SHALL end at dawn after `FORTS.timeLimitSeconds` for its level, and the Game SHALL show the time left, urgently in the last 30 seconds.
6. THE Game SHALL show a haunted island's fort level on its label and in the prompt, and SHALL draw forts with walls that grow with the level.

### Requirement 4: Captured islands
**User Story:** As a captain, I want my islands to look and work like mine, so that progress is visible.

#### Acceptance Criteria
1. THE Renderer SHALL light captured islands with warm lantern light and remove their ghost lights.
2. THE island labels SHALL say "Yours" for captured islands.
3. WHILE the captain holds captured islands, THE Game SHALL collect tribute every minute and show what arrived.
4. WHEN the game uses a custom `?seed`, THE Game SHALL let the player explore but say that captures need the standard sea.
