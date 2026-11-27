# Design Document: Davy Jones' Locker

## Overview
`server/aftermath.ts` already wears down ghost crew and drowns a living crew member when a ship sinks; this feature also sets `sunk`. `server/locker.ts` adds the routes; `sim/crew.ts` holds the pure crew commands.

| Route | Does |
|---|---|
| `POST /locker/escape` | Hands out the escape puzzle (requires `sunk`) |
| `POST /locker/finish { id, orientation }` | Frees the ship; solved in time costs nothing, anything else costs gold |
| `POST /locker/pay` | Pays the Ferryman and frees the ship |
| `POST /crew/keep { role }` | Keeps a ghost crew member for more battles |
| `POST /crew/hire { role }` | Hires a living crew member for an empty post |

The escape is "in time" when the server receives it within `LOCKER.puzzleSeconds` plus a 15-second grace for the network.

## Locker scene
The game dims and tints the 3D view toward a drowned teal and blurs it, shows rising bubbles and the Ferryman's offer, then opens the Lantern Lines with a countdown. A freed ship reappears beside Last Light.

## Correctness Properties

**Property 1: Sinking drowns one crew member and sends the ship down.** *For any* battle result and crew, a sinking sets `sunk` and turns exactly one living crew member (if there is one) into a ghost with `CREW.ghostBattles` battles; a battle without sinking changes no living crew member.
**Validates: Requirements 1.1, 1.2**

**Property 2: Ghosts fade on schedule.** *For any* sequence of battles and keeps, each ghost crew member loses one battle per battle, fades at zero, and each keep adds exactly `CREW.ghostBattles` for exactly its cost.
**Validates: Requirements 3.1, 3.2**

**Property 3: The Locker lets go exactly once, at the right price.** *For any* outcome (solved in time, solved late, wrong, abandoned) the ship is freed once; only a solution in time costs nothing, and any other outcome takes exactly floor(`goldLostOnFailure` × gold), cursed gold first.
**Validates: Requirements 2.2, 2.3**

**Property 4: A sunk ship can't fight.** *For any* sunk captain, captures, raids and sieges are refused and nothing changes.
**Validates: Requirement 1.3**

**Property 5: The Ferryman's price is exact.** *For any* resources, paying frees the ship and costs exactly `LOCKER.ferrymanCost` when affordable, and changes nothing otherwise.
**Validates: Requirement 2.4**
