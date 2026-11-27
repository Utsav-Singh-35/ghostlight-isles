import { BLOOD_MOON, GHOSTS } from './balance';
import { clamp } from './math';
import type { Profile } from './profile';

export interface MoonState {
  /** True during a shared Blood Moon window. */
  readonly active: boolean;
  /** Which window this is, counted from the Unix epoch. */
  readonly index: number;
  /** When the current period's Blood Moon starts and ends, milliseconds. */
  readonly startsAt: number;
  readonly endsAt: number;
  /** When the next Blood Moon rises. */
  readonly nextStart: number;
}

const PERIOD = BLOOD_MOON.periodSeconds * 1000;
const DURATION = BLOOD_MOON.durationSeconds * 1000;

/** The shared Blood Moon clock: the same for every player, from the time alone. */
export function bloodMoonAt(now: number): MoonState {
  const index = Math.floor(now / PERIOD);
  const startsAt = index * PERIOD;
  const endsAt = startsAt + DURATION;
  return { active: now >= startsAt && now < endsAt, index, startsAt, endsAt, nextStart: startsAt + PERIOD };
}

/** True while a Blood Moon is up for this captain: the shared one or one they summoned. */
export function moonIsUp(profile: Pick<Profile, 'summonedUntil'>, now: number): boolean {
  return bloodMoonAt(now).active || profile.summonedUntil > now;
}

/** True when the ghost fleet may attack this captain's island now. */
export function fleetCanSail(profile: Pick<Profile, 'summonedUntil' | 'ghostRestUntil'>, now: number): boolean {
  if (profile.summonedUntil > now) return true;
  return bloodMoonAt(now).active && profile.ghostRestUntil <= now;
}

/** When the moon goes back to normal for this captain, milliseconds. */
export function moonEndsAt(profile: Pick<Profile, 'summonedUntil'>, now: number): number {
  const moon = bloodMoonAt(now);
  return Math.max(moon.active ? moon.endsAt : 0, profile.summonedUntil);
}

/** The fleet that comes for an island: cursed gold and a bigger island draw more ships. */
export function fleetFor(profile: Pick<Profile, 'resources' | 'homeLevel' | 'stats'>): { count: number; level: number } {
  const extra = Math.floor(Math.max(0, profile.resources.cursedGold) / BLOOD_MOON.cursedGoldPerExtraShip);
  return {
    count: clamp(BLOOD_MOON.baseFleet + extra + (profile.homeLevel - 1), 1, GHOSTS.maxFleet),
    level: clamp(profile.homeLevel + Math.floor(profile.stats.ghostRaidsRepelled / 3), 1, GHOSTS.maxLevel),
  };
}
