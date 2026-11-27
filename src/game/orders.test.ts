import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createProfile } from '../sim/profile';
import { ORDERS, STEER_RADIANS, currentOrder, observe, readDone, writeDone, type OrderId, type Sighting } from './orders';

const ids = ORDERS.map((o) => o.id);
const startingDefenses = createProfile('', '', '', 0).defenses.length;
const doneSet = fc.subarray(ids).map((list) => new Set<OrderId>(list));
const count = fc.nat({ max: 12 });
const captain = fc.record({ captured: count, defenses: count, raidsWon: count, ghostRaidsRepelled: count, ghostShipsSunk: count });
const sighting: fc.Arbitrary<Sighting> = fc.record({
  sailLevel: fc.integer({ min: 0, max: 2 }),
  turned: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 10 }),
  nearHaunted: fc.boolean(),
  did: fc.subarray(['build', 'moon', 'raid'] as OrderId[]),
  captain: fc.option(captain, { nil: null }),
});

describe("captain's orders", () => {
  // Feature: captains-orders, Property 1. Validates: Requirement 2.4
  it('Property 1: done orders stay done', () => {
    fc.assert(
      fc.property(doneSet, fc.array(sighting, { maxLength: 20 }), (start, sightings) => {
        let done: ReadonlySet<OrderId> = start;
        for (const s of sightings) {
          const next = observe(done, s);
          for (const id of done) expect(next.has(id)).toBe(true);
          done = next;
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: captains-orders, Property 2. Validates: Requirements 1.1, 1.3
  it('Property 2: the current order is the first one not done', () => {
    fc.assert(
      fc.property(doneSet, (done) => {
        const current = currentOrder(done);
        const first = ORDERS.findIndex((o) => !done.has(o.id));
        if (first < 0) expect(current).toBeNull();
        else {
          expect(current?.order).toBe(ORDERS[first]);
          expect(current?.number).toBe(first + 1);
          expect(ORDERS.slice(0, first).every((o) => done.has(o.id))).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: captains-orders, Property 3. Validates: Requirement 2.2
  it('Property 3: a seasoned captain skips ahead', () => {
    fc.assert(
      fc.property(captain, fc.integer({ min: 0, max: 2 }), fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 10 }), fc.boolean(), (c, sailLevel, turned, nearHaunted) => {
        const done = observe(new Set(), { sailLevel, turned, nearHaunted, did: [], captain: c });
        expect(done.has('capture')).toBe(c.captured > 0);
        expect(done.has('build')).toBe(c.defenses > startingDefenses);
        expect(done.has('moon')).toBe(c.ghostRaidsRepelled > 0 || c.ghostShipsSunk > 0);
        expect(done.has('raid')).toBe(c.raidsWon > 0);
        expect(done.has('island')).toBe(nearHaunted || c.captured > 0);
        expect(done.has('sail')).toBe(sailLevel >= 1);
        expect(done.has('steer')).toBe(turned >= STEER_RADIANS);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: captains-orders, Property 4. Validates: Requirement 2.4
  it('Property 4: saved progress reads back', () => {
    fc.assert(
      fc.property(doneSet, (done) => {
        expect(readDone(writeDone(done))).toEqual(done);
      }),
      { numRuns: 200 },
    );
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json(), fc.constant(null)), (text) => {
        const read = readDone(text);
        for (const id of read) expect(ids).toContain(id);
      }),
      { numRuns: 200 },
    );
  });

  it('a new captain starts with the sails', () => {
    expect(currentOrder(new Set())?.order.id).toBe('sail');
    expect(readDone('["sail","steer","kraken"]')).toEqual(new Set(['sail', 'steer']));
  });
});
