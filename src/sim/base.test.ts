import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COSTS } from './balance';
import { DEFENSE_TYPES, SHIP_PARTS, buildDefense, removeDefense, slotsFor, spentOn, upgradeDefense, upgradeHome, upgradeShip, type CommandResult, type ShipPart } from './base';
import { capsFor, normalize } from './economy';
import { cleanDefenses, type DefenseType } from './layout';
import { createProfile, type Profile } from './profile';

export type BaseCommand =
  | { op: 'build' | 'upgrade' | 'remove'; type: string; slot: number }
  | { op: 'home' }
  | { op: 'ship'; part: string };

export const commandArb: fc.Arbitrary<BaseCommand> = fc.oneof(
  fc.record({ op: fc.constantFrom('build' as const, 'upgrade' as const, 'remove' as const), type: fc.constantFrom(...DEFENSE_TYPES, 'moat'), slot: fc.integer({ min: -1, max: 13 }) }),
  fc.record({ op: fc.constant('home' as const) }),
  fc.record({ op: fc.constant('ship' as const), part: fc.constantFrom(...SHIP_PARTS, 'sails') }),
);

export function apply(profile: Profile, c: BaseCommand): CommandResult {
  switch (c.op) {
    case 'build':
      return buildDefense(profile, c.type, c.slot);
    case 'upgrade':
      return upgradeDefense(profile, c.type, c.slot);
    case 'remove':
      return removeDefense(profile, c.type, c.slot);
    case 'home':
      return upgradeHome(profile);
    case 'ship':
      return upgradeShip(profile, c.part);
  }
}

/** A captain with plenty of resources, so commands usually succeed. */
const richProfile = fc.record({ gold: fc.integer({ min: 0, max: 15000 }), cursed: fc.integer({ min: 0, max: 3000 }), ecto: fc.integer({ min: 0, max: 1500 }) }).map(({ gold, cursed, ecto }) => {
  const p = createProfile('0123456789abcdef', 'Tester', 'h', 0);
  return { ...p, resources: normalize({ gold, cursedGold: cursed, ectoplasm: ecto }, capsFor(3)) };
});

function baseProblem(p: Profile): string | null {
  const slots = slotsFor(p.homeLevel);
  const clean = cleanDefenses(p.defenses, slots.towers, slots.mines);
  if (clean.length !== p.defenses.length) return 'a defense sits on a missing or shared slot';
  if (p.defenses.some((d) => COSTS.unlockLevel[d.type] > p.homeLevel)) return 'a defense is not unlocked at this home level';
  const caps = capsFor(p.homeLevel);
  const r = p.resources;
  if (![r.gold, r.cursedGold, r.ectoplasm].every((v) => Number.isInteger(v) && v >= 0)) return 'resources are not whole and non-negative';
  if (r.gold + r.cursedGold > Math.max(caps.gold, capsFor(3).gold) || r.ectoplasm > capsFor(3).ectoplasm) return 'resources are over the cap';
  return null;
}

describe('base-building spec: rules', () => {
  // Feature: base-building, Property 1. Validates: Requirements 1.4, 1.5, 2.1
  it('Property 1: the base stays valid', () => {
    fc.assert(
      fc.property(richProfile, fc.array(commandArb, { maxLength: 40 }), (start, commands) => {
        let p = start;
        for (const c of commands) {
          const r = apply(p, c);
          if (r.ok) p = r.profile;
          expect(baseProblem(p)).toBeNull();
        }
      }),
      { numRuns: 300 },
    );
  });

  // Feature: base-building, Property 2. Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2
  it('Property 2: costs are exact', () => {
    fc.assert(
      fc.property(richProfile, fc.array(commandArb, { maxLength: 12 }), commandArb, (start, warmup, c) => {
        let p = start;
        for (const w of warmup) {
          const r = apply(p, w);
          if (r.ok) p = r.profile;
        }
        const r = apply(p, c);
        if (!r.ok) {
          expect(typeof r.reason).toBe('string');
          return;
        }
        if (c.op === 'remove') return;
        const before = p.resources;
        const after = r.profile.resources;
        const goldPaid = before.gold + before.cursedGold - (after.gold + after.cursedGold);
        const ectoPaid = before.ectoplasm - after.ectoplasm;
        // Costs read straight from the balance table, not through the code under test.
        let cost: { gold: number; ectoplasm: number };
        if (c.op === 'ship') {
          const part = c.part as ShipPart;
          cost = COSTS[part][p.weapons[part]]!;
        } else if (c.op === 'home') {
          cost = p.homeLevel === 1 ? { gold: 1500, ectoplasm: 0 } : { gold: 4000, ectoplasm: 120 };
        } else if (c.op === 'build') {
          cost = COSTS[c.type as DefenseType][0];
        } else {
          const d = p.defenses.find((x) => x.type === c.type && x.slot === c.slot)!;
          cost = COSTS[d.type][d.level as 1 | 2];
        }
        expect(goldPaid).toBe(cost.gold);
        expect(ectoPaid).toBe(cost.ectoplasm);
        expect(before.cursedGold - after.cursedGold).toBe(Math.min(before.cursedGold, cost.gold));
      }),
      { numRuns: 400 },
    );
  });

  // Feature: base-building, Property 3. Validates: Requirement 1.3
  it('Property 3: refunds are exact', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DEFENSE_TYPES), fc.integer({ min: 1, max: 3 }), (type, level) => {
        const home = type === 'boneCatapult' ? 2 : 1;
        const base = createProfile('0123456789abcdef', 'Tester', 'h', 0);
        const p: Profile = { ...base, homeLevel: home, resources: { gold: 0, cursedGold: 0, ectoplasm: 0 }, defenses: [{ type, level: level as 1 | 2 | 3, slot: 0 }] };
        const r = removeDefense(p, type, 0);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const spent = spentOn(type, level);
        expect(r.profile.resources.gold).toBe(Math.floor(spent.gold * COSTS.refund));
        expect(r.profile.resources.ectoplasm).toBe(Math.floor(spent.ectoplasm * COSTS.refund));
        expect(r.profile.defenses).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });

  it('refuses what it should, with a reason', () => {
    const p = createProfile('0123456789abcdef', 'Tester', 'h', 0);
    expect(buildDefense(p, 'boneCatapult', 1)).toEqual({ ok: false, reason: 'Bone Catapult needs Last Light at level 2.' });
    expect(buildDefense(p, 'cannonTower', 0)).toEqual({ ok: false, reason: 'That slot is taken.' });
    expect(buildDefense(p, 'cannonTower', 6).ok).toBe(false);
    expect(upgradeShip({ ...p, resources: { gold: 10, cursedGold: 0, ectoplasm: 0 } }, 'barrel')).toEqual({ ok: false, reason: 'You need 400 gold.' });
  });
});
