/**
 * The battle simulation. Pure and deterministic: a BattleSetup plus the player's input events
 * always give the same battle, so the server can replay a fight and trust only its own result.
 */
import {
  BATTLE,
  DAMAGE_VS,
  DEFENSES,
  GHOSTS,
  GHOST_SHIP,
  TICK_SECONDS,
  WEAPONS,
  type ShipStats,
  type ShotKind,
  type TargetClass,
} from './balance';
import { cleanDefenses, mineSlotPosition, slotPosition, toLevel, type DefenseLevel, type DefenseType, type PlacedDefense } from './layout';
import { TAU, angleDelta, clamp, finiteOr, wrapAngle } from './math';
import { createRng, type Rng } from './rng';
import { stepShip, type ShipInput, type ShipState } from './ship';
import { collisionRadius, resolveCollisions, type World } from './world';

export type BattleMode = 'assault' | 'siege';
export type CrewState = 'none' | 'living' | 'ghost';
export type Side = 'player' | 'island' | 'ghost';
export type ShotType = ShotKind | 'barrel';

export interface Loadout {
  /** Maximum health of the player's ship. */
  readonly hull: number;
  /** Weapon levels: 1 to 3, or 0 for a weapon not yet unlocked. Cannons are always at least 1. */
  readonly cannon: number;
  readonly salt: number;
  readonly barrel: number;
  readonly bats: number;
  readonly gunner: CrewState;
  readonly navigator: CrewState;
}

export interface BattleIsland {
  readonly radius: number;
  /** True for a living island with a lighthouse keep; false for a haunted ghost light. */
  readonly living: boolean;
  readonly level: number;
  /** Seed for the island's shape. Visual only. */
  readonly seed: number;
  readonly slotCount: number;
  readonly mineSlotCount: number;
}

export interface BattleSetup {
  readonly seed: number;
  readonly mode: BattleMode;
  readonly island: BattleIsland;
  readonly defenses: readonly PlacedDefense[];
  readonly loadout: Loadout;
  readonly fleet: { readonly count: number; readonly level: number };
  readonly timeLimitSeconds: number;
}

/** Input flag bits. */
export const FLAG = { port: 1, starboard: 2, barrel: 4, bats: 8, salt: 16, retreat: 32 } as const;
const ALL_FLAGS = 63;

export interface BattleInput {
  readonly rudder: number;
  readonly sailLevel: number;
  readonly flags: number;
}

/** A change in the player's input: [tick it applies from, rudder, sail level, flags]. */
export type InputEvent = readonly [tick: number, rudder: number, sailLevel: number, flags: number];

/** The input a battle starts with, before the first event. */
export const DEFAULT_INPUT: BattleInput = { rudder: 0, sailLevel: 1, flags: 0 };

export interface Combatant {
  readonly id: number;
  readonly kind: 'player' | 'ghost';
  readonly ship: ShipState;
  readonly hp: number;
  readonly maxHp: number;
  /** Ticks until each broadside has reloaded (player only). */
  readonly reloadPort: number;
  readonly reloadStarboard: number;
  /** Ticks until a ghost fires again. */
  readonly cooldown: number;
  /** A ghost is slowed while the tick is below this. */
  readonly slowedUntil: number;
  readonly sunk: boolean;
  /** Which way a ghost circles the island. */
  readonly orbit: 1 | -1;
}

export interface Structure {
  readonly id: number;
  readonly type: DefenseType | 'keep';
  readonly level: DefenseLevel;
  /** Slot index, or −1 for the keep. */
  readonly slot: number;
  readonly x: number;
  readonly z: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly cooldown: number;
  readonly destroyed: boolean;
}

export interface Shot {
  readonly id: number;
  readonly kind: ShotType;
  readonly side: Side;
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
  readonly launchTick: number;
  readonly landTick: number;
  readonly damage: number;
  /** Area radius in metres, or 0 for a shot that hits one target. */
  readonly splash: number;
  readonly level: number;
  /** A ghost Gunner's cannonballs hit ghosts at full strength. */
  readonly pierce: boolean;
}

export interface FireZone {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly dps: number;
  readonly untilTick: number;
  readonly side: Side;
}

export type BattleEvent =
  | { readonly type: 'fire'; readonly kind: ShotType; readonly side: Side; readonly x: number; readonly z: number; readonly sourceId: number; readonly targetId: number | null }
  | { readonly type: 'land'; readonly kind: ShotType; readonly x: number; readonly z: number; readonly hitId: number | null; readonly splash: number }
  | { readonly type: 'destroyed'; readonly id: number; readonly structure: DefenseType | 'keep'; readonly x: number; readonly z: number }
  | { readonly type: 'sunk'; readonly id: number; readonly kind: 'player' | 'ghost'; readonly x: number; readonly z: number }
  | { readonly type: 'mine'; readonly id: number; readonly x: number; readonly z: number }
  | { readonly type: 'bats' };

export type BattleEndReason = 'destroyed' | 'sunk' | 'retreat' | 'time' | 'repelled' | 'overrun' | 'dawn';

export interface BattleResult {
  readonly reason: BattleEndReason;
  readonly ticks: number;
  /** Share of the island destroyed, 0 to 1. The keep counts BATTLE.keepWeight times; mines don't count. */
  readonly destruction: number;
  readonly keepDestroyed: boolean;
  readonly stars: number;
  readonly shipSunk: boolean;
  readonly ghostsSunk: number;
  readonly ghostsTotal: number;
  readonly hull: number;
  readonly maxHull: number;
}

export interface BattleState {
  readonly tick: number;
  /** The battle ends at this tick. */
  readonly limit: number;
  /** Random number generator state. */
  readonly rng: number;
  readonly setup: BattleSetup;
  readonly arena: World;
  readonly player: Combatant;
  readonly ghosts: readonly Combatant[];
  readonly structures: readonly Structure[];
  readonly shots: readonly Shot[];
  readonly fires: readonly FireZone[];
  readonly barrelCooldown: number;
  readonly batsCooldown: number;
  /** Bats reveal everything while the tick is below this. */
  readonly revealUntil: number;
  readonly nextId: number;
  /** What happened during the last tick, for effects and sound. */
  readonly events: readonly BattleEvent[];
  readonly result: BattleResult | null;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const SLOWED_GHOST: ShipStats = { ...GHOST_SHIP, maxSpeed: GHOST_SHIP.maxSpeed * GHOSTS.slowFactor };
const ARC_COS = Math.cos(BATTLE.firingArc);

/** Seconds to whole ticks, at least one. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds / TICK_SECONDS));
}

const weaponLevel = (n: number): number => clamp(Math.round(finiteOr(n, 0)), 0, 3);
const crewState = (c: unknown): CrewState => (c === 'living' || c === 'ghost' ? c : 'none');
const at = <T>(list: readonly T[], level: number): T => list[clamp(level, 1, list.length) - 1] as T;

/** Clamps every number in a setup into range, so any setup is safe to run. */
export function sanitizeSetup(raw: BattleSetup): BattleSetup {
  const island = raw.island;
  const slotCount = clamp(Math.round(finiteOr(island.slotCount, 6)), 1, 16);
  const mineSlotCount = clamp(Math.round(finiteOr(island.mineSlotCount, 3)), 0, 8);
  return {
    seed: Math.floor(finiteOr(raw.seed, 0)) >>> 0,
    mode: raw.mode === 'siege' ? 'siege' : 'assault',
    island: {
      radius: clamp(finiteOr(island.radius, 40), 15, 80),
      living: island.living === true,
      level: toLevel(island.level),
      seed: Math.floor(finiteOr(island.seed, 0)) >>> 0,
      slotCount,
      mineSlotCount,
    },
    defenses: cleanDefenses(raw.defenses ?? [], slotCount, mineSlotCount),
    loadout: {
      hull: clamp(finiteOr(raw.loadout.hull, 160), 1, 1000),
      cannon: clamp(weaponLevel(raw.loadout.cannon), 1, 3),
      salt: weaponLevel(raw.loadout.salt),
      barrel: weaponLevel(raw.loadout.barrel),
      bats: weaponLevel(raw.loadout.bats),
      gunner: crewState(raw.loadout.gunner),
      navigator: crewState(raw.loadout.navigator),
    },
    fleet: {
      count: clamp(Math.round(finiteOr(raw.fleet.count, 0)), 0, GHOSTS.maxFleet),
      level: clamp(Math.round(finiteOr(raw.fleet.level, 1)), 1, GHOSTS.maxLevel),
    },
    timeLimitSeconds: clamp(finiteOr(raw.timeLimitSeconds, BATTLE.timeLimitSeconds), BATTLE.minTimeLimitSeconds, BATTLE.maxTimeLimitSeconds),
  };
}

/** Damage a shot deals to one kind of target. */
export function shotDamage(kind: ShotKind, base: number, target: TargetClass, pierce = false): number {
  const multiplier = kind === 'ball' && target === 'ghost' && pierce ? 1 : DAMAGE_VS[kind][target];
  return base * multiplier;
}

/** How far the player's lantern reveals ghosts, metres. */
export function revealRadius(loadout: Loadout): number {
  return BATTLE.navigatorRevealRadius[loadout.navigator];
}

function revealed(
  tick: number,
  revealUntil: number,
  player: Combatant,
  structures: readonly Structure[],
  loadout: Loadout,
  ghost: Combatant,
): boolean {
  if (ghost.kind !== 'ghost' || tick < revealUntil) return true;
  const g = ghost.ship;
  if (!player.sunk && Math.hypot(player.ship.x - g.x, player.ship.z - g.z) <= revealRadius(loadout)) return true;
  for (const s of structures) {
    if (!s.destroyed && s.type === 'spiritLantern' && Math.hypot(s.x - g.x, s.z - g.z) <= DEFENSES.spiritLantern.range) return true;
  }
  return false;
}

/** True when a ghost can be seen and aimed at: near a standing Spirit Lantern, near the player's lantern, or under the Bat Swarm. */
export function isRevealed(state: BattleState, ghost: Combatant): boolean {
  return revealed(state.tick, state.revealUntil, state.player, state.structures, state.setup.loadout, ghost);
}

/** True when a mine should be drawn: near the player's ship or under the Bat Swarm (or when the player owns it). */
export function isMineVisible(state: BattleState, mine: Structure): boolean {
  if (state.setup.mode === 'siege' || state.tick < state.revealUntil) return true;
  const p = state.player.ship;
  const sight = state.setup.loadout.navigator === 'ghost' ? Infinity : BATTLE.mineSightRadius;
  return Math.hypot(p.x - mine.x, p.z - mine.z) <= sight;
}

/** Seconds left before the battle ends at dawn. */
export function timeLeft(state: BattleState): number {
  return Math.max(0, (state.limit - state.tick) * TICK_SECONDS);
}

/** Ticks a full broadside reload takes with this loadout. */
export function reloadTicks(loadout: Loadout): number {
  return secondsToTicks(WEAPONS.cannon.reloadSeconds * WEAPONS.gunnerReload[loadout.gunner]);
}

function makeArena(setup: BattleSetup): World {
  const { island } = setup;
  return {
    seed: setup.seed,
    radius: BATTLE.arenaRadius,
    islands: [{ id: 0, name: 'battle', kind: island.living ? 'home' : 'haunted', x: 0, z: 0, radius: island.radius, seed: island.seed }],
    spawn: { x: 0, z: 0, heading: 0 },
  };
}

function orbitRing(arena: World): number {
  return collisionRadius(arena.islands[0]!) + GHOSTS.orbitMargin;
}

/** Sets up a battle. The setup is sanitized first. */
export function createBattle(rawSetup: BattleSetup): BattleState {
  const setup = sanitizeSetup(rawSetup);
  const rng = createRng(setup.seed);
  const arena = makeArena(setup);
  const { island, loadout } = setup;
  let nextId = 1;

  const structures: Structure[] = [];
  const keepHp = at(DEFENSES.keep.hp, island.level);
  structures.push({ id: nextId++, type: 'keep', level: toLevel(island.level), slot: -1, x: 0, z: 0, hp: keepHp, maxHp: keepHp, cooldown: 0, destroyed: false });
  for (const d of setup.defenses) {
    const p = d.type === 'mine' ? mineSlotPosition(island.radius, d.slot, island.mineSlotCount) : slotPosition(island.radius, d.slot, island.slotCount);
    const hp = d.type === 'mine' ? 1 : at(DEFENSES[d.type].hp, d.level);
    structures.push({ id: nextId++, type: d.type, level: d.level, slot: d.slot, x: p.x, z: p.z, hp, maxHp: hp, cooldown: secondsToTicks(0.4 + rng.next()), destroyed: false });
  }

  const angle = rng.range(-Math.PI, Math.PI);
  const assault = setup.mode === 'assault';
  const spawnDistance = assault ? BATTLE.playerSpawnDistance : collisionRadius(arena.islands[0]!) + BATTLE.siegeSpawnMargin;
  const ship: ShipState = {
    x: Math.sin(angle) * spawnDistance,
    z: Math.cos(angle) * spawnDistance,
    heading: wrapAngle(assault ? angle + Math.PI : angle + Math.PI / 2),
    speed: BATTLE.startSpeed,
    sailLevel: 1,
    sail: 0.5,
    rudder: 0,
  };
  const player: Combatant = {
    id: nextId++,
    kind: 'player',
    ship,
    hp: loadout.hull,
    maxHp: loadout.hull,
    reloadPort: 0,
    reloadStarboard: 0,
    cooldown: 0,
    slowedUntil: 0,
    sunk: false,
    orbit: 1,
  };

  // A siege's fleet sails in from the edge of the arena. In an assault the ghosts are the fort's
  // own: they rise on the ring around the island and hunt the attacker.
  const ghosts: Combatant[] = [];
  const { count, level } = setup.fleet;
  if (!assault || count > 0) {
    const hp = at(GHOSTS.hp, level);
    const offset = rng.range(-Math.PI, Math.PI);
    const spawnRadius = assault ? orbitRing(arena) : GHOSTS.spawnRadius;
    for (let i = 0; i < count; i++) {
      const a = offset + (i / Math.max(1, count)) * TAU + rng.range(-0.3, 0.3);
      const orbit = i % 2 === 0 ? 1 : -1;
      ghosts.push({
        id: nextId++,
        kind: 'ghost',
        ship: {
          x: Math.sin(a) * spawnRadius,
          z: Math.cos(a) * spawnRadius,
          heading: wrapAngle(assault ? a + (orbit * Math.PI) / 2 : a + Math.PI),
          speed: GHOST_SHIP.maxSpeed * 0.6,
          sailLevel: 2,
          sail: 1,
          rudder: 0,
        },
        hp,
        maxHp: hp,
        reloadPort: 0,
        reloadStarboard: 0,
        cooldown: secondsToTicks(1 + rng.next() * 1.5),
        slowedUntil: 0,
        sunk: false,
        orbit,
      });
    }
  }

  return {
    tick: 0,
    limit: secondsToTicks(setup.timeLimitSeconds),
    rng: rng.state(),
    setup,
    arena,
    player,
    ghosts,
    structures,
    shots: [],
    fires: [],
    barrelCooldown: 0,
    batsCooldown: 0,
    revealUntil: 0,
    nextId,
    events: [],
    result: null,
  };
}

/** Steers a ghost onto a ring around the island, circling one way. */
function ghostSteer(ghost: Combatant, ring: number): ShipInput {
  const { x, z, heading } = ghost.ship;
  const d = Math.hypot(x, z);
  const around = Math.atan2(x, z);
  const error = d - ring;
  const lean = error > 0 ? Math.min(0.9, error * 0.02) : -Math.min(0.6, -error * 0.05);
  const desired = around + ghost.orbit * (Math.PI / 2 + lean);
  return { rudder: clamp(-angleDelta(heading, desired) * 2.5, -1, 1), sailLevel: 2 };
}

/** A fort's own ghost: patrols the ring around its island, and hunts the attacker once it comes near. */
function guardSteer(ghost: Combatant, player: Combatant, ring: number): ShipInput {
  const p = player.ship;
  if (player.sunk || Math.hypot(p.x, p.z) > ring + GHOSTS.guardReach) return ghostSteer(ghost, ring);
  const { x, z, heading } = ghost.ship;
  const dx = p.x - x;
  const dz = p.z - z;
  const toward = Math.atan2(dx, dz);
  // Close in, then circle the attacker inside its lantern light.
  const desired = Math.hypot(dx, dz) > GHOSTS.huntDistance ? toward : toward + ghost.orbit * (Math.PI / 2);
  return { rudder: clamp(-angleDelta(heading, desired) * 2.5, -1, 1), sailLevel: 2 };
}

/** Clamps one tick of input into range. */
export function sanitizeBattleInput(input: BattleInput): BattleInput {
  return {
    rudder: clamp(finiteOr(input.rudder, 0), -1, 1),
    sailLevel: clamp(Math.round(finiteOr(input.sailLevel, 1)), 0, 2),
    flags: Math.round(clamp(finiteOr(input.flags, 0), 0, ALL_FLAGS)) & ALL_FLAGS,
  };
}

interface Target {
  readonly id: number;
  readonly cls: TargetClass;
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly radius: number;
  /** Extra broadside range against this target, metres (the keep). */
  readonly reach: number;
}

function shipTarget(c: Combatant): Target {
  const s = c.ship;
  return {
    id: c.id,
    cls: c.kind === 'player' ? 'living' : 'ghost',
    x: s.x,
    z: s.z,
    vx: Math.sin(s.heading) * s.speed,
    vz: Math.cos(s.heading) * s.speed,
    radius: BATTLE.shipHitRadius,
    reach: 0,
  };
}

function structureTarget(s: Structure): Target {
  return { id: s.id, cls: 'structure', x: s.x, z: s.z, vx: 0, vz: 0, radius: BATTLE.structureHitRadius, reach: s.type === 'keep' ? BATTLE.keepReach : 0 };
}

function nearest(targets: readonly Target[], x: number, z: number, accept: (t: Target, d: number) => boolean): Target | null {
  let best: Target | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < bestD && accept(t, d)) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function flightTicks(distance: number, speed: number): number {
  return Math.max(1, Math.round(distance / speed / TICK_SECONDS));
}

/** Where to aim so a shot of this speed meets a moving target. */
function leadPoint(t: Target, fromX: number, fromZ: number, speed: number): { x: number; z: number } {
  const flight = flightTicks(Math.hypot(t.x - fromX, t.z - fromZ), speed) * TICK_SECONDS;
  return { x: t.x + t.vx * flight, z: t.z + t.vz * flight };
}

/** Advances a battle by one tick. Returns the same state once the battle has ended. */
export function stepBattle(state: BattleState, rawInput: BattleInput): BattleState {
  if (state.result) return state;
  const { setup, arena } = state;
  const { loadout } = setup;
  const assault = setup.mode === 'assault';
  const tick = state.tick + 1;
  const input = sanitizeBattleInput(rawInput);
  const rng: Rng = createRng(state.rng);
  const events: BattleEvent[] = [];

  const player: Mutable<Combatant> = { ...state.player };
  const ghosts: Array<Mutable<Combatant>> = state.ghosts.map((g) => ({ ...g }));
  const structures: Array<Mutable<Structure>> = state.structures.map((s) => ({ ...s }));

  if (assault && input.flags & FLAG.retreat) {
    return finish({ ...state, tick, events: [] }, 'retreat');
  }

  // Reveal status at the start of the tick decides what towers may aim at this tick.
  const visible = new Set<number>();
  for (const g of state.ghosts) if (!g.sunk && isRevealed(state, g)) visible.add(g.id);

  // 1. Ships move.
  if (!player.sunk) {
    player.ship = resolveCollisions(arena, stepShip(player.ship, { rudder: input.rudder, sailLevel: input.sailLevel }, TICK_SECONDS));
  }
  const ring = orbitRing(arena);
  for (const g of ghosts) {
    if (g.sunk) continue;
    const stats = g.slowedUntil > tick ? SLOWED_GHOST : GHOST_SHIP;
    const steer = assault ? guardSteer(g, player, ring) : ghostSteer(g, ring);
    g.ship = resolveCollisions(arena, stepShip(g.ship, steer, TICK_SECONDS, stats));
  }

  // Who each side can hit, after movement. In an assault the island's ghosts fight for the island.
  const living = player.sunk ? [] : [shipTarget(player)];
  const ghostTargets = ghosts.filter((g) => !g.sunk).map(shipTarget);
  const standing = structures.filter((s) => !s.destroyed && s.type !== 'mine').map(structureTarget);
  const hostileToPlayer = assault ? [...standing, ...ghostTargets] : ghostTargets;
  const hostileToIsland = assault ? living : ghostTargets;
  const hostileToGhosts = assault ? living : [...living, ...standing];
  const targetsOf = (side: Side): readonly Target[] => (side === 'player' ? hostileToPlayer : side === 'island' ? hostileToIsland : hostileToGhosts);

  const shots: Shot[] = state.shots.slice();
  const fires: FireZone[] = state.fires.filter((f) => f.untilTick > tick);
  let nextId = state.nextId;
  let barrelCooldown = Math.max(0, state.barrelCooldown - 1);
  let batsCooldown = Math.max(0, state.batsCooldown - 1);
  let revealUntil = state.revealUntil;

  const launch = (shot: Omit<Shot, 'id'>) => {
    shots.push({ ...shot, id: nextId++ });
    if (shots.length > BATTLE.maxShots) shots.shift();
  };

  // 2. The player's weapons.
  player.reloadPort = Math.max(0, player.reloadPort - 1);
  player.reloadStarboard = Math.max(0, player.reloadStarboard - 1);
  if (!player.sunk) {
    const s = player.ship;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const useSalt = (input.flags & FLAG.salt) !== 0 && loadout.salt > 0;
    const kind: ShotKind = useSalt ? 'salt' : 'ball';
    const damage = useSalt ? at(WEAPONS.salt.damage, loadout.salt) : at(WEAPONS.cannon.damage, loadout.cannon);
    const balls = at(WEAPONS.cannon.balls, loadout.cannon);
    const reload = reloadTicks(loadout);
    const candidates = targetsOf('player').filter((t) => t.cls !== 'ghost' || visible.has(t.id));

    const broadside = (sign: 1 | -1) => {
      // Port is (cos h, −sin h); starboard is the opposite.
      const sx = Math.cos(s.heading) * sign;
      const sz = -Math.sin(s.heading) * sign;
      const target = nearest(candidates, s.x, s.z, (t, d) => {
        if (d > WEAPONS.cannon.range + t.reach) return false;
        if (d < 1e-6) return true;
        return ((t.x - s.x) * sx + (t.z - s.z) * sz) / d >= ARC_COS;
      });
      for (let i = 0; i < balls; i++) {
        const along = (i - (balls - 1) / 2) * WEAPONS.cannon.spacing;
        const fromX = s.x + fx * along + sx * 2;
        const fromZ = s.z + fz * along + sz * 2;
        const aim = target ? leadPoint(target, fromX, fromZ, WEAPONS.cannon.shotSpeed) : { x: fromX + sx * 30, z: fromZ + sz * 30 };
        const toX = aim.x + rng.range(-WEAPONS.cannon.spread, WEAPONS.cannon.spread);
        const toZ = aim.z + rng.range(-WEAPONS.cannon.spread, WEAPONS.cannon.spread);
        launch({
          kind,
          side: 'player',
          fromX,
          fromZ,
          toX,
          toZ,
          launchTick: tick,
          landTick: tick + flightTicks(Math.hypot(toX - fromX, toZ - fromZ), WEAPONS.cannon.shotSpeed),
          damage,
          splash: 0,
          level: useSalt ? loadout.salt : loadout.cannon,
          pierce: loadout.gunner === 'ghost',
        });
      }
      events.push({ type: 'fire', kind, side: 'player', x: s.x + sx * 2, z: s.z + sz * 2, sourceId: player.id, targetId: target?.id ?? null });
    };

    if (input.flags & FLAG.port && player.reloadPort === 0) {
      broadside(1);
      player.reloadPort = reload;
    }
    if (input.flags & FLAG.starboard && player.reloadStarboard === 0) {
      broadside(-1);
      player.reloadStarboard = reload;
    }
    if (input.flags & FLAG.barrel && loadout.barrel > 0 && barrelCooldown === 0) {
      const fromX = s.x - fx * 6;
      const fromZ = s.z - fz * 6;
      launch({
        kind: 'barrel',
        side: 'player',
        fromX,
        fromZ,
        toX: fromX - fx * WEAPONS.barrel.throwDistance + rng.range(-1, 1),
        toZ: fromZ - fz * WEAPONS.barrel.throwDistance + rng.range(-1, 1),
        launchTick: tick,
        landTick: tick + secondsToTicks(WEAPONS.barrel.flightSeconds),
        damage: at(WEAPONS.barrel.dps, loadout.barrel),
        splash: at(WEAPONS.barrel.radius, loadout.barrel),
        level: loadout.barrel,
        pierce: false,
      });
      barrelCooldown = secondsToTicks(WEAPONS.barrel.cooldownSeconds);
      events.push({ type: 'fire', kind: 'barrel', side: 'player', x: fromX, z: fromZ, sourceId: player.id, targetId: null });
    }
    if (input.flags & FLAG.bats && loadout.bats > 0 && batsCooldown === 0) {
      revealUntil = tick + secondsToTicks(at(WEAPONS.bats.revealSeconds, loadout.bats));
      batsCooldown = secondsToTicks(WEAPONS.bats.cooldownSeconds);
      events.push({ type: 'bats' });
    }
  }

  // 3. The island's defenses fire.
  const islandTargets = targetsOf('island');
  for (const st of structures) {
    if (st.destroyed || st.type === 'keep' || st.type === 'mine') continue;
    st.cooldown = Math.max(0, st.cooldown - 1);
    if (st.cooldown > 0) continue;
    const type = st.type;
    const target = nearest(islandTargets, st.x, st.z, (t, d) => {
      if (type === 'boneCatapult') {
        if (d > DEFENSES.boneCatapult.range || d < DEFENSES.boneCatapult.minRange) return false;
      } else if (d > DEFENSES[type].range) {
        return false;
      }
      // Only Spirit Lanterns can aim at veiled ghosts.
      return t.cls !== 'ghost' || type === 'spiritLantern' || visible.has(t.id);
    });
    if (!target) continue;
    let toX: number;
    let toZ: number;
    let landTick: number;
    let kind: ShotKind;
    let splash = 0;
    let damage: number;
    if (type === 'boneCatapult') {
      toX = target.x + rng.range(-2, 2);
      toZ = target.z + rng.range(-2, 2);
      landTick = tick + secondsToTicks(DEFENSES.boneCatapult.flightSeconds);
      kind = 'stone';
      splash = DEFENSES.boneCatapult.splash;
      damage = at(DEFENSES.boneCatapult.damage, st.level);
    } else {
      const speed = DEFENSES[type].shotSpeed;
      const aim = leadPoint(target, st.x, st.z, speed);
      toX = aim.x + rng.range(-0.8, 0.8);
      toZ = aim.z + rng.range(-0.8, 0.8);
      landTick = tick + flightTicks(Math.hypot(toX - st.x, toZ - st.z), speed);
      kind = type === 'cannonTower' ? 'tower' : 'lantern';
      damage = at(DEFENSES[type].damage, st.level);
    }
    launch({ kind, side: 'island', fromX: st.x, fromZ: st.z, toX, toZ, launchTick: tick, landTick, damage, splash, level: st.level, pierce: false });
    st.cooldown = secondsToTicks(type === 'boneCatapult' ? DEFENSES.boneCatapult.reloadSeconds : DEFENSES[type].reloadSeconds);
    events.push({ type: 'fire', kind, side: 'island', x: st.x, z: st.z, sourceId: st.id, targetId: target.id });
  }

  // 4. Ghost ships fire: at structures and the ship in a siege, at the attacker in an assault.
  {
    const level = setup.fleet.level;
    const prey = targetsOf('ghost');
    for (const g of ghosts) {
      if (g.sunk) continue;
      g.cooldown = Math.max(0, g.cooldown - 1);
      if (g.cooldown > 0) continue;
      const target = nearest(prey, g.ship.x, g.ship.z, (_t, d) => d <= GHOSTS.range);
      if (!target) continue;
      const aim = leadPoint(target, g.ship.x, g.ship.z, GHOSTS.shotSpeed);
      const toX = aim.x + rng.range(-1, 1);
      const toZ = aim.z + rng.range(-1, 1);
      launch({
        kind: 'bolt',
        side: 'ghost',
        fromX: g.ship.x,
        fromZ: g.ship.z,
        toX,
        toZ,
        launchTick: tick,
        landTick: tick + flightTicks(Math.hypot(toX - g.ship.x, toZ - g.ship.z), GHOSTS.shotSpeed),
        damage: at(GHOSTS.damage, level),
        splash: 0,
        level,
        pierce: false,
      });
      g.cooldown = secondsToTicks(GHOSTS.reloadSeconds);
      events.push({ type: 'fire', kind: 'bolt', side: 'ghost', x: g.ship.x, z: g.ship.z, sourceId: g.id, targetId: target.id });
    }
  }

  // Damage goes to the working copies.
  const byId = new Map<number, Mutable<Structure> | Mutable<Combatant>>();
  for (const st of structures) byId.set(st.id, st);
  byId.set(player.id, player);
  for (const g of ghosts) byId.set(g.id, g);
  const hurt = (t: Target, kind: ShotKind, base: number, pierce: boolean, level: number) => {
    const amount = shotDamage(kind, base, t.cls, pierce);
    if (amount <= 0) return;
    const entity = byId.get(t.id);
    if (!entity) return;
    entity.hp = Math.max(0, entity.hp - amount);
    if (kind === 'salt' && t.cls === 'ghost' && 'slowedUntil' in entity) {
      entity.slowedUntil = Math.max(entity.slowedUntil, tick + secondsToTicks(at(WEAPONS.salt.slowSeconds, level)));
    }
  };

  // 5. Shots land.
  const flying: Shot[] = [];
  for (const shot of shots) {
    if (shot.landTick > tick) {
      flying.push(shot);
      continue;
    }
    if (shot.kind === 'barrel') {
      fires.push({
        id: nextId++,
        x: shot.toX,
        z: shot.toZ,
        radius: shot.splash,
        dps: shot.damage,
        untilTick: tick + secondsToTicks(WEAPONS.barrel.burnSeconds),
        side: shot.side,
      });
      events.push({ type: 'land', kind: 'barrel', x: shot.toX, z: shot.toZ, hitId: null, splash: shot.splash });
      continue;
    }
    const kind = shot.kind;
    const targets = targetsOf(shot.side);
    let hitId: number | null = null;
    if (shot.splash > 0) {
      for (const t of targets) {
        if (Math.hypot(t.x - shot.toX, t.z - shot.toZ) <= shot.splash + t.radius) {
          hurt(t, kind, shot.damage, shot.pierce, shot.level);
          hitId ??= t.id;
        }
      }
    } else {
      const t = nearest(targets, shot.toX, shot.toZ, (target, d) => d <= target.radius);
      if (t) {
        hurt(t, kind, shot.damage, shot.pierce, shot.level);
        hitId = t.id;
      }
    }
    events.push({ type: 'land', kind, x: shot.toX, z: shot.toZ, hitId, splash: shot.splash });
  }

  // 6. Witchfire burns.
  for (const f of fires) {
    for (const t of targetsOf(f.side)) {
      if (Math.hypot(t.x - f.x, t.z - f.z) <= f.radius + t.radius * 0.5) hurt(t, 'fire', f.dps * TICK_SECONDS, false, 1);
    }
  }

  // 7. Mines go off under hostile ships.
  const mineVictims = assault ? living : ghostTargets;
  for (const m of structures) {
    if (m.destroyed || m.type !== 'mine') continue;
    if (!mineVictims.some((v) => Math.hypot(v.x - m.x, v.z - m.z) <= DEFENSES.mine.triggerRadius)) continue;
    for (const v of mineVictims) {
      if (Math.hypot(v.x - m.x, v.z - m.z) <= DEFENSES.mine.splash) hurt(v, 'mine', at(DEFENSES.mine.damage, m.level), false, m.level);
    }
    m.hp = 0;
    m.destroyed = true;
    events.push({ type: 'mine', id: m.id, x: m.x, z: m.z });
  }

  // 8. Destroyed structures and sunk ships.
  for (const st of structures) {
    if (!st.destroyed && st.hp <= 0) {
      st.destroyed = true;
      events.push({ type: 'destroyed', id: st.id, structure: st.type, x: st.x, z: st.z });
    }
  }
  for (const c of [player, ...ghosts]) {
    if (!c.sunk && c.hp <= 0) {
      c.sunk = true;
      c.ship = { ...c.ship, speed: 0, sail: 0, sailLevel: 0, rudder: 0 };
      events.push({ type: 'sunk', id: c.id, kind: c.kind, x: c.ship.x, z: c.ship.z });
    }
  }

  const next: BattleState = {
    ...state,
    tick,
    rng: rng.state(),
    player,
    ghosts,
    structures,
    shots: flying,
    fires,
    barrelCooldown,
    batsCooldown,
    revealUntil,
    nextId,
    events,
    result: null,
  };

  // 9. Has the battle ended?
  let reason: BattleEndReason | null = null;
  if (assault) {
    if (standing.length === 0 || structures.every((s) => s.type === 'mine' || s.destroyed)) reason = 'destroyed';
    else if (player.sunk) reason = 'sunk';
    else if (tick >= state.limit) reason = 'time';
  } else if (structures.some((s) => s.type === 'keep' && s.destroyed)) {
    reason = 'overrun';
  } else if (ghosts.every((g) => g.sunk)) {
    reason = 'repelled';
  } else if (tick >= state.limit) {
    reason = 'dawn';
  }
  return reason ? finish(next, reason) : next;
}

/** Scores the island: destruction from 0 to 1 and stars from 0 to 3. */
export function scoreIsland(structures: readonly Structure[]): { destruction: number; keepDestroyed: boolean; stars: number } {
  let total = 0;
  let destroyed = 0;
  let keepDestroyed = false;
  for (const s of structures) {
    if (s.type === 'mine') continue;
    const weight = s.type === 'keep' ? BATTLE.keepWeight : 1;
    total += weight;
    if (s.destroyed) {
      destroyed += weight;
      if (s.type === 'keep') keepDestroyed = true;
    }
  }
  const destruction = total > 0 ? destroyed / total : 0;
  const stars = (destruction >= 0.5 ? 1 : 0) + (keepDestroyed ? 1 : 0) + (destruction >= 1 ? 1 : 0);
  return { destruction, keepDestroyed, stars };
}

function finish(state: BattleState, reason: BattleEndReason): BattleState {
  const score = scoreIsland(state.structures);
  return {
    ...state,
    result: {
      reason,
      ticks: state.tick,
      destruction: score.destruction,
      keepDestroyed: score.keepDestroyed,
      stars: score.stars,
      shipSunk: state.player.sunk,
      ghostsSunk: state.ghosts.filter((g) => g.sunk).length,
      ghostsTotal: state.ghosts.length,
      hull: state.player.hp,
      maxHull: state.player.maxHp,
    },
  };
}

function sameInput(a: BattleInput, b: BattleInput): boolean {
  return a.rudder === b.rudder && a.sailLevel === b.sailLevel && a.flags === b.flags;
}

/**
 * Records an input change for replay. Call it before stepping into `tick` with the input used
 * for that tick. Returns the input to compare against next time.
 */
export function recordInput(events: InputEvent[], last: BattleInput, tick: number, rawInput: BattleInput): BattleInput {
  const input = sanitizeBattleInput(rawInput);
  if (!sameInput(input, last)) events.push([tick, input.rudder, input.sailLevel, input.flags]);
  return input;
}

/** Turns untrusted input events into a clean list: well formed, clamped, sorted by tick and capped. */
export function sanitizeEvents(raw: unknown): InputEvent[] {
  if (!Array.isArray(raw)) return [];
  const limit = secondsToTicks(BATTLE.maxTimeLimitSeconds);
  const out: InputEvent[] = [];
  for (const entry of raw.slice(0, BATTLE.maxInputEvents)) {
    if (!Array.isArray(entry) || entry.length !== 4) continue;
    const [tick, rudder, sailLevel, flags] = entry as unknown[];
    if (typeof tick !== 'number' || typeof rudder !== 'number' || typeof sailLevel !== 'number' || typeof flags !== 'number') continue;
    if (!Number.isFinite(tick)) continue;
    const input = sanitizeBattleInput({ rudder, sailLevel, flags });
    out.push([clamp(Math.round(tick), 1, limit), input.rudder, input.sailLevel, input.flags]);
  }
  // A stable sort keeps the original order of events on the same tick; the last one wins.
  return out.sort((a, b) => a[0] - b[0]);
}

/** Replays a battle from its setup and input events, to the end. */
export function runBattle(setup: BattleSetup, rawEvents: unknown): BattleState {
  const events = sanitizeEvents(rawEvents);
  let state = createBattle(setup);
  let input = DEFAULT_INPUT;
  let i = 0;
  while (!state.result) {
    const tick = state.tick + 1;
    while (i < events.length && events[i]![0] <= tick) {
      const e = events[i]!;
      input = { rudder: e[1], sailLevel: e[2], flags: e[3] };
      i++;
    }
    state = stepBattle(state, input);
  }
  return state;
}
