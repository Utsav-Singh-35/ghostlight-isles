import { BATTLE, BLOOD_MOON, REWARDS, TROOPS } from '../sim/balance';
import { crewOf, slotsFor } from '../sim/base';
import { runBattle, type BattleSetup } from '../sim/battle';
import { fleetCanSail, fleetFor, moonIsUp } from '../sim/bloodMoon';
import { capsFor, earn, takeShare } from '../sim/economy';
import { addReport, loadoutOf, publicProfile, type PendingBattle, type Profile } from '../sim/profile';
import { afterBattle } from './aftermath';
import { STANDARD_WORLD, requireAfloat } from './capture';
import { saveProfile } from './players';
import { HttpError, randomHex, route, stringField } from './router';

/** The siege of the captain's own Last Light by the ghost fleet. */
export function siegeSetup(profile: Profile, seed: number): BattleSetup {
  const home = STANDARD_WORLD.islands[0]!;
  const slots = slotsFor(profile.homeLevel);
  return {
    seed,
    mode: 'siege',
    island: { radius: home.radius, living: true, level: profile.homeLevel, seed: home.seed, slotCount: slots.towers, mineSlotCount: slots.mines },
    defenses: profile.defenses,
    loadout: loadoutOf(profile),
    fleet: fleetFor(profile),
    timeLimitSeconds: BATTLE.timeLimitSeconds,
    party: crewOf(profile).ship,
    garrison: crewOf(profile).island,
    boarders: TROOPS.boarders[fleetFor(profile).level - 1] ?? 1,
  };
}

route('POST', '/ghosts/summon', true, async ({ ctx, profile }) => {
  const now = ctx.now();
  if (profile.summonReadyAt > now) throw new HttpError(409, `The moon answers again in ${Math.ceil((profile.summonReadyAt - now) / 1000)} seconds.`);
  const next = { ...profile, summonedUntil: now + BLOOD_MOON.durationSeconds * 1000, summonReadyAt: now + BLOOD_MOON.summonCooldownSeconds * 1000 };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), now };
});

route('POST', '/ghosts/defend', true, async ({ ctx, profile }) => {
  const now = ctx.now();
  requireAfloat(profile);
  if (!moonIsUp(profile, now)) throw new HttpError(409, 'The ghost fleet only sails under a Blood Moon.');
  if (!fleetCanSail(profile, now)) throw new HttpError(409, 'The fleet has already come this Blood Moon. Last Light rests.');
  const id = randomHex(ctx, 8);
  const setup = siegeSetup(profile, ctx.random());
  const battle: PendingBattle = { id, kind: 'ghost', setup, puzzleSeed: 0, target: 'home', startedAt: now };
  const next = { ...profile, battle };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), ticket: { id, setup } };
});

route('POST', '/ghosts/finish', true, async ({ ctx, body, profile }) => {
  const id = stringField(body, 'id', 64);
  const pending = profile.battle;
  if (!pending || pending.id !== id || pending.kind !== 'ghost' || !pending.setup) throw new HttpError(409, 'That siege is already over.');
  const now = ctx.now();
  const result = runBattle(pending.setup, body.inputs).result!;
  let next: Profile = afterBattle({ ...profile, battle: null }, result, pending.setup.seed);

  // The ghosts take their share of what was there, cursed gold first; then the sunk ships pay out.
  const { left, taken } = takeShare(next.resources, REWARDS.raidShare * result.destruction);
  const sunk = result.ghostsSunk;
  const resources = earn(left, { cursedGold: sunk * REWARDS.ghostShipCursedGold, ectoplasm: sunk * REWARDS.ghostShipEctoplasm }, capsFor(next.homeLevel));
  const rewards = { cursedGold: resources.cursedGold - left.cursedGold, ectoplasm: resources.ectoplasm - left.ectoplasm };
  const held = !result.keepDestroyed;
  next = {
    ...next,
    resources,
    infamy: next.infamy + REWARDS.infamyPerGhostShip * sunk,
    ghostRestUntil: now + BLOOD_MOON.restMinutes * 60_000,
    summonedUntil: 0,
    stats: {
      ...next.stats,
      ghostShipsSunk: next.stats.ghostShipsSunk + sunk,
      ghostRaidsRepelled: next.stats.ghostRaidsRepelled + (result.reason === 'repelled' ? 1 : 0),
    },
  };
  const lost = taken.gold + taken.cursedGold;
  next = addReport(next, {
    at: now,
    title: held ? 'Last Light held against the ghost fleet' : 'The ghost fleet put out the lighthouse',
    detail: `${sunk} of ${result.ghostsTotal} ghost ships sunk for ${rewards.cursedGold} cursed gold and ${rewards.ectoplasm} ectoplasm.${lost > 0 || taken.ectoplasm > 0 ? ` The ghosts took ${lost} gold and ${taken.ectoplasm} ectoplasm.` : ''}`,
    tone: held ? 'good' : 'bad',
  });
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), outcome: { result, taken, rewards } };
});

route('POST', '/chapel/cleanse', true, async ({ ctx, profile }) => {
  if (profile.cleanse) throw new HttpError(409, 'The chapel is already cleansing gold.');
  const amount = profile.resources.cursedGold;
  if (amount <= 0) throw new HttpError(400, 'You have no cursed gold to cleanse.');
  const next: Profile = {
    ...profile,
    resources: { ...profile.resources, cursedGold: 0 },
    cleanse: { amount, readyAt: ctx.now() + BLOOD_MOON.cleanseSeconds * 1000 },
  };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next) };
});
