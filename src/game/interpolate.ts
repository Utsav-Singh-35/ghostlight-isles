import { lerp, lerpAngle } from '../sim/math';
import type { ShipState } from '../sim/ship';

/** The ship's pose between two simulation ticks, for drawing only. */
export function interpolateShip(previous: ShipState, current: ShipState, alpha: number): ShipState {
  return {
    x: lerp(previous.x, current.x, alpha),
    z: lerp(previous.z, current.z, alpha),
    heading: lerpAngle(previous.heading, current.heading, alpha),
    speed: lerp(previous.speed, current.speed, alpha),
    sail: lerp(previous.sail, current.sail, alpha),
    rudder: lerp(previous.rudder, current.rudder, alpha),
    sailLevel: current.sailLevel,
  };
}
