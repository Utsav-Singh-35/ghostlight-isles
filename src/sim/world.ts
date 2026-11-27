import { SHIP, WORLD } from './balance';
import { clamp } from './math';
import { createRng, mixSeed } from './rng';
import { createShip, stepShip, type ShipInput, type ShipState } from './ship';

export type IslandKind = 'home' | 'haunted';

export interface Island {
  readonly id: number;
  readonly name: string;
  readonly kind: IslandKind;
  readonly x: number;
  readonly z: number;
  /** Shore radius at the waterline, metres. */
  readonly radius: number;
  /** Seed for the island's shape and props. */
  readonly seed: number;
}

export interface World {
  readonly seed: number;
  readonly radius: number;
  readonly islands: readonly Island[];
  readonly spawn: { readonly x: number; readonly z: number; readonly heading: number };
}

export interface WorldState {
  readonly tick: number;
  readonly ship: ShipState;
}

const HAUNTED_NAMES = [
  'Gallows Key',
  "Widow's Reef",
  'Bonefire Isle',
  'Drowned Bell',
  'Hollow Cay',
  'Saltgrave',
  'Wraith Atoll',
  'Candlewick Rock',
  "Mourner's Rest",
  'Lantern Shoal',
  'Corpse Candle Cay',
  'Grimwater',
  'Banshee Point',
  'Black Spot Isle',
  'Ashen Spit',
  'Coffin Rock',
  'Shroud Island',
  'Revenant Reef',
  'Knell Island',
  'Cinder Cay',
  "Sexton's Shoal",
  "Hangman's Isle",
  'Moonless Key',
  'Owl Light Isle',
] as const;

/** The circle a ship's centre can't enter: shore radius × collisionScale plus the hull radius. */
export function collisionRadius(island: Island): number {
  return island.radius * WORLD.collisionScale + SHIP.radius;
}

/** Builds the islands and the starting point for a seed. The same seed always gives the same world. */
export function generateWorld(seed: number): World {
  const rng = createRng(seed);
  const names = rng.shuffle(HAUNTED_NAMES);
  const maxReach = WORLD.radius - WORLD.edgeMargin;

  const islands: Island[] = [
    {
      id: 0,
      name: WORLD.homeName,
      kind: 'home',
      x: 0,
      z: 0,
      radius: WORLD.homeIslandRadius,
      seed: mixSeed(seed, 0),
    },
  ];

  for (let attempt = 0; attempt < WORLD.placementAttempts && islands.length < WORLD.islandCount; attempt++) {
    const id = islands.length;
    const radius = rng.range(WORLD.minIslandRadius, WORLD.maxIslandRadius);
    // The first haunted island sits ahead of the spawn, so it shows through the fog at once.
    const first = id === 1;
    const angle = first
      ? rng.range(-WORLD.firstIslandMaxAngle, WORLD.firstIslandMaxAngle)
      : rng.range(-Math.PI, Math.PI);
    const distance = first
      ? rng.range(WORLD.firstIslandMinDistance, WORLD.firstIslandMaxDistance)
      : Math.sqrt(rng.next()) * (maxReach - radius);
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;

    if (distance + radius > maxReach) continue;
    const crowded = islands.some(
      (other) => Math.hypot(other.x - x, other.z - z) < other.radius + radius + WORLD.islandGap,
    );
    if (crowded) continue;

    islands.push({
      id,
      name: names[id - 1] as string,
      kind: 'haunted',
      x,
      z,
      radius,
      seed: mixSeed(seed, id),
    });
  }

  return {
    seed,
    radius: WORLD.radius,
    islands,
    spawn: { x: 0, z: WORLD.homeIslandRadius + WORLD.spawnOffset, heading: 0 },
  };
}

export function createWorldState(world: World): WorldState {
  return { tick: 0, ship: createShip(world.spawn.x, world.spawn.z, world.spawn.heading) };
}

/** Advances the world by one tick. */
export function stepWorld(world: World, state: WorldState, input: ShipInput, dt: number): WorldState {
  const ship = resolveCollisions(world, stepShip(state.ship, input, dt));
  return { tick: state.tick + 1, ship };
}

/** How close a ship centre may sit inside a collision circle before it is pushed out. */
const PUSH_TOLERANCE = 1e-7;

/**
 * Pushes the ship out of any island and back inside the world's edge.
 * A head-on hit stops the ship; a glancing hit lets it slide along the shore.
 */
export function resolveCollisions(world: World, ship: ShipState): ShipState {
  let { x, z, speed } = ship;
  const fx = Math.sin(ship.heading);
  const fz = Math.cos(ship.heading);
  const slideCap = (impact: number) => SHIP.maxSpeed * WORLD.shoreSlide * (1 - impact);

  for (const island of world.islands) {
    const limit = collisionRadius(island);
    const dx = x - island.x;
    const dz = z - island.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= limit - PUSH_TOLERANCE) continue;

    // Outward from the island's centre; straight back along the heading if exactly at the centre.
    const nx = distance > 1e-9 ? dx / distance : -fx;
    const nz = distance > 1e-9 ? dz / distance : -fz;
    x = island.x + nx * limit;
    z = island.z + nz * limit;
    const impact = clamp(-(fx * nx + fz * nz), 0, 1);
    speed = Math.min(speed, slideCap(impact));
  }

  const fromCentre = Math.hypot(x, z);
  if (fromCentre > world.radius) {
    const nx = x / fromCentre;
    const nz = z / fromCentre;
    x = nx * world.radius;
    z = nz * world.radius;
    const impact = clamp(fx * nx + fz * nz, 0, 1);
    speed = Math.min(speed, slideCap(impact));
  }

  if (x === ship.x && z === ship.z && speed === ship.speed) return ship;
  return { ...ship, x, z, speed };
}

/** True when the ship is touching an island's collision circle (run aground). */
export function isAground(world: World, ship: ShipState): Island | null {
  for (const island of world.islands) {
    if (Math.hypot(ship.x - island.x, ship.z - island.z) <= collisionRadius(island) + 0.05) return island;
  }
  return null;
}
