import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TROOPS } from '../sim/balance';
import { spaceFor } from '../sim/base';
import { FLAG, runBattle, type BattleSetup } from '../sim/battle';
import type { Profile } from '../sim/profile';
import { LIVING_TROOPS, subtractCounts, troopSpace } from '../sim/troops';
import { siegeSetup } from './ghosts';
import { testServer, type TestServer } from './testServer';

const SLOW = 60_000;
const keyOf = (id: string) => `player:${id}`;
const stored = (server: TestServer, id: string): Profile => JSON.parse(server.store.data.get(keyOf(id))!);
const patch = (server: TestServer, id: string, change: Partial<Profile>) => server.store.data.set(keyOf(id), JSON.stringify({ ...stored(server, id), ...change }));

const command = fc.oneof(
  fc.record({ path: fc.constant('/troops/recruit'), type: fc.constantFrom(...LIVING_TROOPS, 'rattler', 'nobody'), post: fc.constantFrom('ship', 'island', 'moon') }),
  fc.record({ path: fc.constant('/troops/move'), type: fc.constantFrom(...LIVING_TROOPS), from: fc.constantFrom('ship', 'island') }),
  fc.record({ path: fc.constant('/troops/dismiss'), type: fc.constantFrom(...LIVING_TROOPS), from: fc.constantFrom('ship', 'island') }),
);

/** Sails in, lands the party at once and fires both broadsides. */
const LANDING = [
  [1, 0, 2, 0],
  [2, 0, 2, FLAG.land],
  [400, 0, 1, FLAG.land | FLAG.port | FLAG.starboard],
];

describe('landing-parties spec: the Tavern and losses', () => {
  // Feature: landing-parties, Property 1. Validates: Requirements 1.2, 1.3
  it('Property 1: space is never exceeded and every cost is exact', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(command, { maxLength: 25 }), fc.integer({ min: 0, max: 3000 }), fc.constantFrom(1, 2, 3), async (commands, gold, homeLevel) => {
        const server = testServer(3);
        const { token, profile } = await server.guest();
        patch(server, profile.id, { resources: { gold, cursedGold: 0, ectoplasm: 200 }, homeLevel: homeLevel as 1 | 2 | 3 });
        for (const c of commands) {
          const before = server.store.snapshot();
          const was = stored(server, profile.id);
          const answer = await server.call('POST', c.path, c, token);
          const now = stored(server, profile.id);
          const caps = spaceFor(now);
          expect(troopSpace(now.troops!.ship)).toBeLessThanOrEqual(caps.ship);
          expect(troopSpace(now.troops!.island)).toBeLessThanOrEqual(caps.island);
          if (answer.status !== 200) {
            expect(answer.status).toBe(400);
            expect(server.store.snapshot()).toEqual(before);
            continue;
          }
          const paid = { gold: was.resources.gold - now.resources.gold, ectoplasm: was.resources.ectoplasm - now.resources.ectoplasm };
          if (c.path === '/troops/recruit') expect(paid).toEqual(TROOPS.types[c.type as keyof typeof TROOPS.types].cost);
          else expect(paid).toEqual({ gold: 0, ectoplasm: 0 });
        }
      }),
      { numRuns: 120 },
    );
  }, SLOW);

  // Feature: landing-parties, Property 8. Validates: Requirements 7.1, 7.2
  it('Property 8: losses are exact', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000 }), fc.constantFrom('capture', 'raid', 'siege'), fc.boolean(), async (seed, kind, land) => {
        const server = testServer(seed);
        const me = await server.guest();
        const other = await server.guest();
        const crew = { ship: { buccaneer: 3, archer: 2, deckhand: 1, powderMonkey: 1 }, island: { buccaneer: 2, deckhand: 1 } };
        patch(server, me.profile.id, { troops: crew });
        const otherCrew = stored(server, other.profile.id).troops;
        const inputs = land ? LANDING : [];
        let setup: BattleSetup;
        let finish: () => Promise<unknown>;
        if (kind === 'capture') {
          const start = await server.call('POST', '/captures/start', { islandId: 1 }, me.token);
          setup = start.data.ticket.setup;
          finish = () => server.call('POST', '/captures/finish', { id: start.data.ticket.id, inputs }, me.token);
        } else if (kind === 'raid') {
          const start = await server.call('POST', '/raids/start', { targetId: other.profile.id }, me.token);
          setup = start.data.ticket.setup;
          finish = () => server.call('POST', '/raids/finish', { id: start.data.ticket.id, inputs }, me.token);
        } else {
          // A siege needs a Blood Moon: run the server's own setup through its replay directly.
          setup = siegeSetup(stored(server, me.profile.id), seed);
          finish = async () => {
            const result = runBattle(setup, inputs).result!;
            const { afterBattle } = await import('./aftermath');
            patch(server, me.profile.id, afterBattle(stored(server, me.profile.id), result, seed));
          };
        }
        const result = runBattle(setup, inputs).result!;
        await finish();
        const after = stored(server, me.profile.id).troops!;
        expect(after.ship).toEqual(subtractCounts(crew.ship, result.lost!.ship));
        expect(after.island).toEqual(subtractCounts(crew.island, result.lost!.island));
        // A raided captain loses nobody: the raider fought a copy.
        expect(stored(server, other.profile.id).troops).toEqual(otherCrew);
      }),
      { numRuns: 30 },
    );
  }, SLOW);

  it('starts a new captain with a crew, and refuses a Brute below home level 2', async () => {
    const server = testServer(5);
    const { token, profile } = await server.guest();
    expect(stored(server, profile.id).troops).toEqual({ ship: TROOPS.start.ship, island: TROOPS.start.island });
    patch(server, profile.id, { resources: { gold: 2000, cursedGold: 0, ectoplasm: 100 } });
    expect((await server.call('POST', '/troops/recruit', { type: 'brute', post: 'ship' }, token)).status).toBe(400);
    patch(server, profile.id, { homeLevel: 2 });
    // Five space: too big for a new ship's last four, but Last Light at level 2 has room ashore.
    expect((await server.call('POST', '/troops/recruit', { type: 'brute', post: 'ship' }, token)).status).toBe(400);
    expect((await server.call('POST', '/troops/recruit', { type: 'brute', post: 'island' }, token)).status).toBe(200);
  });
});
