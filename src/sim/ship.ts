import { MAX_STEP_SECONDS, SHIP } from './balance';
import { clamp, finiteOr, moveToward, wrapAngle } from './math';

/** The captain's sail order: 0 Furled, 1 Half sail, 2 Full sail. */
export type SailLevel = 0 | 1 | 2;

export interface ShipState {
  /** Position in metres. */
  readonly x: number;
  readonly z: number;
  /** Radians in (−π, π]. 0 faces +Z; turning to starboard lowers it. */
  readonly heading: number;
  /** Forward speed, metres per second, 0..SHIP.maxSpeed. */
  readonly speed: number;
  /** The sail order. */
  readonly sailLevel: SailLevel;
  /** How far the sails are unfurled, 0..1. */
  readonly sail: number;
  /** Actual rudder position, −1 (port) to +1 (starboard). */
  readonly rudder: number;
}

/** One tick of player input. Untrusted: the simulation sanitizes it. */
export interface ShipInput {
  /** −1 port, +1 starboard. */
  readonly rudder: number;
  /** Desired sail setting, 0 to 2. */
  readonly sailLevel: number;
}

export const NO_INPUT: ShipInput = { rudder: 0, sailLevel: 0 };

export function createShip(x: number, z: number, heading: number): ShipState {
  return { x, z, heading: wrapAngle(heading), speed: 0, sailLevel: 0, sail: 0, rudder: 0 };
}

/** Clamps an untrusted input into range; non-finite values count as 0. */
export function sanitizeInput(input: ShipInput): { rudder: number; sailLevel: SailLevel } {
  const rudder = clamp(finiteOr(input.rudder, 0), -1, 1);
  const sailLevel = Math.round(clamp(finiteOr(input.sailLevel, 0), 0, SHIP.maxSailLevel)) as SailLevel;
  return { rudder, sailLevel };
}

/** Clamps a step length into [0, MAX_STEP_SECONDS]; non-finite values count as 0. */
export function sanitizeDt(dt: number): number {
  return clamp(finiteOr(dt, 0), 0, MAX_STEP_SECONDS);
}

/** Advances one ship by one step in open water. Collisions are handled by the world. */
export function stepShip(ship: ShipState, input: ShipInput, dtIn: number): ShipState {
  const dt = sanitizeDt(dtIn);
  const order = sanitizeInput(input);

  const sail = moveToward(ship.sail, order.sailLevel / SHIP.maxSailLevel, SHIP.sailRate * dt);
  const rudder = moveToward(ship.rudder, order.rudder, SHIP.rudderRate * dt);

  const targetSpeed = SHIP.maxSpeed * sail * (1 - SHIP.turnDrag * Math.abs(rudder));
  const rate = ship.speed < targetSpeed ? SHIP.accel : SHIP.decel;
  const speed = clamp(moveToward(ship.speed, targetSpeed, rate * dt), 0, SHIP.maxSpeed);

  const steerage =
    SHIP.minSteerage + (1 - SHIP.minSteerage) * clamp(speed / SHIP.steerageSpeed, 0, 1);
  const heading = wrapAngle(ship.heading - rudder * SHIP.maxTurnRate * steerage * dt);

  const x = ship.x + Math.sin(heading) * speed * dt;
  const z = ship.z + Math.cos(heading) * speed * dt;

  return { x, z, heading, speed, sailLevel: order.sailLevel, sail, rudder };
}
