import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BLOOD_MOON, REWARDS } from '../sim/balance';
import { FLAG, runBattle } from '../sim/battle';
import { bloodMoonAt, fleetCanSail, moonIsUp } from '../sim/bloodMoon';
import { capsFor, earn, takeShare } from '../sim/economy';
import type { Profile } from '../sim/profile';
import { autopilot } from './testAutopilot';
import { testServer, type TestServer } from './testServer';

const PERIOD = BLOOD_MOON.periodSeconds * 1000;
/** Midway through a shared Blood Moon window. */
const DURING_MOON = PERIOD * 1_500_000 + 60_000;
/** Well outside any window. */
// Halfway between the end of one Blood Moon and the start of the next, whatever the period.
const NO_MOON = PERIOD * 1_500_000 + Math.round((BLOOD_MOON.durationSeconds * 1000 + PERIOD) / 2);

function stored(server: TestServer, id: string): Profile {
  return JSON.parse(server.store.data.get(`player:${id}`)!);
}
function patch(server: TestServer, id: string, change: Partial<Profile>): void {
  server.store.data.set(`player:${id}`, JSON.stringify({ ...stored(server, id), ...change }));
}

describe('ghost-fleet spec: routes', () => {
  // Feature: ghost-fleet, Property 3. Validates: Requirements 3.1, 3.2
  it('Property 3: sieges pay what the replay says', async () => {
    const plan = fc.oneof(
      fc.constant('autopilot' as const),
      fc.constant('idle' as const),
      fc.array(fc.tuple(fc.integer({ min: 1, max: 4500 }), fc.constantFrom(-1, 0, 1), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 31 })), { maxLength: 15 }),
    );
    const holdings = fc.record({ gold: fc.integer({ min: 0, max: 2000 }), cursedGold: fc.integer({ min: 0, max: 900 }), ectoplasm: fc.integer({ min: 0, max: 250 }) });
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000 }), plan, holdings, async (seed, p, resources) => {
        const server = testServer(seed, DURING_MOON);
        const { token, profile } = await server.guest();
        patch(server, profile.id, { resources, defenses: [{ type: 'spiritLantern', level: 1, slot: 0 }, { type: 'cannonTower', level: 1, slot: 3 }] });
        const start = await server.call('POST', '/ghosts/defend', {}, token);
        expect(start.status).toBe(200);
        const { setup, id } = start.data.ticket;
        const inputs = p === 'autopilot' ? autopilot(setup, FLAG.port | FLAG.starboard | FLAG.salt).inputs : p === 'idle' ? [[1, 0, 0, 0]] : [...p].sort((a, b) => a[0] - b[0]);
        const replay = runBattle(setup, inputs).result!;
        const finish = await server.call('POST', '/ghosts/finish', { id, inputs }, token);
        expect(finish.status).toBe(200);
        const { left } = takeShare(resources, REWARDS.raidShare * replay.destruction);
        const expected = earn(left, { cursedGold: replay.ghostsSunk * REWARDS.ghostShipCursedGold, ectoplasm: replay.ghostsSunk * REWARDS.ghostShipEctoplasm }, capsFor(1));
        expect(stored(server, profile.id).resources).toEqual(expected);
        expect(stored(server, profile.id).stats.ghostShipsSunk).toBe(replay.ghostsSunk);
      }),
      { numRuns: 25 },
    );
  }, 120_000);

  // Feature: ghost-fleet, Property 4. Validates: Requirements 2.4, 2.5, 3.3
  it('Property 4: the fleet keeps to the moon', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: PERIOD * 3 }),
        fc.boolean(),
        fc.integer({ min: -600_000, max: 600_000 }),
        async (offset, summon, restOffset) => {
          const now = PERIOD * 1_500_000 + offset;
          const server = testServer(4, now);
          const { token, profile } = await server.guest();
          patch(server, profile.id, { ghostRestUntil: now + restOffset });
          if (summon) {
            expect((await server.call('POST', '/ghosts/summon', {}, token)).status).toBe(200);
            // A second summon right away is refused by the cooldown.
            expect((await server.call('POST', '/ghosts/summon', {}, token)).status).toBe(409);
          }
          const p = stored(server, profile.id);
          const expected = moonIsUp(p, now) && fleetCanSail(p, now);
          const r = await server.call('POST', '/ghosts/defend', {}, token);
          expect(r.status === 200).toBe(expected);
          if (summon) expect(r.status).toBe(200);
          if (!summon && !bloodMoonAt(now).active) expect(r.status).toBe(409);
        },
      ),
      { numRuns: 120 },
    );
  });

  // Feature: ghost-fleet, Property 5. Validates: Requirement 4.2
  it('Property 5: cleansing is exact and happens once', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 2500 }), fc.integer({ min: 0, max: 2500 }), fc.integer({ min: 0, max: BLOOD_MOON.cleanseSeconds * 2000 }), async (cursed, gold, wait) => {
        const server = testServer(6, NO_MOON);
        const { token, profile } = await server.guest();
        patch(server, profile.id, { resources: { gold, cursedGold: cursed, ectoplasm: 0 } });
        expect((await server.call('POST', '/chapel/cleanse', {}, token)).status).toBe(200);
        expect((await server.call('POST', '/chapel/cleanse', {}, token)).status).toBe(409);
        server.advance(wait);
        const first = await server.call('POST', '/collect', {}, token);
        const ready = wait >= BLOOD_MOON.cleanseSeconds * 1000;
        const expectedGold = ready ? Math.min(gold + cursed, capsFor(1).gold) : gold;
        expect(first.data.profile.resources.gold).toBe(expectedGold);
        expect(first.data.profile.resources.cursedGold).toBe(0);
        const second = await server.call('POST', '/collect', {}, token);
        expect(second.data.cleansed).toBe(0);
        if (ready) expect(second.data.profile.resources.gold).toBe(expectedGold);
      }),
      { numRuns: 80 },
    );
  });

  it('a siege rests the island and ends a summoned moon', async () => {
    const server = testServer(8, NO_MOON);
    const { token, profile } = await server.guest();
    expect((await server.call('POST', '/ghosts/defend', {}, token)).status).toBe(409);
    await server.call('POST', '/ghosts/summon', {}, token);
    const start = await server.call('POST', '/ghosts/defend', {}, token);
    expect(start.data.ticket.setup.fleet).toEqual({ count: 2, level: 1 });
    await server.call('POST', '/ghosts/finish', { id: start.data.ticket.id, inputs: [] }, token);
    const after = stored(server, profile.id);
    expect(after.summonedUntil).toBe(0);
    expect(after.ghostRestUntil).toBe(NO_MOON + BLOOD_MOON.restMinutes * 60_000);
    expect(after.reports[0]!.title).toMatch(/ghost fleet|Last Light/);
  });
});
