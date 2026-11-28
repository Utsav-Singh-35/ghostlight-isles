# Implementation Plan

- [x] 1. Server
  - [x] 1.1 `server/rivals.ts`: ten rival captains, their storage and protection
    - _Requirements: 1.1_
  - [x] 1.2 `server/raids.ts`: targets, start, finish, leaderboard
    - _Requirements: 1.1, 1.2, 2.1 to 2.5, 3.1, 3.2, 4.1_
  - [x]* 1.3 Property tests
    - **Property 1: Loot is bounded and conserved**
    - **Property 2: Protected and own islands are off limits**
    - **Property 3: One report and fair protection per raid**
    - **Property 4: Infamy follows stars**
    - **Validates: Requirements 1.2, 2.2 to 2.4, 3.1, 3.2**

- [x] 2. Client
  - [x] 2.1 Raid list (R or the Raid button), raid battles, loot on the result card
    - _Requirements: 1.1, 2.2_
  - [x] 2.2 Captain's Log (L): reports and leaderboard; protection time in the captain bar
    - _Requirements: 3.3, 4.2_
  - [x] 2.3 Smoke test: raid a rival, open the log
    - _Requirements: 1.1, 4.2_

- [x] 5. Finding rivals and paying them back
  - [x] 5.1 Toughness stars from base strength; one star per fort level on labels and fort reports
  - [x] 5.2 Search by username; the raider named on the defender's report, with a Raid back button
  - _Requirements: 5.1 to 5.4_
  - [x]* 5.3 Properties 5 and 6, a search example, smoke checks for the stars
