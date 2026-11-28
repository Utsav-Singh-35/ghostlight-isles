import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ECONOMY } from './balance';
import { createProfile, loadoutOf, trialLeft, useTrialBattle, type Profile } from './profile';

const weapons = fc.record({
  hull: fc.integer({ min: 1, max: 3 }),
  cannon: fc.integer({ min: 0, max: 3 }),
  salt: fc.integer({ min: 0, max: 3 }),
  barrel: fc.integer({ min: 0, max: 3 }),
  bats: fc.integer({ min: 0, max: 3 }),
  mortar: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
});
const trial = fc.option(fc.oneof(fc.integer({ min: -2, max: 5 }), fc.constantFrom(Number.NaN, 2.5)), { nil: undefined });

const ARMS = ['cannon', 'salt', 'barrel', 'bats', 'mortar'] as const;

describe('base-building spec: the trial', () => {
  // Feature: base-building, Property 5. Validates: Requirements 4.2, 4.3
  it('Property 5: the trial lends every weapon and takes nothing', () => {
    fc.assert(
      fc.property(weapons, trial, fc.nat(6), (w, trialBattles, battles) => {
        const base = createProfile('0123456789abcdef', 'Tester', '', 0);
        const profile: Profile = { ...base, weapons: w, trialBattles };
        const owned = { cannon: w.cannon, salt: w.salt, barrel: w.barrel, bats: w.bats, mortar: w.mortar ?? 0 };
        const loadout = loadoutOf(profile);
        for (const arm of ARMS) {
          expect(loadout[arm]).toBeGreaterThanOrEqual(owned[arm]);
          if (trialLeft(profile) > 0) expect(loadout[arm]).toBeGreaterThanOrEqual(1);
          else expect(loadout[arm]).toBe(owned[arm]);
        }
        let p = profile;
        for (let i = 0; i < battles; i++) {
          const before = trialLeft(p);
          p = useTrialBattle(p);
          expect(trialLeft(p)).toBe(Math.max(0, before - 1));
        }
        expect(p.weapons).toEqual(profile.weapons);
      }),
      { numRuns: 200 },
    );
  });

  it('a new captain starts with the trial, and an old save has none', () => {
    const fresh = createProfile('0123456789abcdef', 'Tester', '', 0);
    expect(trialLeft(fresh)).toBe(ECONOMY.trialBattles);
    expect(loadoutOf(fresh).mortar).toBe(1);
    const { trialBattles: _gone, ...old } = fresh;
    void _gone;
    expect(trialLeft(old as Profile)).toBe(0);
    expect(loadoutOf(old as Profile).mortar).toBe(0);
  });
});
