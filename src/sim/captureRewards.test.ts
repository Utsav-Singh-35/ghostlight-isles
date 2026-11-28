import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FORTS, REWARDS } from './balance';
import { runBattle } from './battle';
import { captureRewards, rewardsFor, summarize, type BattleSummary } from './captureRewards';
import { fortDifficulty, fortSetup } from './layout';
import type { FortLevel, Island } from './world';

const level = fc.constantFrom<FortLevel>(1, 2, 3, 4, 5);
const summary: fc.Arbitrary<BattleSummary> = fc.record({
  won: fc.boolean(),
  timeLeft: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 }),
  secondsLeft: fc.integer({ min: 0, max: 300 }),
  towersDestroyed: fc.integer({ min: 0, max: 10 }),
  towerLevels: fc.integer({ min: 0, max: 30 }),
  ghostsSunk: fc.integer({ min: 0, max: 4 }),
  vaultsDestroyed: fc.integer({ min: 0, max: 3 }),
});
const isWhole = (n: number) => Number.isInteger(n) && n >= 0;

describe('fort-assault spec: rewards', () => {
  // Feature: fort-assault, Property 1. Validates: Requirement 5.1
  it('Property 1: rewards add up', () => {
    fc.assert(
      fc.property(summary, level, fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 }), (s, lvl, later) => {
        const r = rewardsFor(s, lvl);
        if (!s.won) {
          expect(r).toEqual({ lines: [], gold: 0, ectoplasm: 0 });
          return;
        }
        expect(r.lines.every((l) => isWhole(l.gold) && isWhole(l.ectoplasm))).toBe(true);
        expect(r.gold).toBe(r.lines.reduce((sum, l) => sum + l.gold, 0));
        expect(r.ectoplasm).toBe(r.lines.reduce((sum, l) => sum + l.ectoplasm, 0));
        const base = REWARDS.captureGold[lvl - 1]!;
        expect(r.lines[0]).toEqual({ label: `Level ${lvl} fort broken`, gold: base, ectoplasm: REWARDS.captureEctoplasm[lvl - 1] });
        const speed = r.lines.find((l) => l.label.startsWith('Done with'));
        expect(speed?.gold ?? 0).toBeLessThanOrEqual(Math.floor(base * REWARDS.speedBonus));
        // Finishing with more time left never pays less.
        const more = Math.max(s.timeLeft, later);
        expect(rewardsFor({ ...s, timeLeft: more }, lvl).gold).toBeGreaterThanOrEqual(r.gold);
        // Every other part is exact.
        expect(r.gold).toBe(base + s.towerLevels * REWARDS.towerBounty + (speed?.gold ?? 0) + s.ghostsSunk * REWARDS.islandGhostGold + s.vaultsDestroyed * FORTS.vaultGold[lvl - 1]!);
      }),
      { numRuns: 200 },
    );
  });

  it('reads a real battle: a retreat on the first tick pays nothing and destroys nothing', () => {
    const island: Island = { id: 1, name: 'Test', kind: 'haunted', x: 0, z: 250, radius: 30, seed: 77 };
    const state = runBattle(fortSetup(island, { hull: 160, cannon: 1, salt: 1, barrel: 0, bats: 0, mortar: 0, gunner: 'living', navigator: 'living' }, 5), [[1, 0, 1, 32]]);
    const s = summarize(state);
    expect(s.won).toBe(false);
    expect(s.towersDestroyed).toBe(0);
    expect(s.timeLeft).toBeGreaterThan(0.99);
    expect(captureRewards(state, fortDifficulty(island))).toEqual({ lines: [], gold: 0, ectoplasm: 0 });
  });
});
