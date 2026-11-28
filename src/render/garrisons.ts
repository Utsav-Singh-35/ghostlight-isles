import * as THREE from 'three';
import { TROOPS } from '../sim/balance';
import { fortDifficulty, fortWalls } from '../sim/layout';
import { TAU } from '../sim/math';
import { TROOP_TYPES, type Troop, type TroopCounts, type TroopType } from '../sim/troops';
import type { World } from '../sim/world';
import { MeshBuilder, placed } from './meshBuilder';
import { PALETTE } from './palette';
import { TroopSet, type Team, type TroopView } from './troopMeshes';

/** Where Last Light's barracks stands, relative to the island's centre: beside the lighthouse, inside the ring of tower slots. */
export const BARRACKS_OFFSET = { x: 14, z: -10 } as const;

/**
 * Last Light's barracks: a small walled yard of pale stone with a timber hall, a gate facing the
 * lighthouse, a blue banner and two lanterns. Its feet are at y = 0.
 */
export function barracksGeometry(): { body: THREE.BufferGeometry; lamps: Array<[number, number, number]> } {
  const b = new MeshBuilder();
  const stone = '#9A9488';
  const cap = '#C9C2B2';
  const wood = '#7A5634';
  const half = 4.2;
  // Four low walls, with a gap for the gate on the side facing the lighthouse (−X).
  for (const [x, z, w, d] of [[0, half, half * 2, 0.6], [0, -half, half * 2, 0.6], [half, 0, 0.6, half * 2]] as const) {
    b.add(new THREE.BoxGeometry(w, 1.6, d), stone, placed([x, 0.6, z]));
    b.add(new THREE.BoxGeometry(w + 0.1, 0.16, d + 0.1), cap, placed([x, 1.45, z]), 1.15);
  }
  for (const z of [-half * 0.6, half * 0.6]) {
    b.add(new THREE.BoxGeometry(0.6, 1.6, half * 0.8), stone, placed([-half, 0.6, z]));
    b.add(new THREE.BoxGeometry(0.7, 0.16, half * 0.8 + 0.1), cap, placed([-half, 1.45, z]), 1.15);
  }
  // Corner posts.
  for (const [x, z] of [[half, half], [half, -half], [-half, half], [-half, -half]] as const) {
    b.add(new THREE.BoxGeometry(0.9, 2.2, 0.9), stone, placed([x, 0.9, z]), 0.95);
    b.add(new THREE.ConeGeometry(0.75, 0.8, 4), PALETTE.flag, placed([x, 2.4, z], [0, Math.PI / 4, 0]));
  }
  // The hall: plank walls, a pitched roof, a door.
  b.add(new THREE.BoxGeometry(3.4, 2.2, 4.0), wood, placed([1.4, 1.0, 0]));
  const roof = new THREE.CylinderGeometry(0.01, 2.4, 1.4, 4, 1);
  b.add(roof, '#3A302A', placed([1.4, 2.75, 0], [0, Math.PI / 4, 0], [1, 1, 1.25]));
  b.add(new THREE.BoxGeometry(0.06, 1.4, 1.0), '#2A1E16', placed([-0.32, 0.8, 0]));
  // Racks of weapons by the door.
  for (const z of [-1.4, 1.4]) {
    b.add(new THREE.BoxGeometry(0.1, 1.2, 0.8), wood, placed([-0.6, 0.6, z]));
    for (const dz of [-0.25, 0, 0.25]) b.add(new THREE.BoxGeometry(0.04, 1.3, 0.04), '#C8CED6', placed([-0.7, 0.75, z + dz], [0, 0, 0.15]), 1.2);
  }
  // A tall pole with the blue banner of your crew.
  b.add(new THREE.BoxGeometry(0.12, 5.4, 0.12), wood, placed([half - 0.6, 2.7, half - 0.6]));
  b.add(new THREE.BoxGeometry(0.04, 1.2, 1.8), PALETTE.teamMine, placed([half - 0.6, 4.6, half - 0.6 - 0.95]), 1.3);
  const lamps: Array<[number, number, number]> = [
    [-half - 0.3, 2.0, -half * 0.25],
    [-half - 0.3, 2.0, half * 0.25],
  ];
  for (const [x, y, z] of lamps) b.add(new THREE.BoxGeometry(0.12, 0.8, 0.12), wood, placed([x, y - 0.6, z]));
  return { body: b.build(), lamps };
}

/** A loop a patrol walks: its centre, radius and the ground under it, sampled once. */
interface Loop {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly heights: readonly number[];
  readonly speed: number;
}

interface Walker {
  readonly troop: Troop & { x: number; z: number; facing: number };
  readonly team: Team;
  readonly loop: Loop;
  readonly phase: number;
  /** True for a sentry who stands still and looks about. */
  readonly sentry: boolean;
  readonly islandId: number;
}

const SAMPLES = 32;

/**
 * The troops that live on the islands, idling in the open sea: Last Light's garrison walking round
 * its barracks, and each fort's ghost troops patrolling inside its walls. Drawn only.
 */
export class IslandGarrisons {
  readonly group = new THREE.Group();
  private readonly set = new TroopSet(140, false);
  private readonly walkers: Walker[] = [];
  private home: Walker[] = [];
  private captured: ReadonlySet<number> = new Set();
  private nextId = 1;

  constructor(
    private readonly world: World,
    private readonly groundAt: (islandId: number, x: number, z: number) => number,
  ) {
    this.group.name = 'island-garrisons';
    this.group.add(this.set.group);
    for (const island of world.islands) {
      if (island.kind !== 'haunted') continue;
      const level = fortDifficulty(island);
      const walls = fortWalls(island.radius, level, island.seed);
      const r = (TROOPS.keepRadius * 1.6 + walls.radius) / 2;
      const loop = this.loop(island.id, island.x, island.z, r, 0.18 + (island.seed % 7) * 0.01);
      this.add(TROOPS.fortGarrison[level - 1]!, 'ghost', loop, island.id, 0);
    }
  }

  /** Last Light's garrison, from the captain's crew ashore. */
  setHome(counts: TroopCounts): void {
    const home = this.world.islands[0]!;
    for (const w of this.home) this.walkers.splice(this.walkers.indexOf(w), 1);
    const x = home.x + BARRACKS_OFFSET.x;
    const z = home.z + BARRACKS_OFFSET.z;
    const loop = this.loop(home.id, x, z, 6.5, 0.22);
    const before = this.walkers.length;
    // Deckhands stand at the door; the rest walk the yard's walls, a few on watch.
    const { deckhand = 0, ...rest } = counts;
    this.add({ deckhand }, 'mine', this.loop(home.id, x - 5.2, z, 1.2, 0), home.id, 1);
    this.add(rest, 'mine', loop, home.id, 0.25);
    this.home = this.walkers.slice(before);
  }

  setCaptured(ids: ReadonlySet<number>): void {
    this.captured = ids;
  }

  update(time: number): void {
    const views: TroopView[] = [];
    for (const w of this.walkers) {
      if (this.captured.has(w.islandId)) continue;
      const { loop, troop } = w;
      const a = w.sentry ? w.phase : w.phase + time * loop.speed;
      const r = w.sentry ? loop.r : loop.r + Math.sin(a * 3 + w.phase * 5) * 0.4;
      troop.x = loop.x + Math.sin(a) * r;
      troop.z = loop.z + Math.cos(a) * r;
      // Walkers face along the loop; sentries look slowly about.
      troop.facing = w.sentry ? w.phase + Math.sin(time * 0.4 + w.phase * 3) * 1.2 : a + Math.PI / 2;
      views.push({ troop, team: w.team });
    }
    const height = (x: number, z: number) => this.heightNear(x, z);
    // Everyone walks; a standing sentry still reads as alive by its own sway.
    this.set.update(
      views.map((v) => v.troop),
      views,
      0.5,
      0,
      time,
      height,
    );
  }

  dispose(): void {
    this.set.dispose();
  }

  private loop(islandId: number, x: number, z: number, r: number, speed: number): Loop & { islandId: number } {
    const heights = Array.from({ length: SAMPLES }, (_, i) => {
      const a = (i / SAMPLES) * TAU;
      return this.groundAt(islandId, x + Math.sin(a) * r, z + Math.cos(a) * r);
    });
    return { x, z, r, heights, speed, islandId };
  }

  private add(counts: TroopCounts, team: Team, loop: Loop & { islandId: number }, islandId: number, sentryShare: number): void {
    const types: TroopType[] = [];
    for (const t of TROOP_TYPES) for (let i = 0; i < (counts[t] ?? 0); i++) types.push(t);
    types.forEach((type, i) => {
      const phase = (i / Math.max(1, types.length)) * TAU + islandId * 0.7;
      const hp = TROOPS.types[type].hp;
      const troop = { id: 50_000 + this.nextId++, type, side: 'island' as const, x: loop.x, z: loop.z, hp, maxHp: hp, cooldown: 0, slowedUntil: 0, postX: loop.x, postZ: loop.z, facing: 0, struckAt: -100, dead: false };
      this.walkers.push({ troop, team, loop, phase, sentry: i / Math.max(1, types.length) < sentryShare, islandId });
    });
  }

  /** Ground height under a walker: from the nearest loop's samples, so no raycasts run each frame. */
  private heightNear(x: number, z: number): number {
    let best: Loop | null = null;
    let bestD = Infinity;
    for (const w of this.walkers) {
      const d = Math.abs(Math.hypot(x - w.loop.x, z - w.loop.z) - w.loop.r);
      if (d < bestD) {
        bestD = d;
        best = w.loop;
        if (d < 0.6) break;
      }
    }
    if (!best) return 1;
    const a = Math.atan2(x - best.x, z - best.z);
    const f = (((a / TAU) % 1) + 1) % 1;
    const i = f * SAMPLES;
    const i0 = Math.floor(i) % SAMPLES;
    const i1 = (i0 + 1) % SAMPLES;
    const t = i - Math.floor(i);
    return best.heights[i0]! * (1 - t) + best.heights[i1]! * t;
  }
}
