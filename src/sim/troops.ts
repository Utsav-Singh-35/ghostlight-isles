/**
 * Troops: the landing party, garrisons and ghost boarders, fighting on an island. Pure and
 * deterministic: `stepTroops` uses no randomness, and spawns use their own random stream.
 */
import { TICK_SECONDS, TROOPS } from './balance';
import { TAU, angleDelta, clamp } from './math';
import type { Rng } from './rng';

export type LivingTroop = 'deckhand' | 'buccaneer' | 'shieldbearer' | 'archer' | 'powderMonkey' | 'brute' | 'surgeon';
export type GhostTroop = 'rattler' | 'grabber' | 'wraithArcher' | 'bosun';
export type TroopType = LivingTroop | GhostTroop;

export const LIVING_TROOPS: readonly LivingTroop[] = ['deckhand', 'buccaneer', 'shieldbearer', 'archer', 'powderMonkey', 'brute', 'surgeon'];
export const GHOST_TROOPS: readonly GhostTroop[] = ['rattler', 'grabber', 'wraithArcher', 'bosun'];
export const TROOP_TYPES: readonly TroopType[] = [...LIVING_TROOPS, ...GHOST_TROOPS];

export const TROOP_NAMES: Readonly<Record<TroopType, string>> = {
  deckhand: 'Deckhand',
  buccaneer: 'Cutlass Buccaneer',
  shieldbearer: 'Shieldbearer',
  archer: 'Lantern Archer',
  powderMonkey: 'Powder Monkey',
  brute: 'Anchor Brute',
  surgeon: "Ship's Surgeon",
  rattler: 'Bone Rattler',
  grabber: 'Drowned Grabber',
  wraithArcher: 'Wraith Archer',
  bosun: 'Headless Bosun',
};

/** How many of each troop type. Missing types mean none. */
export type TroopCounts = Partial<Record<TroopType, number>>;

/** Which side a troop fights for: the attacking captain, the island, or the ghost fleet. */
export type TroopSide = 'player' | 'island' | 'ghost';

export interface Troop {
  readonly id: number;
  readonly type: TroopType;
  readonly side: TroopSide;
  readonly x: number;
  readonly z: number;
  readonly hp: number;
  readonly maxHp: number;
  /** Ticks until it can strike again. */
  readonly cooldown: number;
  /** Slowed while the tick is below this. */
  readonly slowedUntil: number;
  /** Where a defender stands guard. */
  readonly postX: number;
  readonly postZ: number;
  /** Direction it faces, radians (heading convention), and the tick it last struck. For drawing. */
  readonly facing: number;
  readonly struckAt: number;
  readonly dead: boolean;
}

export interface Gate {
  readonly x: number;
  readonly z: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly destroyed: boolean;
}

/** Something a troop can attack that isn't a troop: a structure or the gate. */
export interface TroopStructure {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Distance from its centre to its edge, metres. */
  readonly radius: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly destroyed: boolean;
}

export type TroopEvent =
  | { readonly type: 'strike'; readonly id: number; readonly troop: TroopType; readonly x: number; readonly z: number; readonly toX: number; readonly toZ: number; readonly ranged: boolean }
  | { readonly type: 'heal'; readonly id: number; readonly x: number; readonly z: number }
  | { readonly type: 'blast'; readonly id: number; readonly x: number; readonly z: number }
  | { readonly type: 'fallen'; readonly id: number; readonly troop: TroopType; readonly side: TroopSide; readonly x: number; readonly z: number }
  | { readonly type: 'gate'; readonly x: number; readonly z: number }
  | { readonly type: 'landed'; readonly x: number; readonly z: number; readonly count: number };

export function isTroopType(t: unknown): t is TroopType {
  return typeof t === 'string' && (TROOP_TYPES as readonly string[]).includes(t);
}

export function isLivingTroop(t: unknown): t is LivingTroop {
  return typeof t === 'string' && (LIVING_TROOPS as readonly string[]).includes(t);
}

/** Cleans untrusted counts: known types only (living only, unless `ghosts`), whole numbers, at most `cap` in all. */
export function cleanCounts(raw: unknown, ghosts = false, cap: number = TROOPS.maxTroops): TroopCounts {
  const out: TroopCounts = {};
  if (!raw || typeof raw !== 'object') return out;
  let total = 0;
  for (const type of ghosts ? TROOP_TYPES : LIVING_TROOPS) {
    const n = (raw as Record<string, unknown>)[type];
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    const count = clamp(Math.floor(n), 0, cap - total);
    if (count > 0) {
      out[type] = count;
      total += count;
    }
  }
  return out;
}

/** The number of troops in some counts. */
export function troopTotal(counts: TroopCounts): number {
  return TROOP_TYPES.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
}

/** The space some counts take. */
export function troopSpace(counts: TroopCounts): number {
  return TROOP_TYPES.reduce((sum, t) => sum + (counts[t] ?? 0) * TROOPS.types[t].space, 0);
}

/** `a` minus `b`, never below zero, without empty entries. */
export function subtractCounts(a: TroopCounts, b: TroopCounts): TroopCounts {
  const out: TroopCounts = {};
  for (const t of TROOP_TYPES) {
    const n = Math.max(0, (a[t] ?? 0) - (b[t] ?? 0));
    if (n > 0) out[t] = n;
  }
  return out;
}

/** Puts a group of troops around a point, spread out, inside the beach. */
export function spawnGroup(counts: TroopCounts, side: TroopSide, x: number, z: number, spread: number, firstId: number, rng: Rng, beachRadius: number): Troop[] {
  const out: Troop[] = [];
  let id = firstId;
  for (const type of TROOP_TYPES) {
    for (let i = 0; i < (counts[type] ?? 0); i++) {
      const a = rng.range(0, TAU);
      const r = Math.sqrt(rng.next()) * spread;
      const p = toBeach(x + Math.sin(a) * r, z + Math.cos(a) * r, beachRadius);
      const hp = TROOPS.types[type].hp;
      out.push({ id: id++, type, side, x: p.x, z: p.z, hp, maxHp: hp, cooldown: 0, slowedUntil: 0, postX: p.x, postZ: p.z, facing: Math.atan2(-p.x, -p.z), struckAt: -100, dead: false });
    }
  }
  return out;
}

function toBeach(x: number, z: number, beachRadius: number): { x: number; z: number } {
  const d = Math.hypot(x, z);
  if (d <= beachRadius || d < 1e-9) return { x, z };
  return { x: (x / d) * beachRadius, z: (z / d) * beachRadius };
}

/** True when two sides fight each other. In an assault the attacker fights the island; in a siege the ghosts fight everyone. */
export function hostile(a: TroopSide, b: TroopSide, siege: boolean): boolean {
  if (a === b) return false;
  if (siege) return a === 'ghost' || b === 'ghost';
  return (a === 'player' && b === 'island') || (a === 'island' && b === 'player');
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface TroopWorld {
  readonly tick: number;
  readonly siege: boolean;
  /** Troops stay within this distance of the island's centre. */
  readonly beachRadius: number;
  /** The wall ring's radius, or 0 for an island without walls. */
  readonly wallRadius: number;
  /** Structures (towers, keep, treasure) by side: whose they are. */
  readonly structures: ReadonlyArray<Mutable<TroopStructure> & { readonly side: TroopSide; readonly repairable?: boolean }>;
}

const SPEED_PER_TICK = (type: TroopType) => TROOPS.types[type].speed * TICK_SECONDS;
const ticksOf = (seconds: number) => Math.max(1, Math.round(seconds / TICK_SECONDS));
/** Ranged troops shoot at anything within this many times their reach of sight. */
const RANGED = (type: TroopType) => TROOPS.types[type].range > 4;

/** Which side of the wall a point is on. */
const insideWall = (x: number, z: number, wallRadius: number) => wallRadius > 0 && Math.hypot(x, z) < wallRadius;

interface Foe {
  readonly kind: 'troop' | 'structure' | 'gate';
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * One tick for every troop: choose a target, walk (never through a standing wall), strike, heal
 * or repair. Mutates the working copies it is given and returns what happened.
 */
export function stepTroops(world: TroopWorld, troops: Array<Mutable<Troop>>, gate: Mutable<Gate> | null): TroopEvent[] {
  const events: TroopEvent[] = [];
  const { tick, siege, wallRadius } = world;
  const alive = troops.filter((t) => !t.dead);
  const hurtTroop = (t: Mutable<Troop>, amount: number) => {
    t.hp = Math.max(0, t.hp - amount);
  };

  for (const t of alive) {
    if (t.dead || t.hp <= 0) continue;
    t.cooldown = Math.max(0, t.cooldown - 1);
    const stats = TROOPS.types[t.type];
    const enemyTroops = alive.filter((o) => !o.dead && o.hp > 0 && hostile(t.side, o.side, siege));
    const enemyStructures = world.structures.filter((s) => !s.destroyed && hostile(t.side, s.side, siege));
    // The gate belongs to the island, so only the island's enemies attack it.
    const gateFoe: Foe | null = gate && !gate.destroyed && hostile(t.side, 'island', siege) ? { kind: 'gate', id: -1, x: gate.x, z: gate.z, radius: 1.2 } : null;
    const defender = !siege && t.side === 'island';

    // Surgeons heal; Deckhands ashore repair. Neither fights.
    if (t.type === 'surgeon') {
      const allies = alive.filter((o) => !o.dead && o.hp > 0 && o.side === t.side && o.id !== t.id);
      const hurt = allies.filter((o) => o.hp < o.maxHp && Math.hypot(o.x - t.x, o.z - t.z) <= stats.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
      if (hurt) {
        hurt.hp = Math.min(hurt.maxHp, hurt.hp + TROOPS.surgeonHeal * TICK_SECONDS);
        if (t.cooldown === 0) {
          events.push({ type: 'heal', id: hurt.id, x: hurt.x, z: hurt.z });
          t.cooldown = ticksOf(stats.cooldownSeconds);
          t.struckAt = tick;
        }
      } else {
        const follow = nearestOf(allies.map((o) => ({ kind: 'troop' as const, id: o.id, x: o.x, z: o.z, radius: 0.5 })), t.x, t.z);
        if (follow) move(t, follow.x, follow.z, 2.5, world, gate);
      }
      continue;
    }
    if (t.type === 'deckhand') {
      // Towers only: the keep and treasure are past a Deckhand's mending.
      const mine = world.structures.filter((s) => !s.destroyed && s.side === t.side && s.repairable !== false && s.hp < s.maxHp);
      const job = nearestOf(mine.map((s) => ({ kind: 'structure' as const, id: s.id, x: s.x, z: s.z, radius: s.radius })), t.x, t.z);
      if (job) {
        const s = mine.find((m) => m.id === job.id)!;
        if (move(t, s.x, s.z, s.radius + stats.range, world, gate)) {
          s.hp = Math.min(s.maxHp, s.hp + TROOPS.deckhandTowerRepair * TICK_SECONDS);
          if (t.cooldown === 0) {
            t.cooldown = ticksOf(stats.cooldownSeconds);
            t.struckAt = tick;
          }
        }
      } else {
        move(t, t.postX, t.postZ, 0.5, world, gate);
      }
      continue;
    }

    // Choose a target by the troop's habits.
    const troopFoes: Foe[] = enemyTroops.map((o) => ({ kind: 'troop', id: o.id, x: o.x, z: o.z, radius: 0.45 }));
    const structureFoes: Foe[] = enemyStructures.map((s) => ({ kind: 'structure', id: s.id, x: s.x, z: s.z, radius: s.radius }));
    if (gateFoe) structureFoes.push(gateFoe);
    let foes: Foe[];
    switch (t.type) {
      case 'brute':
        foes = structureFoes;
        break;
      case 'powderMonkey':
        foes = gateFoe ? [gateFoe] : structureFoes;
        break;
      case 'shieldbearer':
      case 'archer':
      case 'wraithArcher':
        foes = troopFoes.length > 0 ? troopFoes : structureFoes;
        break;
      default:
        foes = [...troopFoes, ...structureFoes];
    }
    // Defenders only leave their posts for enemy troops near them.
    if (defender) foes = troopFoes.filter((f) => Math.hypot(f.x - t.postX, f.z - t.postZ) <= TROOPS.sight || Math.hypot(f.x - t.x, f.z - t.z) <= TROOPS.sight);
    let target = nearestOf(foes, t.x, t.z);
    // An enemy Shieldbearer close by draws every troop that fights troops.
    if (t.type !== 'brute' && t.type !== 'powderMonkey') {
      const taunt = nearestOf(
        enemyTroops.filter((o) => o.type === 'shieldbearer' && Math.hypot(o.x - t.x, o.z - t.z) <= TROOPS.tauntRadius).map((o) => ({ kind: 'troop' as const, id: o.id, x: o.x, z: o.z, radius: 0.45 })),
        t.x,
        t.z,
      );
      if (taunt) target = taunt;
    }
    if (!target) {
      if (defender) move(t, t.postX, t.postZ, 0.5, world, gate);
      continue;
    }

    // A melee troop on the wrong side of a standing wall attacks the gate instead, if it may.
    const ranged = RANGED(t.type);
    const wallBetween = wallRadius > 0 && insideWall(t.x, t.z, wallRadius) !== insideWall(target.x, target.z, wallRadius);
    if (wallBetween && !ranged && target.kind !== 'gate' && gateFoe) target = gateFoe;

    const reach = stats.range + target.radius;
    const d = Math.hypot(target.x - t.x, target.z - t.z);
    let inReach = d <= reach;
    if (!inReach) inReach = move(t, target.x, target.z, reach, world, gate);
    if (!inReach || t.cooldown > 0) continue;

    // Strike.
    t.facing = Math.atan2(target.x - t.x, target.z - t.z);
    t.cooldown = ticksOf(stats.cooldownSeconds);
    t.struckAt = tick;
    events.push({ type: 'strike', id: t.id, troop: t.type, x: t.x, z: t.z, toX: target.x, toZ: target.z, ranged });
    if (t.type === 'powderMonkey') {
      // One blast, then it's gone.
      if (target.kind === 'gate' && gate) gate.hp = Math.max(0, gate.hp - TROOPS.powderGateDamage);
      else if (target.kind === 'structure') {
        const s = enemyStructures.find((e) => e.id === target.id);
        if (s) s.hp = Math.max(0, s.hp - stats.damage);
      }
      for (const o of enemyTroops) if (Math.hypot(o.x - target.x, o.z - target.z) <= TROOPS.powderSplash) hurtTroop(o, TROOPS.powderTroopDamage);
      events.push({ type: 'blast', id: t.id, x: target.x, z: target.z });
      t.hp = 0;
      continue;
    }
    if (target.kind === 'gate' && gate) {
      gate.hp = Math.max(0, gate.hp - stats.damage);
    } else if (target.kind === 'structure') {
      const s = enemyStructures.find((e) => e.id === target.id);
      if (s) s.hp = Math.max(0, s.hp - stats.damage);
    } else {
      const o = enemyTroops.find((e) => e.id === target.id);
      if (o) {
        hurtTroop(o, stats.damage);
        if (t.type === 'grabber') o.slowedUntil = Math.max(o.slowedUntil, tick + ticksOf(TROOPS.grabSeconds));
      }
    }
    // Heavy swings also hit enemy troops beside the target.
    if (t.type === 'brute' || t.type === 'bosun') {
      for (const o of enemyTroops) {
        if (o.id !== target.id && Math.hypot(o.x - target.x, o.z - target.z) <= TROOPS.heavySplash + target.radius) hurtTroop(o, stats.damage * 0.5);
      }
    }
  }

  // Troops keep a little apart, never through a wall or off the beach.
  separate(alive, world, gate);

  for (const t of troops) {
    if (!t.dead && t.hp <= 0) {
      t.dead = true;
      events.push({ type: 'fallen', id: t.id, troop: t.type, side: t.side, x: t.x, z: t.z });
    }
  }
  if (gate && !gate.destroyed && gate.hp <= 0) {
    gate.destroyed = true;
    events.push({ type: 'gate', x: gate.x, z: gate.z });
  }
  return events;
}

function nearestOf<T extends { x: number; z: number; id: number }>(list: readonly T[], x: number, z: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const f of list) {
    const d = Math.hypot(f.x - x, f.z - z);
    // Ties go to the lower id, so the choice never depends on list order.
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best !== null && f.id < best.id)) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

/** True when the move from (x0, z0) to (x1, z1) is allowed by the wall: same side, or through an open gate. */
export function wallAllows(x0: number, z0: number, x1: number, z1: number, wallRadius: number, gate: Gate | null): boolean {
  if (wallRadius <= 0) return true;
  if (insideWall(x0, z0, wallRadius) === insideWall(x1, z1, wallRadius)) return true;
  if (!gate || !gate.destroyed) return false;
  return Math.hypot(x1 - gate.x, z1 - gate.z) <= TROOPS.gateHalfWidth && Math.hypot(x0 - gate.x, z0 - gate.z) <= TROOPS.gateHalfWidth + 1;
}

/**
 * Walks a troop toward a point until it is within `stop` of it. Crossing the wall goes by way of
 * the gate. Returns true once within `stop`.
 */
function move(t: Mutable<Troop>, toX: number, toZ: number, stop: number, world: TroopWorld, gate: Gate | null): boolean {
  const d = Math.hypot(toX - t.x, toZ - t.z);
  if (d <= stop) return true;
  let wx = toX;
  let wz = toZ;
  const { wallRadius } = world;
  if (wallRadius > 0 && gate && insideWall(t.x, t.z, wallRadius) !== insideWall(toX, toZ, wallRadius)) {
    // Head for the gate, keeping to our side of the wall until we are in front of it.
    const inside = insideWall(t.x, t.z, wallRadius);
    const gateAngle = Math.atan2(gate.x, gate.z);
    const myAngle = Math.atan2(t.x, t.z);
    const off = angleDelta(myAngle, gateAngle);
    const side = inside ? wallRadius - 1.6 : wallRadius + 1.6;
    if (Math.abs(off) > 0.12) {
      const step = myAngle + clamp(off, -0.4, 0.4);
      wx = Math.sin(step) * side;
      wz = Math.cos(step) * side;
    } else {
      // In front of the gate: through it (if it's open; otherwise wait at it).
      const nearGate = Math.hypot(gate.x - t.x, gate.z - t.z);
      wx = nearGate > 1.2 ? gate.x : toX;
      wz = nearGate > 1.2 ? gate.z : toZ;
      if (!gate.destroyed) {
        wx = (gate.x / Math.max(1e-6, Math.hypot(gate.x, gate.z))) * side;
        wz = (gate.z / Math.max(1e-6, Math.hypot(gate.x, gate.z))) * side;
      }
    }
  }
  const speed = SPEED_PER_TICK(t.type) * (t.slowedUntil > world.tick ? TROOPS.grabSlow : 1);
  const dx = wx - t.x;
  const dz = wz - t.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return d <= stop;
  const stepLen = Math.min(speed, len);
  let nx = t.x + (dx / len) * stepLen;
  let nz = t.z + (dz / len) * stepLen;
  const p = toBeach(nx, nz, world.beachRadius);
  nx = p.x;
  nz = p.z;
  if (wallAllows(t.x, t.z, nx, nz, wallRadius, gate)) {
    t.x = nx;
    t.z = nz;
  }
  t.facing = Math.atan2(dx, dz);
  return Math.hypot(toX - t.x, toZ - t.z) <= stop;
}

/** Pushes overlapping troops apart, keeping every push inside the beach and on the right side of the wall. */
function separate(alive: ReadonlyArray<Mutable<Troop>>, world: TroopWorld, gate: Gate | null): void {
  const live = alive.filter((t) => t.hp > 0 && !t.dead).sort((a, b) => a.id - b.id);
  const min = TROOPS.spacing;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      // Exactly on top of each other: part along a fixed direction from their ids.
      const ux = d > 1e-9 ? dx / d : Math.sin(a.id * 2.399 + b.id);
      const uz = d > 1e-9 ? dz / d : Math.cos(a.id * 2.399 + b.id);
      const push = (min - d) / 2;
      nudge(a, -ux * push, -uz * push, world, gate);
      nudge(b, ux * push, uz * push, world, gate);
    }
  }
}

function nudge(t: Mutable<Troop>, dx: number, dz: number, world: TroopWorld, gate: Gate | null): void {
  const p = toBeach(t.x + dx, t.z + dz, world.beachRadius);
  if (wallAllows(t.x, t.z, p.x, p.z, world.wallRadius, gate)) {
    t.x = p.x;
    t.z = p.z;
  }
}
