# Implementation Plan

- [x] 1. Rules
  - [x] 1.1 `sim/bloodMoon.ts`: the shared clock, summoned moons, the fleet
    - _Requirements: 1.1, 2.2, 2.3_
  - [x]* 1.2 Property tests
    - **Property 1: The clock is regular**
    - **Property 2: Greed grows the fleet**
    - **Validates: Requirements 1.1, 2.2, 2.3**

- [x] 2. Routes
  - [x] 2.1 `server/ghosts.ts`: summon, defend, finish, cleanse; cleanse completion in `/collect`
    - _Requirements: 2.2 to 2.5, 3.1 to 3.3, 4.2_
  - [x]* 2.2 Property tests
    - **Property 3: Sieges pay what the replay says**
    - **Property 4: The fleet keeps to the moon**
    - **Property 5: Cleansing is exact and happens once**
    - **Validates: Requirements 2.4, 2.5, 3.1 to 3.3, 4.2**

- [x] 3. In the game
  - [x] 3.1 Red moon, sky and fog; the clock and the warning in the HUD; the countdown and the siege
    - _Requirements: 1.2, 1.3, 2.1_
  - [x] 3.2 Summon button (HUD and title screen); chapel and fleet preview in the base panel
    - _Requirements: 2.5, 4.3_
  - [x] 3.3 Smoke test: summon the Blood Moon, fight the siege, see the result
    - _Requirements: 1.3, 2.1, 2.5, 3.1_
