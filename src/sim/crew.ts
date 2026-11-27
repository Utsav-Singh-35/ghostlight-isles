import { BATTLE, CREW, LOCKER, WEAPONS } from './balance';
import type { CommandResult } from './base';
import { describeCost, spend, type Resources } from './economy';
import type { Profile } from './profile';

export type CrewRole = 'gunner' | 'navigator';
export const CREW_ROLES: readonly CrewRole[] = ['gunner', 'navigator'];
export const CREW_NAMES: Readonly<Record<CrewRole, string>> = { gunner: 'Gunner', navigator: 'Navigator' };

const isRole = (role: unknown): role is CrewRole => role === 'gunner' || role === 'navigator';

/** What each crew member does, by state. */
export function crewEffect(role: CrewRole, state: 'none' | 'living' | 'ghost'): string {
  if (state === 'none') return 'Nobody holds this post.';
  if (role === 'gunner') {
    const faster = `Reloads ${Math.round((1 - WEAPONS.gunnerReload[state]) * 100)}% faster`;
    return state === 'ghost' ? `${faster}, and cannonballs hit ghosts at full strength.` : `${faster}.`;
  }
  const sight = BATTLE.navigatorRevealRadius[state];
  return state === 'ghost' ? `Sees ghosts ${sight} m off and every hidden mine.` : `Sees ghosts ${sight} m off in the fog.`;
}

/** Keeps a ghost crew member for another round of battles. */
export function keepGhost(profile: Profile, role: unknown): CommandResult {
  if (!isRole(role)) return { ok: false, reason: 'There is no such post aboard.' };
  const slot = profile.crew[role];
  if (slot.state !== 'ghost') return { ok: false, reason: `Your ${CREW_NAMES[role]} is not a ghost.` };
  const resources = spend(profile.resources, CREW.keepGhostCost);
  if (!resources) return { ok: false, reason: `You need ${describeCost(CREW.keepGhostCost)}.` };
  return { ok: true, profile: { ...profile, resources, crew: { ...profile.crew, [role]: { state: 'ghost', battlesLeft: slot.battlesLeft + CREW.ghostBattles } } } };
}

/** Hires a living crew member for an empty post. */
export function hireCrew(profile: Profile, role: unknown): CommandResult {
  if (!isRole(role)) return { ok: false, reason: 'There is no such post aboard.' };
  if (profile.crew[role].state !== 'none') return { ok: false, reason: `You already have a ${CREW_NAMES[role]}.` };
  const resources = spend(profile.resources, CREW.hireCost);
  if (!resources) return { ok: false, reason: `You need ${describeCost(CREW.hireCost)}.` };
  return { ok: true, profile: { ...profile, resources, crew: { ...profile.crew, [role]: { state: 'living', battlesLeft: 0 } } } };
}

/** What a failed escape from the Locker costs: a share of all gold, cursed gold first. */
export function lockerToll(res: Resources): { left: Resources; lost: number } {
  const lost = Math.floor((res.gold + res.cursedGold) * LOCKER.goldLostOnFailure);
  const fromCursed = Math.min(res.cursedGold, lost);
  return { left: { ...res, cursedGold: res.cursedGold - fromCursed, gold: res.gold - (lost - fromCursed) }, lost };
}
