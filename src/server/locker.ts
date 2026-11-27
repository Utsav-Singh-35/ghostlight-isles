import { LOCKER } from '../sim/balance';
import { hireCrew, keepGhost, lockerToll } from '../sim/crew';
import { describeCost, spend } from '../sim/economy';
import { addReport, publicProfile, type PendingBattle, type Profile } from '../sim/profile';
import { generatePuzzle, isSolved, sanitizeOrientation } from '../sim/puzzle';
import { saveProfile } from './players';
import { HttpError, randomHex, route, stringField, type ServerContext } from './router';

/** Seconds of grace for the network on top of the escape's time limit. */
export const LOCKER_GRACE_SECONDS = 15;

function requireSunk(profile: Profile): void {
  if (!profile.sunk) throw new HttpError(409, 'Your ship is afloat.');
}

async function free(ctx: ServerContext, profile: Profile, title: string, detail: string, tone: 'good' | 'bad'): Promise<Profile> {
  const next = addReport({ ...profile, sunk: false, battle: null }, { at: ctx.now(), title, detail, tone });
  await saveProfile(ctx, next);
  return next;
}

route('POST', '/locker/escape', true, async ({ ctx, profile }) => {
  requireSunk(profile);
  const id = randomHex(ctx, 8);
  const battle: PendingBattle = { id, kind: 'locker', setup: null, puzzleSeed: ctx.random(), target: 'locker', startedAt: ctx.now() };
  const next = { ...profile, battle };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), ticket: { id, puzzleSeed: battle.puzzleSeed, seconds: LOCKER.puzzleSeconds } };
});

route('POST', '/locker/finish', true, async ({ ctx, body, profile }) => {
  const id = stringField(body, 'id', 64);
  const pending = profile.battle;
  if (!profile.sunk || !pending || pending.id !== id || pending.kind !== 'locker') throw new HttpError(409, 'That escape is already over.');
  const puzzle = generatePuzzle(pending.puzzleSeed);
  const inTime = ctx.now() - pending.startedAt <= (LOCKER.puzzleSeconds + LOCKER_GRACE_SECONDS) * 1000;
  const escaped = inTime && isSolved(puzzle, sanitizeOrientation(puzzle, body.orientation));
  if (escaped) {
    const next = await free(ctx, profile, "You escaped Davy Jones' Locker", 'The beam lit every totem and the deep let you go. Nothing was lost.', 'good');
    return { profile: publicProfile(next), outcome: { escaped: true, lost: 0 } };
  }
  const toll = lockerToll(profile.resources);
  const next = await free(ctx, { ...profile, resources: toll.left }, 'The sea took its toll', `You washed up beside Last Light, ${toll.lost} gold lighter.`, 'bad');
  return { profile: publicProfile(next), outcome: { escaped: false, lost: toll.lost } };
});

route('POST', '/locker/pay', true, async ({ ctx, profile }) => {
  requireSunk(profile);
  const resources = spend(profile.resources, LOCKER.ferrymanCost);
  if (!resources) throw new HttpError(400, `The Ferryman wants ${describeCost(LOCKER.ferrymanCost)}.`);
  const next = await free(ctx, { ...profile, resources }, 'You paid the Ferryman', `${describeCost(LOCKER.ferrymanCost)} bought your passage back to Last Light.`, 'good');
  return { profile: publicProfile(next) };
});

route('POST', '/crew/keep', true, async ({ ctx, body, profile }) => {
  const result = keepGhost(profile, body.role);
  if (!result.ok) throw new HttpError(400, result.reason);
  await saveProfile(ctx, result.profile);
  return { profile: publicProfile(result.profile) };
});

route('POST', '/crew/hire', true, async ({ ctx, body, profile }) => {
  const result = hireCrew(profile, body.role);
  if (!result.ok) throw new HttpError(400, result.reason);
  await saveProfile(ctx, result.profile);
  return { profile: publicProfile(result.profile) };
});
