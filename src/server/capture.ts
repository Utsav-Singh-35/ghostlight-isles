import { REWARDS, WORLD } from '../sim/balance';
import { crewOf } from '../sim/base';
import { runBattle } from '../sim/battle';
import { capsFor, earn } from '../sim/economy';
import { fortDifficulty, fortSetup } from '../sim/layout';
import { captureRewards, type RewardLine } from '../sim/captureRewards';
import { addReport, collectTribute, loadoutOf, publicProfile, type PendingBattle, type Profile } from '../sim/profile';
import { hashSeed } from '../sim/rng';
import { generateWorld } from '../sim/world';
import { afterBattle } from './aftermath';
import { saveProfile } from './players';
import { HttpError, intField, randomHex, route, stringField } from './router';

/** Progress always happens in the standard sea, so island ids, fort levels and seeds are the same for everyone. */
export const STANDARD_WORLD = generateWorld(hashSeed(WORLD.defaultSeed));

/** Throws unless the ship can sail out to fight. */
export function requireAfloat(profile: Profile): void {
  if (profile.sunk) throw new HttpError(409, "Your ship lies in Davy Jones' Locker. Escape it first.");
}

route('POST', '/captures/start', true, async ({ ctx, body, profile }) => {
  const islandId = intField(body, 'islandId', 1, STANDARD_WORLD.islands.length - 1);
  // Islands are taken by battle only; the Lantern Lines puzzle is the escape from Davy Jones' Locker.
  if (body.method !== undefined && body.method !== 'fort') throw new HttpError(400, 'Islands are taken by breaking their fort in battle.');
  if (profile.captured.includes(islandId)) throw new HttpError(409, 'That island is already yours.');
  requireAfloat(profile);
  const island = STANDARD_WORLD.islands[islandId]!;
  const id = randomHex(ctx, 8);
  const setup = fortSetup(island, loadoutOf(profile), ctx.random(), crewOf(profile).ship);
  const battle: PendingBattle = { id, kind: 'capture', setup, puzzleSeed: 0, target: String(islandId), startedAt: ctx.now() };
  const next = { ...profile, battle };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), ticket: { id, setup, islandId } };
});

route('POST', '/captures/finish', true, async ({ ctx, body, profile }) => {
  const id = stringField(body, 'id', 64);
  const pending = profile.battle;
  if (!pending || pending.id !== id || pending.kind !== 'capture' || !pending.setup) {
    throw new HttpError(409, 'That capture is already over.');
  }
  const islandId = Number(pending.target);
  const island = STANDARD_WORLD.islands[islandId]!;
  // The server's own replay decides; the client's result is never trusted.
  const replay = runBattle(pending.setup, body.inputs);
  const result = replay.result!;
  const won = result.keepDestroyed;

  let next: Profile = afterBattle({ ...profile, battle: null }, result, pending.setup.seed);
  const rewards: { gold: number; ectoplasm: number; lines: readonly RewardLine[]; full: boolean } = { gold: 0, ectoplasm: 0, lines: [], full: false };
  if (won && !next.captured.includes(islandId)) {
    const level = fortDifficulty(island);
    // Settle tribute for the islands already held before the new one starts paying.
    next = collectTribute(next, ctx.now()).profile;
    // The reward for how the battle went: guns silenced, time left, ghosts sunk, treasure taken.
    const earned = captureRewards(replay, level);
    const before = next.resources;
    const resources = earn(before, { gold: earned.gold, ectoplasm: earned.ectoplasm }, capsFor(next.homeLevel));
    rewards.gold = resources.gold - before.gold;
    rewards.ectoplasm = resources.ectoplasm - before.ectoplasm;
    rewards.lines = earned.lines;
    rewards.full = rewards.gold < earned.gold || rewards.ectoplasm < earned.ectoplasm;
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
      detail: `You broke the level ${level} fort. +${rewards.gold} gold, +${rewards.ectoplasm} ectoplasm.`,
      tone: 'good',
    });
  }
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), outcome: { won, islandId, result, rewards } };
});
