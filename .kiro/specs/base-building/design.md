# Design Document: Base building

## Overview
`src/sim/base.ts` holds pure commands that take a profile and return `{ ok: true, profile }` or `{ ok: false, reason }`. `src/server/base.ts` exposes them as routes; the client calls the routes and redraws Last Light from the returned profile.

| Route | Command |
|---|---|
| `POST /base/build { type, slot }` | `buildDefense` |
| `POST /base/upgrade { type, slot }` | `upgradeDefense` (type tells tower slots from mine slots) |
| `POST /base/remove { type, slot }` | `removeDefense` |
| `POST /base/home` | `upgradeHome` |
| `POST /ship/upgrade { part }` | `upgradeShip` |

The amount spent on a defense is not stored; it is the sum of `COSTS[type][0..level-1]`, so refunds can't drift.

## Correctness Properties

**Property 1: The base stays valid.** *For any* sequence of commands, every defense sits on a slot the home level has, at most one per slot, at level 1 to 3, of a type the home level has unlocked; resources stay valid.
**Validates: Requirements 1.4, 1.5, 2.1**

**Property 2: Costs are exact.** *For any* profile and command, a successful build or upgrade lowers resources by exactly its cost (cursed gold first), and a refused command changes nothing.
**Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2**

**Property 3: Refunds are exact.** *For any* defense, removing it returns floor(`COSTS.refund` × spent) of each resource, up to the cap.
**Validates: Requirement 1.3**

**Property 4: The server and the rules agree.** *For any* sequence of base commands sent to the handler, the saved profile equals applying the same pure commands in order.
**Validates: Requirements 1.1 to 2.3**

## Base view
- `CameraMode 'base'` orbits Last Light from above. The ship's sails furl while the panel is open.
- `GameRenderer.setHomeDefenses` draws defenses from the profile, with heights raycast from the island's terrain.
- The panel (`ui/basePanel.ts`) has two tabs, Defenses and Shipwright, and builds all its DOM with `textContent`.
