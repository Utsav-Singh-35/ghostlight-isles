# Requirements Document

## Introduction
Sound for Ghostlight Isles, made entirely in code with the Web Audio API, so there are no audio files to download or credit. The sea, the wind and the Blood Moon play as ambience; battles, puzzles and menus play short effects. Sound is a second channel for the same information the screen shows: a sinking, a ghost going down or the fleet's bell is always heard, so the spooky mood also tells the player what is happening.

## Glossary
- **Cue**: one battle sound to start this frame, with a loudness and a stereo position.
- **Listener**: the player's ship, with the camera's right-hand direction on the sea plane.
- **Critical cue**: a cue that carries news the player needs: a structure destroyed, the keep falling, a mine, the player's ship sinking or a ghost ship sinking.

## Requirements

### Requirement 1: Battle sounds
**User Story:** As a captain in a battle, I want to hear what happens around me, so that I can follow the fight even in the fog.

#### Acceptance Criteria
1. WHEN a battle event happens, THE Sound system SHALL map it to at most one cue: broadsides, tower and catapult shots, spirit bolts, hits, splashes, explosions, sinkings, mines and the Bat Swarm each have their own sound.
2. THE Sound system SHALL make a cue quieter the further its event is from the listener, and never fully silent.
3. THE Sound system SHALL pan a cue toward the side of the screen its event is on, and never fully into one ear.
4. WHEN many events happen in one frame, THE Sound system SHALL play each kind of cue once, slightly louder, and start no more than `CUE_LIMIT` cues.
5. WHEN cues must be dropped, THE Sound system SHALL keep every critical cue.

### Requirement 2: Ambience
**User Story:** As a captain at sea, I want the night to sound like the sea, so that the world feels alive and the danger feels near.

#### Acceptance Criteria
1. THE Sound system SHALL play a swelling sea and a low wind, with more rush of water the faster the ship sails.
2. WHILE the Blood Moon is up, THE Sound system SHALL add a low drone and a heartbeat that follow how red the night is.
3. WHILE the ship lies in Davy Jones' Locker, THE Sound system SHALL muffle everything as if under water and play rising bubbles.
4. WHEN the ghost fleet sets sail for Last Light, THE Sound system SHALL toll a ship's bell.

### Requirement 3: Interface sounds
**User Story:** As a player, I want quiet feedback when I act, so that I know the game heard me.

#### Acceptance Criteria
1. WHEN the player turns a mirror, lights a totem or solves a Lantern Lines puzzle, THE Sound system SHALL play a click, a chime or a short melody.
2. WHEN a result card appears, THE Sound system SHALL play a rising phrase for a win and a falling phrase for a loss.
3. WHEN the player builds or upgrades, collects tribute or clicks a button, THE Sound system SHALL play a knock, coins or a soft click.

### Requirement 4: Control
**User Story:** As a player, I want to turn sound off, so that I can play anywhere.

#### Acceptance Criteria
1. THE Game SHALL offer a sound button on the HUD and the M key to turn sound on or off, and SHALL remember the choice on this device.
2. THE Sound system SHALL not start audio before the player's first click or key press, as browsers require.
3. WHILE sound is off or the tab is hidden, THE Sound system SHALL suspend audio processing.
4. IF the browser has no Web Audio, THEN THE Game SHALL run silently without errors.
