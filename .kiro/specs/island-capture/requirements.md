# Requirements Document

## Introduction
Capturing haunted islands. Each haunted island can be taken by breaking its fort in a battle or by solving its Lantern Lines puzzle: rotate mirrors on a 5×5 grid to carry the lighthouse's beam through every spirit totem. Captured islands turn warm, pay tribute and count toward infamy. The server decides every capture: it replays the battle or checks the puzzle itself.

## Glossary
- **Lantern Lines**: the puzzle. The beam enters from the lighthouse on the grid's left edge and travels in straight lines; mirrors (`/` or `\`) turn it; rocks stop it; totems light when the beam passes through them.
- **Capture ticket**: a pending battle or puzzle the server has handed out, with a seed chosen by the server.

## Requirements

### Requirement 1: Lantern Lines puzzles
**User Story:** As a captain who'd rather think than fight, I want a puzzle way to capture islands, so that there is more than one way to win.

#### Acceptance Criteria
1. THE Puzzle generator SHALL build a 5×5 puzzle from a seed, with `PUZZLE.totems` totems, rocks and decoy mirrors, and a beam path of at least `PUZZLE.minPath` cells and `PUZZLE.minTurns` turns.
2. THE Puzzle generator SHALL give every puzzle a solution, and SHALL never hand out a starting layout that is already solved.
3. WHEN the player clicks a mirror, THE Game SHALL rotate it and redraw the beam.
4. THE Puzzle SHALL count as solved WHEN the beam passes through every totem, whatever mirror layout does it.

### Requirement 2: Capturing
**User Story:** As a captain, I want to capture islands near me, so that my waters grow.

#### Acceptance Criteria
1. WHEN the ship is within 140 m of a haunted island's shore, THE Game SHALL offer to attack its fort (key 1) or solve its Lantern Lines (key 2).
2. WHEN a capture starts, THE Handler SHALL hand out a ticket with a server-chosen seed and a fort layout from the island's seed.
3. WHEN a fort capture finishes, THE Handler SHALL replay the battle from the recorded inputs and capture the island only if the replay destroys the keep.
4. WHEN a puzzle capture finishes, THE Handler SHALL capture the island only if the submitted mirror layout solves the ticket's puzzle.
5. THE Handler SHALL refuse to capture Last Light, an unknown island or one already captured, and SHALL accept each ticket only once.
6. WHEN an island is captured, THE Handler SHALL pay the fort's reward, add `REWARDS.infamyPerCapture` infamy and write a report.

### Requirement 3: Captured islands
**User Story:** As a captain, I want my islands to look and work like mine, so that progress is visible.

#### Acceptance Criteria
1. THE Renderer SHALL light captured islands with warm lantern light and remove their ghost lights.
2. THE island labels SHALL say "Yours" for captured islands.
3. WHILE the captain holds captured islands, THE Game SHALL collect tribute every minute and show what arrived.
4. WHEN the game uses a custom `?seed`, THE Game SHALL let the player explore but say that captures need the standard sea.
