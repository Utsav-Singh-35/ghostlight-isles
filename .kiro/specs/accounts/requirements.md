# Requirements Document

## Introduction
Real accounts for Ghostlight Isles. A player can pick a unique username and a password, then log in from any device and find their captain as they left it: base, ship, crew, captured islands, reports and leaderboard place. Guests still play at once, and keep their progress when they pick a username. Online, every record lives in MongoDB. Passwords are hashed and sessions are JSON Web Tokens, both made with Web Crypto, so the server needs no packages besides the MongoDB driver.

## Glossary
- **Username**: a captain's unique public name. 3 to 16 letters, digits or underscores, starting with a letter. Unique ignoring case: `Mara_Vane` and `mara_vane` are the same name.
- **Guest**: a captain without a username. Their token is the only way back in.
- **Registered captain**: a captain with a username and a password.
- **Token**: a JSON Web Token signed with HMAC-SHA256 (`HS256`) using the server's `JWT_SECRET`. Its subject is the player id; it also carries the captain's token version and an expiry.
- **Password hash**: `pbkdf2-sha256$<iterations>$<salt>$<hash>`, from PBKDF2 with SHA-256 and a random 16-byte salt.
- **Store**: where records are kept: MongoDB online, localStorage offline, memory in tests and the preview server.

## Requirements

### Requirement 1: Usernames
**User Story:** As a player, I want a unique username, so that other captains can find me and know who I am.

#### Acceptance Criteria
1. WHEN a guest picks a username and password, THE Handler SHALL accept usernames of 3 to 16 letters, digits or underscores starting with a letter, and passwords of 8 to 72 characters, and reject anything else with 400.
2. THE Handler SHALL never give one username to two captains, ignoring case, even when two players ask for it at the same moment.
3. IF a username is taken, THEN THE Handler SHALL answer 409 and change nothing.
4. WHEN a guest registers, THE Handler SHALL keep every part of their progress, and their captain's name SHALL become their username.
5. IF a registered captain asks to register again or to rename, THEN THE Handler SHALL refuse with 400 and change nothing.

### Requirement 2: Logging in
**User Story:** As a player, I want to log in on any device, so that my captain goes wherever I go.

#### Acceptance Criteria
1. WHEN a player logs in with a registered username (in any case) and its password, THE Handler SHALL answer with a new token and that captain's profile.
2. IF the username is unknown or the password is wrong, THEN THE Handler SHALL answer 401 with the same message for both, and return no token.
3. WHEN a captain has failed to log in 5 times within 15 minutes, THE Handler SHALL refuse further logins for that username for 15 minutes, even with the right password.
4. WHEN a player logs out, THE Game SHALL forget the token and go back to this device's guest captain, or a new guest if there is none.
5. WHEN a token is accepted, THE Game SHALL save it on the device, so a reload stays logged in.

### Requirement 3: Security
**User Story:** As a player, I want my account safe, so that nobody else can take my captain or my gold.

#### Acceptance Criteria
1. THE Handler SHALL store only a salted PBKDF2-SHA256 hash of each password, with at least 600,000 iterations online, and never a password itself.
2. THE Handler SHALL never return a password hash, a token hash or a token version in any response.
3. WHEN a request carries a token that is malformed, signed with another key, altered, expired, for another algorithm, or from an older token version, THE Handler SHALL answer 401 and change nothing.
4. WHEN a guest registers, THE Handler SHALL raise their token version, so tokens issued before the password was set stop working.
5. THE Server SHALL read `MONGODB_URI`, `MONGODB_DB` and `JWT_SECRET` from environment variables only. IF `MONGODB_URI` or `JWT_SECRET` is missing online, THEN the health check SHALL fail and the game SHALL play offline on the device, rather than run with an unsafe default.
6. THE Handler SHALL keep accepting guest tokens issued before this change (`<id>.<secret>`), so no guest loses their captain.

### Requirement 4: Storage
**User Story:** As the developer, I want every record in MongoDB, readable in Atlas, so that captains are kept safely and I can inspect them.

#### Acceptance Criteria
1. THE MongoDB Store SHALL keep players, usernames, leaderboard entries and rival islands in their own collections (`players`, `usernames`, `leaderboard`, `rivals`), as readable documents.
2. THE Store SHALL offer an insert that succeeds only when the key is new, and SHALL report whether it did, atomically.
3. THE Store SHALL list every record whose key starts with a given prefix.
4. WHEN a captain saves, THE Handler SHALL write only that captain's leaderboard entry, so two captains saving at once never lose each other's entries.
5. THE Dev server SHALL use MongoDB when `MONGODB_URI` is set; the preview server and tests SHALL use a memory Store, so the smoke test never writes to the real database.

### Requirement 5: In the game
**User Story:** As a player, I want to see who I'm signed in as and switch accounts easily, so that I always know where my progress goes.

#### Acceptance Criteria
1. THE Game SHALL show an Account button. For a guest it SHALL offer to create an account (keeping their progress) or log in; for a registered captain it SHALL show the username and offer to log out.
2. THE Captain bar SHALL show "Guest" next to a guest's name.
3. WHEN a login or logout switches captains, THE Game SHALL reload, so nothing from the previous captain stays on screen.
4. THE Form SHALL say why a username or password was refused, in plain words.
