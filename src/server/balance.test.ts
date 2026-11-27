import { describe, expect, it } from 'vitest';
import { FORTS } from '../sim/balance';
import { FLAG, type Loadout } from '../sim/battle';
import { fortDifficulty, fortSetup } from '../sim/layout';
import { createProfile, loadoutOf } from '../sim/profile';
import type { Island } from '../sim/world';
import { STANDARD_WORLD } from './capture';
import { siegeSetup } from './ghosts';
import { raidSetup } from './raids';
import { RIVALS } from './rivals';
import { autopilot } from './testAutopilot';

// Balance checks with the scripted autopilot (circling 14 m off the shore, firing both broadsides
// with cannonballs). A real player who also uses Salt Shot against ghosts does at least as well.
const fresh = createProfile('p', 'Test', 'x', 0);
const NEW_SHIP = loadoutOf(fresh);
const REFITTED: Loadout = { hull: 210, cannon: 2, salt: 2, barrel: 1, bats: 1, gunner: 'living', navigator: 'living' };
const FULLY_REFITTED: Loadout = { hull: 270, cannon: 3, salt: 3, barrel: 3, bats: 3, gunner: 'living', navigator: 'living' };
const ALL_WEAPONS = FLAG.port | FLAG.starboard | FLAG.barrel | FLAG.bats;

const atLevel = (level: number): Island[] => STANDARD_WORLD.islands.filter((i) => i.kind === 'haunted' && fortDifficulty(i) === level);
const takes = (island: Island, loadout: Loadout, seed: number) => autopilot(fortSetup(island, loadout, seed), ALL_WEAPONS).state.result!.keepDestroyed;

describe('balance: forts get harder as the game goes on', () => {
  const seeds = [7919, 15838, 23757];

  it('the standard sea has forts of every level', () => {
    for (let level = 1; level <= FORTS.levels; level++) expect({ level, forts: atLevel(level).length > 0 }).toEqual({ level, forts: true });
  });

  it('a new captain takes every level-1 fort', () => {
    for (const island of atLevel(1)) {
      for (const seed of seeds) expect({ island: island.name, seed, won: takes(island, NEW_SHIP, seed) }).toEqual({ island: island.name, seed, won: true });
    }
  });

  it('a new captain loses at level 3; a refitted ship takes it', () => {
    const island = atLevel(3)[0]!;
    for (const seed of seeds.slice(0, 2)) {
      expect(takes(island, NEW_SHIP, seed)).toBe(false);
      expect(takes(island, REFITTED, seed)).toBe(true);
    }
  });

  it('level 4 needs a fully refitted ship', () => {
    const island = atLevel(4)[0]!;
    for (const seed of seeds.slice(0, 2)) {
      expect(takes(island, REFITTED, seed)).toBe(false);
      expect(takes(island, FULLY_REFITTED, seed)).toBe(true);
    }
  });

  it('a fully refitted ship can take every level-5 fort', () => {
    for (const island of atLevel(5)) {
      expect({ island: island.name, won: takes(island, FULLY_REFITTED, seeds[0]!) }).toEqual({ island: island.name, won: true });
    }
  }, 60_000);

  // Regression: before BATTLE.keepReach a ship had to scrape a big island's shore to hit its keep.
  // A level-1 fort on the biggest island the world can make must still fall to a new ship.
  it('can reach the keep of a big island without scraping its shore', () => {
    const big: Island = { id: 99, name: 'Test', kind: 'haunted', x: 0, z: 300, radius: 66, seed: 4242 };
    expect(fortDifficulty(big)).toBe(1);
    const result = autopilot(fortSetup(big, NEW_SHIP, 7919), ALL_WEAPONS).state.result!;
    expect(result.keepDestroyed).toBe(true);
    expect(result.destruction).toBe(1);
  });
});

describe('balance: the first minutes', () => {
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
