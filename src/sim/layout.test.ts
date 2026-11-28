import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FORTS, REWARDS, WORLD } from './balance';
import { sanitizeSetup, type Loadout } from './battle';
import { fortDifficulty, fortSetup } from './layout';
import { fortLevelAt, generateWorld, type Island } from './world';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const distance = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: WORLD.radius });
const starter: Loadout = { hull: 160, cannon: 1, salt: 1, barrel: 0, bats: 0, mortar: 0, gunner: 'living', navigator: 'living' };

/** A haunted island anywhere in the sea, of any size the world can make. */
const island: fc.Arbitrary<Island> = fc
  .record({
    distance: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: WORLD.radius - WORLD.edgeMargin }),
    angle: fc.double({ noNaN: true, noDefaultInfinity: true, min: -Math.PI, max: Math.PI }),
    radius: fc.double({ noNaN: true, noDefaultInfinity: true, min: WORLD.minIslandRadius, max: WORLD.maxIslandRadius }),
    seed,
  })
  .map((r) => ({ id: 1, name: 'Test', kind: 'haunted', x: Math.sin(r.angle) * r.distance, z: Math.cos(r.angle) * r.distance, radius: r.radius, seed: r.seed }));

describe('island-capture spec: forts', () => {
  // Feature: island-capture, Property 7. Validates: Requirements 3.1, 3.2
  it('Property 7: forts get harder further out', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const haunted = generateWorld(s).islands.filter((i) => i.kind === 'haunted');
        const byDistance = [...haunted].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
        for (let k = 1; k < byDistance.length; k++) {
          expect(fortDifficulty(byDistance[k]!)).toBeGreaterThanOrEqual(fortDifficulty(byDistance[k - 1]!));
        }
        for (const i of haunted) {
          const [min, max] = FORTS.islandRadius[fortDifficulty(i) - 1]!;
          expect(i.radius).toBeGreaterThanOrEqual(min);
          expect(i.radius).toBeLessThanOrEqual(max);
        }
        // The island ahead of the start is always an easy one.
        expect(fortDifficulty(haunted[0]!)).toBe(1);
      }),
      { numRuns: 200 },
    );
    fc.assert(
      fc.property(distance, distance, (a, b) => {
        const [near, far] = a <= b ? [a, b] : [b, a];
        expect(fortLevelAt(far)).toBeGreaterThanOrEqual(fortLevelAt(near));
        expect(fortLevelAt(near)).toBeGreaterThanOrEqual(1);
        expect(fortLevelAt(far)).toBeLessThanOrEqual(FORTS.levels);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: island-capture, Property 8. Validates: Requirements 3.3, 3.4, 3.5
  it('Property 8: each level is a stronger fort', () => {
    fc.assert(
      fc.property(island, seed, (isl, battleSeed) => {
        const i = fortDifficulty(isl) - 1;
        const setup = fortSetup(isl, starter, battleSeed);
        const towers = setup.defenses.filter((d) => d.type !== 'mine');
        const mines = setup.defenses.filter((d) => d.type === 'mine');
        const [low, high] = FORTS.towerLevels[i]!;
        expect(towers).toHaveLength(FORTS.towers[i]!);
        expect(mines).toHaveLength(FORTS.mines[i]!);
        expect(towers.every((t) => t.level >= low && t.level <= high)).toBe(true);
        expect(setup.defenses[0]?.type).toBe('cannonTower');
        if (FORTS.catapultShare[i] === 0) expect(towers.some((t) => t.type === 'boneCatapult')).toBe(false);
        expect(setup.island.level).toBe(FORTS.keepLevel[i]);
        expect(setup.island.living).toBe(false);
        expect(setup.mode).toBe('assault');
        expect(setup.fleet).toEqual(FORTS.ghosts[i]);
        expect(setup.timeLimitSeconds).toBe(FORTS.timeLimitSeconds[i]);
        // The setup is already clean: the battle runs it exactly as built.
        expect(sanitizeSetup(setup)).toEqual(setup);
      }),
      { numRuns: 200 },
    );
    for (let i = 1; i < FORTS.levels; i++) {
      const was = i - 1;
      expect(FORTS.towers[i]).toBeGreaterThanOrEqual(FORTS.towers[was]!);
      expect(FORTS.slots[i]).toBeGreaterThanOrEqual(FORTS.slots[was]!);
      expect(FORTS.mines[i]).toBeGreaterThanOrEqual(FORTS.mines[was]!);
      expect(FORTS.towerLevels[i]![0]).toBeGreaterThanOrEqual(FORTS.towerLevels[was]![0]);
      expect(FORTS.towerLevels[i]![1]).toBeGreaterThanOrEqual(FORTS.towerLevels[was]![1]);
      expect(FORTS.keepLevel[i]).toBeGreaterThanOrEqual(FORTS.keepLevel[was]!);
      expect(FORTS.ghosts[i]!.count).toBeGreaterThanOrEqual(FORTS.ghosts[was]!.count);
      expect(FORTS.ghosts[i]!.level).toBeGreaterThanOrEqual(FORTS.ghosts[was]!.level);
      expect(FORTS.timeLimitSeconds[i]).toBeGreaterThanOrEqual(FORTS.timeLimitSeconds[was]!);
      expect(FORTS.islandRadius[i]![0]).toBeGreaterThanOrEqual(FORTS.islandRadius[was]![0]);
      expect(FORTS.islandRadius[i]![1]).toBeGreaterThanOrEqual(FORTS.islandRadius[was]![1]);
      expect(REWARDS.captureGold[i]).toBeGreaterThan(REWARDS.captureGold[was]!);
      expect(REWARDS.captureEctoplasm[i]).toBeGreaterThan(REWARDS.captureEctoplasm[was]!);
    }
    for (const [min, max] of FORTS.islandRadius) {
      expect(min).toBeGreaterThanOrEqual(WORLD.minIslandRadius);
      expect(max).toBeLessThanOrEqual(WORLD.maxIslandRadius);
    }
  });
});
