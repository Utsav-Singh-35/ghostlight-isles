import { FORTS, REWARDS, TICK_SECONDS } from './balance';
import type { BattleState } from './battle';
import { TOWER_TYPES, type TowerType } from './layout';
import type { FortLevel } from './world';

/** One part of a capture's reward, as shown on the result card. */
export interface RewardLine {
  readonly label: string;
  readonly gold: number;
  readonly ectoplasm: number;
}

export interface CaptureRewards {
  readonly lines: readonly RewardLine[];
  readonly gold: number;
  readonly ectoplasm: number;
}

/** What a finished fort battle shows, for working out its reward. */
export interface BattleSummary {
  readonly won: boolean;
  /** Share of the dawn clock left when the battle ended, 0 to 1. */
  readonly timeLeft: number;
  readonly secondsLeft: number;
  readonly towersDestroyed: number;
  /** The levels of every tower destroyed, added up. */
  readonly towerLevels: number;
  readonly ghostsSunk: number;
  readonly vaultsDestroyed: number;
}

const isTower = (type: string): type is TowerType => (TOWER_TYPES as readonly string[]).includes(type);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reads the parts of a finished battle that the reward depends on. */
export function summarize(state: BattleState): BattleSummary {
  const result = state.result;
  const ticksLeft = result ? Math.max(0, state.limit - result.ticks) : 0;
  const towers = state.structures.filter((s) => s.destroyed && isTower(s.type));
  return {
    won: result?.keepDestroyed === true,
    timeLeft: state.limit > 0 ? ticksLeft / state.limit : 0,
    secondsLeft: Math.round(ticksLeft * TICK_SECONDS),
    towersDestroyed: towers.length,
    towerLevels: towers.reduce((sum, s) => sum + s.level, 0),
    ghostsSunk: state.ghosts.filter((g) => g.sunk).length,
    vaultsDestroyed: state.structures.filter((s) => s.destroyed && s.type === 'vault').length,
  };
}

/**
 * A captured fort's reward: the base for its level, plus gold for every gun silenced, for time
 * left before dawn, for the island's ghost ships sunk and for treasure vaults cracked. A battle
 * that doesn't capture the fort pays nothing.
 */
export function rewardsFor(s: BattleSummary, level: FortLevel): CaptureRewards {
  if (!s.won) return { lines: [], gold: 0, ectoplasm: 0 };
  const i = level - 1;
  const base = REWARDS.captureGold[i]!;
  const whole = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  const lines: RewardLine[] = [{ label: `Level ${level} fort broken`, gold: base, ectoplasm: REWARDS.captureEctoplasm[i]! }];
  const add = (label: string, gold: number, ectoplasm: number) => {
    if (whole(gold) > 0 || whole(ectoplasm) > 0) lines.push({ label, gold: whole(gold), ectoplasm: whole(ectoplasm) });
  };
  const timeLeft = Math.min(1, Math.max(0, Number.isFinite(s.timeLeft) ? s.timeLeft : 0));
  const clock = `${Math.floor(s.secondsLeft / 60)}:${String(s.secondsLeft % 60).padStart(2, '0')}`;
  add(plural(whole(s.towersDestroyed), 'gun silenced', 'guns silenced'), whole(s.towerLevels) * REWARDS.towerBounty, 0);
  add(`Done with ${clock} left before dawn`, base * REWARDS.speedBonus * timeLeft, 0);
  add(`${plural(whole(s.ghostsSunk), "of the island's ghost ships", "of the island's ghost ships")} sunk`, whole(s.ghostsSunk) * REWARDS.islandGhostGold, whole(s.ghostsSunk) * REWARDS.ghostShipEctoplasm);
  add(plural(whole(s.vaultsDestroyed), 'treasure vault cracked', 'treasure vaults cracked'), whole(s.vaultsDestroyed) * FORTS.vaultGold[i]!, 0);
  return {
    lines,
    gold: lines.reduce((sum, l) => sum + l.gold, 0),
    ectoplasm: lines.reduce((sum, l) => sum + l.ectoplasm, 0),
  };
}

/** The reward for a finished fort battle at this level, from the battle itself. */
export function captureRewards(state: BattleState, level: FortLevel): CaptureRewards {
  return rewardsFor(summarize(state), level);
}
