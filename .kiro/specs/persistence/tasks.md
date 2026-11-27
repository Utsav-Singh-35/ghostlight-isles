# Implementation Plan

- [x] 1. Economy rules
  - [x] 1.1 `sim/economy.ts`: resources, caps, spending, earning, tribute, the starting profile
    - _Requirements: 3.1 to 3.4, 4.1, 4.2_
  - [x]* 1.2 Property tests
    - **Property 1: Resources stay valid**
    - **Property 2: Spending is exact and takes cursed gold first**
    - **Property 3: Tribute is counted once**
    - **Validates: Requirements 3.1 to 3.4, 4.1, 4.2**

- [x] 2. The handler
  - [x] 2.1 `server/api.ts`: router, JSON and size checks, tokens and hashes, guest, profile, rename, collect
    - _Requirements: 1.1 to 1.4, 2.1 to 2.4_
  - [x] 2.2 Stores: memory, localStorage, Netlify Blobs; the Netlify Function; the Vite dev and preview middleware
    - _Requirements: 5.2, 5.3_
  - [x]* 2.3 Property tests
    - **Property 4: Profiles round-trip**
    - **Property 5: Wrong tokens change nothing**
    - **Property 6: Names are validated**
    - **Validates: Requirements 1.2, 1.4, 2.2, 2.4**

- [x] 3. The client
  - [x] 3.1 `net/backend.ts` and `net/session.ts`: online check, offline fallback, saved token, guest creation
    - _Requirements: 1.1 to 1.3, 5.1, 5.2_
  - [x] 3.2 HUD: captain name, resources, online or offline
    - _Requirements: 5.2_
