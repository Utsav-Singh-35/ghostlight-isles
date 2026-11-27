import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FLAG, runBattle } from '../sim/battle';
import { generatePuzzle } from '../sim/puzzle';
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

  // Feature: island-capture, Property 6. Validates: Requirement 2.5
  it('Property 6: tickets are single-use and captures happen once', async () => {
    const step = fc.oneof(
      fc.record({ op: fc.constant('start' as const), islandId: fc.integer({ min: -1, max: STANDARD_WORLD.islands.length + 1 }), method: fc.constantFrom('fort', 'puzzle', 'swim') }),
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
            const r = await server.call('POST', '/captures/start', { islandId: s.islandId, method: s.method }, token);
            if (r.status === 200) {
              previousId = ticket?.id ?? previousId;
              ticket = r.data.ticket;
            }
            if (s.islandId === 0) expect(r.status).toBe(400);
          } else if (ticket) {
            const id = s.stale && previousId ? previousId : ticket.id;
            const body =
              ticket.kind === 'puzzle'
                ? { id, orientation: s.solve ? generatePuzzle(ticket.puzzleSeed).solution : [] }
                : { id, inputs: s.solve ? autopilot(ticket.setup).inputs : [[1, 0, 1, FLAG.retreat]] };
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

  it('solving the Lantern Lines captures the island and pays the reward', async () => {
    const server = testServer(9);
    const { token } = await server.guest();
    const start = await server.call('POST', '/captures/start', { islandId: 1, method: 'puzzle' }, token);
    const puzzle = generatePuzzle(start.data.ticket.puzzleSeed);
    const wrong = await server.call('POST', '/captures/finish', { id: start.data.ticket.id, orientation: puzzle.start }, token);
    expect(wrong.data.outcome.won).toBe(false);
    const again = await server.call('POST', '/captures/start', { islandId: 1, method: 'puzzle' }, token);
    const solution = generatePuzzle(again.data.ticket.puzzleSeed).solution;
    const right = await server.call('POST', '/captures/finish', { id: again.data.ticket.id, orientation: solution }, token);
    expect(right.data.outcome.won).toBe(true);
    expect(right.data.profile.captured).toEqual([1]);
    expect(right.data.profile.resources.gold).toBe(600 + 300);
    expect(right.data.profile.infamy).toBe(25);
    expect(right.data.profile.reports[0].title).toBe(`${firstIsland.name} is yours`);
    const twice = await server.call('POST', '/captures/finish', { id: again.data.ticket.id, orientation: solution }, token);
    expect(twice.status).toBe(409);
    const already = await server.call('POST', '/captures/start', { islandId: 1, method: 'fort' }, token);
    expect(already.status).toBe(409);
  });
});
