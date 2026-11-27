import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ECONOMY } from './balance';
import { canAfford, capsFor, earn, normalize, spend, takeShare, tributeDue, type Resources } from './economy';
import { collectTribute, createProfile } from './profile';

const level = fc.constantFrom(1, 2, 3);
const amount = fc.integer({ min: 0, max: 20000 });
const resourcesFor = (lvl: number): fc.Arbitrary<Resources> =>
  fc.record({ gold: amount, cursedGold: amount, ectoplasm: amount }).map((r) => normalize(r, capsFor(lvl)));
const cost = fc.record({ gold: fc.integer({ min: 0, max: 8000 }), ectoplasm: fc.integer({ min: 0, max: 800 }) });

type Op = { kind: 'earn'; gold: number; cursedGold: number; ectoplasm: number } | { kind: 'spend'; gold: number; ectoplasm: number } | { kind: 'share'; share: number };
const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('earn' as const), gold: amount, cursedGold: amount, ectoplasm: amount }),
  fc.record({ kind: fc.constant('spend' as const), gold: fc.integer({ min: 0, max: 8000 }), ectoplasm: fc.integer({ min: 0, max: 800 }) }),
  fc.record({ kind: fc.constant('share' as const), share: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 }) }),
);

function valid(res: Resources, lvl: number): boolean {
  const caps = capsFor(lvl);
  const values = [res.gold, res.cursedGold, res.ectoplasm];
  return values.every((v) => Number.isInteger(v) && v >= 0) && res.gold + res.cursedGold <= caps.gold && res.ectoplasm <= caps.ectoplasm;
}

describe('persistence spec: economy', () => {
  // Feature: persistence, Property 1. Validates: Requirements 3.1, 3.2
  it('Property 1: resources stay valid', () => {
    fc.assert(
      fc.property(level, fc.array(op, { maxLength: 40 }), (lvl, ops) => {
        let res = normalize(ECONOMY.start, capsFor(lvl));
        for (const o of ops) {
          if (o.kind === 'earn') res = earn(res, o, capsFor(lvl));
          else if (o.kind === 'spend') res = spend(res, o) ?? res;
          else res = takeShare(res, o.share).left;
          expect(valid(res, lvl)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: persistence, Property 2. Validates: Requirements 3.3, 3.4
  it('Property 2: spending is exact and takes cursed gold first', () => {
    fc.assert(
      fc.property(level.chain((lvl) => resourcesFor(lvl)), cost, (res, c) => {
        const after = spend(res, c);
        expect(after !== null).toBe(canAfford(res, c));
        if (!after) return;
        expect(res.gold + res.cursedGold - (after.gold + after.cursedGold)).toBe(c.gold);
        expect(res.cursedGold - after.cursedGold).toBe(Math.min(res.cursedGold, c.gold));
        expect(res.ectoplasm - after.ectoplasm).toBe(c.ectoplasm);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: persistence, Property 3. Validates: Requirements 4.1, 4.2
  it('Property 3: tribute is counted once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 13 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (captured, start, d1, d2) => {
          const t1 = start + d1;
          const t2 = t1 + d2;
          const once = tributeDue(captured, start, t2).gold;
          const first = tributeDue(captured, start, t1);
          const second = tributeDue(captured, first.paidUntil, t2);
          expect(first.gold + second.gold).toBe(once);
          expect(tributeDue(captured, second.paidUntil, t2).gold).toBe(0);

          // Through the profile, collecting twice at the same moment pays nothing the second time.
          const profile = { ...createProfile('p', 'Test', 'h', start), captured: Array.from({ length: captured }, (_, i) => i + 1) };
          const a = collectTribute(profile, t2);
          expect(collectTribute(a.profile, t2).gold).toBe(0);
          expect(a.profile.resources.gold).toBeLessThanOrEqual(capsFor(1).gold);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('earning never lowers resources, and takeShare takes cursed gold first', () => {
    fc.assert(
      fc.property(level.chain((lvl) => fc.tuple(fc.constant(lvl), resourcesFor(lvl))), fc.double({ noNaN: true, min: 0, max: 1 }), ([lvl, res], share) => {
        const more = earn(res, { gold: 50, ectoplasm: 5 }, capsFor(lvl));
        expect(more.gold).toBeGreaterThanOrEqual(res.gold);
        expect(more.ectoplasm).toBeGreaterThanOrEqual(res.ectoplasm);
        const { left, taken } = takeShare(res, share);
        expect(left.gold + taken.gold).toBe(res.gold);
        expect(left.cursedGold + taken.cursedGold).toBe(res.cursedGold);
        if (taken.gold > 0) expect(left.cursedGold).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
