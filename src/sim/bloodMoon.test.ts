import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BLOOD_MOON, GHOSTS } from './balance';
import { bloodMoonAt, fleetCanSail, fleetFor } from './bloodMoon';
import { createProfile } from './profile';

const time = fc.integer({ min: 0, max: 4_102_444_800_000 }); // 1970 to 2100
const PERIOD = BLOOD_MOON.periodSeconds * 1000;
const DURATION = BLOOD_MOON.durationSeconds * 1000;

describe('ghost-fleet spec: the clock and the fleet', () => {
  // Feature: ghost-fleet, Property 1. Validates: Requirement 1.1
  it('Property 1: the clock is regular', () => {
    fc.assert(
      fc.property(time, (t) => {
        const m = bloodMoonAt(t);
        expect(m.active).toBe(t % PERIOD < DURATION);
        expect(m.nextStart).toBeGreaterThan(t);
        expect(m.nextStart - t).toBeLessThanOrEqual(PERIOD);
        expect(m.endsAt - m.startsAt).toBe(DURATION);
        // The next window starts after this one ends, so windows never overlap.
        expect(bloodMoonAt(m.nextStart).startsAt).toBe(m.nextStart);
        expect(m.nextStart).toBeGreaterThan(m.endsAt);
        expect(bloodMoonAt(m.nextStart).index).toBe(m.index + 1);
      }),
      { numRuns: 500 },
    );
  });

  // Feature: ghost-fleet, Property 2. Validates: Requirements 2.2, 2.3
  it('Property 2: greed grows the fleet', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 15000 }), fc.integer({ min: 0, max: 15000 }), fc.constantFrom(1, 2, 3), fc.integer({ min: 0, max: 40 }), (cursed, more, level, repelled) => {
        const base = createProfile('0123456789abcdef', 'T', 'h', 0);
        const p = { ...base, homeLevel: level as 1 | 2 | 3, stats: { ...base.stats, ghostRaidsRepelled: repelled }, resources: { ...base.resources, cursedGold: cursed } };
        const greedier = { ...p, resources: { ...p.resources, cursedGold: cursed + more } };
        const a = fleetFor(p);
        const b = fleetFor(greedier);
        expect(b.count).toBeGreaterThanOrEqual(a.count);
        for (const f of [a, b]) {
          expect(f.count).toBeGreaterThanOrEqual(1);
          expect(f.count).toBeLessThanOrEqual(GHOSTS.maxFleet);
          expect(f.level).toBeGreaterThanOrEqual(1);
          expect(f.level).toBeLessThanOrEqual(GHOSTS.maxLevel);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('a summoned moon ignores the shared clock and the rest', () => {
    const t = PERIOD * 1000 + DURATION + 1; // just after a window
    expect(fleetCanSail({ summonedUntil: 0, ghostRestUntil: 0 }, t)).toBe(false);
    expect(fleetCanSail({ summonedUntil: t + 1000, ghostRestUntil: t + 999_999 }, t)).toBe(true);
    expect(fleetCanSail({ summonedUntil: 0, ghostRestUntil: PERIOD * 1000 + 5 }, PERIOD * 1000 + 10)).toBe(true);
    expect(fleetCanSail({ summonedUntil: 0, ghostRestUntil: PERIOD * 1000 + 50 }, PERIOD * 1000 + 10)).toBe(false);
  });
});
