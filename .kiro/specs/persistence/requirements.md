# Requirements Document

## Introduction
Accounts, saving and the game server. A player gets a guest captain on first visit and keeps their progress. One request handler holds every rule that touches progress; it runs as a Netlify Function online, and in the browser (saving to localStorage) when no server is reachable, so the game always works and the rules are written once.

## Glossary
- **Handler**: `src/server/api.ts`, a function from a web `Request` to a `Response`.
- **Store**: where profiles are kept: MongoDB online (since the accounts spec; Netlify Blobs before), localStorage offline, memory in tests and the preview server.
- **Profile**: one captain's saved progress.
- **Token**: `<player id>.<secret>`; the server keeps only a hash of the secret.
- **Resources**: gold, cursed gold and ectoplasm.

## Requirements

### Requirement 1: Guest captains
**User Story:** As a judge, I want to play at once without signing up, so that I reach the fun in seconds.

#### Acceptance Criteria
1. WHEN the game starts without a saved token, THE Game SHALL create a guest captain with a generated name and save the token on the device.
2. WHEN the game starts with a saved token, THE Game SHALL load that captain's profile.
3. IF the server rejects the saved token, THEN THE Game SHALL create a new guest captain.
4. WHEN a player renames their captain, THE Handler SHALL accept 2 to 20 letters, digits, spaces, apostrophes or hyphens, and reject anything else.

### Requirement 2: Security
**User Story:** As a player, I want my progress safe from other players, so that nobody else can spend my gold.

#### Acceptance Criteria
1. THE Handler SHALL store only a SHA-256 hash of each token's secret.
2. WHEN a request carries no token, an unknown player or a wrong secret, THE Handler SHALL answer 401 and change nothing.
3. THE Handler SHALL reject request bodies over 256 KB and malformed JSON with 400.
4. THE Handler SHALL never return another player's token hash.

### Requirement 3: Resources
**User Story:** As a captain, I want gold, cursed gold and ectoplasm that behave predictably, so that I can plan my base.

#### Acceptance Criteria
1. THE Economy SHALL keep every resource a finite whole number, never below zero.
2. THE Economy SHALL cap gold plus cursed gold, and ectoplasm, at the storage of the home island's level; earnings above the cap are lost.
3. WHEN a captain pays gold, THE Economy SHALL spend cursed gold first.
4. IF a captain can't afford a cost, THEN THE Economy SHALL refuse it and change nothing.

### Requirement 4: Tribute
**User Story:** As a captain with captured islands, I want them to pay tribute, so that captures are worth it.

#### Acceptance Criteria
1. WHEN a captain collects tribute, THE Economy SHALL pay `ECONOMY.tributePerMinute` gold per captured island for each whole minute since the last collection, up to the storage cap.
2. THE Economy SHALL count each minute of tribute only once.

### Requirement 5: Online and offline
**User Story:** As a player with no connection to the server, I want the game to keep working, so that I never see a broken page.

#### Acceptance Criteria
1. WHEN `/api/health` answers within 2.5 seconds, THE Game SHALL use the server.
2. OTHERWISE THE Game SHALL run the same Handler in the browser with a localStorage Store, and say it is saving on this device.
3. THE Dev server and the preview server SHALL serve the Handler at `/api` with a memory Store.
