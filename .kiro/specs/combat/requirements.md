# Requirements Document

## Introduction
Ship battles for Ghostlight Isles. One deterministic battle simulation serves three kinds of fight: capturing a haunted fort, raiding a rival's island, and defending Last Light from the ghost fleet. The server replays every battle from its setup and the player's recorded inputs, so the simulation must give identical results for identical inputs.

## Glossary
- **Battle**: one fight at an island at the centre of a round arena.
- **Assault**: the player's ship attacks an island's defenses (fort captures and raids).
- **Siege**: ghost ships attack the player's island; its defenses and the player's ship fight back.
- **Structure**: a defense or the island's keep (the lighthouse on a living island, the ghost light on a haunted one).
- **Veiled**: a ghost ship that is not revealed. Only Spirit Lanterns can aim at veiled ghosts.
- **Input events**: the player's input recorded as `[tick, rudder, sailLevel, flags]` whenever it changes.

## Requirements

### Requirement 1: Ship weapons
**User Story:** As a captain, I want broadsides, salt shot, witchfire and bats, so that I have tools for living and dead enemies.

#### Acceptance Criteria
1. WHILE the player holds Q (port) or E (starboard) and that side has reloaded, THE Simulation SHALL fire a broadside of `WEAPONS.cannon.balls[level]` shots at the nearest hostile target within range and within the side's firing arc, or straight out to the side when there is none.
2. WHEN a broadside fires, THE Simulation SHALL reload that side for `WEAPONS.cannon.reloadSeconds`, shortened by the Gunner.
3. WHERE Salt Shot is loaded (R toggles it), THE Simulation SHALL deal full damage and a slow to ghosts and 40% damage to living ships and structures.
4. WHEN the player presses F and the Witchfire Barrel is unlocked and ready, THE Simulation SHALL throw a barrel astern that becomes a burning zone damaging every hostile ship and structure inside it.
5. WHEN the player presses B and the Bat Swarm is unlocked and ready, THE Simulation SHALL reveal all ghosts and mines for the swarm's duration.

### Requirement 2: Island defenses
**User Story:** As an island owner, I want defenses that are strong against different threats, so that building a good base takes thought.

#### Acceptance Criteria
1. THE Simulation SHALL make Cannon Towers deal full damage to living ships and half damage to ghosts.
2. THE Simulation SHALL make Spirit Lanterns deal full damage to ghosts and 40% damage to living ships, and reveal every ghost within their range.
3. THE Simulation SHALL make Bone Catapults lob slow area shots at a target's current position, without leading it.
4. WHEN a hostile ship comes within a Jack-o'-lantern Mine's trigger radius, THE Simulation SHALL explode the mine, damaging hostile ships in range, and remove it.
5. THE Simulation SHALL let defenses other than Spirit Lanterns aim only at ghosts that are revealed.

### Requirement 3: Ghost ships
**User Story:** As a defender, I want ghost ships that circle my island and fire at it, so that sieges feel dangerous.

#### Acceptance Criteria
1. WHEN a siege starts, THE Simulation SHALL spawn the ghost fleet at the edge of the arena.
2. THE Simulation SHALL steer each ghost ship onto a ring around the island and fire at the nearest structure or the player's ship in range.
3. WHILE a ghost ship is slowed by Salt Shot, THE Simulation SHALL halve its top speed.
4. A ghost ship SHALL be revealed WHILE it is within range of a standing Spirit Lantern, within the player's lantern light, or the Bat Swarm is active.

### Requirement 4: Ending and scoring
**User Story:** As a player, I want clear outcomes, so that I know what I won or lost.

#### Acceptance Criteria
1. THE Simulation SHALL end an assault when every structure is destroyed, the player's ship sinks, the player retreats, or the time limit passes.
2. THE Simulation SHALL end a siege when every ghost ship sinks, the keep is destroyed, or the time limit passes (the ghosts withdraw at dawn).
3. THE Simulation SHALL report destruction from 0 to 1, weighting the keep three times, and award stars: one for 50% destruction, one for destroying the keep, one for 100% destruction.
4. WHEN the player's ship sinks in a siege, THE Simulation SHALL keep running the battle with the island's defenses alone.

### Requirement 5: Determinism and replay
**User Story:** As the game server, I want to replay a battle from its inputs, so that results can't be faked.

#### Acceptance Criteria
1. THE Simulation SHALL produce identical states from the same setup and input events.
2. WHEN a battle played live is replayed from its recorded input events, THE Simulation SHALL produce the same final state.
3. THE Simulation SHALL sanitize input events: drop malformed ones, sort them by tick and clamp every value.
4. THE Simulation SHALL never raise a structure's or a ship's health during a battle.
5. THE Simulation SHALL keep every ship outside the island and inside the arena.

### Requirement 6: Battle view
**User Story:** As a player, I want to see the fight clearly, so that I can aim, dodge and understand what happened.

#### Acceptance Criteria
1. THE Renderer SHALL draw the island, its defenses and keep, ghost ships, shots in flight, burning zones, mines and explosions.
2. THE Renderer SHALL draw veiled ghosts faintly and revealed ghosts clearly, and hide unrevealed mines beyond 18 metres.
3. THE Game SHALL show health bars, the time left, both broadsides' reload, the loaded ammo and each ability's cooldown, in words as well as bars.
4. WHEN a battle ends, THE Game SHALL show the outcome, stars, destruction and rewards.
