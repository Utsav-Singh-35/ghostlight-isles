import { BATTLE, REWARDS, WORLD } from '../sim/balance';
import { runBattle, type BattleResult, type BattleSetup } from '../sim/battle';
import { capsFor, earn } from '../sim/economy';
import { fortDifficulty, fortLayout } from '../sim/layout';
import { addReport, collectTribute, loadoutOf, publicProfile, type PendingBattle, type Profile } from '../sim/profile';
import { generatePuzzle, isSolved, sanitizeOrientation } from '../sim/puzzle';
import { hashSeed } from '../sim/rng';
import { generateWorld, type Island } from '../sim/world';
import { afterBattle } from './aftermath';
import { saveProfile } from './players';
import { HttpError, intField, randomHex, route, stringField } from './router';

/** Progress always happens in the standard sea, so island ids and seeds are the same for everyone. */
export const STANDARD_WORLD = generateWorld(hashSeed(WORLD.defaultSeed));

/** The battle setup for capturing a haunted island's fort. */
export function fortSetup(island: Island, profile: Profile, seed: number): BattleSetup {
  const layout = fortLayout(island);
  return {
    seed,
    mode: 'assault',
    island: { radius: island.radius, living: false, level: layout.level, seed: island.seed, slotCount: layout.slotCount, mineSlotCount: layout.mineSlotCount },
    defenses: layout.defenses,
    loadout: loadoutOf(profile),
    fleet: { count: 0, level: 1 },
    timeLimitSeconds: BATTLE.timeLimitSeconds,
  };
}

/** Throws unless the ship can sail out to fight. */
export function requireAfloat(profile: Profile): void {
  if (profile.sunk) throw new HttpError(409, "Your ship lies in Davy Jones' Locker. Escape it first.");
}

route('POST', '/captures/start', true, async ({ ctx, body, profile }) => {
  const islandId = intField(body, 'islandId', 1, STANDARD_WORLD.islands.length - 1);
  const method = body.method;
  if (method !== 'fort' && method !== 'puzzle') throw new HttpError(400, 'Choose "fort" or "puzzle".');
  if (profile.captured.includes(islandId)) throw new HttpError(409, 'That island is already yours.');
  requireAfloat(profile);
  const island = STANDARD_WORLD.islands[islandId]!;
  const id = randomHex(ctx, 8);
  const seed = ctx.random();
  const battle: PendingBattle =
    method === 'fort'
      ? { id, kind: 'capture', setup: fortSetup(island, profile, seed), puzzleSeed: 0, target: String(islandId), startedAt: ctx.now() }
      : { id, kind: 'puzzle', setup: null, puzzleSeed: seed, target: String(islandId), startedAt: ctx.now() };
  const next = { ...profile, battle };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), ticket: { id, kind: battle.kind, setup: battle.setup, puzzleSeed: battle.puzzleSeed, islandId } };
});

route('POST', '/captures/finish', true, async ({ ctx, body, profile }) => {
  const id = stringField(body, 'id', 64);
  const pending = profile.battle;
  if (!pending || pending.id !== id || (pending.kind !== 'capture' && pending.kind !== 'puzzle')) {
    throw new HttpError(409, 'That capture is already over.');
  }
  const islandId = Number(pending.target);
  const island = STANDARD_WORLD.islands[islandId]!;
  let won: boolean;
  let result: BattleResult | null = null;
  if (pending.kind === 'capture' && pending.setup) {
    // The server's own replay decides; the client's result is never trusted.
    result = runBattle(pending.setup, body.inputs).result!;
    won = result.keepDestroyed;
  } else {
    const puzzle = generatePuzzle(pending.puzzleSeed);
    won = isSolved(puzzle, sanitizeOrientation(puzzle, body.orientation));
  }

  let next: Profile = afterBattle({ ...profile, battle: null }, result, pending.setup?.seed ?? pending.puzzleSeed);
  const rewards = { gold: 0, ectoplasm: 0 };
  if (won && !next.captured.includes(islandId)) {
    const level = fortDifficulty(island);
    // Settle tribute for the islands already held before the new one starts paying.
    next = collectTribute(next, ctx.now()).profile;
    const before = next.resources;
    const resources = earn(before, { gold: REWARDS.captureGold[level - 1], ectoplasm: REWARDS.captureEctoplasm[level - 1] }, capsFor(next.homeLevel));
    rewards.gold = resources.gold - before.gold;
    rewards.ectoplasm = resources.ectoplasm - before.ectoplasm;
    next = {
      ...next,
      resources,
      captured: [...next.captured, islandId],
      tributeAt: next.captured.length === 0 ? ctx.now() : next.tributeAt,
      infamy: next.infamy + REWARDS.infamyPerCapture,
      stats: { ...next.stats, captures: next.stats.captures + 1 },
    };
    next = addReport(next, {
      at: ctx.now(),
      title: `${island.name} is yours`,
      detail: `${pending.kind === 'puzzle' ? 'You lit every totem.' : 'You broke the fort.'} +${rewards.gold} gold, +${rewards.ectoplasm} ectoplasm.`,
      tone: 'good',
    });
  }
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), outcome: { won, islandId, result, rewards } };
});
