import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFENSE_TYPES, SHIP_PARTS, buildDefense, removeDefense, upgradeDefense, upgradeHome, upgradeShip, type CommandResult } from '../sim/base';
import type { Profile } from '../sim/profile';
import { testServer } from './testServer';

type Command = { op: 'build' | 'upgrade' | 'remove'; type: string; slot: number } | { op: 'home' } | { op: 'ship'; part: string };

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ op: fc.constantFrom('build' as const, 'upgrade' as const, 'remove' as const), type: fc.constantFrom(...DEFENSE_TYPES), slot: fc.integer({ min: 0, max: 9 }) }),
  fc.record({ op: fc.constant('home' as const) }),
  fc.record({ op: fc.constant('ship' as const), part: fc.constantFrom(...SHIP_PARTS) }),
);

function pure(profile: Profile, c: Command): CommandResult {
  if (c.op === 'home') return upgradeHome(profile);
  if (c.op === 'ship') return upgradeShip(profile, c.part);
  if (c.op === 'build') return buildDefense(profile, c.type, c.slot);
  if (c.op === 'upgrade') return upgradeDefense(profile, c.type, c.slot);
  return removeDefense(profile, c.type, c.slot);
}

function route(c: Command): [string, Record<string, unknown>] {
  if (c.op === 'home') return ['/base/home', {}];
  if (c.op === 'ship') return ['/ship/upgrade', { part: c.part }];
  return [`/base/${c.op}`, { type: c.type, slot: c.slot }];
}

describe('base-building spec: routes', () => {
  // Feature: base-building, Property 4. Validates: Requirements 1.1 to 2.3
  it('Property 4: the server and the rules agree', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(command, { maxLength: 25 }), async (commands) => {
        const server = testServer(11);
        const { token } = await server.guest();
        // Give the captain riches so most commands go through.
        const key = [...server.store.data.keys()].find((k) => k.startsWith('player:'))!;
        let expected: Profile = { ...JSON.parse(server.store.data.get(key)!), resources: { gold: 2500, cursedGold: 500, ectoplasm: 300 } };
        server.store.data.set(key, JSON.stringify(expected));
        for (const c of commands) {
          const r = pure(expected, c);
          const [path, body] = route(c);
          const response = await server.call('POST', path, body, token);
          expect(response.status).toBe(r.ok ? 200 : 400);
          if (r.ok) expected = r.profile;
          else expect(response.data.error).toBe(r.reason);
        }
        const saved = JSON.parse(server.store.data.get(key)!) as Profile;
        expect(saved).toEqual(expected);
      }),
      { numRuns: 60 },
    );
  });

  it('uses new ship levels in the next battle setup', async () => {
    const server = testServer(12);
    const { token } = await server.guest();
    const key = [...server.store.data.keys()].find((k) => k.startsWith('player:'))!;
    server.store.data.set(key, JSON.stringify({ ...JSON.parse(server.store.data.get(key)!), resources: { gold: 2000, cursedGold: 0, ectoplasm: 100 } }));
    expect((await server.call('POST', '/ship/upgrade', { part: 'barrel' }, token)).status).toBe(200);
    expect((await server.call('POST', '/ship/upgrade', { part: 'hull' }, token)).status).toBe(200);
    const start = await server.call('POST', '/captures/start', { islandId: 2, method: 'fort' }, token);
    expect(start.data.ticket.setup.loadout).toMatchObject({ barrel: 1, hull: 210 });
  });
});
