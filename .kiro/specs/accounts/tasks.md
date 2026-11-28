# Implementation Plan

- [x] 1. Storage
  - [x] 1.1 `Store.create` and `Store.list` in the memory, localStorage and MongoDB stores; per-captain leaderboard records
  - _Requirements: 4.1 to 4.4_
  - [x]* 1.2 Property 7
- [x] 2. Credentials
  - [x] 2.1 PBKDF2 password hashes and HS256 tokens with Web Crypto; `authenticate` accepts tokens and old guest tokens
  - _Requirements: 3.1 to 3.4, 3.6_
  - [x] 2.2 `/register`, `/login`, the lockout, guest tokens as JWTs, `/rename` for guests only
  - _Requirements: 1.1 to 1.5, 2.1 to 2.3_
  - [x]* 2.3 Properties 1 to 6 and the examples
- [x] 3. Hosting
  - [x] 3.1 Netlify Function on MongoDB with environment variables; dev server on MongoDB when configured; preview on memory; `.env.example`
  - _Requirements: 3.5, 4.5_
- [x] 4. In the game
  - [x] 4.1 Account button and panel, "Guest" on the captain bar, reload on switching captains
  - _Requirements: 2.4, 2.5, 5.1 to 5.4_
  - [x] 4.2 Smoke test: create an account, reload, log out, log back in
- [x] 5. Docs: steering (`tech`, `structure`), README, usage log
