import * as THREE from 'three';
import { TICK_SECONDS } from '../sim/balance';
import { GHOST_TROOPS, TROOP_TYPES, type Troop, type TroopType } from '../sim/troops';
import { MeshBuilder, placed, vertexColorMaterial } from './meshBuilder';
import { PALETTE } from './palette';

/**
 * The crew and the dead, as low-poly figures facing +Z with their feet at y = 0. Living crew wear
 * a warm lantern colour somewhere on them; the dead are bone and spectral green, and see-through.
 * Each has its own outline, so they read apart without colour.
 */

const SKIN = PALETTE.crewSkin;
const LANTERN = '#FFC266';
const IRON = '#2C2C32';
const STEEL = '#9AA0A8';
const WOOD = '#6A4A2C';
const BONE = '#D8CDB2';
const SPECTRAL = '#7DFFC4';

type B = MeshBuilder;

function legs(b: B, color: string, spread = 0.14, height = 0.8, width = 0.16): void {
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(width, height, width * 1.2), color, placed([s * spread, height / 2, 0]));
}

function arm(b: B, side: number, y: number, x: number, color: string, out = 0.35, forward = 0, length = 0.62): void {
  b.add(new THREE.BoxGeometry(0.13, length, 0.13), color, placed([side * x, y - length / 2 + 0.08, forward], [forward * -0.8, 0, side * out]));
}

function head(b: B, y: number, r = 0.2, color: string = SKIN): void {
  b.add(new THREE.SphereGeometry(r, 7, 6), color, placed([0, y, 0], [0, 0, 0], [1, 1.08, 1]));
}

function lantern(b: B, x: number, y: number, z: number, size = 0.13): void {
  b.add(new THREE.BoxGeometry(size, size * 1.3, size), LANTERN, placed([x, y, z]), 1.6);
  b.add(new THREE.BoxGeometry(size * 1.2, 0.03, size * 1.2), IRON, placed([x, y + size * 0.7, z]));
}

/** Short and stocky, sleeves rolled, a mallet in hand and a plank on his back. */
function deckhand(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#3A3A44', 0.15, 0.6, 0.18);
  b.add(new THREE.BoxGeometry(0.58, 0.62, 0.36), '#8A6440', placed([0, 0.92, 0]));
  b.add(new THREE.BoxGeometry(0.6, 0.1, 0.38), '#3A2A1E', placed([0, 0.66, 0]));
  head(b, 1.42, 0.22);
  b.add(new THREE.CylinderGeometry(0.23, 0.24, 0.12, 8), '#5A4630', placed([0, 1.58, 0]));
  arm(b, -1, 1.18, 0.36, SKIN, 0.25);
  arm(b, 1, 1.18, 0.36, SKIN, 0.1, 0.18);
  b.add(new THREE.BoxGeometry(0.06, 0.55, 0.06), WOOD, placed([0.42, 0.8, 0.34], [0.3, 0, 0]));
  b.add(new THREE.BoxGeometry(0.22, 0.16, 0.16), IRON, placed([0.42, 1.06, 0.42]));
  b.add(new THREE.BoxGeometry(0.16, 1.3, 0.05), '#9A7A50', placed([0, 1.0, -0.24], [0, 0, 0.5]));
  lantern(b, -0.3, 0.62, 0.2, 0.11);
  return b.build();
}

/** Lean, red bandana, striped shirt, cutlass held high, bare feet. */
function buccaneer(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#2E3A52', 0.12, 0.82, 0.14);
  for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(0.42, 0.14, 0.26), i % 2 ? '#E8E2D4' : '#2E3A6A', placed([0, 0.92 + i * 0.14, 0]));
  b.add(new THREE.BoxGeometry(0.46, 0.08, 0.28), LANTERN, placed([0, 0.88, 0]), 1.1);
  head(b, 1.62, 0.2);
  b.add(new THREE.SphereGeometry(0.21, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#B0302A', placed([0, 1.66, 0]));
  b.add(new THREE.BoxGeometry(0.05, 0.05, 0.28), '#B0302A', placed([0, 1.63, -0.3], [0.5, 0, 0]));
  arm(b, -1, 1.42, 0.27, SKIN, 0.3);
  // The sword arm, raised.
  b.add(new THREE.BoxGeometry(0.12, 0.6, 0.12), SKIN, placed([0.3, 1.66, 0.05], [0, 0, -2.6]));
  b.add(new THREE.BoxGeometry(0.05, 0.85, 0.12), STEEL, placed([0.44, 2.25, 0.05], [0, 0, -0.3]), 1.2);
  b.add(new THREE.BoxGeometry(0.2, 0.05, 0.14), LANTERN, placed([0.36, 1.88, 0.05], [0, 0, -0.3]));
  return b.build();
}

/** Wide and hunched behind a round shield made from a ship's wheel; iron helmet, short axe. */
function shieldbearer(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#3E3A34', 0.2, 0.7, 0.2);
  b.add(new THREE.BoxGeometry(0.78, 0.72, 0.5), '#5E4A36', placed([0, 1.06, 0], [0.18, 0, 0]));
  head(b, 1.6, 0.22);
  b.add(new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), IRON, placed([0, 1.64, 0]));
  b.add(new THREE.BoxGeometry(0.05, 0.2, 0.1), IRON, placed([0, 1.55, 0.24]));
  // The wheel: a rim, spokes and handles, held in front.
  const rim = new THREE.TorusGeometry(0.58, 0.07, 5, 14);
  b.add(rim, WOOD, placed([0, 1.0, 0.48]));
  b.add(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 14), '#7A5A38', placed([0, 1.0, 0.45], [Math.PI / 2, 0, 0]));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.06, 0.32, 0.06), WOOD, placed([Math.sin(a) * 0.72, 1.0 + Math.cos(a) * 0.72, 0.48], [0, 0, -a]));
  }
  b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), LANTERN, placed([0, 1.0, 0.5], [Math.PI / 2, 0, 0]), 1.3);
  b.add(new THREE.BoxGeometry(0.06, 0.6, 0.06), WOOD, placed([0.5, 1.2, 0.0], [0, 0, -0.4]));
  b.add(new THREE.BoxGeometry(0.06, 0.2, 0.26), STEEL, placed([0.62, 1.48, 0.0], [0, 0, -0.4]), 1.2);
  return b.build();
}

/** Tall and thin in a long coat; a hooded lantern on a pole over her shoulder, and a curved bow. */
function archer(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#2C3028', 0.1, 0.9, 0.12);
  b.add(new THREE.CylinderGeometry(0.2, 0.32, 1.0, 7), '#3E4A3A', placed([0, 1.1, 0]));
  head(b, 1.78, 0.17);
  b.add(new THREE.ConeGeometry(0.24, 0.42, 7), '#2E3A2C', placed([0, 1.9, -0.03]));
  arm(b, -1, 1.55, 0.22, '#3E4A3A', 0.15, 0.25);
  arm(b, 1, 1.55, 0.22, '#3E4A3A', 0.6);
  // The bow: an arc of short pieces.
  for (let k = 0; k < 7; k++) {
    const a = -0.9 + (k / 6) * 1.8;
    b.add(new THREE.BoxGeometry(0.05, 0.26, 0.05), WOOD, placed([-0.3 + Math.cos(a) * 0.08, 1.35 + Math.sin(a) * 0.7, 0.42 + Math.cos(a) * 0.12], [0, 0, a]));
  }
  b.add(new THREE.BoxGeometry(0.02, 1.3, 0.02), BONE, placed([-0.36, 1.35, 0.36]));
  b.add(new THREE.BoxGeometry(0.05, 1.5, 0.05), WOOD, placed([0.18, 1.7, -0.2], [0.25, 0, -0.2]));
  lantern(b, 0.34, 2.42, -0.38, 0.16);
  return b.build();
}

/** A small kid under a huge keg, its fuse sparking. */
function powderMonkey(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#4A3A2A', 0.1, 0.5, 0.12);
  b.add(new THREE.BoxGeometry(0.36, 0.4, 0.24), '#8A2E2A', placed([0, 0.7, 0]));
  head(b, 1.04, 0.18);
  arm(b, -1, 1.02, 0.22, SKIN, -2.6);
  arm(b, 1, 1.02, 0.22, SKIN, 2.6);
  b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.6, 9), '#4A3524', placed([0, 1.52, 0], [0, 0, Math.PI / 2]));
  for (const x of [-0.22, 0.22]) b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 9), '#8A1E1A', placed([x, 1.52, 0], [0, 0, Math.PI / 2]));
  b.add(new THREE.BoxGeometry(0.03, 0.3, 0.03), '#2A2020', placed([0.1, 1.95, 0], [0, 0, 0.5]));
  b.add(new THREE.OctahedronGeometry(0.09, 0), LANTERN, placed([0.2, 2.1, 0]), 1.8);
  return b.build();
}

/** Huge and broad, chains across the chest, swinging a ship's anchor; one eye a glowing lantern. */
function brute(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#3A3028', 0.3, 0.95, 0.3);
  b.add(new THREE.BoxGeometry(1.2, 1.0, 0.72), '#6E5642', placed([0, 1.45, 0]));
  b.add(new THREE.BoxGeometry(1.0, 0.3, 0.6), SKIN, placed([0, 2.05, 0]));
  head(b, 2.4, 0.26);
  b.add(new THREE.BoxGeometry(0.12, 0.08, 0.04), '#141414', placed([-0.1, 2.44, 0.25]));
  b.add(new THREE.SphereGeometry(0.07, 6, 5), LANTERN, placed([0.1, 2.44, 0.24]), 1.8);
  // Chains crossing the chest.
  for (let k = 0; k < 7; k++) b.add(new THREE.TorusGeometry(0.07, 0.025, 4, 6), IRON, placed([-0.5 + k * 0.17, 1.2 + k * 0.12, 0.37], [0, Math.PI / 2, 0]));
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.26, 0.9, 0.26), SKIN, placed([s * 0.75, 1.6, 0.05], [0, 0, s * 0.3]));
  // The anchor: shank, stock and flukes, held by the right hand.
  b.add(new THREE.BoxGeometry(0.12, 1.4, 0.12), IRON, placed([0.95, 1.4, 0.35]));
  b.add(new THREE.BoxGeometry(0.7, 0.1, 0.1), IRON, placed([0.95, 2.0, 0.35]));
  b.add(new THREE.TorusGeometry(0.4, 0.07, 5, 10, Math.PI), IRON, placed([0.95, 0.75, 0.35], [0, 0, Math.PI]));
  b.add(new THREE.ConeGeometry(0.1, 0.22, 4), IRON, placed([0.55, 0.78, 0.35], [0, 0, 0.6]));
  b.add(new THREE.ConeGeometry(0.1, 0.22, 4), IRON, placed([1.35, 0.78, 0.35], [0, 0, -0.6]));
  return b.build();
}

/** A long stained apron, a bone saw on her belt, a bag of bandages, and an amber lantern held up. */
function surgeon(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#2E2A30', 0.11, 0.82, 0.13);
  b.add(new THREE.BoxGeometry(0.46, 0.75, 0.28), '#4A3A4A', placed([0, 1.2, 0]));
  b.add(new THREE.BoxGeometry(0.48, 1.0, 0.04), '#D8D0B8', placed([0, 1.0, 0.16]));
  for (const [x, y] of [[-0.1, 0.8], [0.12, 1.1], [0, 0.6]] as const) b.add(new THREE.BoxGeometry(0.1, 0.08, 0.02), '#7A1E1A', placed([x, y, 0.19]));
  head(b, 1.78, 0.19);
  b.add(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 8), '#2A2A2A', placed([0, 1.95, 0]));
  arm(b, -1, 1.5, 0.27, '#4A3A4A', 0.3);
  b.add(new THREE.BoxGeometry(0.12, 0.6, 0.12), '#4A3A4A', placed([0.3, 1.8, 0.05], [0, 0, -2.7]));
  lantern(b, 0.44, 2.3, 0.05, 0.17);
  b.add(new THREE.BoxGeometry(0.3, 0.24, 0.16), '#6A4A2A', placed([-0.32, 0.95, -0.05]));
  b.add(new THREE.BoxGeometry(0.04, 0.32, 0.1), BONE, placed([0.26, 0.9, 0.12], [0, 0, 0.2]));
  return b.build();
}

/** A skeleton with a rusted sword, jaw hanging open. */
function rattler(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.07, 0.82, 0.07), BONE, placed([s * 0.12, 0.41, 0]));
  b.add(new THREE.BoxGeometry(0.36, 0.1, 0.16), BONE, placed([0, 0.86, 0]));
  b.add(new THREE.BoxGeometry(0.06, 0.6, 0.06), BONE, placed([0, 1.15, 0]));
  for (let r = 0; r < 4; r++) b.add(new THREE.BoxGeometry(0.36 - r * 0.04, 0.04, 0.22), BONE, placed([0, 1.05 + r * 0.11, 0.02]));
  b.add(new THREE.SphereGeometry(0.19, 7, 6), BONE, placed([0, 1.62, 0.02]));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.06, 5, 4), '#0A120E', placed([s * 0.07, 1.64, 0.17]));
  b.add(new THREE.BoxGeometry(0.2, 0.07, 0.14), BONE, placed([0, 1.42, 0.1], [0.4, 0, 0]));
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.06, 0.6, 0.06), BONE, placed([s * 0.24, 1.2, 0.05], [0, 0, s * 0.3]));
  b.add(new THREE.BoxGeometry(0.05, 0.75, 0.1), '#6A4A3A', placed([0.38, 1.25, 0.25], [0.6, 0, -0.2]));
  return b.build();
}

/** Bloated and dripping, wrapped in seaweed, reaching out. */
function grabber(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#4A6A5A', 0.17, 0.62, 0.2);
  b.add(new THREE.SphereGeometry(0.46, 8, 7), '#6A8A78', placed([0, 1.05, 0], [0, 0, 0], [1, 1.1, 0.9]));
  for (let k = 0; k < 5; k++) b.add(new THREE.TorusGeometry(0.44, 0.04, 4, 10), '#2E4A2A', placed([0, 0.8 + k * 0.12, 0], [Math.PI / 2 + k * 0.2, 0, k * 0.4]));
  head(b, 1.6, 0.2, '#7A9A88');
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.16, 0.16, 0.7), '#6A8A78', placed([s * 0.42, 1.2, 0.4]));
  for (let k = 0; k < 4; k++) b.add(new THREE.BoxGeometry(0.04, 0.4, 0.04), '#2E4A2A', placed([-0.3 + k * 0.2, 0.55, 0.3]));
  return b.build();
}

/** A floating hooded shape with no legs, drawing a green bow. */
function wraithArcher(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.ConeGeometry(0.42, 1.5, 7, 1, true), '#3A6A58', placed([0, 1.05, 0], [Math.PI, 0, 0]));
  b.add(new THREE.CylinderGeometry(0.16, 0.36, 0.7, 7), '#3A6A58', placed([0, 1.6, 0]));
  b.add(new THREE.ConeGeometry(0.26, 0.5, 7), '#2A4A40', placed([0, 2.12, -0.03]));
  b.add(new THREE.SphereGeometry(0.15, 6, 5), '#0A120E', placed([0, 1.98, 0.07]));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.035, 4, 3), SPECTRAL, placed([s * 0.05, 2.0, 0.19]), 1.6);
  for (let k = 0; k < 7; k++) {
    const a = -0.9 + (k / 6) * 1.8;
    b.add(new THREE.BoxGeometry(0.05, 0.24, 0.05), SPECTRAL, placed([-0.3 + Math.cos(a) * 0.08, 1.6 + Math.sin(a) * 0.62, 0.42]), 1.3);
  }
  return b.build();
}

/** A giant skeleton carrying its own skull like a lantern. */
function bosun(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.14, 1.3, 0.14), BONE, placed([s * 0.26, 0.65, 0]));
  b.add(new THREE.BoxGeometry(0.7, 0.16, 0.3), BONE, placed([0, 1.36, 0]));
  b.add(new THREE.BoxGeometry(0.1, 1.0, 0.1), BONE, placed([0, 1.85, 0]));
  for (let r = 0; r < 5; r++) b.add(new THREE.BoxGeometry(0.8 - r * 0.07, 0.07, 0.4), BONE, placed([0, 1.55 + r * 0.16, 0.03]));
  b.add(new THREE.BoxGeometry(1.0, 0.14, 0.3), BONE, placed([0, 2.4, 0]));
  // No head on the shoulders: it hangs from the left hand, lit from inside.
  b.add(new THREE.BoxGeometry(0.12, 1.0, 0.12), BONE, placed([-0.62, 1.95, 0.1], [0, 0, 0.15]));
  b.add(new THREE.SphereGeometry(0.26, 7, 6), BONE, placed([-0.72, 1.3, 0.2]));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.08, 5, 4), SPECTRAL, placed([-0.72 + s * 0.1, 1.33, 0.42]), 1.8);
  b.add(new THREE.BoxGeometry(0.12, 1.0, 0.12), BONE, placed([0.62, 1.95, 0.25], [0.6, 0, -0.15]));
  b.add(new THREE.BoxGeometry(0.1, 1.3, 0.22), '#5A5A60', placed([0.66, 2.5, 0.75], [1.0, 0, 0]));
  return b.build();
}

const BUILDERS: Readonly<Record<TroopType, () => THREE.BufferGeometry>> = {
  deckhand,
  buccaneer,
  shieldbearer,
  archer,
  powderMonkey,
  brute,
  surgeon,
  rattler,
  grabber,
  wraithArcher,
  bosun,
};

/** Every troop is drawn this many times its real size, so a figure reads from the battle camera. */
export const TROOP_DRAW_SCALE = 1.8;

/** One instanced mesh per troop type, living ones solid and the dead see-through and glowing. */
export class TroopSet {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<TroopType, THREE.InstancedMesh>();
  private readonly living = vertexColorMaterial();
  private readonly ghostly = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    emissive: new THREE.Color(PALETTE.spectral).multiplyScalar(0.35),
    depthWrite: false,
    flatShading: true,
  });
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  /** When each fallen troop fell, render seconds. */
  private readonly fellAt = new Map<number, number>();

  constructor(capacity = 48) {
    for (const type of TROOP_TYPES) {
      const ghost = (GHOST_TROOPS as readonly string[]).includes(type);
      const mesh = new THREE.InstancedMesh(BUILDERS[type](), ghost ? this.ghostly : this.living, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `troop-${type}`;
      if (ghost) mesh.renderOrder = 3;
      this.meshes.set(type, mesh);
      this.group.add(mesh);
    }
  }

  /** Draws troops between two ticks. `groundAt` gives the terrain height at a point. */
  update(prev: readonly Troop[], current: readonly Troop[], alpha: number, tick: number, time: number, groundAt: (x: number, z: number) => number): void {
    const before = new Map(prev.map((t) => [t.id, t]));
    const counts = new Map<TroopType, number>();
    for (const t of current) {
      const mesh = this.meshes.get(t.type)!;
      let fallen = 0;
      if (t.dead) {
        if (!this.fellAt.has(t.id)) this.fellAt.set(t.id, time);
        fallen = time - this.fellAt.get(t.id)!;
        // The fallen lie a while, then sink away.
        if (fallen > 3) continue;
      }
      const index = counts.get(t.type) ?? 0;
      if (index >= mesh.instanceMatrix.count) continue;
      counts.set(t.type, index + 1);
      const p = before.get(t.id) ?? t;
      const x = p.x + (t.x - p.x) * alpha;
      const z = p.z + (t.z - p.z) * alpha;
      const moving = Math.hypot(t.x - p.x, t.z - p.z) > 1e-4;
      const ghost = (GHOST_TROOPS as readonly string[]).includes(t.type);
      const sinceStrike = (tick - t.struckAt) * TICK_SECONDS;
      const lunge = sinceStrike >= 0 && sinceStrike < 0.25 ? Math.sin((sinceStrike / 0.25) * Math.PI) * 0.35 : 0;
      const bob = moving ? Math.abs(Math.sin(time * 9 + t.id)) * 0.12 : 0;
      const hover = ghost ? 0.25 + Math.sin(time * 2 + t.id) * 0.12 : 0;
      this.pos.set(x, groundAt(x, z) - 0.05 + bob + hover - (fallen > 1.5 ? (fallen - 1.5) * 0.6 : 0), z);
      this.euler.set(t.dead ? -Math.min(1.45, fallen * 4) : lunge, t.facing, moving ? Math.sin(time * 9 + t.id) * 0.06 : 0, 'YXZ');
      this.quat.setFromEuler(this.euler);
      this.scale.setScalar(TROOP_DRAW_SCALE);
      this.matrix.compose(this.pos, this.quat, this.scale);
      mesh.setMatrixAt(index, this.matrix);
    }
    for (const [type, mesh] of this.meshes) {
      mesh.count = counts.get(type) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Lines every troop type up in a row, for looking at the art. */
  lineup(x: number, z: number, heading: number, groundAt: (x: number, z: number) => number, time: number): void {
    const px = Math.cos(heading);
    const pz = -Math.sin(heading);
    TROOP_TYPES.forEach((type, i) => {
      const mesh = this.meshes.get(type)!;
      const offset = (i - (TROOP_TYPES.length - 1) / 2) * 2.4;
      const tx = x + px * offset;
      const tz = z + pz * offset;
      const ghost = (GHOST_TROOPS as readonly string[]).includes(type);
      this.pos.set(tx, groundAt(tx, tz) + (ghost ? 0.25 + Math.sin(time * 2 + i) * 0.12 : 0), tz);
      this.quat.setFromEuler(this.euler.set(0, heading, 0));
      this.scale.setScalar(TROOP_DRAW_SCALE);
      mesh.setMatrixAt(0, this.matrix.compose(this.pos, this.quat, this.scale));
      mesh.count = 1;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.living.dispose();
    this.ghostly.dispose();
  }
}

/** A support gunboat: an open hull, a stubby mast with a scrap of sail, and a swivel gun at the bow. */
export function gunboatGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const hull = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(hull, PALETTE.hullDark, placed([0, 0.55, 0], [0, 0, 0], [1.1, 0.7, 2.6]));
  b.add(new THREE.BoxGeometry(2.0, 0.12, 4.6), PALETTE.hullTrim, placed([0, 0.6, 0]));
  b.add(new THREE.BoxGeometry(1.8, 0.08, 1.0), PALETTE.deck, placed([0, 0.5, -0.6]));
  b.add(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), PALETTE.mast, placed([0, 1.8, -0.2]));
  b.add(new THREE.BoxGeometry(0.04, 1.3, 1.1), PALETTE.sailCloth, placed([0.05, 2.1, -0.6]));
  b.add(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 7), IRON, placed([0, 0.95, 1.85], [Math.PI / 2 - 0.15, 0, 0]));
  b.add(new THREE.BoxGeometry(0.2, 0.3, 0.2), IRON, placed([0, 0.72, 1.6]));
  b.add(new THREE.BoxGeometry(0.16, 0.2, 0.16), LANTERN, placed([0, 0.9, -2.0]), 1.6);
  return b.build();
}

/** The rowboat that takes the landing party ashore. */
export function rowboatGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const hull = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(hull, '#5A4030', placed([0, 0.4, 0], [0, 0, 0], [0.8, 0.45, 1.9]));
  b.add(new THREE.BoxGeometry(1.5, 0.08, 0.3), PALETTE.deck, placed([0, 0.38, 0.4]));
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.06, 0.06, 2.0), WOOD, placed([s * 0.9, 0.45, 0.2], [0, s * 0.5, s * 0.4]));
  b.add(new THREE.BoxGeometry(0.14, 0.18, 0.14), LANTERN, placed([0, 0.6, -1.4]), 1.6);
  return b.build();
}

/** The gate's portcullis, drawn apart from the fort so it can fall. Faces along +X, `width` wide. */
export function portcullisGeometry(width: number, height: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (let i = 0; i < 5; i++) b.add(new THREE.BoxGeometry(0.12, height, 0.12), IRON, placed([0, height / 2, -width / 2 + ((i + 0.5) / 5) * width]));
  for (const y of [0.5, height * 0.55, height - 0.3]) b.add(new THREE.BoxGeometry(0.1, 0.1, width), IRON, placed([0, y, 0]));
  b.add(new THREE.BoxGeometry(0.2, 0.5, width * 0.5), '#3A2A1E', placed([0.05, 0.6, 0]));
  return b.build();
}

