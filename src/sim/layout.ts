import { FORTS, LAYOUT, SHIP, TROOPS, WORLD } from './balance';
import type { BattleSetup, Loadout } from './battle';
import { TAU, clamp } from './math';
import { createRng } from './rng';
import type { TroopCounts } from './troops';
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

/** Bonus targets on haunted forts: a treasure vault pays out, a powder store blows up its neighbours. */
export type BonusType = 'vault' | 'powder';
export const BONUS_TYPES: readonly BonusType[] = ['vault', 'powder'];

export function isBonus(type: string): type is BonusType {
  return type === 'vault' || type === 'powder';
}

export interface PlacedExtra {
  readonly type: BonusType;
  /** A place on the treasure ring, between two tower slots. */
  readonly slot: number;
}

export interface IslandLayout {
  /** Keep level, 1 to 3. */
  readonly level: DefenseLevel;
  readonly slotCount: number;
  readonly mineSlotCount: number;
  readonly defenses: readonly PlacedDefense[];
  readonly extras: readonly PlacedExtra[];
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

/** Where a treasure vault or powder store stands: on the treasure ring, halfway between two tower slots. */
export function extraPosition(radius: number, slot: number, slotCount: number): Point {
  const angle = ((slot + 0.5) / Math.max(1, slotCount)) * TAU + 0.3;
  const r = radius * LAYOUT.treasureRing;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

/** Keeps only bonus targets of known types on distinct places that exist. */
export function cleanExtras(extras: readonly PlacedExtra[], slotCount: number): PlacedExtra[] {
  const used = new Set<number>();
  const out: PlacedExtra[] = [];
  for (const e of extras) {
    const slot = Math.round(e.slot);
    if (!isBonus(e.type) || !Number.isInteger(slot) || slot < 0 || slot >= slotCount || used.has(slot)) continue;
    used.add(slot);
    out.push({ type: e.type, slot });
  }
  return out;
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

/** How a fort is built. Chosen from the island's seed, leaning to stone and star forts as the level rises. */
export type FortStyle = 'curtain' | 'ruin' | 'star' | 'palisade';

/** The style a fort of this level and seed is built in: wooden stockades only on the easy forts, star forts mostly on the hard ones. */
export function fortStyle(level: number, seed: number): FortStyle {
  const roll = createRng(seed ^ 0x51e7).next();
  if (level <= 2) return roll < 0.35 ? 'palisade' : roll < 0.65 ? 'ruin' : 'curtain';
  if (level === 3) return roll < 0.3 ? 'ruin' : roll < 0.65 ? 'star' : 'curtain';
  return roll < 0.2 ? 'ruin' : roll < 0.7 ? 'star' : 'curtain';
}

/** The fort wall's distance from the keep, metres: between the keep and the ring of tower slots. */
export function fortWallRadius(islandRadius: number): number {
  return Math.min(21, Math.max(8.5, islandRadius * 0.34));
}

/** How far a star fort's bastions jut out, and its recesses sit, as shares of the wall's radius. */
export const BASTION_REACH = 1.3;
const RECESS = 0.92;

export interface WallCorner {
  readonly x: number;
  readonly z: number;
  /** Whether a turret stands on this corner. */
  readonly turret: boolean;
}

/** A haunted fort's wall: its corners in order of rising angle, which wall has the gate, and where the gate is. */
export interface FortWalls {
  readonly style: FortStyle;
  readonly corners: readonly WallCorner[];
  /** The gate is in the wall from corner `gateIndex` to the next. */
  readonly gateIndex: number;
  readonly gateX: number;
  readonly gateZ: number;
  /** The wall ring troops can't cross except at the gate: the gate's distance from the centre. */
  readonly radius: number;
}

/**
 * The walls of a haunted fort, from its island's radius, level and seed. The renderer draws them
 * and the battle rules use the same corners and gate, so the gate troops use is the gate you see.
 * A star fort points one bastion at each tower slot.
 */
export function fortWalls(islandRadius: number, level: number, seed: number): FortWalls {
  const style = fortStyle(level, seed);
  const wallR = fortWallRadius(islandRadius);
  const corners: WallCorner[] = [];
  let gateIndex: number;
  if (style === 'star') {
    const slots = FORTS.slots[clamp(Math.round(level), 1, FORTS.levels) - 1]!;
    const first = slotPosition(1, 0, 1);
    const start = Math.atan2(first.x, first.z);
    for (let k = 0; k < slots * 2; k++) {
      const a = start + (k / (slots * 2)) * TAU;
      const r = k % 2 === 0 ? wallR * BASTION_REACH : wallR * RECESS;
      corners.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, turret: k % 2 === 0 });
    }
    // The gate is in a wall running from a bastion's point into the next recess.
    gateIndex = 2 * createRng(seed ^ 0x6a7f).int(0, slots - 1);
  } else {
    const sides = 5 + clamp(Math.round(level), 1, FORTS.levels);
    const start = createRng(seed ^ 0x6a7e).range(0, TAU);
    for (let k = 0; k < sides; k++) {
      const a = start + (k / sides) * TAU;
      corners.push({ x: Math.sin(a) * wallR, z: Math.cos(a) * wallR, turret: true });
    }
    gateIndex = createRng(seed ^ 0x6a7f).int(0, sides - 1);
  }
  const a = corners[gateIndex]!;
  const b = corners[(gateIndex + 1) % corners.length]!;
  const gateX = (a.x + b.x) / 2;
  const gateZ = (a.z + b.z) / 2;
  return { style, corners, gateIndex, gateX, gateZ, radius: Math.hypot(gateX, gateZ) };
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
  // Treasure vaults and powder stores, between the towers.
  const places = rng.shuffle(Array.from({ length: slotCount }, (_, k) => k));
  const extras: PlacedExtra[] = [];
  for (let v = 0; v < FORTS.vaults[i]!; v++) extras.push({ type: 'vault', slot: places[extras.length]! });
  for (let p = 0; p < FORTS.powderStores[i]!; p++) extras.push({ type: 'powder', slot: places[extras.length]! });
  return { level: toLevel(FORTS.keepLevel[i]!), slotCount, mineSlotCount: Math.max(3, mines), defenses, extras };
}

/**
 * The battle for a haunted island's fort at its level: towers, mines, keep, the island's ghosts,
 * its ghost troops behind walls with one gate, and the dawn clock. `party` is the attacker's landing party.
 */
export function fortSetup(island: Island, loadout: Loadout, seed: number, party: TroopCounts = {}): BattleSetup {
  const layout = fortLayout(island);
  const level = fortDifficulty(island);
  const i = level - 1;
  const ghosts = FORTS.ghosts[i]!;
  const walls = fortWalls(island.radius, level, island.seed);
  return {
    seed,
    mode: 'assault',
    island: { radius: island.radius, living: false, level: layout.level, seed: island.seed, slotCount: layout.slotCount, mineSlotCount: layout.mineSlotCount },
    defenses: layout.defenses,
    loadout,
    fleet: { count: ghosts.count, level: ghosts.level },
    timeLimitSeconds: FORTS.timeLimitSeconds[i]!,
    extras: layout.extras,
    party,
    garrison: { ...TROOPS.fortGarrison[i]! },
    walls: { radius: walls.radius, gateX: walls.gateX, gateZ: walls.gateZ, gateHp: TROOPS.gateHp[i]! },
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
  return { level: homeLevel, slotCount, mineSlotCount, defenses, extras: [] };
}
