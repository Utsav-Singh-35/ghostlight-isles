# Requirements Document

## Introduction
Asynchronous raids. A captain attacks a saved copy of another captain's island, or of a rival captain run by the game, while its owner may be offline. The server replays the raid, moves the loot, writes a report for the defender and protects the raided island for a while. A leaderboard ranks captains by infamy.

## Glossary
- **Rival**: one of ten captains run by the game, so the sea is never empty.
- **Storage**: a defender's gold, cursed gold and ectoplasm (a rival's storage is `REWARDS.rivalFill` of its cap).
- **Protection**: a time during which an island can't be raided.

## Requirements

### Requirement 1: Choosing a target
**User Story:** As a captain, I want a list of islands to raid, so that I can pick a fight I can win.

#### Acceptance Criteria
1. WHEN the captain opens the raid list, THE Handler SHALL return up to 8 targets: real captains who are not protected and not the caller, then rivals, each with its name, home level, number of defenses and the most it could lose.
2. THE Handler SHALL refuse to raid the caller's own island, a protected island or an unknown target.

### Requirement 2: Raiding
**User Story:** As a raider, I want my loot to depend on how much I destroy, so that skill pays.

#### Acceptance Criteria
1. WHEN a raid starts, THE Handler SHALL snapshot the defender's defenses and home level into the battle setup.
2. WHEN a raid finishes, THE Handler SHALL replay it and take `REWARDS.raidShare × destruction` of the defender's storage at that moment, cursed gold first.
3. THE raider SHALL gain the loot up to their own storage cap; loot that doesn't fit is lost at sea.
4. THE Handler SHALL add `REWARDS.infamyPerStar` infamy per star to the raider.
5. THE Handler SHALL accept each raid ticket only once.

### Requirement 3: The defender's side
**User Story:** As a defender, I want to know what happened while I was away, and a breather after a raid.

#### Acceptance Criteria
1. WHEN a raid on a captain finishes, THE Handler SHALL write one report on the defender's profile saying who raided, the stars and what was taken.
2. WHEN a raid destroys anything, THE Handler SHALL protect the defender for `REWARDS.raidProtectionHours`.
3. THE Game SHALL show the time left on protection.

### Requirement 4: Leaderboard and log
**User Story:** As a captain, I want to see where I stand, so that infamy means something.

#### Acceptance Criteria
1. THE Handler SHALL return the 10 most infamous captains, real and rival, with the caller's own rank.
2. THE Game SHALL show the leaderboard and the captain's reports in the Captain's Log (L).
