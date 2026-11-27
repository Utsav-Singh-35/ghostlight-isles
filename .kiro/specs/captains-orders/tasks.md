# Implementation Plan

- [x] 1. Orders logic
  - [x] 1.1 `game/orders.ts`: the orders, `observe()`, `currentOrder()`, `readDone()`
    - _Requirements: 1.1, 2.1 to 2.4_
  - [x]* 1.2 Property tests
    - **Property 1: Done orders stay done**
    - **Property 2: The current order is the first one not done**
    - **Property 3: A seasoned captain skips ahead**
    - **Property 4: Saved progress reads back**
    - **Validates: Requirements 1.1, 1.3, 2.2, 2.4**

- [x] 2. In the game
  - [x] 2.1 `ui/ordersView.ts`: the card, marks that differ in shape, the finished message, "Hide"
    - _Requirements: 1.1 to 1.5_
  - [x] 2.2 Sightings each frame, actions from building, sieges and raids, saving, and the chime
    - _Requirements: 2.1 to 2.5_
  - [x] 2.3 Smoke test: a new captain sees order 1, raising the sails moves to order 2
    - _Requirements: 1.1, 2.1_
