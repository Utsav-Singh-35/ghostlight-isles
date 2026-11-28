# Implementation Plan

- [x] 1. Rules
  - [x] 1.1 Numbers in `balance.ts`; `mortar` ship part, with old profiles reading as level 0
    - _Requirements: 3.1_
  - [x] 1.2 Locked target in inputs and broadsides; the mortar; bonus targets, powder blasts, scoring that ignores them
    - _Requirements: 2.2, 2.3, 3.2, 3.3, 4.2, 4.3_
  - [x] 1.3 `fortLayout` bonus targets; `captureRewards`
    - _Requirements: 4.1, 5.1_
  - [x]* 1.4 Property tests
    - **Property 1: Rewards add up**
    - **Property 2: Locked targets are honoured**
    - **Property 3: The mortar only fires at what it can reach**
    - **Property 4: Powder stores blow up their neighbours**
    - **Property 5: Bonus targets don't decide the battle**
    - **Validates: Requirements 2.2, 2.3, 3.2, 3.3, 4.2, 4.3, 5.1**

- [x] 2. Server
  - [x] 2.1 Capture pays `captureRewards` from the replay and returns the breakdown; nothing for a loss
    - _Requirements: 5.1, 5.3_

- [x] 3. In the game
  - [x] 3.1 Clickable labels, the selected island, the fort report
    - _Requirements: 1.1 to 1.4_
  - [x] 3.2 G for the mortar, T and clicks for the lock, lock marker and HUD line, mortar meter, shipwright row
    - _Requirements: 2.1, 2.4, 3.1_
  - [x] 3.3 Shells, vault and powder models, blasts, sounds; reward lines on the result card
    - _Requirements: 3.3, 5.2_
  - [x] 3.4 Smoke test: select a fort by its label, lock a target, capture it, read the reward breakdown
    - _Requirements: 1.1, 2.1, 5.2_
