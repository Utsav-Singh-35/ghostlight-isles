import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TROOPS } from './balance';
import {
  DEFAULT_INPUT,
  FLAG,
  beachRadius,
  canLand,
  createBattle,
  recordInput,
  runBattle,
  stepBattle,
  type BattleInput,
  type BattleSetup,
  type BattleState,
  type InputEvent,
} from './battle';
import { fortWalls, type DefenseType } from './layout';
import { troopTotal, type TroopCounts } from './troops';

const SLOW = 60_000;
const RUNS = { numRuns: 40 };

const defense = fc.record({
  type: fc.constantFrom<DefenseType>('cannonTower', 'spiritLantern', 'boneCatapult', 'mine'),
  level: fc.constantFrom<1 | 2 | 3>(1, 2, 3),
  slot: fc.integer({ min: 0, max: 8 }),
});
const party = fc.record(
  {
    deckhand: fc.integer({ min: 0, max: 2 }),
    buccaneer: fc.integer({ min: 0, max: 5 }),
    shieldbearer: fc.integer({ min: 0, max: 2 }),
    archer: fc.integer({ min: 0, max: 3 }),
    powderMonkey: fc.integer({ min: 0, max: 2 }),
    brute: fc.integer({ min: 0, max: 1 }),
    surgeon: fc.integer({ min: 0, max: 1 }),
  },
  { requiredKeys: [] },
);
const ghostGarrison = fc.record(
  { rattler: fc.integer({ min: 0, max: 6 }), grabber: fc.integer({ min: 0, max: 3 }), wraithArcher: fc.integer({ min: 0, max: 3 }), bosun: fc.integer({ min: 0, max: 1 }) },
  { requiredKeys: [] },
);
const livingGarrison = fc.record({ buccaneer: fc.integer({ min: 0, max: 4 }), archer: fc.integer({ min: 0, max: 2 }), deckhand: fc.integer({ min: 0, max: 2 }) }, { requiredKeys: [] });

/** Random battles with troops: fort assaults with walls, raids on living islands, and sieges with boarders. */
const troopSetup: fc.Arbitrary<BattleSetup> = fc
  .record({
    kind: fc.constantFrom('fort', 'raid', 'siege'),
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    islandSeed: fc.integer({ min: 0, max: 0xffffffff }),
    radius: fc.integer({ min: 28, max: 60 }),
    fortLevel: fc.integer({ min: 1, max: 5 }),
    defenses: fc.array(defense, { maxLength: 7 }),
    party,
    ghosts: ghostGarrison,
    living: livingGarrison,
    boats: fc.integer({ min: 0, max: 2 }),
    fleet: fc.integer({ min: 0, max: 3 }),
    seconds: fc.integer({ min: 25, max: 60 }),
  })
  .map((r) => {
    const fort = r.kind === 'fort';
    const walls = fort ? fortWalls(r.radius, r.fortLevel, r.islandSeed) : null;
    const setup: BattleSetup = {
      seed: r.seed,
      mode: r.kind === 'siege' ? 'siege' : 'assault',
      island: { radius: r.radius, living: !fort, level: 1 + (r.fortLevel % 3), seed: r.islandSeed, slotCount: 9, mineSlotCount: 3 },
      defenses: r.defenses,
      loadout: { hull: 200, cannon: 1, salt: 1, barrel: 0, bats: 0, mortar: 0, gunner: 'living', navigator: 'living', boats: r.boats },
      fleet: { count: r.kind === 'siege' ? Math.max(1, r.fleet) : fort ? r.fleet : 0, level: 1 + (r.fleet % 3) },
      timeLimitSeconds: r.seconds,
      party: r.party,
      garrison: fort ? r.ghosts : r.living,
      ...(walls ? { walls: { radius: walls.radius, gateX: walls.gateX, gateZ: walls.gateZ, gateHp: TROOPS.gateHp[r.fortLevel - 1]! } } : {}),
      ...(r.kind === 'siege' ? { boarders: 1 + (r.fleet % 3) } : {}),
    };
    return setup;
  });

/** [ticks, rudder, sail level, flags]. Plans start by sailing in at full sail, so landings happen. */
const plan = fc
  .tuple(
    fc.integer({ min: 120, max: 420 }),
    fc.array(fc.tuple(fc.integer({ min: 1, max: 150 }), fc.constantFrom(-1, 0, 1), fc.integer({ min: 0, max: 2 }), fc.constantFrom(0, FLAG.land, FLAG.port | FLAG.starboard, FLAG.land | FLAG.port)), { maxLength: 8 }),
  )
  .map(([approach, rest]) => [[approach, 0, 2, 0] as const, ...rest]);
type Plan = ReadonlyArray<readonly [number, number, number, number]>;

function inputAt(p: Plan, index: number): BattleInput {
  let remaining = index;
  for (const [ticks, rudder, sailLevel, flags] of p) {
    if (remaining < ticks) return { rudder, sailLevel, flags, target: 0 };
    remaining -= ticks;
  }
  const last = p[p.length - 1];
  return last ? { rudder: last[1], sailLevel: last[2], flags: last[3], target: 0 } : DEFAULT_INPUT;
}

function playLive(setup: BattleSetup, p: Plan, onStep?: (prev: BattleState, next: BattleState, input: BattleInput) => string | null) {
  let state = createBattle(setup);
  const events: InputEvent[] = [];
  let last = DEFAULT_INPUT;
  let problem: string | null = null;
  for (let i = 0; !state.result; i++) {
    const input = inputAt(p, i);
    last = recordInput(events, last, state.tick + 1, input);
    const next = stepBattle(state, input);
    problem ??= onStep?.(state, next, input) ?? null;
    state = next;
  }
  return { state, events, problem };
}

const inside = (x: number, z: number, r: number) => Math.hypot(x, z) < r;

describe('landing-parties spec: troops in battle', () => {
  // Feature: landing-parties, Property 2. Validates: Requirement 3.1
  it('Property 2: troops stay on land', () => {
    fc.assert(
      fc.property(troopSetup, plan, (setup, p) => {
        const beach = beachRadius(setup.island.radius);
        const { problem } = playLive(setup, p, (_prev, next) => {
          for (const t of next.troops) {
            if (!t.dead && Math.hypot(t.x, t.z) > beach + 1e-6) return `troop ${t.id} (${t.type}) is off the beach at ${Math.hypot(t.x, t.z).toFixed(2)} m`;
            if (![t.x, t.z, t.hp].every(Number.isFinite)) return `troop ${t.id} has a non-finite value`;
          }
          return null;
        });
        expect(problem).toBeNull();
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: landing-parties, Property 3. Validates: Requirements 4.2, 4.3
  it('Property 3: walls hold until the gate falls', () => {
    fc.assert(
      fc.property(troopSetup.filter((s) => s.walls !== undefined), plan, (setup, p) => {
        const { problem } = playLive(setup, p, (prev, next) => {
          const r = prev.wallRadius;
          for (const t of next.troops) {
            const before = prev.troops.find((o) => o.id === t.id);
            if (!before || before.dead) continue;
            if (inside(before.x, before.z, r) === inside(t.x, t.z, r)) continue;
            const g = prev.gate!;
            if (!g.destroyed) return `troop ${t.id} crossed the wall while the gate stood`;
            if (Math.hypot(t.x - g.x, t.z - g.z) > TROOPS.gateHalfWidth + 1e-6) return `troop ${t.id} crossed the wall away from the gate`;
          }
          return null;
        });
        expect(problem).toBeNull();
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: landing-parties, Property 4. Validates: Requirements 3.5, 6.2
  it('Property 4: nobody hurts their own side, and boats never hurt structures', () => {
    fc.assert(
      fc.property(troopSetup, plan, (setup, p) => {
        // Alone on an empty island, a party has nobody to hurt it but itself.
        const alone: BattleSetup = { ...setup, mode: 'assault', defenses: [], garrison: {}, fleet: { count: 0, level: 1 }, boarders: undefined };
        const lonely = playLive(alone, p, (_prev, next) => {
          // A Powder Monkey spends itself in its own blast; that is its job, not friendly fire.
          for (const t of next.troops) if (t.hp < t.maxHp && t.side === 'player' && t.type !== 'powderMonkey') return `troop ${t.id} was hurt with no enemy about`;
          return null;
        });
        expect(lonely.problem).toBeNull();
        // Boats alone, guns silent and no party: no structure ever loses health.
        const quiet: Plan = p.map(([ticks, rudder, sail]) => [ticks, rudder, sail, 0] as const);
        // Ghost ships shoot at structures in sieges and boarders hit them, so this check is an assault with neither.
        const boatsOnly = playLive({ ...setup, mode: 'assault', party: {}, fleet: { count: 0, level: 1 }, boarders: undefined }, quiet, (prev, next) => {
          for (const s of next.structures) {
            const before = prev.structures.find((o) => o.id === s.id)!;
            // Mines blow themselves up under a passing ship; that is the mine, not a boat.
            if (s.hp < before.hp && s.type !== 'mine') return `structure ${s.id} lost health to boats`;
          }
          return null;
        });
        expect(boatsOnly.problem).toBeNull();
      }),
      { numRuns: 25 },
    );
  }, SLOW);

  // Feature: landing-parties, Property 5. Validates: Requirements 2.3, 3.2
  it('Property 5: healing and repair stop at full', () => {
    fc.assert(
      fc.property(troopSetup, plan, (setup, p) => {
        const { problem } = playLive(setup, p, (_prev, next) => {
          for (const t of next.troops) if (t.hp > t.maxHp + 1e-9 || t.hp < 0) return `troop ${t.id} health ${t.hp} is outside [0, ${t.maxHp}]`;
          if (next.player.hp > next.player.maxHp + 1e-9) return `the hull went over full: ${next.player.hp}`;
          for (const s of next.structures) if (s.hp > s.maxHp + 1e-9) return `structure ${s.id} was repaired past full`;
          return null;
        });
        expect(problem).toBeNull();
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: landing-parties, Property 6. Validates: Requirements 2.1, 2.2
  it('Property 6: landing happens once, and only near the shore', () => {
    fc.assert(
      fc.property(troopSetup, plan, (setup, p) => {
        let landings = 0;
        const { state, problem } = playLive(setup, p, (prev, next, input) => {
          if (!prev.landing && next.landing) {
            landings++;
            if (!(input.flags & FLAG.land)) return 'the party landed without L';
            if (!canLand(prev)) return 'the party landed from too far out';
          }
          if (prev.landing && next.landing && (prev.landing.x !== next.landing.x || prev.landing.tick !== next.landing.tick)) return 'the landing moved';
          return null;
        });
        expect(problem).toBeNull();
        expect(landings).toBeLessThanOrEqual(1);
        const pressed = p.some(([, , , flags]) => flags & FLAG.land);
        if (!pressed) expect(state.troops.some((t) => t.side === 'player')).toBe(false);
      }),
      RUNS,
    );
  }, SLOW);

  // Feature: landing-parties, Property 7. Validates: the fairness pillar
  it('Property 7: battles with troops replay exactly', () => {
    fc.assert(
      fc.property(troopSetup, plan, (setup, p) => {
        const live = playLive(setup, p);
        const replay = runBattle(setup, live.events);
        expect(replay.result).toEqual(live.state.result);
        expect(replay.troops).toEqual(live.state.troops);
        expect(replay.boats).toEqual(live.state.boats);
        expect(replay.structures).toEqual(live.state.structures);
      }),
      RUNS,
    );
  }, SLOW);
});

/** A fort with walls whose party lands at once, so examples needn't sail in. */
function landedFort(partyCounts: TroopCounts, garrison: TroopCounts, extra: Partial<BattleSetup> = {}): BattleState {
  const radius = 40;
  const walls = fortWalls(radius, 3, 1234);
  const setup: BattleSetup = {
    seed: 7,
    mode: 'assault',
    island: { radius, living: false, level: 1, seed: 1234, slotCount: 7, mineSlotCount: 3 },
    defenses: [],
    loadout: { hull: 200, cannon: 1, salt: 1, barrel: 0, bats: 0, mortar: 0, gunner: 'living', navigator: 'living' },
    fleet: { count: 0, level: 1 },
    timeLimitSeconds: 120,
    party: partyCounts,
    garrison,
    walls: { radius: walls.radius, gateX: walls.gateX, gateZ: walls.gateZ, gateHp: 250 },
    ...extra,
  };
  const state = createBattle(setup);
  // Land right outside the gate.
  const d = Math.hypot(walls.gateX, walls.gateZ);
  const beach = beachRadius(radius);
  const at = Math.min(beach - 0.5, walls.radius + 5);
  return { ...state, landing: { tick: 1, x: (walls.gateX / d) * at, z: (walls.gateZ / d) * at, done: false } };
}

function run(state: BattleState, ticks: number, input: BattleInput = { rudder: 0, sailLevel: 0, flags: 0, target: 0 }): BattleState[] {
  const out: BattleState[] = [];
  let s = state;
  for (let i = 0; i < ticks && !s.result; i++) {
    s = stepBattle(s, input);
    out.push(s);
  }
  return out;
}

describe('landing-parties spec: examples', () => {
  it('a Powder Monkey blows the gate open, and the party walks through it', () => {
    const states = run(landedFort({ powderMonkey: 1, buccaneer: 2 }, { rattler: 1 }), 1800);
    const opened = states.findIndex((s) => s.gate?.destroyed);
    expect(opened).toBeGreaterThan(0);
    expect(states[opened]!.troops.find((t) => t.type === 'powderMonkey')!.dead).toBe(true);
    const r = states[0]!.wallRadius;
    expect(states.some((s) => s.troops.some((t) => t.side === 'player' && !t.dead && Math.hypot(t.x, t.z) < r))).toBe(true);
  });

  it('a Lantern Archer shoots over a standing wall', () => {
    const states = run(landedFort({ archer: 1 }, { rattler: 2 }), 900);
    const volleys = states.flatMap((s) => s.events.filter((e) => e.type === 'strike' && e.troop === 'archer'));
    expect(volleys.length).toBeGreaterThan(0);
    expect(states.every((s) => !s.gate?.destroyed)).toBe(true);
  });

  it('a Shieldbearer draws the Rattlers to itself', () => {
    const states = run(landedFort({ shieldbearer: 1, archer: 2 }, { rattler: 4 }, { walls: undefined }), 900);
    const hits = states.flatMap((s) => s.events.filter((e) => e.type === 'strike' && e.troop === 'rattler'));
    const shield = states[states.length - 1]!.troops.find((t) => t.type === 'shieldbearer')!;
    expect(hits.length).toBeGreaterThan(0);
    // Most rattler blows land on the Shieldbearer, not the Archers.
    const onShield = hits.filter((e) => e.type === 'strike' && states.some((s) => { const sb = s.troops.find((t) => t.id === shield.id); return sb && Math.hypot(sb.x - e.toX, sb.z - e.toZ) < 0.01; })).length;
    expect(onShield / hits.length).toBeGreaterThan(0.5);
  });

  it('each ghost ship lands its boarders once in a siege', () => {
    const setup: BattleSetup = {
      seed: 11,
      mode: 'siege',
      island: { radius: 40, living: true, level: 1, seed: 5, slotCount: 6, mineSlotCount: 3 },
      defenses: [{ type: 'cannonTower', level: 1, slot: 0 }],
      loadout: { hull: 200, cannon: 1, salt: 1, barrel: 0, bats: 0, mortar: 0, gunner: 'living', navigator: 'living' },
      fleet: { count: 3, level: 1 },
      timeLimitSeconds: 120,
      garrison: { buccaneer: 2, deckhand: 1 },
      boarders: 2,
    };
    const end = runBattle(setup, []);
    expect(end.boarded.length).toBeLessThanOrEqual(3);
    expect(end.troops.filter((t) => t.side === 'ghost').length).toBe(end.boarded.length * 2);
    expect(new Set(end.boarded).size).toBe(end.boarded.length);
  });

  it('Deckhands aboard patch the hull, and older setups have no troops at all', () => {
    const plain = createBattle({ ...landedFort({}, {}).setup, party: undefined, garrison: undefined, walls: undefined });
    expect(plain.troops).toEqual([]);
    expect(plain.gate).toBeNull();
    const hurt = { ...createBattle({ ...plain.setup, party: { deckhand: 2 } }), player: { ...plain.player, hp: 100 } };
    const after = run(hurt, 30);
    expect(after[after.length - 1]!.player.hp).toBeCloseTo(100 + 2 * TROOPS.deckhandShipRepair, 5);
    expect(troopTotal(after[after.length - 1]!.aboard)).toBe(2);
  });
  // Regression from Property 4's first run: in a siege, structures lose health to ghost ships,
  // which the property's first version blamed on the boats. The boats themselves aim only at troops.
  it('support boats in a siege fire only at ghost boarders', () => {
    const setup: BattleSetup = {
      seed: 0,
      mode: 'siege',
      island: { radius: 28, living: true, level: 1, seed: 1, slotCount: 9, mineSlotCount: 3 },
      defenses: [{ type: 'cannonTower', level: 1, slot: 0 }],
      loadout: { hull: 200, cannon: 1, salt: 1, barrel: 0, bats: 0, mortar: 0, gunner: 'living', navigator: 'living', boats: 2 },
      fleet: { count: 2, level: 1 },
      timeLimitSeconds: 60,
      garrison: { buccaneer: 2 },
      boarders: 2,
    };
    let s = createBattle(setup);
    while (!s.result) {
      const prev = s;
      s = stepBattle(s, { rudder: 0, sailLevel: 0, flags: 0, target: 0 });
      for (const e of s.events) {
        if (e.type !== 'grapeshot') continue;
        const aimed = prev.troops.concat(s.troops).some((t) => t.side === 'ghost' && Math.hypot(t.x - e.toX, t.z - e.toZ) < 1e-6);
        expect(aimed).toBe(true);
      }
    }
  });
  // Regression from Property 4: a lone Powder Monkey on an empty fort blew the gate and died, which
  // the property first counted as friendly fire.
  it('a Powder Monkey spends itself on the gate and hurts nobody on its side', () => {
    const states = run(landedFort({ powderMonkey: 1, buccaneer: 3 }, {}), 600);
    const end = states[states.length - 1]!;
    expect(end.gate?.destroyed).toBe(true);
    expect(end.troops.find((t) => t.type === 'powderMonkey')!.dead).toBe(true);
    for (const t of end.troops) if (t.type === 'buccaneer') expect(t.hp).toBe(t.maxHp);
  });
});