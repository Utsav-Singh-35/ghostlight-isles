import * as THREE from 'three';
import { TAU } from '../sim/math';
import { createRng } from '../sim/rng';
import { MeshBuilder, placed, type Vec3 } from './meshBuilder';
import { PALETTE } from './palette';

const STONE = '#6F6B63';
const STONE_LIGHT = '#857F74';
const STONE_DARK = '#4F4C46';
const MOSS = '#46523A';
const SLATE = '#2C2F37';
const IRON = '#26262A';

/** Terrain height under a point given relative to the island's centre. */
export type GroundAt = (x: number, z: number) => number;

/** How much bigger the keep is at each keep level (1 to 3). */
export function keepScale(keepLevel: number): number {
  return 1 + 0.15 * (Math.min(3, Math.max(1, Math.round(keepLevel))) - 1);
}

/** The curtain wall's distance from the keep, metres: between the keep and the ring of tower slots. */
export function fortWallRadius(islandRadius: number): number {
  return Math.min(21, Math.max(8.5, islandRadius * 0.34));
}

/** The keep of a haunted island: a crooked black spire with a green ghost light on top. */
export function ghostSpireGeometry(): { body: THREE.BufferGeometry; lanternHeight: number } {
  const b = new MeshBuilder();
  b.add(new THREE.CylinderGeometry(3.2, 4.2, 2.4, 7).translate(0, 1.2, 0), PALETTE.hauntedRock);
  let y = 2.4;
  let x = 0;
  for (let i = 0; i < 4; i++) {
    const h = 2.4;
    const r = 1.6 - i * 0.28;
    b.add(new THREE.CylinderGeometry(r - 0.2, r, h, 6).translate(0, h / 2, 0), i % 2 ? '#2A2C33' : '#33363E', placed([x, y, 0], [0, i * 0.7, 0.05 * (i % 2 ? -1 : 1)]));
    y += h - 0.1;
    x += i % 2 ? -0.25 : 0.25;
  }
  b.add(new THREE.BoxGeometry(1.6, 0.14, 1.6).translate(x, y + 0.05, 0), IRON);
  b.add(new THREE.BoxGeometry(1.6, 0.14, 1.6).translate(x, y + 1.95, 0), IRON);
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]] as const) {
    b.add(new THREE.BoxGeometry(0.1, 1.9, 0.1).translate(x + dx, y + 1.0, dz), IRON);
  }
  b.add(new THREE.ConeGeometry(1.15, 1.3, 4).translate(x, y + 2.65, 0), IRON, placed([0, 0, 0], [0, Math.PI / 4, 0]));
  return { body: b.build(), lanternHeight: y + 1.0 };
}

/**
 * Adds a haunted fort to `b`: stone curtain walls around the keep with battlements and fallen
 * stones, a gate with a portcullis, mossy footings, and corner turrets with slate roofs or
 * spectral braziers. Higher levels get more sides, taller walls and bigger turrets.
 * `origin` moves the fort into place; returns where the braziers burn, in the same coordinates.
 */
export function addFort(b: MeshBuilder, islandRadius: number, level: number, seed: number, groundAt: GroundAt, origin: { readonly x: number; readonly z: number } = { x: 0, z: 0 }): Vec3[] {
  const rng = createRng(seed ^ 0x7a11);
  const sides = 5 + level;
  const wallR = fortWallRadius(islandRadius);
  const wallH = 2.2 + 0.45 * level;
  const thick = 0.9 + 0.1 * level;
  const turretR = 0.85 + 0.17 * level;
  const gate = rng.int(0, sides - 1);
  const start = rng.range(0, TAU);
  const flames: Vec3[] = [];
  const at = (x: number, y: number, z: number): Vec3 => [x + origin.x, y, z + origin.z];
  const corner = (k: number): [number, number] => {
    const a = start + (k / sides) * TAU;
    return [Math.sin(a) * wallR, Math.cos(a) * wallR];
  };

  for (let k = 0; k < sides; k++) {
    const [x0, z0] = corner(k);
    const [x1, z1] = corner(k + 1);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const heights = [groundAt(x0, z0), groundAt(x1, z1), groundAt(mx, mz)];
    const low = Math.min(...heights);
    const base = low - 0.8;
    const top = Math.max(...heights) + wallH;
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    // Along the wall, and out of its face.
    const ux = Math.sin(yaw);
    const uz = Math.cos(yaw);
    const nx = Math.cos(yaw);
    const nz = -Math.sin(yaw);
    const span = Math.hypot(x1 - x0, z1 - z0) - turretR * 1.4;

    /** A stretch of wall from `from` to `to` metres along the span, measured from its middle. */
    const stretch = (from: number, to: number) => {
      const length = to - from;
      const c = (from + to) / 2;
      const cx = mx + ux * c;
      const cz = mz + uz * c;
      b.add(new THREE.BoxGeometry(thick, top - base, length), STONE, placed(at(cx, (base + top) / 2, cz), [0, yaw, 0]), rng.range(0.9, 1.05));
      b.add(new THREE.BoxGeometry(thick * 1.12, 0.7, length * 1.01), MOSS, placed(at(cx, low + 0.1, cz), [0, yaw, 0]), rng.range(0.8, 1));
      // Battlements, with some stones fallen.
      const count = Math.max(1, Math.floor(length / 1.3));
      for (let m = 0; m < count; m++) {
        if (rng.next() < 0.2) continue;
        const t = from + ((m + 0.5) / count) * length;
        b.add(new THREE.BoxGeometry(thick * 1.04, 0.62, 0.66), STONE_LIGHT, placed(at(mx + ux * t, top + 0.31, mz + uz * t), [0, yaw, 0]), rng.range(0.85, 1.05));
      }
      // Blocks standing proud of both faces, so the wall reads as masonry.
      for (let s = 0; s < 2 + level; s++) {
        const t = from + rng.next() * length;
        const y = base + 1.2 + rng.next() * Math.max(0.2, top - base - 1.8);
        const out = (rng.next() < 0.5 ? -1 : 1) * (thick / 2);
        b.add(new THREE.BoxGeometry(0.16, 0.45, rng.range(0.6, 1.1)), STONE_DARK, placed(at(mx + ux * t + nx * out, y, mz + uz * t + nz * out), [0, yaw, 0]), rng.range(0.85, 1.1));
      }
    };

    if (k === gate) {
      const gap = Math.min(3.4, span * 0.4);
      stretch(-span / 2, -gap / 2);
      stretch(gap / 2, span / 2);
      // A lintel over the gate and an iron portcullis.
      b.add(new THREE.BoxGeometry(thick * 1.15, 1.0, gap + 0.8), STONE_DARK, placed(at(mx, top - 0.5, mz), [0, yaw, 0]));
      const barHeight = top - base - 1.0;
      for (let i = 0; i < 4; i++) {
        const t = -gap / 2 + ((i + 0.5) / 4) * gap;
        b.add(new THREE.BoxGeometry(0.12, barHeight, 0.12), IRON, placed(at(mx + ux * t, base + barHeight / 2, mz + uz * t), [0, yaw, 0]));
      }
      b.add(new THREE.BoxGeometry(0.1, 0.12, gap), IRON, placed(at(mx, low + 1.6, mz), [0, yaw, 0]));
    } else {
      stretch(-span / 2, span / 2);
    }
  }

  for (let k = 0; k < sides; k++) {
    const [cx, cz] = corner(k);
    const ground = groundAt(cx, cz);
    const bottom = ground - 0.8;
    const top = ground + wallH + 1.3 + 0.2 * level;
    b.add(new THREE.CylinderGeometry(turretR, turretR * 1.15, top - bottom, 8), STONE, placed(at(cx, (bottom + top) / 2, cz)), rng.range(0.88, 1.02));
    b.add(new THREE.CylinderGeometry(turretR * 1.12, turretR * 1.12, 0.3, 8), STONE_DARK, placed(at(cx, top, cz)));
    for (let m = 0; m < 6; m++) {
      const a = (m / 6) * TAU + k;
      b.add(new THREE.BoxGeometry(0.42, 0.5, 0.42), STONE_LIGHT, placed(at(cx + Math.sin(a) * turretR * 0.9, top + 0.4, cz + Math.cos(a) * turretR * 0.9), [0, a, 0]));
    }
    if (k % 2 === 0) {
      const roof = 1.5 + 0.25 * level;
      b.add(new THREE.ConeGeometry(turretR * 1.3, roof, 8), SLATE, placed(at(cx, top + 0.15 + roof / 2, cz)));
    } else {
      b.add(new THREE.CylinderGeometry(0.38, 0.22, 0.45, 6), IRON, placed(at(cx, top + 0.4, cz)));
      flames.push(at(cx, top + 0.95, cz));
    }
  }
  return flames;
}

/** Spectral flames for a fort's braziers: one merged mesh of small glowing spikes. */
export function flameGeometry(points: readonly Vec3[]): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const [x, y, z] of points) {
    b.add(new THREE.OctahedronGeometry(0.34, 0), PALETTE.spectral, placed([x, y, z], [0, 0, 0], [1, 1.7, 1]));
  }
  return b.build();
}

/** True when a prop at distance `d` from the island's centre would stand in the fort's wall or keep. */
export function blockedByFort(d: number, islandRadius: number): boolean {
  return d < 6.5 || Math.abs(d - fortWallRadius(islandRadius)) < 2.6;
}
