import { BATTLE, REWARDS, WORLD } from '../sim/balance';
import { slotsFor } from '../sim/base';
import { runBattle, type BattleSetup, type Loadout } from '../sim/battle';
import { capsFor, earn, takeShare, type Resources } from '../sim/economy';
import type { DefenseLevel, PlacedDefense } from '../sim/layout';
import { addReport, loadoutOf, publicProfile, type PendingBattle, type Profile } from '../sim/profile';
import { hashSeed } from '../sim/rng';
import { afterBattle } from './aftermath';
import { requireAfloat } from './capture';
import { baseRating, toughnessStars } from '../sim/toughness';
import { findByUsername, loadProfile, readIndex, saveProfile } from './players';
import { RIVALS, findRival, protectRival, rivalProtectedUntil, rivalStorage } from './rivals';
import { HttpError, randomHex, route, stringField } from './router';

const TARGET_LIMIT = 8;
const HOUR = 3_600_000;

/** A battle setup against an island shaped like Last Light, with the defender's own defenses. */
export function raidSetup(homeLevel: DefenseLevel, defenses: readonly PlacedDefense[], islandSeed: number, loadout: Loadout, seed: number): BattleSetup {
  const slots = slotsFor(homeLevel);
  return {
    seed,
    mode: 'assault',
    island: { radius: WORLD.homeIslandRadius, living: true, level: homeLevel, seed: islandSeed, slotCount: slots.towers, mineSlotCount: slots.mines },
    defenses,
    loadout,
    fleet: { count: 0, level: 1 },
    timeLimitSeconds: BATTLE.timeLimitSeconds,
  };
}

const lootOf = (storage: Resources) => ({
  gold: Math.floor((storage.gold + storage.cursedGold) * REWARDS.raidShare),
  ectoplasm: Math.floor(storage.ectoplasm * REWARDS.raidShare),
});

function describeLoot(r: Resources): string {
  const parts = [`${r.gold + r.cursedGold} gold`];
  if (r.cursedGold > 0) parts[0] += ` (${r.cursedGold} of it cursed)`;
  if (r.ectoplasm > 0) parts.push(`${r.ectoplasm} ectoplasm`);
  return parts.join(' and ');
}

/** A captain as a raid target. */
function captainTarget(p: Profile) {
  return { id: p.id, name: p.name, kind: 'captain' as const, homeLevel: p.homeLevel, defenses: p.defenses.length, infamy: p.infamy, loot: lootOf(p.resources), toughness: toughnessStars(baseRating(p)), protectedUntil: p.protectedUntil };
}

route('GET', '/raids/find/:username', true, async ({ ctx, params, profile }) => {
  const found = await findByUsername(ctx.store, params.username ?? '');
  if (!found) throw new HttpError(404, `No captain is called ${String(params.username ?? '').slice(0, 20)}.`);
  if (found.id === profile.id) throw new HttpError(400, "That's you. Find someone else to raid.");
  return { target: captainTarget(found), now: ctx.now() };
});

route('GET', '/raids/targets', true, async ({ ctx, profile }) => {
  const now = ctx.now();
  const index = await readIndex(ctx.store);
  const mine = index[profile.id]?.rating ?? 0;
  const captains = Object.values(index)
    .filter((e) => e.id !== profile.id && e.protectedUntil <= now)
    .sort((a, b) => Math.abs(a.rating - mine) - Math.abs(b.rating - mine) || b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const targets: unknown[] = [];
  for (const entry of captains) {
    const p = await loadProfile(ctx.store, entry.id);
    if (!p) continue;
    targets.push(captainTarget(p));
  }
  for (const rival of RIVALS) {
    if (targets.length >= TARGET_LIMIT) break;
    if ((await rivalProtectedUntil(ctx.store, rival.id)) > now) continue;
    targets.push({ id: rival.id, name: rival.name, kind: 'rival', homeLevel: rival.homeLevel, defenses: rival.layout.defenses.length, infamy: rival.infamy, loot: lootOf(rivalStorage(rival)), toughness: toughnessStars(baseRating({ defenses: rival.layout.defenses, homeLevel: rival.homeLevel })) });
  }
  return { targets, now };
});

route('POST', '/raids/start', true, async ({ ctx, body, profile }) => {
  const targetId = stringField(body, 'targetId', 40);
  requireAfloat(profile);
  if (targetId === profile.id) throw new HttpError(400, "You can't raid your own island.");
  const now = ctx.now();
  const id = randomHex(ctx, 8);
  const seed = ctx.random();
  let setup: BattleSetup;
  let targetName: string;
  const rival = findRival(targetId);
  if (rival) {
    if ((await rivalProtectedUntil(ctx.store, rival.id)) > now) throw new HttpError(409, `${rival.name}'s island is protected for now.`);
    setup = raidSetup(rival.homeLevel, rival.layout.defenses, rival.seed, loadoutOf(profile), seed);
    targetName = rival.name;
  } else {
    const defender = await loadProfile(ctx.store, targetId);
    if (!defender) throw new HttpError(404, 'There is no such island.');
    if (defender.protectedUntil > now) throw new HttpError(409, `${defender.name}'s island is protected for another ${Math.ceil((defender.protectedUntil - now) / 60_000)} minutes.`);
    setup = raidSetup(defender.homeLevel, defender.defenses, hashSeed(defender.id), loadoutOf(profile), seed);
    targetName = defender.name;
  }
  const battle: PendingBattle = { id, kind: 'raid', setup, puzzleSeed: 0, target: targetId, startedAt: now };
  const next = { ...profile, battle };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), ticket: { id, setup, targetName } };
});

route('POST', '/raids/finish', true, async ({ ctx, body, profile }) => {
  const id = stringField(body, 'id', 64);
  const pending = profile.battle;
  if (!pending || pending.id !== id || pending.kind !== 'raid' || !pending.setup) throw new HttpError(409, 'That raid is already over.');
  const now = ctx.now();
  const result = runBattle(pending.setup, body.inputs).result!;
  const share = REWARDS.raidShare * result.destruction;
  let taken: Resources = { gold: 0, cursedGold: 0, ectoplasm: 0 };
  let targetName = 'a rival';

  const rival = findRival(pending.target);
  if (rival) {
    targetName = rival.name;
    taken = takeShare(rivalStorage(rival), share).taken;
    if (result.destruction > 0) await protectRival(ctx.store, rival.id, now + REWARDS.raidProtectionHours * HOUR);
  } else {
    const defender = await loadProfile(ctx.store, pending.target);
    if (defender) {
      targetName = defender.name;
      const split = takeShare(defender.resources, share);
      taken = split.taken;
      let next: Profile = {
        ...defender,
        resources: split.left,
        protectedUntil: result.destruction > 0 ? now + REWARDS.raidProtectionHours * HOUR : defender.protectedUntil,
      };
      next = addReport(next, {
        at: now,
        title: result.destruction > 0 ? `Captain ${profile.name} raided Last Light` : `Captain ${profile.name} was driven off`,
        detail:
          result.destruction > 0
            ? `${result.stars} of 3 stars, ${Math.round(result.destruction * 100)}% destroyed. They took ${describeLoot(taken)}. Your island is protected for ${REWARDS.raidProtectionHours} hours.`
            : 'Your defenses held and nothing was lost.',
        tone: result.destruction > 0 ? 'bad' : 'good',
        from: { id: profile.id, name: profile.name },
      });
      await saveProfile(ctx, next);
    }
  }

  let next: Profile = afterBattle({ ...profile, battle: null }, result, pending.setup.seed);
  const before = next.resources;
  const resources = earn(before, taken, capsFor(next.homeLevel));
  const loot = { gold: resources.gold - before.gold, cursedGold: resources.cursedGold - before.cursedGold, ectoplasm: resources.ectoplasm - before.ectoplasm };
  next = {
    ...next,
    resources,
    infamy: next.infamy + REWARDS.infamyPerStar * result.stars,
    stats: { ...next.stats, raidsWon: next.stats.raidsWon + (result.stars > 0 ? 1 : 0) },
  };
  next = addReport(next, {
    at: now,
    title: `Raid on ${targetName}`,
    detail: `${result.stars} of 3 stars, ${Math.round(result.destruction * 100)}% destroyed. You took ${describeLoot(loot)}.`,
    tone: result.stars > 0 ? 'good' : 'neutral',
  });
  await saveProfile(ctx, next);
  return { profile: publicProfile(next), outcome: { result, loot, targetName } };
});

route('GET', '/leaderboard', true, async ({ ctx, profile }) => {
  const index = await readIndex(ctx.store);
  const all = [
    ...Object.values(index).map((e) => ({ id: e.id, name: e.name, infamy: e.infamy, kind: 'captain' as const })),
    ...RIVALS.map((r) => ({ id: r.id, name: r.name, infamy: r.infamy, kind: 'rival' as const })),
  ].sort((a, b) => b.infamy - a.infamy || a.name.localeCompare(b.name));
  const rank = all.findIndex((e) => e.id === profile.id) + 1;
  return {
    entries: all.slice(0, 10).map((e, i) => ({ rank: i + 1, name: e.name, infamy: e.infamy, kind: e.kind, you: e.id === profile.id })),
    you: { rank, infamy: profile.infamy, of: all.length },
  };
});
