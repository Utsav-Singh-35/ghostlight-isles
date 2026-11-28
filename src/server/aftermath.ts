import { CREW } from '../sim/balance';
import type { BattleResult } from '../sim/battle';
import { crewOf } from '../sim/base';
import { useTrialBattle, type CrewSlot, type Profile } from '../sim/profile';
import { subtractCounts } from '../sim/troops';

/**
 * What every battle leaves behind: ghost crew members use up a battle, and when the ship sinks
 * one living crew member dies and comes back as a ghost, and the ship goes to Davy Jones' Locker.
 * A new captain's trial of every weapon loses one battle.
 */
export function afterBattle(profile: Profile, result: BattleResult | null, seed: number): Profile {
  if (!result) return profile;
  const wear = (slot: CrewSlot): CrewSlot => {
    if (slot.state !== 'ghost') return slot;
    const battlesLeft = slot.battlesLeft - 1;
    return battlesLeft > 0 ? { state: 'ghost', battlesLeft } : { state: 'none', battlesLeft: 0 };
  };
  let crew = { gunner: wear(profile.crew.gunner), navigator: wear(profile.crew.navigator) };
  let stats = profile.stats;
  if (result.shipSunk) {
    const living = (['gunner', 'navigator'] as const).filter((role) => crew[role].state === 'living');
    if (living.length > 0) {
      const role = living[seed % living.length]!;
      crew = { ...crew, [role]: { state: 'ghost', battlesLeft: CREW.ghostBattles } };
    }
    stats = { ...stats, timesSunk: stats.timesSunk + 1 };
  }
  // The troops that died are gone: the party's, and the garrison's in a siege. Never more than were there.
  const troops = profile.troops && result.lost ? { ship: subtractCounts(crewOf(profile).ship, result.lost.ship), island: subtractCounts(crewOf(profile).island, result.lost.island) } : profile.troops;
  return { ...useTrialBattle(profile), crew, stats, sunk: profile.sunk || result.shipSunk, ...(troops ? { troops } : {}) };
}
