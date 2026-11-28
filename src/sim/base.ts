import { COSTS, ECONOMY, LAYOUT, TROOPS, type Cost } from './balance';
import { capsFor, describeCost, earn, spend } from './economy';
import { TOWER_TYPES, type DefenseLevel, type DefenseType, type PlacedDefense } from './layout';
import type { Crew, Profile, Weapons } from './profile';
import { LIVING_TROOPS, TROOP_NAMES, isLivingTroop, troopSpace, type LivingTroop, type TroopCounts } from './troops';

export type CommandResult = { readonly ok: true; readonly profile: Profile } | { readonly ok: false; readonly reason: string };
export type ShipPart = keyof Weapons;
export const SHIP_PARTS: readonly ShipPart[] = ['hull', 'cannon', 'salt', 'barrel', 'bats', 'mortar', 'boats'];
export const DEFENSE_TYPES: readonly DefenseType[] = [...TOWER_TYPES, 'mine'];

export const DEFENSE_NAMES: Readonly<Record<DefenseType, string>> = {
  cannonTower: 'Cannon Tower',
  spiritLantern: 'Spirit Lantern',
  boneCatapult: 'Bone Catapult',
  mine: "Jack-o'-lantern Mine",
};

export const SHIP_PART_NAMES: Readonly<Record<ShipPart, string>> = {
  hull: 'Hull',
  cannon: 'Cannons',
  salt: 'Salt Shot',
  barrel: 'Witchfire Barrel',
  bats: 'Bat Swarm',
  mortar: 'Pumpkin Mortar',
  boats: 'Support boats',
};

const fail = (reason: string): CommandResult => ({ ok: false, reason });

/** Tower and mine slots at a home level. */
export function slotsFor(homeLevel: number): { towers: number; mines: number } {
  const i = Math.min(3, Math.max(1, Math.round(homeLevel))) - 1;
  return { towers: LAYOUT.homeSlots[i]!, mines: LAYOUT.homeMineSlots[i]! };
}

/** Cost to bring a defense to `level` (level 1 is building it). */
export function defenseCost(type: DefenseType, level: number): Cost {
  return COSTS[type][Math.min(3, Math.max(1, level)) - 1]!;
}

/** Everything paid for a defense that has reached `level`. */
export function spentOn(type: DefenseType, level: number): Cost {
  let gold = 0;
  let ectoplasm = 0;
  for (let l = 1; l <= level; l++) {
    const c = defenseCost(type, l);
    gold += c.gold;
    ectoplasm += c.ectoplasm;
  }
  return { gold, ectoplasm };
}

/** Cost to raise a ship part to its next level, or null at the top. */
export function shipUpgradeCost(profile: Pick<Profile, 'weapons'>, part: ShipPart): Cost | null {
  // Captains saved before a part existed don't have it yet: level 0.
  const current = profile.weapons[part] ?? 0;
  if (current >= (part === 'boats' ? TROOPS.maxBoats : 3)) return null;
  return COSTS[part][current] ?? null;
}

/** Cost to raise Last Light to its next level, or null at the top. */
export function homeUpgradeCost(profile: Pick<Profile, 'homeLevel'>): Cost | null {
  return profile.homeLevel >= 3 ? null : ECONOMY.homeUpgrade[profile.homeLevel - 1]!;
}

const isMine = (type: DefenseType) => type === 'mine';
const sameSlot = (d: PlacedDefense, type: DefenseType, slot: number) => isMine(d.type) === isMine(type) && d.slot === slot;

function validType(type: unknown): type is DefenseType {
  return typeof type === 'string' && (DEFENSE_TYPES as readonly string[]).includes(type);
}

export function buildDefense(profile: Profile, type: unknown, slot: number): CommandResult {
  if (!validType(type)) return fail('That is not a defense you can build.');
  const slots = slotsFor(profile.homeLevel);
  const limit = isMine(type) ? slots.mines : slots.towers;
  if (!Number.isInteger(slot) || slot < 0 || slot >= limit) return fail("That slot doesn't exist yet. Upgrade Last Light for more.");
  const unlock = COSTS.unlockLevel[type];
  if (profile.homeLevel < unlock) return fail(`${DEFENSE_NAMES[type]} needs Last Light at level ${unlock}.`);
  if (profile.defenses.some((d) => sameSlot(d, type, slot))) return fail('That slot is taken.');
  const cost = defenseCost(type, 1);
  const resources = spend(profile.resources, cost);
  if (!resources) return fail(`You need ${describeCost(cost)}.`);
  return { ok: true, profile: { ...profile, resources, defenses: [...profile.defenses, { type, level: 1, slot }] } };
}

export function upgradeDefense(profile: Profile, type: unknown, slot: number): CommandResult {
  if (!validType(type)) return fail('That is not a defense.');
  const index = profile.defenses.findIndex((d) => d.type === type && d.slot === slot);
  const d = profile.defenses[index];
  if (!d) return fail('There is nothing there to upgrade.');
  if (d.level >= 3) return fail('It is already at the highest level.');
  const cost = defenseCost(d.type, d.level + 1);
  const resources = spend(profile.resources, cost);
  if (!resources) return fail(`You need ${describeCost(cost)}.`);
  const defenses = profile.defenses.slice();
  defenses[index] = { ...d, level: (d.level + 1) as DefenseLevel };
  return { ok: true, profile: { ...profile, resources, defenses } };
}

export function removeDefense(profile: Profile, type: unknown, slot: number): CommandResult {
  if (!validType(type)) return fail('That is not a defense.');
  const d = profile.defenses.find((x) => x.type === type && x.slot === slot);
  if (!d) return fail('There is nothing there to remove.');
  const spent = spentOn(d.type, d.level);
  const refund = { gold: Math.floor(spent.gold * COSTS.refund), ectoplasm: Math.floor(spent.ectoplasm * COSTS.refund) };
  return {
    ok: true,
    profile: {
      ...profile,
      resources: earn(profile.resources, refund, capsFor(profile.homeLevel)),
      defenses: profile.defenses.filter((x) => x !== d),
    },
  };
}

export function upgradeHome(profile: Profile): CommandResult {
  const cost = homeUpgradeCost(profile);
  if (!cost) return fail('Last Light is already at the highest level.');
  const resources = spend(profile.resources, cost);
  if (!resources) return fail(`You need ${describeCost(cost)}.`);
  return { ok: true, profile: { ...profile, resources, homeLevel: (profile.homeLevel + 1) as DefenseLevel } };
}

export function upgradeShip(profile: Profile, part: unknown): CommandResult {
  if (typeof part !== 'string' || !(SHIP_PARTS as readonly string[]).includes(part)) return fail('That is not part of the ship.');
  const p = part as ShipPart;
  const cost = shipUpgradeCost(profile, p);
  if (!cost) return fail(`${SHIP_PART_NAMES[p]} is already at the highest level.`);
  const resources = spend(profile.resources, cost);
  if (!resources) return fail(`You need ${describeCost(cost)}.`);
  return { ok: true, profile: { ...profile, resources, weapons: { ...profile.weapons, [p]: (profile.weapons[p] ?? 0) + 1 } } };
}

// ---- The Tavern: recruiting and posting troops ------------------------------------------

export type Post = 'ship' | 'island';

/** The captain's fighters (none for a captain saved before troops existed). */
export function crewOf(profile: Pick<Profile, 'troops'>): Crew {
  return profile.troops ?? { ship: {}, island: {} };
}

/** Room aboard (by hull level) and ashore (by home level). */
export function spaceFor(profile: Pick<Profile, 'weapons' | 'homeLevel'>): { ship: number; island: number } {
  const hull = Math.min(3, Math.max(1, Math.round(profile.weapons.hull))) - 1;
  const home = Math.min(3, Math.max(1, Math.round(profile.homeLevel))) - 1;
  return { ship: TROOPS.shipSpace[hull]!, island: TROOPS.islandSpace[home]! };
}

const validPost = (p: unknown): p is Post => p === 'ship' || p === 'island';

function withCount(counts: TroopCounts, type: LivingTroop, delta: number): TroopCounts {
  const n = (counts[type] ?? 0) + delta;
  const out: TroopCounts = { ...counts };
  if (n > 0) out[type] = n;
  else delete out[type];
  return out;
}

function roomLeft(profile: Profile, post: Post, crew: Crew): number {
  return spaceFor(profile)[post] - troopSpace(crew[post]);
}

export function recruitTroop(profile: Profile, type: unknown, post: unknown): CommandResult {
  if (!isLivingTroop(type)) return fail('Nobody of that kind drinks at this tavern.');
  if (!validPost(post)) return fail('Post them aboard or ashore.');
  const stats = TROOPS.types[type];
  if (profile.homeLevel < stats.minHome) return fail(`An ${TROOP_NAMES[type]} needs Last Light at level ${stats.minHome}.`);
  const crew = crewOf(profile);
  if (roomLeft(profile, post, crew) < stats.space) return fail(post === 'ship' ? 'There is no room aboard. A bigger hull holds more.' : 'There is no room ashore. Upgrade Last Light for more.');
  const resources = spend(profile.resources, stats.cost);
  if (!resources) return fail(`You need ${describeCost(stats.cost)}.`);
  return { ok: true, profile: { ...profile, resources, troops: { ...crew, [post]: withCount(crew[post], type, 1) } } };
}

export function moveTroop(profile: Profile, type: unknown, from: unknown): CommandResult {
  if (!isLivingTroop(type)) return fail('There is nobody like that in your crew.');
  if (!validPost(from)) return fail('Move them from aboard or ashore.');
  const to: Post = from === 'ship' ? 'island' : 'ship';
  const crew = crewOf(profile);
  if ((crew[from][type] ?? 0) < 1) return fail(`You have no ${TROOP_NAMES[type]} ${from === 'ship' ? 'aboard' : 'ashore'}.`);
  if (roomLeft(profile, to, crew) < TROOPS.types[type].space) return fail(to === 'ship' ? 'There is no room aboard.' : 'There is no room ashore.');
  return { ok: true, profile: { ...profile, troops: { [from]: withCount(crew[from], type, -1), [to]: withCount(crew[to], type, 1) } as unknown as Crew } };
}

export function dismissTroop(profile: Profile, type: unknown, from: unknown): CommandResult {
  if (!isLivingTroop(type)) return fail('There is nobody like that in your crew.');
  if (!validPost(from)) return fail('Dismiss them from aboard or ashore.');
  const crew = crewOf(profile);
  if ((crew[from][type] ?? 0) < 1) return fail(`You have no ${TROOP_NAMES[type]} ${from === 'ship' ? 'aboard' : 'ashore'}.`);
  return { ok: true, profile: { ...profile, troops: { ...crew, [from]: withCount(crew[from], type, -1) } } };
}

/** Every recruitable troop type, in Tavern order. */
export const TAVERN: readonly LivingTroop[] = LIVING_TROOPS;