import { REWARDS } from '../sim/balance';
import { capsFor, type Resources } from '../sim/economy';
import { rivalLayout, type DefenseLevel, type IslandLayout } from '../sim/layout';
import { hashSeed } from '../sim/rng';
import type { Store } from './router';

/** A captain run by the game, so the sea is never empty. */
export interface Rival {
  readonly id: string;
  readonly name: string;
  readonly homeLevel: DefenseLevel;
  readonly layout: IslandLayout;
  readonly infamy: number;
  /** Terrain seed for their island. */
  readonly seed: number;
}

const NAMES = ['Mara Vane', 'Old Grimsby', 'Lucan Salt', 'Widow Hask', 'Jory Bellweather', 'Ines Marrow', 'Corwin Teague', 'Tamsin Rook', 'Ezra Fenwick', 'Hollis Crane'];
const LEVELS: readonly DefenseLevel[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
const INFAMY = [20, 35, 50, 80, 110, 140, 170, 230, 300, 380];

export const RIVALS: readonly Rival[] = NAMES.map((name, i) => {
  const id = `rival-${i}`;
  const seed = hashSeed(id);
  const homeLevel = LEVELS[i]!;
  return { id, name, homeLevel, layout: rivalLayout(seed, homeLevel), infamy: INFAMY[i]!, seed };
});

export function findRival(id: string): Rival | undefined {
  return RIVALS.find((r) => r.id === id);
}

/** A rival's storage: always refilled to the same share of their cap. */
export function rivalStorage(rival: Rival): Resources {
  const caps = capsFor(rival.homeLevel);
  return { gold: Math.floor(caps.gold * REWARDS.rivalFill), cursedGold: 0, ectoplasm: Math.floor(caps.ectoplasm * REWARDS.rivalFill) };
}

export async function rivalProtectedUntil(store: Store, id: string): Promise<number> {
  const text = await store.get(`rival:${id}`);
  if (!text) return 0;
  try {
    const value = (JSON.parse(text) as { protectedUntil?: unknown }).protectedUntil;
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

export async function protectRival(store: Store, id: string, until: number): Promise<void> {
  await store.set(`rival:${id}`, JSON.stringify({ protectedUntil: until }));
}
