---
inclusion: fileMatch
fileMatchPattern: "src/sim/**/*.ts"
---
# Simulation conventions

- **Units:** 1 world unit is about 1 metre. Time is in seconds, angles in radians.
- **Ground plane:** X and Z. Y is up, and the simulation ignores it.
- **Heading:** heading `h` points the ship along `(sin h, cos h)` in (x, z). Heading 0 faces +Z (south) and π faces −Z (north). Turning to starboard (right) lowers the heading. The compass bearing shown to players is `headingToBearing(h)` in `src/sim/math.ts`: degrees in [0, 360), north at −Z, east at +X.
- **Rudder:** input from −1 to +1, where +1 means starboard.
- **No mutation:** functions take the old state and return a new one.
- **Time step:** step functions take `dt`, and the game always passes `TICK_SECONDS`. Code must stay correct for any `dt` from 0 to 0.1 seconds.
- **Property tests for every rule:** start from the acceptance criteria in the spec and state the rule as "for any valid input, X holds".
- **Regressions:** when a property test finds a bug, keep the shrunk counterexample as a normal example test after the fix.
