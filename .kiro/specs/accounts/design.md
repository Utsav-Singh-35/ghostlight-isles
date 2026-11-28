# Design Document: accounts

## Overview
Accounts sit on the existing handler (`src/server/api.ts`), so the rules still run in three places: Netlify, Vite's servers and the browser when offline. Only the Store changes underneath: MongoDB on Netlify (and in `npm run dev` when configured), memory in tests and the preview server, localStorage offline.

```
Browser ── fetch /api/* ──► Netlify Function ──► handle(request, ctx) ──► MongoStore ──► Atlas: ghostlight
   │                                                    ▲
   └── offline: handle(request, ctx) ──► LocalStore ────┘ same rules
```

## Store
`Store` gains two methods:

| Method | Meaning | MongoDB | Memory and localStorage |
|---|---|---|---|
| `get(key)` / `set(key, value)` | As before | `findOne` / `replaceOne(upsert)` | Map / localStorage |
| `create(key, value)` | Insert only if the key is new; returns whether it did | `insertOne`; duplicate key error 11000 means false | Check, then set (single-threaded) |
| `list(prefix)` | Every `[key, value]` whose key starts with `prefix` | `find({})` on the prefix's collection | Scan |

Keys are `<kind>:<id>`. `MongoStore` (`src/storage/mongoStore.ts`, Node only) maps each kind to a collection and stores the parsed JSON, so Atlas shows real documents:

| Key | Collection | `_id` |
|---|---|---|
| `player:<id>` | `players` | player id |
| `user:<lowercase username>` | `usernames` | lowercase username |
| `index:<id>` | `leaderboard` | player id |
| `rival:<id>` | `rivals` | rival id |
| anything else | `misc` | the whole key |

Each document is `{ _id, data, updatedAt }`. `list(prefix)` only accepts a prefix of the form `<kind>:`. The client is cached at module level, so a warm Netlify Function reuses its connection. The database is `MONGODB_DB` (default `ghostlight`), whatever database the URI names.

The single `index` record becomes one `index:<id>` record per captain, so saving writes only your own entry. `readIndex` also reads an old single `index` record if one exists (saves made offline before this change).

## Usernames
`user:<lowercase>` holds `{ id }`. Registering:
1. Validate the username and password.
2. `create('user:<lowercase>', { id })`. If it returns false, answer 409. Because MongoDB's `_id` is unique, two players asking at once can't both win.
3. Hash the password, set `username`, `name = username`, `passwordHash`, `tokenVersion + 1`, save, and answer with a new token.

## Passwords
PBKDF2-SHA256 through `crypto.subtle.deriveBits`, 16-byte random salt, 32-byte hash, stored as `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`. The iteration count is stored with the hash, so it can rise later without breaking old passwords. Online it is 600,000 (OWASP's current advice for PBKDF2-SHA256); tests pass a lower count through `ServerContext.passwordIterations` to stay fast. Comparison is constant-time.

Failed logins are counted on the profile (`loginFailures`, `loginWindowStart`, `lockedUntil`), and a success clears them.

## Tokens
A JWT: `base64url(header).base64url(payload).base64url(signature)`, header `{"alg":"HS256","typ":"JWT"}`, payload `{ sub, ver, iat, exp }` in seconds, valid 30 days. Verification:
1. Exactly three parts, each base64url.
2. The header is exactly HS256 (rejects `none` and every other algorithm).
3. The signature verifies with `crypto.subtle.verify` (constant time).
4. `exp` is in the future, `sub` is a player id, and `ver` equals the profile's `tokenVersion` (0 when missing).

Guest tokens issued before this change (`<id>.<32 hex>`) still work through the old hash check.

The secret is `ServerContext.jwtSecret`: `JWT_SECRET` online, a fixed test secret in tests, a random per-process secret in the preview server, and a random secret kept in localStorage offline (offline tokens only ever meet this browser's own handler).

## Routes
| Route | Auth | Does |
|---|---|---|
| `POST /guest` | no | Creates a guest; answers `{ token, profile }` with a JWT |
| `POST /register` | guest | `{ username, password }` → claims the username for this guest |
| `POST /login` | no | `{ username, password }` → `{ token, profile }`; 401 for a wrong login, 429 while the username is locked |
| `POST /rename` | guest | As before; refused for registered captains |

`PublicProfile` drops `tokenHash`, `passwordHash`, `tokenVersion` and the login counters. It keeps `username`, so the client knows whether this is a guest.

## Configuration
| Variable | Where | Meaning |
|---|---|---|
| `MONGODB_URI` | Netlify, local `.env` | Atlas connection string. Never committed |
| `MONGODB_DB` | Netlify, local `.env` | Database name, `ghostlight` |
| `JWT_SECRET` | Netlify, local `.env` | At least 32 random characters. Never committed |

`.env.example` lists them without values. The Netlify Function answers the health check with `ok: false` when either secret is missing, so the game falls back to playing on the device.

## Correctness properties
**Property 1: Usernames are unique, ignoring case.** *For any* sequence of registrations with usernames drawn from a small pool in mixed case, at most one captain holds each lowercase username; every refused registration answers 409 or 400 and leaves the store unchanged. Validates Requirements 1.2, 1.3.

**Property 2: Usernames and passwords are validated.** *For any* text, registration succeeds only when the username and password follow the rules in Requirement 1.1. Validates Requirement 1.1.

**Property 3: Registering keeps progress.** *For any* guest with any progress, the profile after registering equals the profile before, except for `username`, `name` and the credentials. Validates Requirement 1.4.

**Property 4: Only the right password logs in.** *For any* registered captain and any other password, logging in with the other password answers 401 with no token, and logging in with the right password in any letter case of the username answers that captain's profile. Validates Requirements 2.1, 2.2.

**Property 5: Altered tokens are refused.** *For any* valid token, changing any one character, swapping in another payload, signing with another secret, setting `alg` to `none`, or letting it expire makes every authenticated route answer 401 and change nothing. Validates Requirement 3.3.

**Property 6: No secret leaves the server.** *For any* registered captain and password, no response contains the password, `passwordHash`, `tokenHash` or `tokenVersion`, and no stored record contains the password. Validates Requirements 3.1, 3.2.

**Property 7: Stores keep the contract.** *For any* sequence of `set`, `create` and `list` calls, a store behaves like a map: `create` succeeds only for new keys, `get` returns the last value written, and `list(prefix)` returns exactly the keys with that prefix. Checked for the memory store, and for MongoDB when `MONGODB_TEST_URI` is set. Validates Requirements 4.2, 4.3.

## Testing strategy
- Property tests 1 to 7 with fast-check; Properties 1 to 6 through the handler with `testServer`.
- Examples: the lockout after 5 failures and its end after 15 minutes; registering twice; renaming a registered captain; old guest tokens still work; two captains saving at once keep both leaderboard entries; tokens from before registration stop working.
- Smoke test: create an account in the browser, reload and stay logged in, log out, log back in.
