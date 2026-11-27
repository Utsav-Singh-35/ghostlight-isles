# Implementation Plan

- [x] 1. Rules and routes
  - [x] 1.1 `aftermath.ts` sets `sunk`; `sim/crew.ts`: keep and hire
    - _Requirements: 1.1, 1.2, 3.1 to 3.3_
  - [x] 1.2 `server/locker.ts`: escape, finish, pay, keep, hire
    - _Requirements: 1.3, 2.1 to 2.4, 3.2, 3.3_
  - [x]* 1.3 Property tests
    - **Property 1: Sinking drowns one crew member and sends the ship down**
    - **Property 2: Ghosts fade on schedule**
    - **Property 3: The Locker lets go exactly once, at the right price**
    - **Property 4: A sunk ship can't fight**
    - **Property 5: The Ferryman's price is exact**
    - **Validates: Requirements 1.1 to 1.3, 2.2 to 2.4, 3.1, 3.2**

- [x] 2. In the game
  - [x] 2.1 The Locker scene, the Ferryman's offer, the timed escape, back to Last Light
    - _Requirements: 2.1, 2.5_
  - [x] 2.2 Crew in the shipwright: state, effect, keep and hire
    - _Requirements: 3.4_
  - [x] 2.3 Smoke test: sink in a raid, escape the Locker
    - _Requirements: 1.1, 2.1, 2.2, 2.5_
