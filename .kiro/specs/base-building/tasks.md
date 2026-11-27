# Implementation Plan

- [x] 1. Rules
  - [x] 1.1 `sim/base.ts`: build, upgrade, remove, home upgrade, ship upgrades, costs and refunds
    - _Requirements: 1.1 to 1.5, 2.1, 2.2_
  - [x]* 1.2 Property tests
    - **Property 1: The base stays valid**
    - **Property 2: Costs are exact**
    - **Property 3: Refunds are exact**
    - **Validates: Requirements 1.1 to 1.5, 2.1, 2.2**

- [x] 2. Routes
  - [x] 2.1 `server/base.ts`
    - _Requirements: 1.1 to 2.3_
  - [x]* 2.2 Property test
    - **Property 4: The server and the rules agree**
    - **Validates: Requirements 1.1 to 2.3**

- [x] 3. Base view
  - [x] 3.1 Defenses on Last Light in the open sea, base camera
    - _Requirements: 3.1, 3.3_
  - [x] 3.2 Base panel with Defenses and Shipwright tabs
    - _Requirements: 3.2, 3.4_
  - [x] 3.3 Smoke test: build a Spirit Lantern from the panel
    - _Requirements: 1.1, 3.1, 3.2_
