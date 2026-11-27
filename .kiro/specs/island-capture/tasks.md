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
  - [x] 2.1 `server/capture.ts`: start and finish, replay and puzzle checks, rewards, reports
    - _Requirements: 2.2 to 2.6_
  - [x]* 2.2 Property tests
    - **Property 5: Only a real win captures a fort**
    - **Property 6: Tickets are single-use and captures happen once**
    - **Validates: Requirements 2.3, 2.5**

- [x] 3. In the game
  - [x] 3.1 Capture prompt at sea, fort battles through the server, the puzzle view
    - _Requirements: 1.3, 2.1_
  - [x] 3.2 Warm lights and "Yours" labels on captured islands; tribute every minute; custom-seed notice
    - _Requirements: 3.1 to 3.4_
  - [x] 3.3 Smoke test: solve a puzzle capture in the browser
    - _Requirements: 1.3, 2.4, 3.2_
