import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_STEP_SECONDS, SHIP, WORLD } from './balance';
import { TAU, angleDelta, wrapAngle } from './math';
import { hashSeed } from './rng';
import type { SailLevel, ShipInput, ShipState } from './ship';
import { collisionRadius, createWorldState, generateWorld, stepWorld, type World, type WorldState } from './world';

const real = (min: number, max: number) => fc.double({ noNaN: true, noDefaultInfinity: true, min, max });
const seed = fc.integer({ min: 0, max: 0xffffffff });

type Step = ShipInput & { dt: number };
const step: fc.Arbitrary<Step> = fc.record({
  rudder: real(-1, 1),
  sailLevel: fc.integer({ min: 0, max: 2 }),
  dt: real(0, MAX_STEP_SECONDS),
});
const steps = fc.array(step, { minLength: 1, maxLength: 90 });

/**
 * Where to start the ship, as numbers in [0, 1] that are turned into a position once the world exists.
 * Mode 0 starts near a shore heading roughly at it, mode 1 near the world's edge heading roughly out,
 * and mode 2 anywhere, so collisions actually happen in most runs.
 */
const startPlan = fc.record({
  mode: fc.integer({ min: 0, max: 2 }),
  a: real(0, 1),
  b: real(0, 1),
  c: real(0, 1),
  aim: real(-1, 1),
  speed: real(0, SHIP.maxSpeed),
  sail: real(0, 1),
  sailLevel: fc.constantFrom<SailLevel>(0, 1, 2),
  rudder: real(-1, 1),
});

type StartPlan = typeof startPlan extends fc.Arbitrary<infer T> ? T : never;

function placeShip(world: World, plan: StartPlan): ShipState {
  const angle = plan.b * TAU;
  let x: number;
  let z: number;
  let heading: number;
  if (plan.mode === 0) {
    const island = world.islands[Math.min(world.islands.length - 1, Math.floor(plan.a * world.islands.length))]!;
    const distance = collisionRadius(island) + 0.01 + plan.c * 30;
    x = island.x + Math.sin(angle) * distance;
    z = island.z + Math.cos(angle) * distance;
    heading = Math.atan2(island.x - x, island.z - z) + plan.aim * 0.8;
  } else if (plan.mode === 1) {
    const distance = world.radius - plan.c * 30;
    x = Math.sin(angle) * distance;
    z = Math.cos(angle) * distance;
    heading = angle + plan.aim * 0.8;
  } else {
    const distance = Math.sqrt(plan.a) * world.radius;
    x = Math.sin(angle) * distance;
    z = Math.cos(angle) * distance;
    heading = plan.aim * Math.PI;
    for (const island of world.islands) {
      const dx = x - island.x;
      const dz = z - island.z;
      const d = Math.hypot(dx, dz);
      const limit = collisionRadius(island) + 0.01;
      if (d < limit) {
        const nx = d > 1e-9 ? dx / d : 1;
        const nz = d > 1e-9 ? dz / d : 0;
        x = island.x + nx * limit;
        z = island.z + nz * limit;
      }
    }
  }
  return {
    x,
    z,
    heading: wrapAngle(heading),
    speed: plan.speed,
    sail: plan.sail,
    sailLevel: plan.sailLevel,
    rudder: plan.rudder,
  };
}

function expectInOpenWater(world: World, ship: ShipState): void {
  for (const island of world.islands) {
    expect(Math.hypot(ship.x - island.x, ship.z - island.z)).toBeGreaterThanOrEqual(collisionRadius(island) - 1e-6);
  }
  expect(Math.hypot(ship.x, ship.z)).toBeLessThanOrEqual(world.radius + 1e-6);
}

describe('sailing spec: world', () => {
  // Feature: sailing, Property 6. Validates: Requirements 4.1, 4.2
  it("Property 6: islands and the world's edge are solid", () => {
    fc.assert(
      fc.property(seed, startPlan, steps, (s, plan, inputs) => {
        const world = generateWorld(s);
        let state = { tick: 0, ship: placeShip(world, plan) };
        expectInOpenWater(world, state.ship);
        for (const input of inputs) {
          state = stepWorld(world, state, input, input.dt);
          expectInOpenWater(world, state.ship);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: sailing, Property 7. Validates: Requirement 4.3
  it('Property 7: no teleporting', () => {
    fc.assert(
      fc.property(seed, startPlan, steps, (s, plan, inputs) => {
        const world = generateWorld(s);
        let state = { tick: 0, ship: placeShip(world, plan) };
        for (const input of inputs) {
          const next = stepWorld(world, state, input, input.dt);
          const moved = Math.hypot(next.ship.x - state.ship.x, next.ship.z - state.ship.z);
          expect(moved).toBeLessThanOrEqual(2 * SHIP.maxSpeed * input.dt + 1e-6);
          state = next;
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: sailing, Property 8. Validates: Requirement 5.1
  it('Property 8: same inputs, same result', () => {
    fc.assert(
      fc.property(seed, startPlan, steps, (s, plan, inputs) => {
        const run = () => {
          const world = generateWorld(s);
          let state = { tick: 0, ship: placeShip(world, plan) };
          for (const input of inputs) state = stepWorld(world, state, input, input.dt);
          return state;
        };
        expect(run()).toEqual(run());
      }),
      { numRuns: 200 },
    );
  });

  // Feature: sailing, Property 9. Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6
  it('Property 9: the archipelago is well formed', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const world = generateWorld(s);
        const { islands, spawn } = world;

        expect(islands).toHaveLength(WORLD.islandCount);
        const home = islands[0]!;
        expect(home).toMatchObject({ kind: 'home', name: WORLD.homeName, x: 0, z: 0 });
        expect(islands.slice(1).every((island) => island.kind === 'haunted')).toBe(true);

        for (let i = 0; i < islands.length; i++) {
          const a = islands[i]!;
          expect(Math.hypot(a.x, a.z) + a.radius).toBeLessThanOrEqual(world.radius - WORLD.edgeMargin + 1e-9);
          for (let j = i + 1; j < islands.length; j++) {
            const b = islands[j]!;
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius + WORLD.islandGap - 1e-9);
          }
        }

        expect(new Set(islands.map((island) => island.name)).size).toBe(islands.length);

        for (const island of islands) {
          expect(Math.hypot(spawn.x - island.x, spawn.z - island.z)).toBeGreaterThan(collisionRadius(island));
        }

        const first = islands[1]!;
        const distance = Math.hypot(first.x, first.z);
        expect(distance).toBeGreaterThanOrEqual(WORLD.firstIslandMinDistance);
        expect(distance).toBeLessThanOrEqual(WORLD.firstIslandMaxDistance);
        expect(Math.abs(angleDelta(spawn.heading, Math.atan2(first.x, first.z)))).toBeLessThanOrEqual(
          WORLD.firstIslandMaxAngle + 1e-9,
        );
      }),
      { numRuns: 200 },
    );
  });

  // Feature: sailing, Property 10. Validates: Requirement 3.2
  it('Property 10: the archipelago is reproducible', () => {
    fc.assert(
      fc.property(seed, (s) => {
        expect(generateWorld(s)).toEqual(generateWorld(s));
      }),
      { numRuns: 200 },
    );
  });

  describe('examples', () => {
    const world = generateWorld(hashSeed(WORLD.defaultSeed));

    it('different seeds give different worlds', () => {
      expect(generateWorld(1).islands).not.toEqual(generateWorld(2).islands);
    });

    it('the ship starts at the spawn, at rest, in open water', () => {
      const state = createWorldState(world);
      expect(state.tick).toBe(0);
      expect(state.ship).toMatchObject({ x: world.spawn.x, z: world.spawn.z, speed: 0, sail: 0 });
      expectInOpenWater(world, state.ship);
    });

    it('a ship sailing straight at an island runs aground and stops', () => {
      const target = world.islands[1]!;
      const startDistance = collisionRadius(target) + 10;
      const heading = Math.atan2(target.x - world.spawn.x, target.z - world.spawn.z);
      let state: WorldState = {
        tick: 0,
        ship: {
          x: target.x - Math.sin(heading) * startDistance,
          z: target.z - Math.cos(heading) * startDistance,
          heading,
          speed: SHIP.maxSpeed,
          sail: 1,
          sailLevel: 2,
          rudder: 0,
        },
      };
      for (let i = 0; i < 60; i++) state = stepWorld(world, state, { rudder: 0, sailLevel: 2 }, 1 / 30);
      expect(state.ship.speed).toBeLessThan(SHIP.accel);
      expectInOpenWater(world, state.ship);
    });
  });
});
