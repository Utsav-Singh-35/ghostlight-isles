# Design Document: Raids

## Overview
| Route | Does |
|---|---|
| `GET /raids/targets` | Up to 8 targets |
| `POST /raids/start { targetId }` | Snapshots the defender; returns a battle ticket |
| `POST /raids/finish { id, inputs }` | Replays, moves loot, writes the report, protects the defender |
| `GET /leaderboard` | Top 10 by infamy and the caller's rank |

Rivals live in `src/server/rivals.ts`: ids `rival-0` to `rival-9`, names, home levels and layouts generated from fixed seeds (`rivalLayout`). Only their protection time is stored (`rival:<id>`). Real captains are found through the `index` entry each save writes.

Every raided island uses Last Light's shape (radius `WORLD.homeIslandRadius`), with a terrain seed from the defender's id, so islands look different but play fair.

## Correctness Properties

**Property 1: Loot is bounded and conserved.** *For any* raid inputs and defender storage, the defender loses at most `REWARDS.raidShare` of each resource, scaled by the replay's destruction, and the raider gains at most what the defender lost.
**Validates: Requirements 2.2, 2.3**

**Property 2: Protected and own islands are off limits.** *For any* target id, starting a raid on the caller, a protected captain or an unknown id is refused and changes nothing.
**Validates: Requirements 1.2, 3.2**

**Property 3: One report and fair protection per raid.** *For any* finished raid on a captain, the defender gains exactly one report, and is protected afterwards exactly when the replay destroyed something.
**Validates: Requirements 3.1, 3.2**

**Property 4: Infamy follows stars.** *For any* finished raid, the raider's infamy rises by exactly `REWARDS.infamyPerStar` × the replay's stars.
**Validates: Requirement 2.4**
