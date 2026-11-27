import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BATTLE, DEFENSES, GHOSTS, WEAPONS, WORLD } from './balance';
import {
  DEFAULT_INPUT,
  FLAG,
  createBattle,
  isRevealed,
  recordInput,
  runBattle,
  sanitizeEvents,
  shotDamage,
  stepBattle,
  type BattleInput,
  type BattleSetup,
  type BattleState,
  type CrewState,
  type InputEvent,
} from './battle';
import { fortLayout, type DefenseType } from './layout';
import { angleDelta, clamp } from './math';
import { hashSeed } from './rng';
import { collisionRadius, generateWorld } from './world';

/** How far off a shore a captain may comfortably sail and still hit the keep, metres. */
const KEEP_OFFSHORE = 16;
const crew = fc.constantFrom<CrewState>('none', 'living', 'ghost');
const defense = fc.record({
  type: fc.constantFrom<DefenseType>('cannonTower', 'spiritLantern', 'boneCatapult', 'mine'),
  level: fc.constantFrom<1 | 2 | 3>(1, 2, 3),
  slot: fc.integer({ min: 0, max: 11 }),
});

const setupArb: fc.Arbitrary<BattleSetup> = fc.record({
  seed: fc.integer({ min: 0, max: 0xffffffff }),
  mode: fc.constantFrom<'assault' | 'siege'>('assault', 'siege'),
  island: fc.record({
    radius: fc.double({ noNaN: true, noDefaultInfinity: true, min: 26, max: 62 }),
    living: fc.boolean(),
    level: fc.constantFrom(1, 2, 3),
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    slotCount: fc.integer({ min: 4, max: 12 }),
    mineSlotCount: fc.integer({ min: 0, max: 5 }),
  }),
  defenses: fc.array(defense, { maxLength: 14 }),
  loadout: fc.record({
    hull: fc.integer({ min: 60, max: 300 }),
    cannon: fc.constantFrom(1, 2, 3),
    salt: fc.constantFrom(0, 1, 2, 3),
    barrel: fc.constantFrom(0, 1, 2, 3),
    bats: fc.constantFrom(0, 1, 2, 3),
    gunner: crew,
    navigator: crew,
  }),
  fleet: fc.record({ count: fc.integer({ min: 0, max: 8 }), level: fc.integer({ min: 1, max: 5 }) }),
  timeLimitSeconds: fc.integer({ min: 5, max: 30 }),
});

/** Stretches of held input: [ticks, rudder, sail level, flags without retreat]. */
const segments = fc.array(
  fc.tuple(fc.integer({ min: 1, max: 120 }), fc.constantFrom(-1, 0, 1), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 31 })),
  { maxLength: 16 },
);

function inputAt(plan: ReadonlyArray<readonly [number, number, number, number]>, index: number): BattleInput {
  let remaining = index;
  for (const [ticks, rudder, sailLevel, flags] of plan) {
    if (remaining < ticks) return { rudder, sailLevel, flags };
    remaining -= ticks;
  }
  const last = plan[plan.length - 1];
  return last ? { rudder: last[1], sailLevel: last[2], flags: last[3] } : DEFAULT_INPUT;
}

/** Plays a battle tick by tick, as the game does, recording input changes. */
function playLive(setup: BattleSetup, plan: ReadonlyArray<readonly [number, number, number, number]>, onStep?: (prev: BattleState, next: BattleState) => void) {
  let state = createBattle(setup);
  const events: InputEvent[] = [];
  let last = DEFAULT_INPUT;
  for (let i = 0; !state.result; i++) {
    const input = inputAt(plan, i);
    last = recordInput(events, last, state.tick + 1, input);
    const next = stepBattle(state, input);
    onStep?.(state, next);
    state = next;
  }
  return { state, events };
}

/** The first thing wrong with a state, or null. Plain checks: calling expect() every tick is too slow. */
function problemWith(state: BattleState): string | null {
  const island = state.arena.islands[0]!;
  for (const c of [state.player, ...state.ghosts]) {
    for (const value of [c.hp, c.ship.x, c.ship.z, c.ship.heading, c.ship.speed]) {
      if (!Number.isFinite(value)) return `ship ${c.id} has a non-finite value`;
    }
    if (c.hp < 0 || c.hp > c.maxHp) return `ship ${c.id} health ${c.hp} is outside [0, ${c.maxHp}]`;
    if (Math.hypot(c.ship.x, c.ship.z) > state.arena.radius + 1e-6) return `ship ${c.id} left the arena`;
    if (Math.hypot(c.ship.x - island.x, c.ship.z - island.z) < collisionRadius(island) - 1e-6) return `ship ${c.id} is inside the island`;
  }
  for (const s of state.structures) {
    if (!Number.isFinite(s.hp) || s.hp < 0 || s.hp > s.maxHp) return `structure ${s.id} health ${s.hp} is invalid`;
  }
  for (const shot of state.shots) {
    if (![shot.fromX, shot.fromZ, shot.toX, shot.toZ, shot.damage].every(Number.isFinite)) return `shot ${shot.id} has a non-finite value`;
  }
  return null;
}

const RUNS = { numRuns: 60 };
/** Battle properties replay thousands of ticks; give them time. */
const SLOW = 60_000;

describe('combat spec: battle simulation', () => {
  // Feature: combat, Property 1. Validates: Requirement 5.1
  it('Property 1: same setup and inputs, same battle', () => {
    fc.assert(
      fc.property(setupArb, segments, (setup, plan) => {
        const { events } = playLive(setup, plan);
        expect(runBattle(setup, events)).toEqual(runBattle(setup, events));
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: combat, Property 2. Validates: Requirement 5.2
  it('Property 2: a live battle replays exactly', () => {
    fc.assert(
      fc.property(setupArb, segments, (setup, plan) => {
        const { state, events } = playLive(setup, plan);
        expect(runBattle(setup, events)).toEqual(state);
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: combat, Property 3. Validates: Requirement 5.5
  it('Property 3: the battle state stays valid', () => {
    fc.assert(
      fc.property(setupArb, segments, (setup, plan) => {
        let problem = problemWith(createBattle(setup));
        playLive(setup, plan, (_prev, next) => {
          problem ??= problemWith(next);
        });
        expect(problem).toBeNull();
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: combat, Property 4. Validates: Requirement 5.4
  it('Property 4: health never rises', () => {
    fc.assert(
      fc.property(setupArb, segments, (setup, plan) => {
        let problem: string | null = null;
        playLive(setup, plan, (prev, next) => {
          if (problem) return;
          prev.structures.forEach((s, i) => {
            if (next.structures[i]!.hp > s.hp) problem = `structure ${s.id} healed on tick ${next.tick}`;
          });
          if (next.player.hp > prev.player.hp) problem = `the player's ship healed on tick ${next.tick}`;
          prev.ghosts.forEach((g, i) => {
            if (next.ghosts[i]!.hp > g.hp) problem = `ghost ${g.id} healed on tick ${next.tick}`;
          });
        });
        expect(problem).toBeNull();
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: combat, Property 5. Validates: Requirements 4.1, 4.2, 4.3
  it('Property 5: every battle ends, with a consistent score', () => {
    fc.assert(
      fc.property(setupArb, segments, (setup, plan) => {
        const { state } = playLive(setup, plan);
        const result = state.result!;
        expect(result.ticks).toBeLessThanOrEqual(state.limit);
        expect(result.destruction).toBeGreaterThanOrEqual(0);
        expect(result.destruction).toBeLessThanOrEqual(1);
        const expected = (result.destruction >= 0.5 ? 1 : 0) + (result.keepDestroyed ? 1 : 0) + (result.destruction >= 1 ? 1 : 0);
        expect(result.stars).toBe(expected);
        const reasons = setup.mode === 'assault' ? ['destroyed', 'sunk', 'time'] : ['repelled', 'overrun', 'dawn'];
        expect(reasons).toContain(result.reason);
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: combat, Property 6. Validates: Requirements 2.1, 2.2
  it('Property 6: the two threats need two defenses', () => {
    fc.assert(
      fc.property(fc.constantFrom(0, 1, 2), (i) => {
        const tower = DEFENSES.cannonTower.damage[i]!;
        const lantern = DEFENSES.spiritLantern.damage[i]!;
        expect(shotDamage('tower', tower, 'ghost')).toBeCloseTo(shotDamage('tower', tower, 'living') * 0.5, 12);
        expect(shotDamage('lantern', lantern, 'living')).toBeCloseTo(shotDamage('lantern', lantern, 'ghost') * 0.4, 12);
        expect(shotDamage('salt', 10, 'ghost')).toBeGreaterThan(shotDamage('ball', 10, 'ghost'));
        expect(shotDamage('ball', 10, 'ghost', true)).toBe(shotDamage('ball', 10, 'living'));
      }),
      { numRuns: 20 },
    );
  });

  // Feature: combat, Property 7. Validates: Requirements 2.5, 3.4
  it("Property 7: veiled ghosts can't be targeted by towers", () => {
    const siege = setupArb.map((s) => ({ ...s, mode: 'siege' as const, fleet: { count: Math.max(2, s.fleet.count), level: s.fleet.level } }));
    fc.assert(
      fc.property(siege, segments, (setup, plan) => {
        playLive(setup, plan, (prev, next) => {
          for (const e of next.events) {
            if (e.type !== 'fire' || e.side !== 'island' || e.kind === 'lantern' || e.targetId === null) continue;
            const ghost = prev.ghosts.find((g) => g.id === e.targetId);
            if (ghost) expect(isRevealed(prev, ghost)).toBe(true);
          }
        });
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: combat, Property 8. Validates: Requirement 5.3
  it('Property 8: malformed inputs are harmless', () => {
    const junk = fc.array(
      fc.oneof(
        fc.tuple(fc.double(), fc.double(), fc.double(), fc.double()),
        fc.tuple(fc.integer({ min: -50, max: 2000 }), fc.integer({ min: -3, max: 3 }), fc.integer({ min: -2, max: 5 }), fc.integer({ min: -10, max: 200 })),
        fc.anything(),
      ),
      { maxLength: 60 },
    );
    fc.assert(
      fc.property(setupArb, junk, (setup, events) => {
        const clean = sanitizeEvents(events);
        expect(sanitizeEvents(clean)).toEqual(clean);
        const state = runBattle(setup, events);
        expect(state.result).not.toBeNull();
        expect(state).toEqual(runBattle(setup, clean));
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: combat, Property 9. Validates: Requirements 1.1, 3.2, 4.3
  it('Property 9: every keep is within reach', () => {
    // Raided home islands are as big as Last Light, so cover them too.
    const islandRadius = fc.double({ noNaN: true, noDefaultInfinity: true, min: WORLD.minIslandRadius, max: Math.max(WORLD.maxIslandRadius, WORLD.homeIslandRadius) });
    const offshore = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: KEEP_OFFSHORE });
    fc.assert(
      fc.property(islandRadius, offshore, (radius, off) => {
        const shore = collisionRadius({ id: 0, name: '', kind: 'haunted', x: 0, z: 0, radius, seed: 0 });
        // A ship sailing up to KEEP_OFFSHORE metres off the shore can hit the keep at the centre...
        expect(WEAPONS.cannon.range + BATTLE.keepReach).toBeGreaterThanOrEqual(shore + off);
        // ...and a ship at the shore can hit every tower slot, which stands closer to the shore than the keep.
        expect(WEAPONS.cannon.range).toBeGreaterThanOrEqual(shore - radius * 0.6);
      }),
      { numRuns: 200 },
    );
    // Ghosts circling Last Light can hit its keep.
    const home = collisionRadius({ id: 0, name: '', kind: 'home', x: 0, z: 0, radius: WORLD.homeIslandRadius, seed: 0 });
    expect(GHOSTS.range).toBeGreaterThanOrEqual(home + GHOSTS.orbitMargin);
  });

  // Feature: combat, Property 10. Validates: Requirements 3.5, 3.6, 4.1
  it("Property 10: the island's ghosts fight for it", () => {
    const assault = setupArb.map((s) => ({ ...s, mode: 'assault' as const, fleet: { count: Math.max(1, s.fleet.count), level: s.fleet.level } }));
    const playerKinds = new Set(['ball', 'salt', 'barrel']);
    fc.assert(
      fc.property(assault, segments, (setup, plan) => {
        let problem: string | null = null;
        const { state } = playLive(setup, plan, (prev, next) => {
          if (problem) return;
          for (const e of next.events) {
            if (e.type === 'land' && !playerKinds.has(e.kind) && e.hitId !== null && e.hitId !== next.player.id) {
              problem = `a ${e.kind} shot hit ${e.hitId} instead of the player on tick ${next.tick}`;
            }
          }
          // Anything of the island's that loses health must have been hit by the player's shots or Witchfire.
          const byPlayer = prev.fires.length > 0 || next.fires.length > 0 || next.events.some((e) => e.type === 'land' && playerKinds.has(e.kind));
          next.ghosts.forEach((g, i) => {
            if (g.hp < prev.ghosts[i]!.hp && !byPlayer) problem = `ghost ${g.id} was hurt by its own side on tick ${next.tick}`;
          });
          next.structures.forEach((s, i) => {
            if (s.type !== 'mine' && s.hp < prev.structures[i]!.hp && !byPlayer) problem = `structure ${s.id} was hurt by its own side on tick ${next.tick}`;
          });
        });
        expect(problem).toBeNull();
        expect(['destroyed', 'sunk', 'time']).toContain(state.result!.reason);
        expect(state.result!.reason === 'destroyed').toBe(state.structures.every((s) => s.type === 'mine' || s.destroyed));
      }),
      RUNS,
    );
  }, SLOW);

  describe('examples', () => {
    const world = generateWorld(hashSeed(WORLD.defaultSeed));
    const firstFort = world.islands[1]!;
    const layout = fortLayout(firstFort);
    const starter = { hull: 160, cannon: 1, salt: 1, barrel: 0, bats: 0, gunner: 'living', navigator: 'living' } as const;

    it('a captain circling the first fort and firing both broadsides takes it', () => {
      const setup: BattleSetup = {
        seed: 7,
        mode: 'assault',
        island: { radius: firstFort.radius, living: false, level: layout.level, seed: firstFort.seed, slotCount: layout.slotCount, mineSlotCount: layout.mineSlotCount },
        defenses: layout.defenses,
        loadout: starter,
        fleet: { count: 0, level: 1 },
        timeLimitSeconds: 150,
      };
      // Circle the island at broadside range with the island to port, firing both sides.
      let state = createBattle(setup);
      const ring = collisionRadius(state.arena.islands[0]!) + 14;
      while (!state.result) {
        const { x, z, heading } = state.player.ship;
        const around = Math.atan2(x, z);
        const error = Math.hypot(x, z) - ring;
        const desired = around - (Math.PI / 2 + clamp(error * 0.03, -0.6, 0.9));
        const rudder = clamp(-angleDelta(heading, desired) * 2.5, -1, 1);
        state = stepBattle(state, { rudder, sailLevel: 1, flags: FLAG.port | FLAG.starboard });
      }
      expect(state.result.keepDestroyed).toBe(true);
      expect(state.result.shipSunk).toBe(false);
    });

    it('two Spirit Lanterns and two Cannon Towers repel a small fleet on their own', () => {
      const setup: BattleSetup = {
        seed: 11,
        mode: 'siege',
        island: { radius: WORLD.homeIslandRadius, living: true, level: 1, seed: 1, slotCount: 6, mineSlotCount: 3 },
        defenses: [
          { type: 'spiritLantern', level: 2, slot: 0 },
          { type: 'spiritLantern', level: 2, slot: 3 },
          { type: 'cannonTower', level: 1, slot: 1 },
          { type: 'cannonTower', level: 1, slot: 4 },
        ],
        loadout: starter,
        fleet: { count: 2, level: 1 },
        timeLimitSeconds: 150,
      };
      // The player furls the sails and does nothing.
      const state = runBattle(setup, [[1, 0, 0, 0]]);
      expect(state.result!.reason).toBe('repelled');
      expect(state.result!.keepDestroyed).toBe(false);
    });

    it('cannon towers alone cannot see ghosts in the fog', () => {
      const setup: BattleSetup = {
        seed: 3,
        mode: 'siege',
        island: { radius: WORLD.homeIslandRadius, living: true, level: 1, seed: 1, slotCount: 6, mineSlotCount: 3 },
        defenses: [
          { type: 'cannonTower', level: 3, slot: 0 },
          { type: 'cannonTower', level: 3, slot: 2 },
          { type: 'cannonTower', level: 3, slot: 4 },
        ],
        loadout: starter,
        fleet: { count: 3, level: 1 },
        timeLimitSeconds: 60,
      };
      let state = createBattle(setup);
      let towerShotsAtGhosts = 0;
      while (!state.result) {
        state = stepBattle(state, { rudder: 0, sailLevel: 0, flags: 0 });
        for (const e of state.events) if (e.type === 'fire' && e.side === 'island') towerShotsAtGhosts++;
      }
      // The player's ship sits still, so only ghosts that sail into its lantern light can be shot.
      expect(state.result.ghostsSunk).toBeLessThan(3);
      expect(towerShotsAtGhosts).toBeLessThan(40);
    });

    it('retreating ends an assault at once with nothing destroyed', () => {
      const setup: BattleSetup = {
        seed: 5,
        mode: 'assault',
        island: { radius: 40, living: false, level: 1, seed: 2, slotCount: 5, mineSlotCount: 3 },
        defenses: [{ type: 'cannonTower', level: 1, slot: 0 }],
        loadout: starter,
        fleet: { count: 0, level: 1 },
        timeLimitSeconds: 60,
      };
      const state = runBattle(setup, [[3, 0, 1, FLAG.retreat]]);
      expect(state.result).toMatchObject({ reason: 'retreat', ticks: 3, destruction: 0, stars: 0 });
    });
  });
});
