import { FORTS, LAYOUT, SHIP, WORLD } from './balance';
import type { BattleSetup, Loadout } from './battle';
import { TAU, clamp } from './math';
import { createRng } from './rng';
import { fortLevelAt, type FortLevel, type Island } from './world';

export type TowerType = 'cannonTower' | 'spiritLantern' | 'boneCatapult';
export type DefenseType = TowerType | 'mine';
export type DefenseLevel = 1 | 2 | 3;

export const TOWER_TYPES: readonly TowerType[] = ['cannonTower', 'spiritLantern', 'boneCatapult'];

export interface PlacedDefense {
  readonly type: DefenseType;
  readonly level: DefenseLevel;
  /** Tower slot for towers, mine slot for mines. */
  readonly slot: number;
}

export interface IslandLayout {
  /** Keep level, 1 to 3. */
  readonly level: DefenseLevel;
  readonly slotCount: number;
  readonly mineSlotCount: number;
  readonly defenses: readonly PlacedDefense[];
}

export interface Point {
  readonly x: number;
  readonly z: number;
}

/** Where a tower slot stands, relative to the island's centre. */
export function slotPosition(radius: number, slot: number, slotCount: number): Point {
  const angle = (slot / Math.max(1, slotCount)) * TAU + 0.3;
  const r = radius * LAYOUT.slotRing;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

/** Where a mine floats, relative to the island's centre: in the water just off the shore. */
export function mineSlotPosition(radius: number, slot: number, mineSlotCount: number): Point {
  const angle = (slot / Math.max(1, mineSlotCount)) * TAU + 0.9;
  const r = radius * WORLD.collisionScale + SHIP.radius + LAYOUT.mineMargin;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

/** Clamps a number to a defense level. */
export function toLevel(n: number): DefenseLevel {
  return clamp(Math.round(Number.isFinite(n) ? n : 1), 1, 3) as DefenseLevel;
}

/** Keeps only defenses that fit the layout: known types, slots in range, one defense per slot. */
export function cleanDefenses(defenses: readonly PlacedDefense[], slotCount: number, mineSlotCount: number): PlacedDefense[] {
  const towers = new Set<number>();
  const mines = new Set<number>();
  const out: PlacedDefense[] = [];
  for (const d of defenses) {
    const slot = Math.round(d.slot);
    const isMine = d.type === 'mine';
    if (!isMine && !TOWER_TYPES.includes(d.type as TowerType)) continue;
    const used = isMine ? mines : towers;
    const limit = isMine ? mineSlotCount : slotCount;
    if (!Number.isInteger(slot) || slot < 0 || slot >= limit || used.has(slot)) continue;
    used.add(slot);
    out.push({ type: d.type, level: toLevel(d.level), slot });
  }
  return out;
}

/** How hard a haunted island's fort is, 1 to 5, by its distance from Last Light. */
export function fortDifficulty(island: Island): FortLevel {
  return fortLevelAt(Math.hypot(island.x, island.z));
}

/** The fort that guards a haunted island at its level, generated from the island's seed. */
export function fortLayout(island: Island): IslandLayout {
  const rng = createRng(island.seed ^ 0x5f0f);
  const i = fortDifficulty(island) - 1;
  const slotCount = FORTS.slots[i]!;
  const mines = FORTS.mines[i]!;
  const [low, high] = FORTS.towerLevels[i]!;
  const catapults = FORTS.catapultShare[i]!;
  const slots = rng.shuffle(Array.from({ length: slotCount }, (_, k) => k)).slice(0, FORTS.towers[i]!);
  const defenses: PlacedDefense[] = slots.map((slot, k) => {
    const roll = rng.next();
    // The first tower is always a Cannon Tower. Haunted forts lean on Spirit Lanterns, which are weak against living ships.
    const type: TowerType = k === 0 ? 'cannonTower' : roll < catapults ? 'boneCatapult' : roll < catapults + (1 - catapults) * 0.45 ? 'cannonTower' : 'spiritLantern';
    return { type, level: toLevel(low + Math.floor(rng.next() * (high - low + 1))), slot };
  });
  for (let m = 0; m < mines; m++) defenses.push({ type: 'mine', level: toLevel(low), slot: m });
  return { level: toLevel(FORTS.keepLevel[i]!), slotCount, mineSlotCount: Math.max(3, mines), defenses };
}

/** The battle for a haunted island's fort at its level: towers, mines, keep, the island's ghosts and the dawn clock. */
export function fortSetup(island: Island, loadout: Loadout, seed: number): BattleSetup {
  const layout = fortLayout(island);
  const i = fortDifficulty(island) - 1;
  const ghosts = FORTS.ghosts[i]!;
  return {
    seed,
    mode: 'assault',
    island: { radius: island.radius, living: false, level: layout.level, seed: island.seed, slotCount: layout.slotCount, mineSlotCount: layout.mineSlotCount },
    defenses: layout.defenses,
    loadout,
    fleet: { count: ghosts.count, level: ghosts.level },
    timeLimitSeconds: FORTS.timeLimitSeconds[i]!,
  };
}

/** A rival captain's base, generated from a seed and a home level. */
export function rivalLayout(seed: number, homeLevel: DefenseLevel): IslandLayout {
  const rng = createRng(seed ^ 0x2b1d);
  const slotCount = LAYOUT.homeSlots[homeLevel - 1] as number;
  const mineSlotCount = LAYOUT.homeMineSlots[homeLevel - 1] as number;
  const towerCount = Math.min(slotCount, 2 + homeLevel * 2 + rng.int(0, 1));
  const slots = rng.shuffle(Array.from({ length: slotCount }, (_, i) => i)).slice(0, towerCount);
  const defenses: PlacedDefense[] = slots.map((slot) => {
    const roll = rng.next();
    const type: TowerType = roll < 0.5 ? 'cannonTower' : roll < 0.8 || homeLevel === 1 ? 'spiritLantern' : 'boneCatapult';
    return { type, level: toLevel(homeLevel - (rng.next() < 0.4 ? 1 : 0)), slot };
  });
  const mines = rng.int(0, mineSlotCount - 1);
  for (let m = 0; m < mines; m++) defenses.push({ type: 'mine', level: toLevel(homeLevel), slot: m });
  return { level: homeLevel, slotCount, mineSlotCount, defenses };
}
