import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FORTS, REWARDS } from '../sim/balance';
import { FLAG, runBattle } from '../sim/battle';
import { captureRewards } from '../sim/captureRewards';
import { fortDifficulty } from '../sim/layout';
import { STANDARD_WORLD } from './capture';
import { autopilot } from './testAutopilot';
import { testServer } from './testServer';

const firstIsland = STANDARD_WORLD.islands[1]!;

describe('island-capture spec: captures', () => {
  // Feature: island-capture, Property 5. Validates: Requirement 2.3
  it('Property 5: only a real win captures a fort', async () => {
    const randomInputs = fc.array(
      fc.tuple(fc.integer({ min: 1, max: 4500 }), fc.constantFrom(-1, 0, 1), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 63 })),
      { maxLength: 30 },
    );
    const plan = fc.oneof(
      fc.record({ kind: fc.constant('autopilot' as const), flags: fc.constantFrom(FLAG.port | FLAG.starboard, FLAG.port, FLAG.starboard) }),
      fc.record({ kind: fc.constant('random' as const), inputs: randomInputs }),
    );
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000 }), plan, async (seed, p) => {
        const server = testServer(seed);
        const { token } = await server.guest();
        const start = await server.call('POST', '/captures/start', { islandId: 1, method: 'fort' }, token);
        expect(start.status).toBe(200);
        const { setup, id } = start.data.ticket;
        const inputs = p.kind === 'autopilot' ? autopilot(setup, p.flags).inputs : [...p.inputs].sort((a, b) => a[0] - b[0]);
        const expected = runBattle(setup, inputs).result!.keepDestroyed;
        const finish = await server.call('POST', '/captures/finish', { id, inputs }, token);
        expect(finish.status).toBe(200);
        expect(finish.data.outcome.won).toBe(expected);
        expect(finish.data.profile.captured.includes(1)).toBe(expected);
      }),
      { numRuns: 30 },
    );
  }, 60_000);

  // Feature: island-capture, Property 6. Validates: Requirements 2.4, 2.5
  it('Property 6: tickets are single-use and captures happen once', async () => {
    const step = fc.oneof(
      fc.record({
        op: fc.constant('start' as const),
        islandId: fc.integer({ min: -1, max: STANDARD_WORLD.islands.length + 1 }),
        method: fc.constantFrom<string | undefined>('fort', undefined, 'puzzle', 'swim'),
      }),
      fc.record({ op: fc.constant('finish' as const), stale: fc.boolean(), solve: fc.boolean() }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 14 }), async (steps) => {
        const server = testServer(5);
        const { token } = await server.guest();
        let ticket: any = null;
        const used = new Set<string>();
        let previousId: string | null = null;
        for (const s of steps) {
          if (s.op === 'start') {
            const r = await server.call('POST', '/captures/start', s.method === undefined ? { islandId: s.islandId } : { islandId: s.islandId, method: s.method }, token);
            if (r.status === 200) {
              previousId = ticket?.id ?? previousId;
              ticket = r.data.ticket;
              // Only fort battles start.
              expect(ticket.setup.mode).toBe('assault');
            }
            if (s.islandId === 0) expect(r.status).toBe(400);
            if (s.method === 'puzzle' || s.method === 'swim') expect(r.status).toBe(400);
          } else if (ticket) {
            const id = s.stale && previousId ? previousId : ticket.id;
            const body = { id, inputs: s.solve ? autopilot(ticket.setup).inputs : [[1, 0, 1, FLAG.retreat]] };
            const r = await server.call('POST', '/captures/finish', body, token);
            if (used.has(id)) expect(r.status).toBe(409);
            if (r.status === 200) used.add(id);
          }
        }
        const profile = (await server.call('GET', '/profile', undefined, token)).data.profile;
        expect(new Set(profile.captured).size).toBe(profile.captured.length);
        expect(profile.captured).not.toContain(0);
      }),
      { numRuns: 25 },
    );
  }, 120_000);

  it('breaking the first fort captures the island and pays its level-1 reward', async () => {
    const server = testServer(9);
    const { token } = await server.guest();
    expect(fortDifficulty(firstIsland)).toBe(1);
    const lost = await server.call('POST', '/captures/start', { islandId: 1 }, token);
    const retreat = await server.call('POST', '/captures/finish', { id: lost.data.ticket.id, inputs: [[1, 0, 1, FLAG.retreat]] }, token);
    expect(retreat.data.outcome.won).toBe(false);
    const start = await server.call('POST', '/captures/start', { islandId: 1 }, token);
    const inputs = autopilot(start.data.ticket.setup).inputs;
    const right = await server.call('POST', '/captures/finish', { id: start.data.ticket.id, inputs }, token);
    expect(right.data.outcome.won).toBe(true);
    expect(right.data.profile.captured).toEqual([1]);
    // The reward is the pure rules applied to the battle the server replayed.
    const expected = captureRewards(runBattle(start.data.ticket.setup, inputs), 1);
    expect(expected.gold).toBeGreaterThan(REWARDS.captureGold[0]);
    expect(right.data.outcome.rewards.lines).toEqual(expected.lines);
    expect(right.data.profile.resources.gold).toBe(600 + expected.gold);
    expect(right.data.profile.infamy).toBe(REWARDS.infamyPerCapture);
    expect(right.data.profile.reports[0].title).toBe(`${firstIsland.name} is yours`);
    const twice = await server.call('POST', '/captures/finish', { id: start.data.ticket.id, inputs }, token);
    expect(twice.status).toBe(409);
    const already = await server.call('POST', '/captures/start', { islandId: 1 }, token);
    expect(already.status).toBe(409);
  });

  it('refuses to capture by puzzle', async () => {
    const server = testServer(10);
    const { token } = await server.guest();
    const r = await server.call('POST', '/captures/start', { islandId: 1, method: 'puzzle' }, token);
    expect(r.status).toBe(400);
    expect((await server.call('GET', '/profile', undefined, token)).data.profile.battle).toBeNull();
  });

  it("hands out the fort's level: its island ghosts and its dawn clock", async () => {
    const server = testServer(11);
    const { token } = await server.guest();
    for (const island of STANDARD_WORLD.islands.slice(1)) {
      const r = await server.call('POST', '/captures/start', { islandId: island.id }, token);
      const i = fortDifficulty(island) - 1;
      expect(r.data.ticket.setup.fleet).toEqual(FORTS.ghosts[i]);
      expect(r.data.ticket.setup.timeLimitSeconds).toBe(FORTS.timeLimitSeconds[i]);
    }
  });
});
