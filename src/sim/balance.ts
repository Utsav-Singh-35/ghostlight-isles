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
