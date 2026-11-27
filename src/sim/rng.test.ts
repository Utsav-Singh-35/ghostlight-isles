import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, mixSeed } from './rng';

const seed = fc.integer({ min: 0, max: 0xffffffff });

describe('sailing spec: random number generator', () => {
  // Feature: sailing, Property 11. Validates: Requirements 3.2, 5.1
  it('Property 11: the random number generator is reproducible and in range', () => {
    fc.assert(
      fc.property(seed, fc.integer({ min: -1_000_000, max: 1_000_000 }), fc.nat({ max: 1_000_000 }), (s, lo, span) => {
        const a = createRng(s);
        const b = createRng(s);
        for (let i = 0; i < 50; i++) {
          const value = a.next();
          expect(value).toBe(b.next());
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
        const hi = lo + span;
        for (let i = 0; i < 20; i++) {
          const n = a.int(lo, hi);
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(lo);
          expect(n).toBeLessThanOrEqual(hi);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('shuffle keeps every element exactly once', () => {
    fc.assert(
      fc.property(seed, fc.array(fc.integer(), { maxLength: 40 }), (s, items) => {
        const shuffled = createRng(s).shuffle(items);
        expect([...shuffled].sort((x, y) => x - y)).toEqual([...items].sort((x, y) => x - y));
      }),
      { numRuns: 200 },
    );
  });

  it('hashSeed and mixSeed give 32-bit unsigned integers', () => {
    fc.assert(
      fc.property(fc.string(), seed, fc.nat(), (text, s, salt) => {
        for (const value of [hashSeed(text), mixSeed(s, salt)]) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(0xffffffff);
        }
      }),
      { numRuns: 200 },
    );
  });
});
