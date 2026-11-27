import { ECONOMY, type Cost } from './balance';
import { clamp, finiteOr } from './math';

export interface Resources {
  readonly gold: number;
  readonly cursedGold: number;
  readonly ectoplasm: number;
}

export interface Caps {
  /** Gold and cursed gold together. */
  readonly gold: number;
  readonly ectoplasm: number;
}

export const NO_RESOURCES: Resources = { gold: 0, cursedGold: 0, ectoplasm: 0 };

const whole = (n: number): number => Math.max(0, Math.floor(finiteOr(n, 0)));

/** Storage for a home level. */
export function capsFor(homeLevel: number): Caps {
  const i = clamp(Math.round(finiteOr(homeLevel, 1)), 1, 3) - 1;
  return { gold: ECONOMY.goldCap[i]!, ectoplasm: ECONOMY.ectoplasmCap[i]! };
}

/** Makes resources whole, non-negative and inside the caps. Plain gold is trimmed before cursed gold. */
export function normalize(res: Resources, caps: Caps): Resources {
  const cursedGold = Math.min(whole(res.cursedGold), caps.gold);
  const gold = Math.min(whole(res.gold), caps.gold - cursedGold);
  return { gold, cursedGold, ectoplasm: Math.min(whole(res.ectoplasm), caps.ectoplasm) };
}

export function canAfford(res: Resources, cost: Cost): boolean {
  return res.gold + res.cursedGold >= whole(cost.gold) && res.ectoplasm >= whole(cost.ectoplasm);
}

/** Pays a cost, spending cursed gold before plain gold. Returns null when it can't be afforded. */
export function spend(res: Resources, cost: Cost): Resources | null {
  if (!canAfford(res, cost)) return null;
  const gold = whole(cost.gold);
  const fromCursed = Math.min(res.cursedGold, gold);
  return {
    gold: res.gold - (gold - fromCursed),
    cursedGold: res.cursedGold - fromCursed,
    ectoplasm: res.ectoplasm - whole(cost.ectoplasm),
  };
}

/** Adds earnings, up to the caps. Whatever doesn't fit is lost. */
export function earn(res: Resources, gain: Partial<Resources>, caps: Caps): Resources {
  const start = normalize(res, caps);
  let room = caps.gold - start.gold - start.cursedGold;
  const gold = Math.min(whole(gain.gold ?? 0), room);
  room -= gold;
  const cursedGold = Math.min(whole(gain.cursedGold ?? 0), room);
  const ectoplasm = Math.min(whole(gain.ectoplasm ?? 0), caps.ectoplasm - start.ectoplasm);
  return { gold: start.gold + gold, cursedGold: start.cursedGold + cursedGold, ectoplasm: start.ectoplasm + ectoplasm };
}

/** Takes up to a share of what's in storage: cursed gold first, then gold; and ectoplasm. */
export function takeShare(res: Resources, share: number): { left: Resources; taken: Resources } {
  const s = clamp(finiteOr(share, 0), 0, 1);
  const goldTotal = Math.floor((res.gold + res.cursedGold) * s);
  const fromCursed = Math.min(res.cursedGold, goldTotal);
  const taken = { gold: goldTotal - fromCursed, cursedGold: fromCursed, ectoplasm: Math.floor(res.ectoplasm * s) };
  return {
    left: { gold: res.gold - taken.gold, cursedGold: res.cursedGold - taken.cursedGold, ectoplasm: res.ectoplasm - taken.ectoplasm },
    taken,
  };
}

/** Tribute owed for whole minutes since `since`, and the time the next unpaid minute starts. */
export function tributeDue(captured: number, since: number, now: number): { gold: number; paidUntil: number } {
  const minutes = Math.max(0, Math.floor((finiteOr(now, since) - since) / 60_000));
  return { gold: minutes * ECONOMY.tributePerMinute * Math.max(0, Math.floor(captured)), paidUntil: since + minutes * 60_000 };
}

/** Adds two costs. */
export function addCost(a: Cost, b: Cost): Cost {
  return { gold: a.gold + b.gold, ectoplasm: a.ectoplasm + b.ectoplasm };
}

/** Plain words for a cost, like "450 gold and 40 ectoplasm". */
export function describeCost(cost: Cost): string {
  const parts: string[] = [];
  if (cost.gold > 0) parts.push(`${cost.gold} gold`);
  if (cost.ectoplasm > 0) parts.push(`${cost.ectoplasm} ectoplasm`);
  return parts.length ? parts.join(' and ') : 'free';
}
