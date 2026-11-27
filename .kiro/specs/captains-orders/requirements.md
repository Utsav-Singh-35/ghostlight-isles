# Requirements Document

## Introduction
A first-minute tutorial for new captains and hackathon judges. A small "Captain's orders" card under the captain's details shows one order at a time, in the order a new player needs them: sail, steer, find a haunted island, capture it, build on Last Light, survive the ghost fleet, raid a rival. Each order ticks off by itself when the player does it, so the card never blocks play and never needs a "Next" button.

## Glossary
- **Order**: one step of the tutorial, with a plain-English instruction.
- **Done set**: the orders the player has carried out, saved on this device.

## Requirements

### Requirement 1: Showing the orders
**User Story:** As a new captain, I want to be told the next thing to try, so that I reach the fun parts in the first two minutes.

#### Acceptance Criteria
1. WHILE the player sails the standard sea, THE Game SHALL show the first order not yet done, its number and how many orders there are.
2. THE Game SHALL show which orders are done with filled marks and the current one with a pulsing outline, so progress doesn't rely on color alone.
3. WHEN every order is done, THE Game SHALL say so briefly and then hide the card for good.
4. WHEN the player presses "Hide", THE Game SHALL hide the card for good on this device.
5. WHILE a battle, a puzzle or the title screen is showing, THE Game SHALL not show the card.

### Requirement 2: Ticking orders off
**User Story:** As a captain, I want orders to tick off when I do them, so that I'm never asked to do something twice.

#### Acceptance Criteria
1. WHEN the sails are raised, the ship has turned 60° in total, or a haunted island is in reach, THE Game SHALL mark the sail, steer and island orders done.
2. WHEN the captain's profile shows a capture, a defense beyond the starting one, a repelled ghost raid or sunk ghost ship, or a won raid, THE Game SHALL mark the matching orders done, so returning captains skip what they've already done.
3. WHEN the player builds a defense, starts a siege or starts a raid, THE Game SHALL mark the matching order done.
4. THE Game SHALL never mark a done order as not done, and SHALL save the done set on this device.
5. WHEN an order is done during play, THE Game SHALL play a soft chime.
