# Implementation Plan

- [x] 1. Cue planning
  - [x] 1.1 `audio/cues.ts`: event to cue, loudness, pan, merge and rank
    - _Requirements: 1.1 to 1.5_
  - [x]* 1.2 Property tests
    - **Property 1: Cues are well formed**
    - **Property 2: Nearer is never quieter**
    - **Property 3: Sounds come from their side**
    - **Property 4: News is never dropped**
    - **Validates: Requirements 1.1 to 1.5**

- [x] 2. Sounds
  - [x] 2.1 `audio/synth.ts`: buses, reverb, noise buffers, the battle and interface voices
    - _Requirements: 1.1, 3.1 to 3.3_
  - [x] 2.2 Ambience: sea, wash, wind, Blood Moon drone and heartbeat, Locker muffle and bubbles, the fleet's bell
    - _Requirements: 2.1 to 2.4_
  - [x] 2.3 `audio/sound.ts`: unlock on first gesture, on/off setting, suspend when off or hidden, silent without Web Audio
    - _Requirements: 4.2 to 4.4_

- [x] 3. In the game
  - [x] 3.1 Wire battle events, frames, puzzles, results, building, tribute and buttons in `game/app.ts`
    - _Requirements: 1.1, 2.1 to 2.4, 3.1 to 3.3_
  - [x] 3.2 HUD sound button and the M key
    - _Requirements: 4.1_
  - [x] 3.3 Smoke test: audio runs after the first key press, battles start cues, the button turns it off
    - _Requirements: 1.1, 4.1, 4.2_
