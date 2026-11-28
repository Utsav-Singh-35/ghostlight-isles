# Design Document: landing parties

## Overview
Troops are a new part of `BattleState`, stepped by `stepTroops` in `src/sim/troops.ts` from inside `stepBattle`, after ships move and before towers fire, so towers can aim at troops on the tick they arrive. Everything is pure and deterministic. Troop spawns draw from their own random stream (`setup.seed ^ 0x7f00d`), so adding a garrison never changes the ship battle's random numbers; the troop step itself uses no randomness.

## Data
- `Profile.troops?: { ship: TroopCounts; island: TroopCounts }`, counts of living troop types. Missing on old saves, which means the starting crew is not given retroactively (an empty crew).
- `Profile.weapons.boats?: number`, 0 to `TROOPS.maxBoats`.
- `BattleSetup` gains `party?` (living counts, aboard), `garrison?` (any troop counts, on the island), `walls?` (`{ radius, gateX, gateZ, gateHp }`, forts only), `boarders?` (ghost troops each ghost ship lands, sieges only) and `loadout.boats`.
- `BattleState` gains `troops`, `aboard` (counts still aboard), `landing` (`{ tick, x, z }` or null), `gate` (or null), `boats` and `boarded` (ghost ids that have landed boarders).
- `BattleResult` gains `lost: { ship: TroopCounts; island: TroopCounts }`: dead party troops, and dead garrison troops when the garrison is the captain's own (sieges).

Old setups have none of the new fields, so they play exactly as before.

## Walls
`fortWalls(islandRadius, level, seed)` in `src/sim/layout.ts` decides the fort's style, its ring of corners and which wall carries the gate. The renderer builds the walls from the same function, so the gate the troops use is the gate you see. The wall ring's radius is the gate's distance from the centre. A troop step that would cross the ring is undone unless the troop is within `TROOPS.gateHalfWidth` of the gate and the gate is down. Troops whose target is on the other side head for the gate, walking around the ring when the gate is far round it.

## Targets
| Troop | Goes for |
|---|---|
| Buccaneer, Rattler, Drowned Grabber, Headless Bosun | nearest enemy troop or structure (gate included) |
| Shieldbearer | nearest enemy troop, else structure |
| Lantern Archer, Wraith Archer | nearest enemy troop in sight, else structure |
| Powder Monkey | the gate while it stands, else the nearest structure |
| Anchor Brute | nearest structure or gate; never troops |
| Surgeon | heals the most hurt ally within reach; otherwise follows the nearest ally |
| Deckhand (ashore) | the nearest damaged friendly structure, to repair it |

Any troop that targets troops switches to an enemy Shieldbearer within `TROOPS.tauntRadius`. Defenders (the garrison in an assault) only leave their posts for enemy troops within `TROOPS.sight` of the post, and walk back otherwise.

Towers add enemy troops to their targets. Troops are always visible: they stand on land, in lantern light.

## Support boats
Boats steer like ships with `BOAT` stats: in formation behind the ship, then on a station `TROOPS.boatStation` metres off the shore nearest the landing (or the ship). They fire `TROOPS.grapeshot` at enemy troops only. They are targets of class `living` for towers and ghost ships.

## Correctness properties
**Property 1: Space is never exceeded and every cost is exact.** *For any* sequence of recruit, move and dismiss commands, the ship's and the island's space never exceed their caps, each accepted recruit costs exactly its price, and every refused command changes nothing. Validates Requirements 1.2, 1.3.

**Property 2: Troops stay on land.** *For any* battle with any party, garrison and inputs, every troop alive at any tick is within the island's beach radius. Validates Requirement 3.1.

**Property 3: Walls hold until the gate falls.** *For any* fort battle, no troop is ever on the other side of the wall ring from where it was a tick before, unless the gate was down and the troop was in the gateway. Validates Requirements 4.2, 4.3.

**Property 4: Nobody hurts their own side, and boats never hurt structures.** *For any* battle, no troop's health drops from an attack by its own side (a Powder Monkey's own blast, which it is meant to die in, is not an attack on itself), and no structure loses health on a tick when only support boats fired. Validates Requirements 3.5, 6.2.

**Property 5: Healing and repair stop at full.** *For any* battle, no troop's health exceeds its maximum and the ship's health never exceeds its hull. Validates Requirements 2.3, 3.2.

**Property 6: Landing happens once, and only near the shore.** *For any* inputs, the party lands at most once; if it lands, the ship was within the landing reach when L was pressed; and a battle where L is never pressed has no landed troops of the player. Validates Requirements 2.1, 2.2.

**Property 7: Battles with troops replay exactly.** *For any* setup with a party, garrison, walls, boarders and boats, playing the battle live tick by tick gives the same final state as the server's replay of the recorded inputs. Validates the fairness pillar.

**Property 8: Losses are exact.** *For any* finished battle, the captain's crew afterwards equals their crew before minus `result.lost`, never below zero, and a raided captain's crew is unchanged. Validates Requirements 7.1, 7.2.

## Testing strategy
- Properties 2 to 7 on random setups and random input plans, with the existing battle-plan generators; the autopilot plus a landing for the "sail in and land" case.
- Property 1 through the handler; Property 8 through the handler for captures, raids and sieges.
- Examples: a Powder Monkey opens a gate; an Archer shoots over a standing wall; a Shieldbearer draws Rattlers; boarders land once per ghost ship.
