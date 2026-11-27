# Implementation Plan

- [x] 1. Lantern Lines
  - [x] 1.1 `sim/puzzle.ts`: generator, trace, solved check, sanitizer
    - _Requirements: 1.1, 1.2, 1.4_
  - [x]* 1.2 Property tests
    - **Property 1: Every puzzle has a solution**
    - **Property 2: No puzzle starts solved**
    - **Property 3: The beam behaves**
    - **Property 4: Solved means every totem is lit**
    - **Validates: Requirements 1.1 to 1.4**

- [x] 2. Capture routes
  - [x] 2.1 `server/capture.ts`: start and finish, replay checks, rewards, reports
    - _Requirements: 2.2 to 2.6_
  - [x]* 2.2 Property tests
    - **Property 5: Only a real win captures a fort**
    - **Property 6: Tickets are single-use and captures happen once**
    - **Validates: Requirements 2.3, 2.5**

- [x] 3. In the game
  - [x] 3.1 Capture prompt at sea, fort battles through the server
    - _Requirements: 2.1_
  - [x] 3.2 Warm lights and "Yours" labels on captured islands; tribute every minute; custom-seed notice
    - _Requirements: 4.1 to 4.4_

- [x] 4. Battles only, and forts that get harder
  - [x] 4.1 Remove the puzzle capture: server refuses other methods, prompt offers only the fort, tutorial text
    - _Requirements: 2.1, 2.4_
  - [x] 4.2 `FORTS` table, `fortLevelAt`, island radius by level in `generateWorld`, `fortLayout` and `fortSetup` by level
    - _Requirements: 3.1 to 3.5_
  - [x] 4.3 Island ghosts in assaults (combat spec Requirement 3.5 and 3.6)
    - _Requirements: 3.4_
  - [x]* 4.4 Property tests
    - **Property 6: Tickets are single-use and captures happen once** (updated)
    - **Property 7: Forts get harder further out**
    - **Property 8: Each level is a stronger fort**
    - **Validates: Requirements 2.4, 2.5, 3.1 to 3.5**
  - [x] 4.5 Balance tests with the scripted captain across all five levels
    - _Requirements: 3.3 to 3.5_
  - [x] 4.6 Fort level on labels and the prompt, the dawn clock, fort walls in the sea and in battle, props on battle islands
    - _Requirements: 3.5, 3.6_
  - [x] 4.7 Smoke test: win the first fort battle in the browser and capture the island
    - _Requirements: 2.3, 4.2_
