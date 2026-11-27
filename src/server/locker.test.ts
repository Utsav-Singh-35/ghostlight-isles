import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CREW, LOCKER } from '../sim/balance';
import type { BattleResult, CrewState } from '../sim/battle';
import { keepGhost } from '../sim/crew';
import { createProfile, type Profile } from '../sim/profile';
import { generatePuzzle } from '../sim/puzzle';
import { afterBattle } from './aftermath';
import { LOCKER_GRACE_SECONDS } from './locker';
import { RIVALS } from './rivals';
import { testServer, type TestServer } from './testServer';

const crewState = fc.constantFrom<CrewState>('none', 'living', 'ghost');
const slot = fc.record({ state: crewState, battlesLeft: fc.integer({ min: 1, max: 9 }) }).map((s) => (s.state === 'ghost' ? s : { state: s.state, battlesLeft: 0 }));

function result(shipSunk: boolean): BattleResult {
  return { reason: shipSunk ? 'sunk' : 'time', ticks: 100, destruction: 0, keepDestroyed: false, stars: 0, shipSunk, ghostsSunk: 0, ghostsTotal: 0, hull: shipSunk ? 0 : 50, maxHull: 160 };
}

function captain(crew: Profile['crew']): Profile {
  return { ...createProfile('0123456789abcdef', 'T', 'h', 0), crew };
}

function stored(server: TestServer, id: string): Profile {
  return JSON.parse(server.store.data.get(`player:${id}`)!);
}
function patch(server: TestServer, id: string, change: Partial<Profile>): void {
  server.store.data.set(`player:${id}`, JSON.stringify({ ...stored(server, id), ...change }));
}

describe('davy-jones-locker spec', () => {
  // Feature: davy-jones-locker, Property 1. Validates: Requirements 1.1, 1.2
  it('Property 1: sinking drowns one crew member and sends the ship down', () => {
    fc.assert(
      fc.property(slot, slot, fc.boolean(), fc.integer({ min: 0, max: 0xffffffff }), (gunner, navigator, sank, seed) => {
        const before = captain({ gunner, navigator });
        const after = afterBattle(before, result(sank), seed);
        const livingBefore = (['gunner', 'navigator'] as const).filter((r) => before.crew[r].state === 'living');
        const drowned = livingBefore.filter((r) => after.crew[r].state === 'ghost');
        expect(after.sunk).toBe(sank);
        if (sank) {
          expect(drowned).toHaveLength(livingBefore.length > 0 ? 1 : 0);
          for (const r of drowned) expect(after.crew[r].battlesLeft).toBe(CREW.ghostBattles);
        } else {
          for (const r of livingBefore) expect(after.crew[r].state).toBe('living');
        }
      }),
      { numRuns: 300 },
    );
  });

  // Feature: davy-jones-locker, Property 2. Validates: Requirements 3.1, 3.2
  it('Property 2: ghosts fade on schedule', () => {
    const step = fc.constantFrom('battle' as const, 'keep' as const);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.array(step, { maxLength: 20 }), (start, steps) => {
        let p: Profile = { ...captain({ gunner: { state: 'ghost', battlesLeft: start }, navigator: { state: 'living', battlesLeft: 0 } }), resources: { gold: 0, cursedGold: 0, ectoplasm: 300 } };
        let expected = start;
        for (const s of steps) {
          if (s === 'battle') {
            p = afterBattle(p, result(false), 1);
            if (expected > 0) expected -= 1;
          } else {
            const before = p.resources.ectoplasm;
            const r = keepGhost(p, 'gunner');
            if (expected > 0 && before >= CREW.keepGhostCost.ectoplasm) {
              expect(r.ok).toBe(true);
              if (r.ok) {
                p = r.profile;
                expected += CREW.ghostBattles;
                expect(before - p.resources.ectoplasm).toBe(CREW.keepGhostCost.ectoplasm);
              }
            } else {
              expect(r.ok).toBe(false);
            }
          }
          if (expected === 0) expect(p.crew.gunner).toEqual({ state: 'none', battlesLeft: 0 });
          else expect(p.crew.gunner).toEqual({ state: 'ghost', battlesLeft: expected });
        }
      }),
      { numRuns: 300 },
    );
  });

  // Feature: davy-jones-locker, Property 3. Validates: Requirements 2.2, 2.3
  it('Property 3: the Locker lets go exactly once, at the right price', async () => {
    const outcome = fc.constantFrom('solved', 'late', 'wrong', 'abandoned');
    await fc.assert(
      fc.asyncProperty(outcome, fc.integer({ min: 0, max: 2500 }), fc.integer({ min: 0, max: 400 }), async (how, gold, cursedGold) => {
        const server = testServer(13);
        const { token, profile } = await server.guest();
        patch(server, profile.id, { sunk: true, resources: { gold, cursedGold, ectoplasm: 0 } });
        const start = await server.call('POST', '/locker/escape', {}, token);
        expect(start.status).toBe(200);
        const puzzle = generatePuzzle(start.data.ticket.puzzleSeed);
        if (how === 'late') server.advance((LOCKER.puzzleSeconds + LOCKER_GRACE_SECONDS + 1) * 1000);
        const orientation = how === 'solved' || how === 'late' ? puzzle.solution : how === 'wrong' ? puzzle.start : [];
        const finish = await server.call('POST', '/locker/finish', { id: start.data.ticket.id, orientation }, token);
        expect(finish.status).toBe(200);
        const after = stored(server, profile.id);
        expect(after.sunk).toBe(false);
        const lost = how === 'solved' ? 0 : Math.floor((gold + cursedGold) * LOCKER.goldLostOnFailure);
        expect(gold + cursedGold - after.resources.gold - after.resources.cursedGold).toBe(lost);
        expect(cursedGold - after.resources.cursedGold).toBe(Math.min(cursedGold, lost));
        // Only once.
        expect((await server.call('POST', '/locker/finish', { id: start.data.ticket.id, orientation }, token)).status).toBe(409);
      }),
      { numRuns: 60 },
    );
  });

  // Feature: davy-jones-locker, Property 4. Validates: Requirement 1.3
  it("Property 4: a sunk ship can't fight", async () => {
    const attempt = fc.constantFrom(
      ['/captures/start', { islandId: 1, method: 'fort' }],
      ['/captures/start', { islandId: 2 }],
      ['/raids/start', { targetId: RIVALS[0]!.id }],
      ['/ghosts/defend', {}],
    );
    await fc.assert(
      fc.asyncProperty(attempt, async ([path, body]) => {
        const server = testServer(14);
        const { token, profile } = await server.guest();
        patch(server, profile.id, { sunk: true, summonedUntil: server.ctx.now() + 60_000 });
        const before = server.store.snapshot();
        const r = await server.call('POST', path as string, body, token);
        expect(r.status).toBe(409);
        expect(server.store.snapshot()).toEqual(before);
      }),
      { numRuns: 20 },
    );
  });

  // Feature: davy-jones-locker, Property 5. Validates: Requirement 2.4
  it("Property 5: the Ferryman's price is exact", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 100 }), async (ectoplasm) => {
        const server = testServer(15);
        const { token, profile } = await server.guest();
        patch(server, profile.id, { sunk: true, resources: { gold: 100, cursedGold: 0, ectoplasm } });
        const r = await server.call('POST', '/locker/pay', {}, token);
        const affordable = ectoplasm >= LOCKER.ferrymanCost.ectoplasm;
        expect(r.status === 200).toBe(affordable);
        const after = stored(server, profile.id);
        expect(after.sunk).toBe(!affordable);
        expect(after.resources.ectoplasm).toBe(affordable ? ectoplasm - LOCKER.ferrymanCost.ectoplasm : ectoplasm);
        expect(after.resources.gold).toBe(100);
      }),
      { numRuns: 60 },
    );
  });

  it('hiring fills an empty post for its price', async () => {
    const server = testServer(16);
    const { token, profile } = await server.guest();
    patch(server, profile.id, { crew: { gunner: { state: 'none', battlesLeft: 0 }, navigator: { state: 'living', battlesLeft: 0 } } });
    expect((await server.call('POST', '/crew/hire', { role: 'navigator' }, token)).status).toBe(400);
    const r = await server.call('POST', '/crew/hire', { role: 'gunner' }, token);
    expect(r.status).toBe(200);
    expect(r.data.profile.crew.gunner.state).toBe('living');
    expect(r.data.profile.resources.gold).toBe(600 - CREW.hireCost.gold);
  });
});
