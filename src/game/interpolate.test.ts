import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { angleDelta, lerpAngle, wrapAngle } from '../sim/math';

const real = (min: number, max: number) => fc.double({ noNaN: true, noDefaultInfinity: true, min, max });
const heading = real(-Math.PI, Math.PI).map(wrapAngle);

describe('sailing spec: interpolation', () => {
  // Feature: sailing, Property 14. Validates: Requirement 6.5
  it('Property 14: heading interpolation takes the short way round', () => {
    fc.assert(
      fc.property(heading, heading, real(0, 1), (a, b, t) => {
        expect(Math.abs(angleDelta(lerpAngle(a, b, 0), a))).toBeLessThan(1e-12);
        expect(Math.abs(angleDelta(lerpAngle(a, b, 1), b))).toBeLessThan(1e-9);

        // Partway, the result is t of the way along the shorter arc from a to b.
        const arc = angleDelta(a, b);
        const along = angleDelta(a, lerpAngle(a, b, t));
        expect(Math.abs(along - arc * t)).toBeLessThan(1e-9);
        expect(Math.abs(along)).toBeLessThanOrEqual(Math.abs(arc) + 1e-12);
      }),
      { numRuns: 200 },
    );
  });

  it('crossing ±π goes the short way, not all the way round', () => {
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(1e-9);
  });
});
