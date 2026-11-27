/** Small, pure math helpers shared by the simulation and the renderer. */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Returns `value` if it is a finite number, otherwise `fallback`. */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Moves `current` toward `target` by at most `maxDelta`, without overshooting. */
export function moveToward(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

/** Wraps an angle in radians into (−π, π]. */
export function wrapAngle(angle: number): number {
  let r = angle % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

/** Shortest signed turn from angle `a` to angle `b`, in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Interpolates between two angles the short way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + angleDelta(a, b) * t);
}

/**
 * Compass bearing in degrees, in [0, 360), for a ship heading.
 * North is −Z and east is +X, so heading π is 0° and heading π/2 is 90°.
 */
export function headingToBearing(heading: number): number {
  const degrees = ((Math.PI - heading) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}
