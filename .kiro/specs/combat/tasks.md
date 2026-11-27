# Implementation Plan

- [x] 1. Battle numbers and layout
  - [x] 1.1 Add `BATTLE`, `WEAPONS`, `DEFENSES`, `GHOSTS` and the damage table to `balance.ts`
    - _Requirements: 1.1 to 1.5, 2.1 to 2.4_
  - [x] 1.2 Add `layout.ts`: slot and mine positions, fort and rival layouts
    - _Requirements: 6.1_
  - [x] 1.3 Let `stepShip` take a speed table, so ghosts sail at their own speed
    - _Requirements: 3.3_

- [x] 2. Battle simulation
  - [x] 2.1 `battle.ts`: setup, weapons, defenses, ghost AI, shots, burning zones, mines, end and score
    - _Requirements: 1.1 to 1.5, 2.1 to 2.5, 3.1 to 3.4, 4.1 to 4.4_
  - [x] 2.2 Input events: sanitize, record, `runBattle`
    - _Requirements: 5.1 to 5.3_
  - [x]* 2.3 Property tests
    - **Property 1: Same setup and inputs, same battle**
    - **Property 2: A live battle replays exactly**
    - **Property 3: The battle state stays valid**
    - **Property 4: Health never rises**
    - **Property 5: Every battle ends, with a consistent score**
    - **Property 6: The two threats need two defenses**
    - **Property 7: Veiled ghosts can't be targeted by towers**
    - **Property 8: Malformed inputs are harmless**
    - **Property 9: Every keep is within reach**
    - **Validates: Requirements 1.1, 2.1, 2.2, 2.5, 3.2, 3.4, 4.1 to 4.3, 5.1 to 5.5**

- [x] 3. Battle view
  - [x] 3.1 `battleLayer.ts`: island, defenses, keep, ghost ships, shots, fire, mines, explosions
    - _Requirements: 6.1, 6.2_
  - [x] 3.2 Battle runner, battle HUD, health bars and result screen
    - _Requirements: 6.3, 6.4_
  - [x] 3.3 Smoke test: a practice battle runs, fires and ends
    - _Requirements: 6.1 to 6.4_
