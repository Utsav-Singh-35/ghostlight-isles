import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DefenseLevel, DefenseType, PlacedDefense } from './layout';
import { baseRating, fortToughness, starText, toughnessStars } from './toughness';

const TYPES: readonly DefenseType[] = ['cannonTower', 'spiritLantern', 'boneCatapult', 'mine'];
const level = fc.constantFrom<DefenseLevel>(1, 2, 3);
const defense = fc.record({ type: fc.constantFrom(...TYPES), level, slot: fc.nat(11) });
const base = fc.record({ defenses: fc.array(defense, { maxLength: 17 }), homeLevel: level });

describe('raids spec: toughness', () => {
  // Feature: raids, Property 5. Validates: Requirement 5.3
  it('Property 5: toughness grows with defenses', () => {
    fc.assert(
      fc.property(base, defense, fc.nat(16), (b, extra, pick) => {
        const stars = toughnessStars(baseRating(b));
        expect(Number.isInteger(stars) && stars >= 1 && stars <= 5).toBe(true);
        const more = { ...b, defenses: [...b.defenses, extra] };
        expect(toughnessStars(baseRating(more))).toBeGreaterThanOrEqual(stars);
        if (b.defenses.length > 0) {
          const i = pick % b.defenses.length;
          const upgraded: PlacedDefense[] = b.defenses.map((d, k) => (k === i ? { ...d, level: Math.min(3, d.level + 1) as DefenseLevel } : d));
          expect(toughnessStars(baseRating({ ...b, defenses: upgraded }))).toBeGreaterThanOrEqual(stars);
        }
        if (b.homeLevel < 3) expect(toughnessStars(baseRating({ ...b, homeLevel: (b.homeLevel + 1) as DefenseLevel }))).toBeGreaterThanOrEqual(stars);
      }),
      { numRuns: 200 },
    );
  });

  it('a new captain is 1 star, a full level-3 base is 5, and forts get one star per level', () => {
    expect(toughnessStars(baseRating({ defenses: [{ type: 'cannonTower', level: 1, slot: 0 }], homeLevel: 1 }))).toBe(1);
    const full = Array.from({ length: 17 }, (_, i) => ({ type: 'cannonTower' as const, level: 3 as const, slot: i }));
    expect(toughnessStars(baseRating({ defenses: full, homeLevel: 3 }))).toBe(5);
    expect([1, 2, 3, 4, 5].map(fortToughness)).toEqual([1, 2, 3, 4, 5]);
    expect(starText(3)).toBe('★★★☆☆');
    expect(toughnessStars(Number.NaN)).toBe(1);
  });
});
