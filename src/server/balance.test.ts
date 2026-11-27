import { describe, expect, it } from 'vitest';
import { FLAG } from '../sim/battle';
import { fortDifficulty } from '../sim/layout';
import { createProfile, loadoutOf } from '../sim/profile';
import { STANDARD_WORLD, fortSetup } from './capture';
import { siegeSetup } from './ghosts';
import { raidSetup } from './raids';
import { RIVALS } from './rivals';
import { autopilot } from './testAutopilot';

// Balance checks for the first minutes of play: what a brand-new captain can do with the scripted
// autopilot (circling 14 m off the shore, firing both broadsides). A real player does about as well.
describe('balance for a new captain', () => {
  const fresh = createProfile('p', 'Test', 'x', 0);
  const seeds = [7919, 15838, 23757];

  it('takes every level-1 fort in the standard sea', () => {
    const easy = STANDARD_WORLD.islands.filter((i) => i.kind === 'haunted' && fortDifficulty(i) === 1);
    expect(easy.length).toBeGreaterThan(0);
    for (const island of easy) {
      for (const seed of seeds) {
        const result = autopilot(fortSetup(island, fresh, seed)).state.result!;
        expect({ island: island.name, seed, won: result.keepDestroyed }).toEqual({ island: island.name, seed, won: true });
      }
    }
  });

  // Regression: Bonefire Isle is a level-1 fort on a big island. Before BATTLE.keepReach the
  // autopilot sank every tower but its keep stayed out of range, so the battle ran out at 50%.
  it('can reach the keep of a big island without scraping its shore', () => {
    const bonefire = STANDARD_WORLD.islands.find((i) => i.name === 'Bonefire Isle')!;
    const result = autopilot(fortSetup(bonefire, fresh, 7919)).state.result!;
    expect(result.keepDestroyed).toBe(true);
    expect(result.destruction).toBe(1);
  });

  // The autopilot never chases a hidden ghost, so it loses some sieges a player would win.
  it('usually holds Last Light against the first ghost fleet by fighting, and loses it by idling', () => {
    const sieges = Array.from({ length: 10 }, (_, k) => siegeSetup(fresh, (k + 1) * 7919));
    const held = sieges.filter((s) => !autopilot(s, FLAG.port | FLAG.starboard | FLAG.salt).state.result!.keepDestroyed).length;
    const heldIdle = sieges.filter((s) => !autopilot(s, 0).state.result!.keepDestroyed).length;
    expect(held).toBeGreaterThanOrEqual(7);
    expect(heldIdle).toBe(0);
  });

  it('earns at least one star raiding any level-1 rival', () => {
    for (const rival of RIVALS.filter((r) => r.homeLevel === 1)) {
      const result = autopilot(raidSetup(rival.homeLevel, rival.layout.defenses, rival.seed, loadoutOf(fresh), 613)).state.result!;
      expect({ rival: rival.name, starred: result.stars >= 1 }).toEqual({ rival: rival.name, starred: true });
    }
  });
});
