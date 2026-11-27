# Design Document: Captain's orders

## Overview
| File | Does |
|---|---|
| `game/orders.ts` | Pure: the list of orders, `observe()` (adds whatever a sighting shows is done), `currentOrder()`, and reading the saved done set |
| `ui/ordersView.ts` | The card: title with "Order N of M", the instruction, one mark per order, and a "Hide" button |
| `game/app.ts` | Each frame at sea, builds a sighting from the ship, the nearby island, the profile and the actions just taken, then shows the current order |

The card sits inside the captain bar's column, so it hides whenever the captain bar does (title screen, battles). The done set is saved in `localStorage` under `ghostlight.orders`; "Hide" saves `ghostlight.orders.hidden`. Orders don't touch the simulation or the server.

| Order | Done when |
|---|---|
| Sail | sail setting is at least Half sail |
| Steer | the ship has turned 60° in total |
| Island | a haunted island is in reach, or the captain owns one |
| Capture | the profile has a captured island |
| Build | the player built a defense, or the profile has more than the starting defense |
| Moon | the player started a siege, or the profile shows a repelled ghost raid or a sunk ghost ship |
| Raid | the player started a raid, or the profile shows a won raid |

## Correctness Properties

**Property 1: Done orders stay done.** *For any* saved done set and any sequence of sightings, each `observe()` returns a superset of what it was given.
**Validates: Requirement 2.4**

**Property 2: The current order is the first one not done.** *For any* done set, `currentOrder()` returns the first order in the list that isn't done, numbered from 1, and returns nothing exactly when every order is done.
**Validates: Requirements 1.1, 1.3**

**Property 3: A seasoned captain skips ahead.** *For any* profile counts, `observe()` marks capture, build, moon and raid done exactly when the counts show them, whatever the ship is doing.
**Validates: Requirement 2.2**

**Property 4: Saved progress reads back.** *For any* done set, saving and reading gives the same set; *for any* stored text, reading never throws and returns only known orders.
**Validates: Requirement 2.4**
