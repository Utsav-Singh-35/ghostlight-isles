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
  /** Smallest and largest shore radius of a haunted island, metres. */
  minIslandRadius: 26,
  maxIslandRadius: 62,
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
  /** Ghosts appear this far from the island, metres. */
  spawnRadius: 215,
  /** Salt Shot slows a ghost to this share of its top speed. */
  slowFactor: 0.5,
  maxFleet: 8,
  maxLevel: 5,
} as const;

export type ShotKind = 'ball' | 'salt' | 'tower' | 'lantern' | 'stone' | 'bolt' | 'fire' | 'mine';
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
};

/** Where towers and mines stand. */
export const LAYOUT = {
  /** Tower slots sit on a ring at this share of the island's radius. */
  slotRing: 0.6,
  /** Mines float this far outside the island's collision circle, metres. */
  mineMargin: 10,
  /** Tower and mine slots on the home island, by home level. */
  homeSlots: [6, 9, 12],
  homeMineSlots: [3, 4, 5],
} as const;
