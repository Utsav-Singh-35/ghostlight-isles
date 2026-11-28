/**
 * Every gameplay number lives here. Change balance in this file only, and
 * update Documents/game-design.md in the same change.
 */

/** Simulation ticks per second. */
export const TICK_RATE = 30;
/** Length of one simulation tick, in seconds. */
export const TICK_SECONDS = 1 / TICK_RATE;
/** The simulation clamps every step to at most this many seconds. */
export const MAX_STEP_SECONDS = 0.1;

export const SHIP = {
  /** Top speed at full sail, metres per second (about 27 knots). */
  maxSpeed: 14,
  /** Fastest speed gain, metres per second, per second. */
  accel: 2.2,
  /** Fastest speed loss, metres per second, per second. */
  decel: 3,
  /** How fast the sails unfurl or furl, in deployment per second. */
  sailRate: 0.6,
  /** Highest sail setting: 0 Furled, 1 Half sail, 2 Full sail. */
  maxSailLevel: 2,
  /** Fastest turn with the rudder hard over, radians per second. */
  maxTurnRate: 0.5,
  /** Share of the turn rate available when the ship is at rest. */
  minSteerage: 0.3,
  /** Speed at which steering reaches full strength, metres per second. */
  steerageSpeed: 6,
  /** How fast the rudder swings, in rudder units per second. */
  rudderRate: 2.5,
  /** Share of top speed lost with the rudder hard over. */
  turnDrag: 0.25,
  /** Collision radius of the hull, metres. */
  radius: 4,
} as const;

export const WORLD = {
  /** Default world seed text; hashed with hashSeed(). */
  defaultSeed: 'ghostlight-2026',
  /** Radius of the sea, metres. */
  radius: 1100,
  /** Number of islands, including the home island. */
  islandCount: 14,
  /** Name of the player's home island. */
  homeName: 'Last Light',
  /** Shore radius of the home island, metres. */
  homeIslandRadius: 55,
  /** Smallest and largest shore radius of a haunted island, metres. Each fort level uses a band inside this (FORTS.islandRadius). */
  minIslandRadius: 26,
  maxIslandRadius: 66,
  /** Least open water between the shores of two islands, metres. */
  islandGap: 70,
  /** Least distance from any shore to the edge of the world, metres. */
  edgeMargin: 140,
  /** Collision circle = shore radius × this, so ships can nose into the shallows. */
  collisionScale: 0.9,
  /** A glancing hit on a shore or the world's edge keeps at most this share of top speed. */
  shoreSlide: 0.4,
  /** How far beyond the home island's shore the ship starts, metres. */
  spawnOffset: 30,
  /** The first haunted island sits this far from the centre, metres... */
  firstIslandMinDistance: 220,
  firstIslandMaxDistance: 280,
  /** ...and within this angle of the starting heading, radians (20°). */
  firstIslandMaxAngle: (20 * Math.PI) / 180,
  /** Attempts the generator makes to place islands before giving up. */
  placementAttempts: 5000,
} as const;

/** A ship's handling. The player's ship uses SHIP; ghost ships use GHOST_SHIP. */
export interface ShipStats {
  readonly maxSpeed: number;
  readonly accel: number;
  readonly decel: number;
  readonly sailRate: number;
  readonly maxSailLevel: number;
  readonly maxTurnRate: number;
  readonly minSteerage: number;
  readonly steerageSpeed: number;
  readonly rudderRate: number;
  readonly turnDrag: number;
  readonly radius: number;
}

export const GHOST_SHIP: ShipStats = {
  maxSpeed: 8.5,
  accel: 3,
  decel: 3,
  sailRate: 1,
  maxSailLevel: 2,
  maxTurnRate: 0.65,
  minSteerage: 0.5,
  steerageSpeed: 4,
  rudderRate: 3,
  turnDrag: 0.1,
  radius: 4,
};

/** A support boat: small, quick and nimble, so it keeps up with the ship and holds its station. */
export const SUPPORT_BOAT: ShipStats = {
  maxSpeed: 15,
  accel: 5,
  decel: 5,
  sailRate: 1.5,
  maxSailLevel: 2,
  maxTurnRate: 1.2,
  minSteerage: 0.6,
  steerageSpeed: 3,
  rudderRate: 4,
  turnDrag: 0.1,
  radius: 2.2,
};

// ---- Battles ----------------------------------------------------------------------------

export const BATTLE = {
  /** Radius of the battle arena around the island, metres. */
  arenaRadius: 240,
  /** Default length of a battle, seconds. */
  timeLimitSeconds: 150,
  /** Shortest and longest time limit a setup may ask for, seconds. */
  minTimeLimitSeconds: 5,
  maxTimeLimitSeconds: 300,
  /** Most input events a battle accepts. */
  maxInputEvents: 6000,
  /** In an assault the player starts this far from the island, metres. */
  playerSpawnDistance: 150,
  /** In a siege the player starts this far outside the island's collision circle, metres. */
  siegeSpawnMargin: 24,
  /** Hit circles, metres. */
  shipHitRadius: 4.5,
  structureHitRadius: 3.4,
  /** The player's stern lantern reveals ghosts this close, metres. */
  lanternRevealRadius: 20,
  /** A Navigator widens that, metres. */
  navigatorRevealRadius: { none: 20, living: 30, ghost: 45 },
  /** Hidden mines are drawn only this close to the player, metres, unless revealed. */
  mineSightRadius: 18,
  /** The keep counts this many times an ordinary structure toward destruction. */
  keepWeight: 3,
  /**
   * Broadsides reach the keep, a tall light at the island's heart, this much further than other
   * targets, metres. Without it a ship had to scrape the shore of a big island to hit the keep.
   */
  keepReach: 22,
  /** Broadsides auto-aim inside this angle either side of the beam, radians (55°). */
  firingArc: (55 * Math.PI) / 180,
  /** Safety cap on shots in flight. */
  maxShots: 400,
  /** The player's ship starts each battle at half sail with this speed, m/s. */
  startSpeed: 6,
} as const;

/** Weapon numbers; arrays are indexed by level − 1. */
export const WEAPONS = {
  // Range must reach an island's centre from its shore: 0.9 × 66 m + 4 m ≤ 64 m (see the reach property).
  cannon: { balls: [3, 4, 5], damage: [14, 17, 21], range: 64, reloadSeconds: 2.0, shotSpeed: 70, spread: 1.6, spacing: 2.0 },
  salt: { damage: [12, 15, 18], slowSeconds: [2.5, 3, 3.5] },
  barrel: { cooldownSeconds: 9, throwDistance: 16, flightSeconds: 0.7, radius: [9, 11, 13], dps: [14, 19, 25], burnSeconds: 6 },
  bats: { cooldownSeconds: 25, revealSeconds: [6, 8, 10] },
  /** The Pumpkin Mortar lobs a burning pumpkin where its target stands; it doesn't lead. */
  mortar: { cooldownSeconds: 8, minRange: 15, range: 100, flightSeconds: 1.6, damage: [45, 60, 80], splash: [6, 7, 8], spread: 1.2 },
  /** Reload time multipliers from the Gunner. */
  gunnerReload: { none: 1, living: 0.8, ghost: 0.65 },
} as const;

export const DEFENSES = {
  // Towers slightly outrange a ship's broadside, so a ship can't shell them from safety.
  cannonTower: { hp: [120, 165, 215], damage: [6, 9, 13], range: 70, reloadSeconds: 2.4, shotSpeed: 60 },
  spiritLantern: { hp: [90, 125, 165], damage: [9, 12, 16], range: 60, reloadSeconds: 1.6, shotSpeed: 45 },
  boneCatapult: { hp: [150, 195, 245], damage: [22, 28, 36], range: 96, minRange: 14, reloadSeconds: 4.6, flightSeconds: 2.2, splash: 7 },
  mine: { damage: [30, 40, 52], triggerRadius: 7, splash: 9 },
  keep: { hp: [260, 340, 440] },
  /** Bonus targets on haunted forts. They fire nothing and don't count toward destruction. */
  vault: { hp: [90, 130, 180] },
  /** A powder store explodes when destroyed, hurting every structure and the ship within the blast. */
  powder: { hp: [50, 50, 50], blastRadius: 16, blastDamage: 90, shipDamage: 54 },
} as const;

export const GHOSTS = {
  /** Indexed by fleet level − 1. */
  hp: [55, 75, 95, 120, 150],
  damage: [7, 9, 11, 13, 15],
  // From their ring, ghosts must reach the keep at the island's centre (see the reach property).
  range: 66,
  reloadSeconds: 2.4,
  shotSpeed: 42,
  /** Ghosts circle this far outside the island's collision circle, metres. */
  orbitMargin: 8,
  /** A haunted island's own ghosts hunt an attacker who comes within this far outside their ring, metres. */
  guardReach: 70,
  /** Hunting ghosts close to this distance from the attacker, then circle it, metres. Inside a Navigator's lantern light. */
  huntDistance: 24,
  /** Ghosts appear this far from the island, metres. */
  spawnRadius: 215,
  /** Salt Shot slows a ghost to this share of its top speed. */
  slowFactor: 0.5,
  maxFleet: 8,
  maxLevel: 5,
} as const;

export type ShotKind = 'ball' | 'salt' | 'tower' | 'lantern' | 'stone' | 'bolt' | 'fire' | 'mine' | 'pumpkin';
export type TargetClass = 'living' | 'ghost' | 'structure';

/** Damage multiplier for each kind of shot against each kind of target. */
export const DAMAGE_VS: Readonly<Record<ShotKind, Readonly<Record<TargetClass, number>>>> = {
  ball: { living: 1, ghost: 0.5, structure: 1 },
  salt: { living: 0.4, ghost: 1, structure: 0.4 },
  tower: { living: 1, ghost: 0.5, structure: 0 },
  lantern: { living: 0.4, ghost: 1, structure: 0 },
  stone: { living: 0.8, ghost: 0.8, structure: 0 },
  bolt: { living: 1, ghost: 0, structure: 1 },
  fire: { living: 1, ghost: 1, structure: 1 },
  mine: { living: 1, ghost: 1, structure: 0 },
  // A burning pumpkin is a siege weapon: full damage to stone, less to ships that can dodge it.
  pumpkin: { living: 0.8, ghost: 0.6, structure: 1 },
};

// ---- Progress -------------------------------------------------------------------------

export interface Cost {
  readonly gold: number;
  readonly ectoplasm: number;
}

export const ECONOMY = {
  start: { gold: 600, cursedGold: 0, ectoplasm: 30 },
  /** Storage by home level − 1. Gold and cursed gold share the gold cap. */
  goldCap: [3000, 7000, 15000],
  ectoplasmCap: [300, 700, 1500],
  /** Cost to raise the home island to level 2, then to level 3. */
  homeUpgrade: [
    { gold: 1500, ectoplasm: 0 },
    { gold: 4000, ectoplasm: 120 },
  ],
  /** Gold each captured island pays per minute. */
  tributePerMinute: 12,
  maxReports: 20,
  /** Hull health by hull level − 1. */
  hull: [160, 210, 270],
  /** A new captain carries every ship weapon at level 1 for this many battles. */
  trialBattles: 3,
  nameMinLength: 2,
  nameMaxLength: 20,
} as const;

/** Building costs: level 1 is the cost to build, levels 2 and 3 the cost to upgrade. */
export const COSTS = {
  cannonTower: [{ gold: 200, ectoplasm: 0 }, { gold: 450, ectoplasm: 0 }, { gold: 900, ectoplasm: 0 }],
  spiritLantern: [{ gold: 150, ectoplasm: 20 }, { gold: 350, ectoplasm: 40 }, { gold: 700, ectoplasm: 90 }],
  boneCatapult: [{ gold: 450, ectoplasm: 0 }, { gold: 900, ectoplasm: 0 }, { gold: 1700, ectoplasm: 0 }],
  mine: [{ gold: 100, ectoplasm: 0 }, { gold: 220, ectoplasm: 0 }, { gold: 450, ectoplasm: 0 }],
  /** Ship upgrades: cost to reach level 1 (unlock), 2 and 3. Null where a ship starts with that level. */
  cannon: [null, { gold: 600, ectoplasm: 0 }, { gold: 1500, ectoplasm: 0 }],
  salt: [null, { gold: 300, ectoplasm: 30 }, { gold: 900, ectoplasm: 80 }],
  barrel: [{ gold: 400, ectoplasm: 0 }, { gold: 800, ectoplasm: 0 }, { gold: 1600, ectoplasm: 0 }],
  bats: [{ gold: 0, ectoplasm: 60 }, { gold: 0, ectoplasm: 120 }, { gold: 0, ectoplasm: 240 }],
  mortar: [{ gold: 500, ectoplasm: 20 }, { gold: 1000, ectoplasm: 40 }, { gold: 2000, ectoplasm: 80 }],
  /** Support boats: the first and the second. */
  boats: [{ gold: 450, ectoplasm: 0 }, { gold: 900, ectoplasm: 20 }],
  hull: [null, { gold: 700, ectoplasm: 0 }, { gold: 1800, ectoplasm: 60 }],
  /** Removing a defense returns this share of everything spent on it. */
  refund: 0.5,
  /** Lowest home level that can build each defense. */
  unlockLevel: { cannonTower: 1, spiritLantern: 1, boneCatapult: 2, mine: 1 },
} as const;

/**
 * Haunted forts by fort level − 1 (levels 1 to 5). Islands further from Last Light have higher
 * levels: bigger islands, more and stronger towers, mines, ghost ships and a longer dawn clock.
 */
export const FORTS = {
  levels: 5,
  /** The level is 1 + floor((distance / levelReach)² × 5), metres. Squaring spreads levels by area. */
  levelReach: 900,
  /** Shore radius band of an island at each level, metres. */
  islandRadius: [
    [26, 34],
    [32, 42],
    [38, 50],
    [46, 58],
    [54, 66],
  ],
  towers: [3, 4, 5, 6, 7],
  slots: [5, 6, 7, 8, 9],
  mines: [0, 1, 2, 3, 3],
  /** Lowest and highest tower level at each fort level. */
  towerLevels: [
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 3],
    [2, 3],
  ],
  keepLevel: [1, 1, 2, 3, 3],
  /** Chance that a tower after the first is a Bone Catapult; the rest split between Cannon Towers and Spirit Lanterns. */
  catapultShare: [0, 0.15, 0.25, 0.3, 0.3],
  /** Ghost ships that rise from the island to hunt the attacker. */
  ghosts: [
    { count: 0, level: 1 },
    { count: 1, level: 1 },
    { count: 2, level: 1 },
    { count: 2, level: 2 },
    { count: 3, level: 2 },
  ],
  /** The fort must fall before dawn, seconds. */
  timeLimitSeconds: [150, 165, 180, 195, 225],
  /** Bonus targets: treasure vaults pay `vaultGold` each when destroyed; powder stores blow up their neighbours. */
  vaults: [1, 1, 1, 2, 2],
  powderStores: [0, 1, 1, 2, 2],
  vaultGold: [80, 120, 180, 260, 360],
} as const;

export const REWARDS = {
  /** Capturing a fort, by its fort level − 1. */
  captureGold: [300, 450, 650, 900, 1200],
  captureEctoplasm: [10, 18, 28, 40, 55],
  /** A capture also pays this much gold per level of every tower destroyed. */
  towerBounty: 15,
  /** A capture pays up to this share of its base gold more, by the share of the dawn clock left. */
  speedBonus: 0.5,
  /** A capture pays this much gold for each of the island's own ghost ships sunk (plus ghostShipEctoplasm). */
  islandGhostGold: 15,
  /** A raid takes at most this share of the defender's storage, scaled by destruction. */
  raidShare: 0.3,
  infamyPerStar: 10,
  infamyPerCapture: 25,
  infamyPerGhostShip: 5,
  /** An island raided by a player can't be raided again for this long. */
  raidProtectionHours: 4,
  /** Loot from each ghost ship sunk. */
  ghostShipCursedGold: 40,
  ghostShipEctoplasm: 8,
  /** Rival captains' storage refills to this share of their cap. */
  rivalFill: 0.6,
} as const;

/**
 * Troops: the landing party aboard, the garrison ashore and a fort's ghost troops. Health, damage
 * per hit, reach (metres to the target's edge), seconds between hits, walking speed (m/s), space
 * taken, and the price at the Tavern. Ghost troops can't be recruited.
 */
export const TROOPS = {
  types: {
    deckhand: { hp: 40, damage: 0, range: 1.6, cooldownSeconds: 1, speed: 3.0, space: 1, cost: { gold: 40, ectoplasm: 0 }, minHome: 1 },
    buccaneer: { hp: 70, damage: 12, range: 1.6, cooldownSeconds: 1, speed: 3.4, space: 1, cost: { gold: 50, ectoplasm: 0 }, minHome: 1 },
    shieldbearer: { hp: 220, damage: 6, range: 1.8, cooldownSeconds: 1, speed: 2.4, space: 3, cost: { gold: 120, ectoplasm: 0 }, minHome: 1 },
    archer: { hp: 35, damage: 9, range: 14, cooldownSeconds: 1.2, speed: 3.0, space: 1, cost: { gold: 70, ectoplasm: 0 }, minHome: 1 },
    powderMonkey: { hp: 30, damage: 120, range: 1.4, cooldownSeconds: 1, speed: 4.6, space: 1, cost: { gold: 90, ectoplasm: 0 }, minHome: 1 },
    brute: { hp: 480, damage: 30, range: 2.2, cooldownSeconds: 2, speed: 1.9, space: 5, cost: { gold: 300, ectoplasm: 15 }, minHome: 2 },
    surgeon: { hp: 50, damage: 0, range: 6, cooldownSeconds: 1, speed: 3.0, space: 2, cost: { gold: 110, ectoplasm: 0 }, minHome: 1 },
    rattler: { hp: 50, damage: 10, range: 1.6, cooldownSeconds: 1, speed: 3.0, space: 1, cost: { gold: 0, ectoplasm: 0 }, minHome: 9 },
    grabber: { hp: 90, damage: 7, range: 1.6, cooldownSeconds: 1, speed: 2.6, space: 1, cost: { gold: 0, ectoplasm: 0 }, minHome: 9 },
    wraithArcher: { hp: 30, damage: 8, range: 12, cooldownSeconds: 1.3, speed: 3.2, space: 1, cost: { gold: 0, ectoplasm: 0 }, minHome: 9 },
    bosun: { hp: 400, damage: 28, range: 2.2, cooldownSeconds: 2, speed: 2.0, space: 3, cost: { gold: 0, ectoplasm: 0 }, minHome: 9 },
  },
  /** Space aboard by hull level, and ashore by home level. */
  shipSpace: [8, 12, 16],
  islandSpace: [6, 10, 14],
  /** A new captain's crew. */
  start: { ship: { buccaneer: 3, archer: 1 }, island: { buccaneer: 2, deckhand: 1 } },
  /** The party can row ashore from this far off the shore, metres; farther with a support boat. */
  landReach: 25,
  boatLandReach: 60,
  rowSeconds: 3,
  /** Each Deckhand aboard repairs the hull this much per second; ashore, a tower this much. */
  deckhandShipRepair: 1.2,
  deckhandTowerRepair: 1.5,
  /** A Surgeon heals this much per second. */
  surgeonHeal: 10,
  /** Enemy troops within this of a Shieldbearer must fight it. */
  tauntRadius: 8,
  /** Defenders leave their posts for enemies within this of the post. */
  sight: 22,
  /** A Powder Monkey's blast: damage to the gate, to troops around it, and its radius. */
  powderGateDamage: 400,
  powderTroopDamage: 40,
  powderSplash: 3,
  /** An Anchor Brute's and a Headless Bosun's swing hits enemy troops this far round the target. */
  heavySplash: 2,
  /** A Drowned Grabber slows what it hits to this share of its speed, for this long. */
  grabSlow: 0.6,
  grabSeconds: 2,
  /** Shots from towers and ghost ships deal this share of their damage to a troop: guns are made for ships. */
  shotDamageShare: 0.5,
  /** Troops keep this far apart, and towers hit a troop within this of where a shot lands. */
  spacing: 0.9,
  hitRadius: 1.0,
  /** The keep's edge, for troops attacking it, metres from the centre. */
  keepRadius: 4,
  /** How far inland the beach reaches: troops stay within this share of the island's radius. */
  beach: 0.86,
  /** The gate: health by fort level, and how far either side of it a troop may pass once it falls. */
  gateHp: [250, 350, 450, 560, 700],
  gateHalfWidth: 1.8,
  /** A fort's ghost troops by fort level − 1. */
  fortGarrison: [
    { rattler: 3 },
    { rattler: 4, grabber: 1 },
    { rattler: 4, grabber: 2, wraithArcher: 2 },
    { rattler: 5, grabber: 2, wraithArcher: 3, bosun: 1 },
    { rattler: 6, grabber: 3, wraithArcher: 3, bosun: 2 },
  ],
  /** Ghost boarders each ghost ship lands in a siege, by fleet level − 1. */
  boarders: [1, 2, 2, 3, 3],
  /** At most this many troops in one battle. */
  maxTroops: 48,
  /** Support boats: how many a ship can have (prices in COSTS.boats), their health and grapeshot. */
  maxBoats: 2,
  boatHp: 70,
  boatStation: 12,
  grapeshot: { pellets: 4, damage: 6, range: 30, reloadSeconds: 1.5 },
} as const;

export const ACCOUNTS = {
  /** Usernames: this many letters, digits or underscores, starting with a letter. */
  usernameMinLength: 3,
  usernameMaxLength: 16,
  passwordMinLength: 8,
  /** Long enough for passphrases; capped so hashing a huge body can't tie up the server. */
  passwordMaxLength: 72,
  /** PBKDF2-SHA256 rounds for new password hashes (OWASP's advice in 2023). */
  passwordIterations: 600_000,
  /** How long a login lasts. */
  tokenDays: 30,
  /** This many failed logins within the window locks the username for the lockout. */
  maxLoginFailures: 5,
  loginWindowMinutes: 15,
  lockoutMinutes: 15,
} as const;

export const BLOOD_MOON = {
  /** A Blood Moon rises every period and stays red for its duration, for every player at once. */
  periodSeconds: 480,
  durationSeconds: 180,
  /** A player may summon their own Blood Moon this often. */
  summonCooldownSeconds: 120,
  /** Ghost fleet size: this many ships, plus one per this much cursed gold held. */
  baseFleet: 2,
  cursedGoldPerExtraShip: 150,
  /** After a ghost raid the fleet leaves the island alone this long, unless summoned. */
  restMinutes: 10,
  /** Cleansing cursed gold at the chapel takes this long. */
  cleanseSeconds: 600,
} as const;

export const CREW = {
  /** A crew member who dies returns as a ghost for this many battles. */
  ghostBattles: 3,
  /** Keeping a ghost crew member for another round of battles. */
  keepGhostCost: { gold: 0, ectoplasm: 40 },
  /** Hiring a new living crew member. */
  hireCost: { gold: 150, ectoplasm: 0 },
} as const;

export const LOCKER = {
  /** Time to solve the escape puzzle, seconds. */
  puzzleSeconds: 90,
  ferrymanCost: { gold: 0, ectoplasm: 30 },
  /** Failing to escape costs this share of your gold. */
  goldLostOnFailure: 0.2,
} as const;

export const PUZZLE = {
  size: 5,
  totems: 3,
  decoys: 4,
  minPath: 9,
  minTurns: 3,
  /** Attempts the generator makes before falling back to a simple layout. */
  attempts: 400,
} as const;

/** Where towers and mines stand. */
export const LAYOUT = {
  /** Tower slots sit on a ring at this share of the island's radius. */
  slotRing: 0.6,
  /** A fort's treasure vaults and powder stores sit on this ring, between the tower slots. */
  treasureRing: 0.47,
  /** Mines float this far outside the island's collision circle, metres. */
  mineMargin: 10,
  /** Tower and mine slots on the home island, by home level. */
  homeSlots: [6, 9, 12],
  homeMineSlots: [3, 4, 5],
} as const;
