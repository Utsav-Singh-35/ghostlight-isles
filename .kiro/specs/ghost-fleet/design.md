# Design Document: Ghost fleet

## Overview
`src/sim/bloodMoon.ts` (pure) computes the shared clock and the fleet. `src/server/ghosts.ts` adds the routes. The client polls nothing: it computes the clock from the server's time and the profile, shows a countdown, and starts the siege when the fleet arrives.

| Route | Does |
|---|---|
| `POST /ghosts/summon` | Raises a personal Blood Moon (cooldown) |
| `POST /ghosts/defend` | Hands out a siege ticket built from the captain's base |
| `POST /ghosts/finish { id, inputs }` | Replays the siege; pays for sunk ghosts; ghosts take loot; rests the island |
| `POST /chapel/cleanse` | Starts cleansing all cursed gold |
| `POST /collect` | Also completes a cleanse whose time has come |

```ts
bloodMoonAt(nowMs): { active: boolean; index: number; startsAt: number; endsAt: number; nextStart: number }
moonIsUp(profile, nowMs): boolean            // shared window or summoned
fleetFor(profile): { count: number; level: number }
```

## Correctness Properties

**Property 1: The clock is regular.** *For any* time, the Blood Moon is up exactly during the first `durationSeconds` of its period; the next start is later than now and at most one period away; windows never overlap.
**Validates: Requirement 1.1**

**Property 2: Greed grows the fleet.** *For any* captain, adding cursed gold never shrinks the fleet, and the fleet stays between 1 and `GHOSTS.maxFleet` ships at a level between 1 and `GHOSTS.maxLevel`.
**Validates: Requirements 2.2, 2.3**

**Property 3: Sieges pay what the replay says.** *For any* recorded siege inputs, the captain gains the per-ship rewards for exactly the ghosts the replay sank (up to the cap) and loses exactly `takeShare(raidShare × destruction)` of what they held before the rewards.
**Validates: Requirements 3.1, 3.2**

**Property 4: The fleet keeps to the moon.** *For any* time and profile state, `/ghosts/defend` succeeds exactly when the moon is up and the island is not resting (a summoned moon ignores rest), and summoning respects its cooldown.
**Validates: Requirements 2.4, 2.5, 3.3**

**Property 5: Cleansing is exact and happens once.** *For any* cursed gold amount and collection times, cleansing returns that amount as plain gold (up to the cap) exactly once, and not before its time.
**Validates: Requirement 4.2**
