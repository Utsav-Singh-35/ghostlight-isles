import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REWARDS } from '../sim/balance';
import { FLAG, runBattle } from '../sim/battle';
import { takeShare } from '../sim/economy';
import type { Profile } from '../sim/profile';
import { RIVALS, rivalStorage } from './rivals';
import { autopilot } from './testAutopilot';
import { testServer, type TestServer } from './testServer';

const plan = fc.oneof(
  fc.constant({ kind: 'autopilot' as const }),
  fc.constant({ kind: 'retreat' as const }),
  fc.record({ kind: fc.constant('random' as const), events: fc.array(fc.tuple(fc.integer({ min: 1, max: 4500 }), fc.constantFrom(-1, 0, 1), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 31 })), { maxLength: 20 }) }),
);
type Plan = typeof plan extends fc.Arbitrary<infer T> ? T : never;

function inputsFor(p: Plan, setup: any) {
  if (p.kind === 'autopilot') return autopilot(setup).inputs;
  if (p.kind === 'retreat') return [[1, 0, 1, FLAG.retreat]];
  return [...p.events].sort((a, b) => a[0] - b[0]);
}

const keyOf = (id: string) => `player:${id}`;
function stored(server: TestServer, id: string): Profile {
  return JSON.parse(server.store.data.get(keyOf(id))!);
}
function patch(server: TestServer, id: string, change: Partial<Profile>): void {
  server.store.data.set(keyOf(id), JSON.stringify({ ...stored(server, id), ...change }));
}

describe('raids spec', () => {
  // Feature: raids, Property 1. Validates: Requirements 2.2, 2.3
  it('Property 1: loot is bounded and conserved', async () => {
    const storage = fc.record({ gold: fc.integer({ min: 0, max: 2500 }), cursedGold: fc.integer({ min: 0, max: 500 }), ectoplasm: fc.integer({ min: 0, max: 300 }) });
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000 }), plan, storage, fc.boolean(), async (seed, p, defenderStorage, againstRival) => {
        const server = testServer(seed);
        const attacker = await server.guest();
        const defender = await server.guest();
        patch(server, defender.profile.id, { resources: defenderStorage, defenses: [{ type: 'cannonTower', level: 1, slot: 0 }, { type: 'spiritLantern', level: 1, slot: 2 }] });
        const targetId = againstRival ? RIVALS[0]!.id : defender.profile.id;
        const start = await server.call('POST', '/raids/start', { targetId }, attacker.token);
        expect(start.status).toBe(200);
        const { setup, id } = start.data.ticket;
        const inputs = inputsFor(p, setup);
        const replay = runBattle(setup, inputs).result!;
        const before = againstRival ? rivalStorage(RIVALS[0]!) : defenderStorage;
        const attackerBefore = stored(server, attacker.profile.id).resources;
        const finish = await server.call('POST', '/raids/finish', { id, inputs }, attacker.token);
        expect(finish.status).toBe(200);
        const expectedTaken = takeShare(before, REWARDS.raidShare * replay.destruction).taken;
        if (!againstRival) {
          const after = stored(server, defender.profile.id).resources;
          expect(before.gold + before.cursedGold - after.gold - after.cursedGold).toBe(expectedTaken.gold + expectedTaken.cursedGold);
          expect(before.ectoplasm - after.ectoplasm).toBe(expectedTaken.ectoplasm);
          expect(expectedTaken.gold + expectedTaken.cursedGold).toBeLessThanOrEqual(Math.floor((before.gold + before.cursedGold) * REWARDS.raidShare));
        }
        const attackerAfter = stored(server, attacker.profile.id).resources;
        expect(attackerAfter.gold + attackerAfter.cursedGold - attackerBefore.gold - attackerBefore.cursedGold).toBeLessThanOrEqual(expectedTaken.gold + expectedTaken.cursedGold);
        expect(attackerAfter.ectoplasm - attackerBefore.ectoplasm).toBeLessThanOrEqual(expectedTaken.ectoplasm);
      }),
      { numRuns: 30 },
    );
  }, 120_000);

  // Feature: raids, Property 2. Validates: Requirements 1.2, 3.2
  it('Property 2: protected and own islands are off limits', async () => {
    const target = fc.constantFrom('self', 'protected', 'unknown', 'open', 'rival');
    await fc.assert(
      fc.asyncProperty(target, async (which) => {
        const server = testServer(21);
        const me = await server.guest();
        const other = await server.guest();
        patch(server, other.profile.id, { protectedUntil: which === 'protected' ? server.ctx.now() + 60_000 : 0 });
        const id = which === 'self' ? me.profile.id : which === 'unknown' ? 'fedcba9876543210' : which === 'rival' ? RIVALS[3]!.id : other.profile.id;
        const before = server.store.snapshot();
        const r = await server.call('POST', '/raids/start', { targetId: id }, me.token);
        const allowed = which === 'open' || which === 'rival';
        expect(r.status === 200).toBe(allowed);
        if (!allowed) expect(server.store.snapshot()).toEqual(before);
      }),
      { numRuns: 30 },
    );
  });

  // Feature: raids, Property 3 and Property 4. Validates: Requirements 2.4, 3.1, 3.2
  it('Property 3: one report and fair protection per raid; Property 4: infamy follows stars', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000 }), plan, async (seed, p) => {
        const server = testServer(seed);
        const attacker = await server.guest();
        const defender = await server.guest();
        patch(server, defender.profile.id, { resources: { gold: 2000, cursedGold: 0, ectoplasm: 100 } });
        const reportsBefore = stored(server, defender.profile.id).reports.length;
        const start = await server.call('POST', '/raids/start', { targetId: defender.profile.id }, attacker.token);
        const { setup, id } = start.data.ticket;
        const inputs = inputsFor(p, setup);
        const replay = runBattle(setup, inputs).result!;
        const infamyBefore = stored(server, attacker.profile.id).infamy;
        await server.call('POST', '/raids/finish', { id, inputs }, attacker.token);
        const after = stored(server, defender.profile.id);
        expect(after.reports.length).toBe(reportsBefore + 1);
        expect(after.protectedUntil > server.ctx.now()).toBe(replay.destruction > 0);
        expect(stored(server, attacker.profile.id).infamy - infamyBefore).toBe(REWARDS.infamyPerStar * replay.stars);
        // The ticket is used up.
        expect((await server.call('POST', '/raids/finish', { id, inputs }, attacker.token)).status).toBe(409);
      }),
      { numRuns: 25 },
    );
  }, 120_000);

  it('lists targets and ranks the leaderboard', async () => {
    const server = testServer(31);
    const me = await server.guest();
    await server.guest();
    const targets = await server.call('GET', '/raids/targets', undefined, me.token);
    expect(targets.data.targets.length).toBe(8);
    expect(targets.data.targets.some((t: any) => t.id === me.profile.id)).toBe(false);
    const board = await server.call('GET', '/leaderboard', undefined, me.token);
    expect(board.data.entries).toHaveLength(10);
    expect(board.data.entries[0].infamy).toBeGreaterThanOrEqual(board.data.entries[9].infamy);
    expect(board.data.you.rank).toBeGreaterThan(0);
  });
});
