# Requirements Document

## Introduction
The first playable slice of Ghostlight Isles: the player sails a small pirate ship with two crew across a 3D night sea full of haunted islands. This slice sets up the deterministic simulation that later features (battles, raids, the ghost fleet) build on, and the night look the Costume Contest category is judged on.

## Glossary
- **Simulation**: the pure, deterministic game rules in `src/sim/`.
- **Renderer**: the Three.js code in `src/render/` that draws the simulation state.
- **Game**: the glue in `src/main.ts`, `src/game/` and `src/ui/`.
- **Sail setting**: the captain's order: 0 Furled, 1 Half sail, 2 Full sail.
- **Deployment**: how far the sails are actually unfurled, from 0 to 1.
- **Rudder**: from −1 (hard to port, left) to +1 (hard to starboard, right).
- **Heading**: the ship's direction in radians, in (−π, π]. Heading 0 faces +Z (south).
- **Bearing**: the compass direction shown to the player, 0° to 360°, with north at −Z.
- **Collision circle**: an island's radius × `WORLD.collisionScale`, plus the ship's radius.

## Requirements

### Requirement 1: Sail control
**User Story:** As a player, I want to raise and lower my sails, so that I can set my speed without holding a key down.

#### Acceptance Criteria
1. WHEN the player presses W or the Up arrow, THE Game SHALL raise the sail setting by one level, up to Full sail.
2. WHEN the player presses S or the Down arrow, THE Game SHALL lower the sail setting by one level, down to Furled.
3. WHILE the deployment differs from the sail setting, THE Simulation SHALL move the deployment toward it by at most `SHIP.sailRate` per second.
4. THE Simulation SHALL move the speed toward `SHIP.maxSpeed × deployment × (1 − SHIP.turnDrag × |rudder|)`, gaining at most `SHIP.accel` and losing at most `SHIP.decel` metres per second, per second.
5. THE Simulation SHALL keep the speed between 0 and `SHIP.maxSpeed`, and the deployment between 0 and 1.
6. WHEN the sail setting is Furled, THE Simulation SHALL bring the ship to a full stop within `1 / SHIP.sailRate + SHIP.maxSpeed / SHIP.decel` seconds.

### Requirement 2: Steering
**User Story:** As a player, I want to steer with A and D, so that I can choose where to sail.

#### Acceptance Criteria
1. WHILE the player holds A or the Left arrow, THE Game SHALL send rudder −1; WHILE the player holds D or the Right arrow, THE Game SHALL send rudder +1; WHILE neither or both are held, THE Game SHALL send rudder 0.
2. THE Simulation SHALL move the rudder toward the input by at most `SHIP.rudderRate` per second.
3. WHILE the rudder is to starboard, THE Simulation SHALL turn the ship to starboard (the bearing increases) at `SHIP.maxTurnRate × |rudder| × steerage`, where steerage rises from `SHIP.minSteerage` at rest to 1 at `SHIP.steerageSpeed`; WHILE it is to port, THE Simulation SHALL turn the ship to port at the same rate.
4. THE Simulation SHALL keep the heading in (−π, π].
5. THE Simulation SHALL move the ship along its heading by its speed × dt each step.

### Requirement 3: The archipelago
**User Story:** As a player, I want a sea full of distinct islands, so that I have places to explore and capture.

#### Acceptance Criteria
1. THE Simulation SHALL generate `WORLD.islandCount` islands from a seed, with the home island, Last Light, at the centre of the world.
2. THE Simulation SHALL generate identical islands for identical seeds.
3. THE Simulation SHALL keep at least `WORLD.islandGap` metres of water between the shores of any two islands.
4. THE Simulation SHALL keep every island's shore at least `WORLD.edgeMargin` metres inside the edge of the world.
5. THE Simulation SHALL give every island a unique name.
6. THE Simulation SHALL start the ship in open water, outside every collision circle, with the first haunted island between 220 and 280 metres from the centre and within 20° of the ship's starting heading.

### Requirement 4: Islands and the edge of the world are solid
**User Story:** As a player, I want islands and the edge of the world to stop my ship, so that the world feels solid.

#### Acceptance Criteria
1. WHEN a step would end with the ship inside an island's collision circle, THE Simulation SHALL move the ship back to the edge of the circle and cap its speed by how directly it hit: a head-on hit stops the ship, and a glancing hit lets it slide along the shore at up to `WORLD.shoreSlide × SHIP.maxSpeed`.
2. WHEN a step would end with the ship more than `WORLD.radius` from the centre, THE Simulation SHALL move it back to the edge and cap its speed the same way.
3. THE Simulation SHALL never move the ship more than `2 × SHIP.maxSpeed × dt` in one step.

### Requirement 5: Determinism and robustness
**User Story:** As the game server, I want the simulation to give the same result for the same inputs, so that I can replay battles and reject cheated results.

#### Acceptance Criteria
1. THE Simulation SHALL produce identical states from identical starting states and input sequences.
2. WHEN an input is out of range or not a finite number, THE Simulation SHALL clamp the rudder to [−1, 1], round and clamp the sail setting to 0, 1 or 2, and treat non-finite values as 0.
3. THE Simulation SHALL clamp each step's dt to [0, `MAX_STEP_SECONDS`] and treat a non-finite dt as 0.
4. THE Simulation SHALL not use `Math.random`, `Date`, `performance`, timers, the DOM or Three.js.

### Requirement 6: The night sea
**User Story:** As a player, I want a moody night sea, so that the game feels haunted from the first second.

#### Acceptance Criteria
1. THE Renderer SHALL draw an animated sea with smooth wave lighting, fine ripples that catch the moon and lanterns, a reflected night sky, foam on the highest crests and surf along island shores, plus a night sky with stars and a moon, and fog that hides islands beyond about 300 metres.
6. THE Renderer SHALL light the sea with the same slopes the waves have, so the light on the water matches the waves the ship rides.
2. THE Renderer SHALL float the ship on the same waves the player sees, with bobbing, pitching, rolling and leaning into turns, without changing the simulation.
3. THE Renderer SHALL show lantern glows through the fog: warm (`#FFB347`) on the player's island and ship, spectral green (`#5CFFB0`) on haunted islands.
4. THE Renderer SHALL show a foam wake behind the ship that grows with speed, and green ghost lights drifting over haunted islands.
5. THE Renderer SHALL interpolate between the last two simulation ticks, so motion is smooth at any frame rate.

### Requirement 7: Camera
**User Story:** As a player, I want the camera to follow my ship and let me look around, so that I can see where I'm going.

#### Acceptance Criteria
1. THE Game SHALL keep the camera behind the ship, following it smoothly and staying above the waves.
2. WHEN the player drags with the mouse, THE Game SHALL orbit the camera around the ship; WHEN the player stops dragging and the ship is moving, THE Game SHALL ease the camera back behind the ship.
3. WHEN the player scrolls, THE Game SHALL zoom the camera between 14 and 70 metres from the ship.

### Requirement 8: HUD and first minute
**User Story:** As a judge with only a few minutes, I want to understand the game and start sailing at once, so that I reach a fun moment quickly.

#### Acceptance Criteria
1. WHEN the game loads, THE Game SHALL show the title, a one-line story, the controls and a Set sail button, while the camera circles the ship.
2. WHEN the player clicks Set sail or presses a sail or steering key, THE Game SHALL hide the title and give control to the player.
3. THE Game SHALL show the compass bearing, the sail setting, the speed in knots and the controls.
4. WHEN an island is within 350 metres and in view, THE Game SHALL label it with its name, whether it is haunted or yours (in words, not only color), and its distance.
5. WHEN the ship has run aground, THE Game SHALL tell the player to turn away.
6. IF the browser does not support WebGL 2, THEN THE Game SHALL explain that a WebGL 2 browser is needed instead of showing a blank page.
7. IF the WebGL context is lost, THEN THE Game SHALL show a message with a Reload button.

### Requirement 9: Performance
**User Story:** As a player on an ordinary laptop, I want the game to run smoothly, so that it's fun to play.

#### Acceptance Criteria
1. THE Renderer SHALL use at most 150 draw calls and 4 point lights per frame.
2. THE Game SHALL offer High and Low graphics, and Low SHALL use pixel ratio 1, no antialiasing, a coarser sea and fewer particles.
3. WHEN the average frame rate stays under 40 fps for 5 seconds on High, THE Game SHALL suggest switching to Low.
4. THE Game SHALL expose read-only stats (draw calls, point lights, frame rate and the ship's state) on `window.__ghostlight` for the smoke test.
