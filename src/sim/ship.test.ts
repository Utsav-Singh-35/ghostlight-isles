import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_STEP_SECONDS, SHIP, TICK_SECONDS } from './balance';
import { angleDelta, headingToBearing, wrapAngle } from './math';
import { createShip, stepShip, type SailLevel, type ShipInput, type ShipState } from './ship';

const real = (min: number, max: number) => fc.double({ noNaN: true, noDefaultInfinity: true, min, max });

/** Any valid ship state. */
const shipState: fc.Arbitrary<ShipState> = fc.record({
  x: real(-1000, 1000),
  z: real(-1000, 1000),
  heading: real(-Math.PI, Math.PI).map((h) => wrapAngle(h)),
  speed: real(0, SHIP.maxSpeed),
  sailLevel: fc.constantFrom<SailLevel>(0, 1, 2),
  sail: real(0, 1),
  rudder: real(-1, 1),
});

/** Inputs in range. */
const goodInput: fc.Arbitrary<ShipInput> = fc.record({ rudder: real(-1, 1), sailLevel: fc.integer({ min: 0, max: 2 }) });

/** Anything a broken or cheating client might send. */
const anyNumber = fc.oneof(
  fc.double(),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0),
);
const anyInput: fc.Arbitrary<ShipInput> = fc.record({ rudder: anyNumber, sailLevel: anyNumber });

const dtInRange = real(0, MAX_STEP_SECONDS);
const EPS = 1e-9;

function expectValid(ship: ShipState): void {
  for (const value of Object.values(ship)) expect(Number.isFinite(value)).toBe(true);
  expect(ship.speed).toBeGreaterThanOrEqual(0);
  expect(ship.speed).toBeLessThanOrEqual(SHIP.maxSpeed);
  expect(ship.sail).toBeGreaterThanOrEqual(0);
  expect(ship.sail).toBeLessThanOrEqual(1);
  expect([0, 1, 2]).toContain(ship.sailLevel);
  expect(ship.rudder).toBeGreaterThanOrEqual(-1);
  expect(ship.rudder).toBeLessThanOrEqual(1);
  expect(ship.heading).toBeGreaterThan(-Math.PI);
  expect(ship.heading).toBeLessThanOrEqual(Math.PI);
}

describe('sailing spec: ship step', () => {
  // Feature: sailing, Property 1. Validates: Requirements 1.5, 2.4, 5.2, 5.3
  it("Property 1: the ship's state stays valid", () => {
    fc.assert(
      fc.property(shipState, anyInput, fc.oneof(dtInRange, anyNumber), (ship, input, dt) => {
        expectValid(stepShip(ship, input, dt));
      }),
      { numRuns: 300 },
    );
  });

  // Feature: sailing, Property 2. Validates: Requirements 1.3, 1.4, 2.2
  it('Property 2: sails, rudder and speed change at limited rates', () => {
    fc.assert(
      fc.property(shipState, anyInput, dtInRange, (ship, input, dt) => {
        const next = stepShip(ship, input, dt);
        expect(Math.abs(next.sail - ship.sail)).toBeLessThanOrEqual(SHIP.sailRate * dt + EPS);
        expect(Math.abs(next.rudder - ship.rudder)).toBeLessThanOrEqual(SHIP.rudderRate * dt + EPS);
        expect(next.speed - ship.speed).toBeLessThanOrEqual(SHIP.accel * dt + EPS);
        expect(ship.speed - next.speed).toBeLessThanOrEqual(SHIP.decel * dt + EPS);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: sailing, Property 3. Validates: Requirement 1.6
  it('Property 3: furled sails stop the ship', () => {
    const seconds = 1 / SHIP.sailRate + SHIP.maxSpeed / SHIP.decel;
    const ticks = Math.ceil(seconds / TICK_SECONDS) + 2;
    fc.assert(
      fc.property(shipState, fc.array(real(-1, 1), { minLength: ticks, maxLength: ticks }), (start, rudders) => {
        let ship = start;
        for (const rudder of rudders) ship = stepShip(ship, { rudder, sailLevel: 0 }, TICK_SECONDS);
        expect(ship.speed).toBe(0);
        expect(ship.sail).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: sailing, Property 4. Validates: Requirement 2.3
  it('Property 4: the rudder turns the ship the right way', () => {
    fc.assert(
      fc.property(shipState, fc.integer({ min: 0, max: 2 }), real(0.001, MAX_STEP_SECONDS), (ship, sailLevel, dt) => {
        const starboard = stepShip({ ...ship, rudder: 1 }, { rudder: 1, sailLevel }, dt);
        const port = stepShip({ ...ship, rudder: -1 }, { rudder: -1, sailLevel }, dt);
        const centred = stepShip({ ...ship, rudder: 0 }, { rudder: 0, sailLevel }, dt);
        expect(angleDelta(ship.heading, starboard.heading)).toBeLessThan(0);
        expect(angleDelta(ship.heading, port.heading)).toBeGreaterThan(0);
        expect(centred.heading).toBe(ship.heading);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: sailing, Property 5. Validates: Requirement 2.5
  it('Property 5: the ship moves along its heading', () => {
    fc.assert(
      fc.property(shipState, goodInput, dtInRange, (ship, input, dt) => {
        const next = stepShip(ship, input, dt);
        const dx = next.x - ship.x;
        const dz = next.z - ship.z;
        const travelled = Math.hypot(dx, dz);
        expect(Math.abs(travelled - next.speed * dt)).toBeLessThan(1e-6);
        if (travelled > 1e-3) {
          expect(Math.abs(angleDelta(next.heading, Math.atan2(dx, dz)))).toBeLessThan(1e-6);
        }
      }),
      { numRuns: 300 },
    );
  });

  describe('conventions (example tests)', () => {
    const cruise = (heading: number): ShipState => ({ ...createShip(0, 0, heading), speed: SHIP.maxSpeed, sail: 1, sailLevel: 2 });

    it('heading 0 moves toward +Z (south)', () => {
      const next = stepShip(cruise(0), { rudder: 0, sailLevel: 2 }, 0.1);
      expect(next.z).toBeGreaterThan(1);
      expect(Math.abs(next.x)).toBeLessThan(1e-9);
    });

    it('heading π/2 moves toward +X (east)', () => {
      const next = stepShip(cruise(Math.PI / 2), { rudder: 0, sailLevel: 2 }, 0.1);
      expect(next.x).toBeGreaterThan(1);
      expect(Math.abs(next.z)).toBeLessThan(1e-9);
    });

    it('bearings: heading π is north (0°), π/2 is east (90°), 0 is south (180°), −π/2 is west (270°)', () => {
      expect(headingToBearing(Math.PI)).toBeCloseTo(0, 9);
      expect(headingToBearing(Math.PI / 2)).toBeCloseTo(90, 9);
      expect(headingToBearing(0)).toBeCloseTo(180, 9);
      expect(headingToBearing(-Math.PI / 2)).toBeCloseTo(270, 9);
    });

    it('a starboard turn raises the bearing', () => {
      const ship = { ...cruise(0), rudder: 1 };
      const next = stepShip(ship, { rudder: 1, sailLevel: 2 }, 0.1);
      expect(headingToBearing(next.heading)).toBeGreaterThan(headingToBearing(ship.heading));
    });
  });
});
