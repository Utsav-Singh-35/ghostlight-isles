import * as THREE from 'three';
import { FORTS } from '../sim/balance';
import { slotPosition } from '../sim/layout';
import { TAU } from '../sim/math';
import { createRng, type Rng } from '../sim/rng';
import { MeshBuilder, placed, type Vec3 } from './meshBuilder';
import { PALETTE } from './palette';

const IRON = '#26262A';
const BONE = '#D8CDB2';
const WOOD = '#3E3026';
/** Stockade stakes: weathered pale wood, so a palisade's outline shows at night. */
const STAKE = '#7A6650';
const FLAG_BLACK = '#121214';

/** Terrain height under a point given relative to the island's centre. */
export type GroundAt = (x: number, z: number) => number;

/** How a fort is built. Chosen from the island's seed, leaning to stone and star forts as the level rises. */
export type FortStyle = 'curtain' | 'ruin' | 'star' | 'palisade';

/** The stone a fort is built from. */
interface Stone {
  readonly stone: string;
  readonly light: string;
  readonly dark: string;
  readonly moss: string;
  readonly roof: string;
}

const STONES: readonly Stone[] = [
  // Pale enough to read against the night sea; the tops of the walls catch the moon.
  // Grey granite.
  { stone: '#8C877C', light: '#B5AEA0', dark: '#5E5A53', moss: '#4E5B40', roof: '#30343D' },
  // Black basalt, with pale mortar on top.
  { stone: '#5C5E68', light: '#8E909A', dark: '#3A3B42', moss: '#3F4C3A', roof: '#22232A' },
  // Bone-white limestone.
  { stone: '#B2AA98', light: '#D3CBB6', dark: '#7C7567', moss: '#5B6644', roof: '#3E302B' },
  // Green-grey stone, half eaten by moss.
  { stone: '#78826F', light: '#A0A894', dark: '#4F5749', moss: '#44633B', roof: '#29332A' },
];

/** What a fort adds to a scene besides its stone: spectral fire to glow, and where its keep's light burns. */
export interface FortLights {
  /** Braziers, candles and lit windows, in the same coordinates as the fort. */
  readonly flames: Vec3[];
}

/** How much bigger the keep is at each keep level (1 to 3). */
export function keepScale(keepLevel: number): number {
  return 1 + 0.15 * (Math.min(3, Math.max(1, Math.round(keepLevel))) - 1);
}

/** The curtain wall's distance from the keep, metres: between the keep and the ring of tower slots. */
export function fortWallRadius(islandRadius: number): number {
  return Math.min(21, Math.max(8.5, islandRadius * 0.34));
}

/** How far a star fort's bastions jut out, as a share of the wall's radius. */
const BASTION_REACH = 1.3;

/** The angle of tower slot 0, so a star fort's bastions can point at the slots. */
const SLOT_START_ANGLE = (() => {
  const p = slotPosition(1, 0, 1);
  return Math.atan2(p.x, p.z);
})();

/** Radius of the keep's base at this fort level, before the keep is scaled. */
function keepBaseRadius(level: number): number {
  return level >= 4 ? 4.8 : level === 3 ? 4.4 : 4.2;
}

/**
 * True when a prop at distance `d` from the island's centre would stand in the fort's keep, its
 * candles or its wall. Star forts also block the band their bastions jut into.
 */
export function blockedByFort(d: number, islandRadius: number, style: FortStyle = 'curtain'): boolean {
  const wallR = fortWallRadius(islandRadius);
  if (d < 8.5) return true;
  if (style === 'star') return d > wallR * 0.92 - 3.4 && d < wallR * BASTION_REACH + 2.5;
  return Math.abs(d - wallR) < 3.4;
}

/** The style a fort of this level and seed is built in: wooden stockades only on the easy forts, star forts mostly on the hard ones. */
export function fortStyle(level: number, seed: number): FortStyle {
  const roll = createRng(seed ^ 0x51e7).next();
  if (level <= 2) return roll < 0.35 ? 'palisade' : roll < 0.65 ? 'ruin' : 'curtain';
  if (level === 3) return roll < 0.3 ? 'ruin' : roll < 0.65 ? 'star' : 'curtain';
  return roll < 0.2 ? 'ruin' : roll < 0.7 ? 'star' : 'curtain';
}

// ---- Keeps --------------------------------------------------------------------------------

/** Levels 1 and 2: a crooked black spire with a green ghost light on top. */
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

/** Level 3: a drowned lighthouse, striped in bone and black, its top broken open around a green lamp. */
function ruinedLighthouseGeometry(): { body: THREE.BufferGeometry; lanternHeight: number } {
  const b = new MeshBuilder();
  b.add(new THREE.CylinderGeometry(3.4, 4.4, 2.2, 9).translate(0, 1.1, 0), '#2E3036');
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const r0 = 2.3 - i * 0.16;
    b.add(new THREE.CylinderGeometry(r0 - 0.16, r0, 2.1, 9).translate(0, 2.2 + i * 2.1 + 1.05, 0), i % 2 ? '#B9B09A' : '#25262C', undefined, 0.95);
  }
  const top = 2.2 + bands * 2.1;
  // The broken gallery: jagged stones around the lamp.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU;
    const h = 0.6 + ((k * 7) % 5) * 0.28;
    b.add(new THREE.BoxGeometry(0.7, h, 0.5), '#3A3C44', placed([Math.sin(a) * 1.55, top + h / 2, Math.cos(a) * 1.55], [0, a, 0.08 * ((k % 3) - 1)]));
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    b.add(new THREE.BoxGeometry(0.1, 2.0, 0.1), IRON, placed([Math.sin(a) * 1.05, top + 1.2, Math.cos(a) * 1.05], [0, 0, 0.1 * ((k % 2) * 2 - 1)]));
  }
  b.add(new THREE.ConeGeometry(1.3, 1.0, 6).translate(0.3, top + 2.6, 0), IRON, placed([0, 0, 0], [0, 0, 0.25]));
  return { body: b.build(), lanternHeight: top + 1.2 };
}

/** Levels 4 and 5: a black tower crowned with a great horned skull. Its eyes burn. */
function skullTowerGeometry(): { body: THREE.BufferGeometry; lanternHeight: number; eyes: Vec3[] } {
  const b = new MeshBuilder();
  b.add(new THREE.CylinderGeometry(3.8, 4.8, 2.4, 8).translate(0, 1.2, 0), '#22232A');
  b.add(new THREE.CylinderGeometry(1.9, 2.6, 9.5, 8).translate(0, 2.4 + 4.75, 0), '#2B2C33');
  for (const y of [4.2, 7.4, 10.4]) b.add(new THREE.CylinderGeometry(2.45 - y * 0.05, 2.45 - y * 0.05, 0.35, 8).translate(0, y, 0), '#3D3F47');
  // Flying buttresses of bone.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    b.add(new THREE.BoxGeometry(0.35, 6.5, 0.35), BONE, placed([Math.sin(a) * 3.3, 4.2, Math.cos(a) * 3.3], [Math.cos(a) * 0.32, 0, -Math.sin(a) * 0.32]), 0.85);
  }
  const top = 12.2;
  // The skull: cranium, cheekbones, jaw and teeth, horns.
  b.add(new THREE.SphereGeometry(2.3, 10, 8), BONE, placed([0, top + 1.6, 0], [0, 0, 0], [1, 0.95, 1.05]));
  b.add(new THREE.BoxGeometry(2.6, 1.1, 2.4), BONE, placed([0, top + 0.15, 0.25]), 0.92);
  b.add(new THREE.BoxGeometry(1.9, 0.6, 1.9), '#BFB49A', placed([0, top - 0.55, 0.45]));
  for (let t = -3; t <= 3; t++) b.add(new THREE.BoxGeometry(0.22, 0.34, 0.16), '#EDE4CC', placed([t * 0.27, top - 0.15, 1.42]));
  // Eye sockets and the nose, dark.
  for (const x of [-0.78, 0.78]) b.add(new THREE.SphereGeometry(0.55, 8, 6), '#0B0B0E', placed([x, top + 1.45, 1.75], [0, 0, 0], [1, 0.85, 0.6]));
  b.add(new THREE.ConeGeometry(0.32, 0.6, 3), '#0B0B0E', placed([0, top + 0.75, 2.0], [Math.PI, 0, 0]));
  for (const side of [-1, 1]) {
    b.add(new THREE.ConeGeometry(0.42, 2.6, 6), '#1A1A1E', placed([side * 2.0, top + 3.1, -0.2], [0, 0, -side * 0.75]));
  }
  return { body: b.build(), lanternHeight: top + 1.5, eyes: [[-0.78, top + 1.45, 1.95], [0.78, top + 1.45, 1.95]] };
}

/** The keep of a haunted fort at this level: spire, broken lighthouse or skull tower. */
export function hauntedKeepGeometry(level: number): { body: THREE.BufferGeometry; lanternHeight: number; eyes: Vec3[] } {
  if (level >= 4) return skullTowerGeometry();
  if (level === 3) return { ...ruinedLighthouseGeometry(), eyes: [] };
  return { ...ghostSpireGeometry(), eyes: [] };
}

// ---- Walls ------------------------------------------------------------------------------

/** One corner of the wall: where it stands and whether it carries a turret. */
interface Corner {
  readonly x: number;
  readonly z: number;
  readonly turret: boolean;
}

/** The wall's corners in order of rising angle, so every wall's outward side is the same side. */
function corners(style: FortStyle, sides: number, wallR: number, start: number): Corner[] {
  const out: Corner[] = [];
  if (style === 'star') {
    // Bastions: every other corner juts out into a point with a turret.
    for (let k = 0; k < sides * 2; k++) {
      const a = start + (k / (sides * 2)) * TAU;
      const r = k % 2 === 0 ? wallR * BASTION_REACH : wallR * 0.92;
      out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, turret: k % 2 === 0 });
    }
    return out;
  }
  for (let k = 0; k < sides; k++) {
    const a = start + (k / sides) * TAU;
    out.push({ x: Math.sin(a) * wallR, z: Math.cos(a) * wallR, turret: true });
  }
  return out;
}

/** Thin pole with a skull on top. */
function skullPike(b: MeshBuilder, x: number, y: number, z: number, h: number, rng: Rng): void {
  b.add(new THREE.BoxGeometry(0.1, h, 0.1), WOOD, placed([x, y + h / 2, z], [rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)]));
  b.add(new THREE.SphereGeometry(0.24, 6, 5), BONE, placed([x, y + h + 0.12, z], [0, rng.range(0, TAU), 0], [1, 1.1, 1.15]));
}

/** A tattered black flag on a pole, torn into strips. */
function flag(b: MeshBuilder, x: number, y: number, z: number, rng: Rng): void {
  b.add(new THREE.BoxGeometry(0.08, 2.6, 0.08), IRON, placed([x, y + 1.3, z]));
  const yaw = rng.range(0, TAU);
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  for (let s = 0; s < 3; s++) {
    const len = 1.5 - s * 0.35 + rng.range(-0.15, 0.15);
    b.add(new THREE.BoxGeometry(0.03, 0.32, len), FLAG_BLACK, placed([x + ux * (len / 2 + 0.05), y + 2.35 - s * 0.36, z + uz * (len / 2 + 0.05)], [0, yaw, rng.range(-0.1, 0.1)]));
  }
  b.add(new THREE.SphereGeometry(0.12, 5, 4), BONE, placed([x + ux * 0.55, y + 2.05, z + uz * 0.55]));
}

/** A gibbet: a post and arm with an iron cage, and what is left of someone inside. The arm points along `yaw`. */
function gibbet(b: MeshBuilder, x: number, y: number, z: number, yaw: number): void {
  b.add(new THREE.BoxGeometry(0.22, 4.4, 0.22), WOOD, placed([x, y + 2.2, z]));
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  b.add(new THREE.BoxGeometry(0.18, 0.18, 1.8), WOOD, placed([x + ux * 0.8, y + 4.3, z + uz * 0.8], [0, yaw, 0]));
  const cx = x + ux * 1.55;
  const cz = z + uz * 1.55;
  for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]] as const) {
    b.add(new THREE.BoxGeometry(0.05, 1.5, 0.05), IRON, placed([cx + dx, y + 2.85, cz + dz]));
  }
  b.add(new THREE.BoxGeometry(0.8, 0.06, 0.8), IRON, placed([cx, y + 3.6, cz]));
  b.add(new THREE.BoxGeometry(0.8, 0.06, 0.8), IRON, placed([cx, y + 2.1, cz]));
  b.add(new THREE.SphereGeometry(0.2, 6, 5), BONE, placed([cx, y + 3.2, cz]));
  b.add(new THREE.BoxGeometry(0.28, 0.6, 0.16), BONE, placed([cx, y + 2.7, cz], [0, 0, 0.2]));
}

// ---- Island clutter: what is left of the people who came before -------------------------

const HULL = '#3A2A1E';
const HULL_ROT = '#2A231C';
const CLOTH = '#6E6656';
const GOLD = '#D9A441';

/** A wrecked ship half sunk in the sand, ribs showing, its mast snapped. Its bow points along `yaw`. */
function shipwreck(b: MeshBuilder, x: number, y: number, z: number, yaw: number, rng: Rng): void {
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  const px = Math.cos(yaw);
  const pz = -Math.sin(yaw);
  const tilt = rng.range(0.25, 0.45);
  // The keel and the side still standing.
  b.add(new THREE.BoxGeometry(0.5, 0.5, 9), HULL, placed([x, y - 0.1, z], [0, yaw, 0]));
  b.add(new THREE.BoxGeometry(0.22, 1.9, 7.5), HULL, placed([x + px * 1.2, y + 0.6, z + pz * 1.2], [0, yaw, tilt]));
  // Ribs on the broken side, curving up out of the sand.
  for (let r = 0; r < 7; r++) {
    const t = -3.3 + r * 1.1;
    const h = 1.6 + Math.sin((r / 6) * Math.PI) * 1.0;
    b.add(new THREE.BoxGeometry(0.16, h, 0.18), HULL_ROT, placed([x + ux * t - px * 1.1, y + h / 2 - 0.2, z + uz * t - pz * 1.1], [0, yaw, -0.35]));
  }
  // The stump of the mast, and the rest of it lying in the sand with a rag of sail.
  b.add(new THREE.CylinderGeometry(0.16, 0.2, 2.6, 6), HULL, placed([x, y + 1.1, z], [0.1, 0, 0.15]));
  b.add(new THREE.CylinderGeometry(0.12, 0.15, 6, 6), HULL_ROT, placed([x + px * 3.2 + ux * 1.5, y + 0.15, z + pz * 3.2 + uz * 1.5], [Math.PI / 2, yaw + 0.6, 0]));
  b.add(new THREE.BoxGeometry(0.05, 1.4, 2.2), CLOTH, placed([x + px * 3.4 + ux * 0.4, y + 0.3, z + pz * 3.4 + uz * 0.4], [1.2, yaw + 0.6, 0]));
}

/** A bonfire of driftwood and bones. Returns where its fire burns. */
function bonfire(b: MeshBuilder, x: number, y: number, z: number, rng: Rng): Vec3[] {
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + rng.range(-0.2, 0.2);
    b.add(new THREE.CylinderGeometry(0.09, 0.12, 1.5, 5), HULL, placed([x + Math.sin(a) * 0.35, y + 0.45, z + Math.cos(a) * 0.35], [Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55]));
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    b.add(new THREE.DodecahedronGeometry(0.22, 0), '#4A4A50', placed([x + Math.sin(a) * 0.95, y + 0.08, z + Math.cos(a) * 0.95]));
  }
  b.add(new THREE.SphereGeometry(0.18, 6, 5), BONE, placed([x + 0.9, y + 0.15, z + 0.4]));
  return [
    [x, y + 0.9, z],
    [x + 0.2, y + 1.3, z - 0.1],
    [x - 0.15, y + 0.6, z + 0.15],
  ];
}

/** A fisherman's shack, abandoned: plank walls, a sagging roof, a door left open. Faces `yaw`. */
function hut(b: MeshBuilder, x: number, y: number, z: number, yaw: number, rng: Rng): Vec3 {
  const w = rng.range(2.4, 3.2);
  const d = rng.range(2.2, 2.8);
  b.add(new THREE.BoxGeometry(w, 2.0, d), '#4E3E30', placed([x, y + 0.9, z], [0, yaw, rng.range(-0.04, 0.04)]));
  const roof = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, 1.4, 4);
  b.add(roof, '#2E2A26', placed([x, y + 2.55, z], [0, yaw + Math.PI / 4, rng.range(-0.08, 0.08)], [1, 1, d / w]));
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  b.add(new THREE.BoxGeometry(0.8, 1.4, 0.06), '#0E0D0C', placed([x + ux * (d / 2 + 0.02), y + 0.7, z + uz * (d / 2 + 0.02)], [0, yaw, 0]));
  b.add(new THREE.BoxGeometry(0.08, 1.4, 0.8), '#3A2E24', placed([x + ux * (d / 2 + 0.35) + Math.cos(yaw) * 0.6, y + 0.7, z + uz * (d / 2 + 0.35) - Math.sin(yaw) * 0.6], [0, yaw + 0.9, 0]));
  // A candle in the window, so somebody (or something) is still home.
  return [x + ux * (d / 2 + 0.05) + Math.cos(yaw) * (w * 0.3), y + 1.2, z + uz * (d / 2 + 0.05) - Math.sin(yaw) * (w * 0.3)];
}

/** A treasure chest, lid open, gold spilling. */
function chest(b: MeshBuilder, x: number, y: number, z: number, yaw: number): void {
  b.add(new THREE.BoxGeometry(1.1, 0.6, 0.7), '#5A3A22', placed([x, y + 0.3, z], [0, yaw, 0]));
  b.add(new THREE.BoxGeometry(1.14, 0.08, 0.74), IRON, placed([x, y + 0.45, z], [0, yaw, 0]));
  b.add(new THREE.BoxGeometry(1.1, 0.12, 0.7), '#5A3A22', placed([x - Math.sin(yaw) * 0.35, y + 0.9, z - Math.cos(yaw) * 0.35], [-1.2, yaw, 0]));
  b.add(new THREE.SphereGeometry(0.45, 7, 4), GOLD, placed([x, y + 0.6, z], [0, 0, 0], [1, 0.35, 0.65]), 1.2);
  b.add(new THREE.SphereGeometry(0.3, 6, 4), GOLD, placed([x + Math.sin(yaw) * 0.6, y + 0.05, z + Math.cos(yaw) * 0.6], [0, 0, 0], [1, 0.25, 1]), 1.15);
}

/** A skeleton sprawled on the sand. */
function skeleton(b: MeshBuilder, x: number, y: number, z: number, yaw: number, rng: Rng): void {
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  b.add(new THREE.SphereGeometry(0.2, 6, 5), BONE, placed([x + ux * 0.75, y + 0.15, z + uz * 0.75], [0, rng.range(0, TAU), 0]));
  for (let r = 0; r < 4; r++) b.add(new THREE.BoxGeometry(0.5 - r * 0.05, 0.05, 0.06), BONE, placed([x + ux * (0.45 - r * 0.13), y + 0.06, z + uz * (0.45 - r * 0.13)], [0, yaw + Math.PI / 2, 0]));
  b.add(new THREE.BoxGeometry(0.06, 0.05, 0.7), BONE, placed([x + ux * 0.2, y + 0.05, z + uz * 0.2], [0, yaw, 0]));
  for (const side of [-1, 1]) {
    const px = Math.cos(yaw) * side * 0.15;
    const pz = -Math.sin(yaw) * side * 0.15;
    b.add(new THREE.BoxGeometry(0.06, 0.05, 0.8), BONE, placed([x - ux * 0.4 + px, y + 0.05, z - uz * 0.4 + pz], [0, yaw + side * 0.25, 0]));
    b.add(new THREE.BoxGeometry(0.05, 0.05, 0.6), BONE, placed([x + ux * 0.4 + px * 3, y + 0.05, z + uz * 0.4 + pz * 3], [0, yaw + side * rng.range(0.4, 1.2), 0]));
  }
}

/** A rowboat left upside down on the beach. */
function rowboat(b: MeshBuilder, x: number, y: number, z: number, yaw: number): void {
  const hull = new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, Math.PI / 2);
  b.add(hull, '#4A3626', placed([x, y + 0.05, z], [0, yaw, 0], [0.75, 0.45, 1.9]));
  b.add(new THREE.BoxGeometry(0.08, 0.08, 2.4), '#3A2A1E', placed([x + Math.cos(yaw) * 1.1, y + 0.05, z - Math.sin(yaw) * 1.1], [0, yaw + 0.2, 0]));
}

/** A crow, perched, as a dark wedge with a head. */
function crow(b: MeshBuilder, x: number, y: number, z: number, yaw: number): void {
  b.add(new THREE.ConeGeometry(0.13, 0.42, 4), '#0C0C10', placed([x, y + 0.12, z], [Math.PI / 2 - 0.5, yaw, 0]));
  b.add(new THREE.SphereGeometry(0.08, 5, 4), '#0C0C10', placed([x + Math.sin(yaw) * 0.16, y + 0.27, z + Math.cos(yaw) * 0.16]));
}

/**
 * Adds the island's clutter between the fort and the sea: wrecks at the waterline, a bonfire,
 * shacks, a chest, skeletons, a rowboat and crows. More of it on harder forts. Everything sits on
 * the beach, outside the ring of tower slots, so nothing stands in a defense or the walls.
 */
function addClutter(b: MeshBuilder, islandRadius: number, level: number, rng: Rng, groundAt: GroundAt, at: (x: number, y: number, z: number) => Vec3, flames: Vec3[]): void {
  const used: number[] = [];
  /** A free angle on the beach, at least `gap` radians from everything placed so far. */
  const angle = (gap: number): number => {
    for (let tries = 0; tries < 12; tries++) {
      const a = rng.range(0, TAU);
      if (used.every((u) => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u))) > gap)) {
        used.push(a);
        return a;
      }
    }
    const a = rng.range(0, TAU);
    used.push(a);
    return a;
  };
  const spot = (a: number, f: number): [number, number, number] => {
    const x = Math.sin(a) * islandRadius * f;
    const z = Math.cos(a) * islandRadius * f;
    return [x, groundAt(x, z), z];
  };
  const place = (a: number, f: number, fn: (x: number, y: number, z: number) => void) => {
    const [x, y, z] = spot(a, f);
    const [wx, , wz] = at(x, 0, z);
    fn(wx, y, wz);
  };
  for (let w = 0; w < (level >= 3 ? 2 : 1); w++) {
    const a = angle(0.7);
    place(a, 0.9, (x, y, z) => shipwreck(b, x, y - 0.35, z, a + Math.PI / 2 + rng.range(-0.4, 0.4), rng));
  }
  for (let f = 0; f < 1 + Math.floor(level / 3); f++) {
    const a = angle(0.45);
    place(a, 0.8, (x, y, z) => flames.push(...bonfire(b, x, y, z, rng)));
  }
  for (let h = 0; h < Math.min(3, 1 + Math.floor(level / 2)); h++) {
    const a = angle(0.45);
    place(a, 0.78, (x, y, z) => flames.push(hut(b, x, y, z, a + Math.PI, rng)));
  }
  {
    const a = angle(0.35);
    place(a, 0.8, (x, y, z) => chest(b, x, y, z, a + Math.PI + rng.range(-0.5, 0.5)));
  }
  for (let s = 0; s < 2 + level; s++) {
    const a = angle(0.15);
    place(a, rng.range(0.76, 0.86), (x, y, z) => skeleton(b, x, y + 0.02, z, rng.range(0, TAU), rng));
  }
  {
    const a = angle(0.35);
    place(a, 0.88, (x, y, z) => rowboat(b, x, y, z, a + Math.PI / 2));
  }
  for (let c = 0; c < 3 + level; c++) {
    const a = angle(0.08);
    place(a, rng.range(0.74, 0.84), (x, y, z) => crow(b, x, y, z, rng.range(0, TAU)));
  }
}

/**
 * Adds a haunted fort to `b`, in a style and stone chosen from its seed: walls, turrets, a gate,
 * flags, skull pikes, gibbets and braziers. Higher levels get more sides, taller walls and more
 * fire. `origin` moves the fort into place; returns where its flames burn, in the same coordinates.
 */
export function addFort(b: MeshBuilder, islandRadius: number, level: number, seed: number, groundAt: GroundAt, origin: { readonly x: number; readonly z: number } = { x: 0, z: 0 }): FortLights {
  const rng = createRng(seed ^ 0x7a11);
  const style = fortStyle(level, seed);
  const stone = STONES[rng.int(0, STONES.length - 1)]!;
  const wallR = fortWallRadius(islandRadius);
  const wallH = 2.2 + 0.45 * level;
  const thick = 0.9 + 0.1 * level;
  const turretR = 0.85 + 0.17 * level;
  const flames: Vec3[] = [];
  const at = (x: number, y: number, z: number): Vec3 => [x + origin.x, y, z + origin.z];
  const turn = rng.range(0, TAU);
  // A star fort points one bastion at each tower slot, so the treasure between the slots sits in
  // the hollows of the star instead of under a bastion.
  const slots = FORTS.slots[Math.min(FORTS.levels, Math.max(1, level)) - 1]!;
  const ring = style === 'star' ? corners(style, slots, wallR, SLOT_START_ANGLE) : corners(style, 5 + level, wallR, turn);
  const gate = rng.int(0, ring.length - 1);

  ring.forEach((c0, k) => {
    const c1 = ring[(k + 1) % ring.length]!;
    const mx = (c0.x + c1.x) / 2;
    const mz = (c0.z + c1.z) / 2;
    const heights = [groundAt(c0.x, c0.z), groundAt(c1.x, c1.z), groundAt(mx, mz)];
    const low = Math.min(...heights);
    const base = low - 0.8;
    const top = Math.max(...heights) + wallH;
    const yaw = Math.atan2(c1.x - c0.x, c1.z - c0.z);
    const ux = Math.sin(yaw);
    const uz = Math.cos(yaw);
    // The corners run in rising angle, so the wall's outward side is to the right of its direction.
    const nx = -Math.cos(yaw);
    const nz = Math.sin(yaw);
    const span = Math.hypot(c1.x - c0.x, c1.z - c0.z) - (c0.turret || c1.turret ? turretR * 1.4 : 0.2);

    if (style === 'palisade') {
      // Sharpened stakes, with skulls on some, and a gap for the gate.
      const count = Math.max(2, Math.floor(span / 0.62));
      for (let s = 0; s < count; s++) {
        const t = -span / 2 + ((s + 0.5) / count) * span;
        if (k === gate && Math.abs(t) < 1.6) continue;
        const h = wallH + 0.6 + rng.range(-0.4, 0.5);
        const x = mx + ux * t;
        const z = mz + uz * t;
        b.add(new THREE.CylinderGeometry(0.22, 0.26, h, 5), STAKE, placed(at(x, base + h / 2, z), [rng.range(-0.05, 0.05), rng.next() * TAU, rng.range(-0.05, 0.05)]), rng.range(0.8, 1.1));
        b.add(new THREE.ConeGeometry(0.24, 0.55, 5), STAKE, placed(at(x, base + h + 0.27, z)), 1.15);
        if (rng.next() < 0.12) b.add(new THREE.SphereGeometry(0.24, 6, 5), BONE, placed(at(x, base + h + 0.55, z), [0, rng.range(0, TAU), 0], [1, 1.1, 1.15]));
      }
      return;
    }

    /** A stretch of stone wall from `from` to `to` metres along the span, measured from its middle. */
    const stretch = (from: number, to: number, ruined: boolean) => {
      const length = to - from;
      const c = (from + to) / 2;
      const cx = mx + ux * c;
      const cz = mz + uz * c;
      if (ruined) {
        // Fallen to a jagged stump, its stones scattered outside.
        const pieces = Math.max(2, Math.floor(length / 1.2));
        for (let p = 0; p < pieces; p++) {
          const t = from + ((p + 0.5) / pieces) * length;
          const h = (top - base) * rng.range(0.25, 0.65);
          b.add(new THREE.BoxGeometry(thick, h, length / pieces + 0.05), stone.stone, placed(at(mx + ux * t, base + h / 2, mz + uz * t), [0, yaw, rng.range(-0.06, 0.06)]), rng.range(0.85, 1.05));
        }
        for (let r = 0; r < 3 + level; r++) {
          const t = from + rng.next() * length;
          const out = rng.range(1, 3.5);
          const s = rng.range(0.4, 0.9);
          const x = mx + ux * t + nx * out;
          const z = mz + uz * t + nz * out;
          b.add(new THREE.BoxGeometry(s, s * 0.7, s * 1.2), stone.dark, placed(at(x, groundAt(x, z) + s * 0.25, z), [rng.range(-0.4, 0.4), rng.range(0, TAU), rng.range(-0.4, 0.4)]));
        }
        return;
      }
      b.add(new THREE.BoxGeometry(thick, top - base, length), stone.stone, placed(at(cx, (base + top) / 2, cz), [0, yaw, 0]), rng.range(0.9, 1.05));
      b.add(new THREE.BoxGeometry(thick * 1.12, 0.7, length * 1.01), stone.moss, placed(at(cx, low + 0.1, cz), [0, yaw, 0]), rng.range(0.8, 1));
      // A pale coping stone along the top, so the line of the wall reads from far away at night.
      b.add(new THREE.BoxGeometry(thick * 1.1, 0.16, length * 1.0), stone.light, placed(at(cx, top + 0.02, cz), [0, yaw, 0]), 1.25);
      // Torches on iron brackets along the outside of the wall.
      const torches = Math.floor(length / 5.5);
      for (let q = 0; q < torches; q++) {
        const t = from + ((q + 0.5) / torches) * length;
        const out = thick / 2 + 0.18;
        const x = mx + ux * t + nx * out;
        const z = mz + uz * t + nz * out;
        const y = top - 1.0;
        b.add(new THREE.BoxGeometry(0.08, 0.08, 0.42), IRON, placed(at(x - nx * 0.1, y - 0.25, z - nz * 0.1), [0, yaw + Math.PI / 2, 0]));
        b.add(new THREE.CylinderGeometry(0.09, 0.05, 0.4, 5), WOOD, placed(at(x, y - 0.05, z)));
        flames.push(at(x, y + 0.3, z));
      }
      const count = Math.max(1, Math.floor(length / 1.3));
      for (let m = 0; m < count; m++) {
        if (rng.next() < 0.2) continue;
        const t = from + ((m + 0.5) / count) * length;
        b.add(new THREE.BoxGeometry(thick * 1.04, 0.62, 0.66), stone.light, placed(at(mx + ux * t, top + 0.31, mz + uz * t), [0, yaw, 0]), rng.range(0.85, 1.05));
      }
      for (let s = 0; s < 2 + level; s++) {
        const t = from + rng.next() * length;
        const y = base + 1.2 + rng.next() * Math.max(0.2, top - base - 1.8);
        const out = (rng.next() < 0.5 ? -1 : 1) * (thick / 2);
        b.add(new THREE.BoxGeometry(0.16, 0.45, rng.range(0.6, 1.1)), stone.dark, placed(at(mx + ux * t + nx * out, y, mz + uz * t + nz * out), [0, yaw, 0]), rng.range(0.85, 1.1));
      }
      // Arrow slits that glow from inside.
      if (length > 3 && rng.next() < 0.5) {
        const t = from + length * rng.range(0.3, 0.7);
        const out = thick / 2 + 0.02;
        const y = base + (top - base) * 0.6;
        b.add(new THREE.BoxGeometry(0.05, 0.7, 0.16), '#0B0B0E', placed(at(mx + ux * t + nx * out, y, mz + uz * t + nz * out), [0, yaw, 0]));
        flames.push(at(mx + ux * t + nx * (out + 0.1), y, mz + uz * t + nz * (out + 0.1)));
      }
    };

    const ruined = style === 'ruin' && k !== gate && rng.next() < 0.4;
    if (k === gate) {
      const gap = Math.min(3.4, span * 0.4);
      stretch(-span / 2, -gap / 2, false);
      stretch(gap / 2, span / 2, false);
      b.add(new THREE.BoxGeometry(thick * 1.15, 1.0, gap + 0.8), stone.dark, placed(at(mx, top - 0.5, mz), [0, yaw, 0]));
      const barHeight = top - base - 1.0;
      for (let i = 0; i < 4; i++) {
        const t = -gap / 2 + ((i + 0.5) / 4) * gap;
        b.add(new THREE.BoxGeometry(0.12, barHeight, 0.12), IRON, placed(at(mx + ux * t, base + barHeight / 2, mz + uz * t), [0, yaw, 0]));
      }
      b.add(new THREE.BoxGeometry(0.1, 0.12, gap), IRON, placed(at(mx, low + 1.6, mz), [0, yaw, 0]));
      // Ghost light burns in the gateway, behind the bars.
      for (let i = 0; i < 3; i++) flames.push(at(mx + ux * (i - 1) * gap * 0.3 - nx * 0.4, low + 0.6 + i * 0.5, mz + uz * (i - 1) * gap * 0.3 - nz * 0.4));
      // Skulls on pikes either side of the gate, and a torch on each side.
      for (const side of [-1, 1]) {
        const t = side * (gap / 2 + 1.3);
        const x = mx + ux * t + nx * 1.8;
        const z = mz + uz * t + nz * 1.8;
        skullPike(b, origin.x + x, groundAt(x, z), origin.z + z, 2.2 + rng.range(-0.2, 0.3), rng);
        flames.push(at(mx + ux * side * (gap / 2 + 0.3) + nx * (thick / 2 + 0.3), top - 1.2, mz + uz * side * (gap / 2 + 0.3) + nz * (thick / 2 + 0.3)));
      }
    } else {
      stretch(-span / 2, span / 2, ruined);
    }
  });

  // Turrets (stone forts) or watchtowers (palisades).
  ring.forEach((c, k) => {
    if (!c.turret) return;
    const ground = groundAt(c.x, c.z);
    const bottom = ground - 0.8;
    if (style === 'palisade') {
      if (k % 2 === 1) return;
      const h = wallH + 2.4;
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]] as const) {
        b.add(new THREE.BoxGeometry(0.2, h, 0.2), WOOD, placed(at(c.x + dx, bottom + h / 2, c.z + dz)));
      }
      b.add(new THREE.BoxGeometry(2.3, 0.18, 2.3), WOOD, placed(at(c.x, bottom + h, c.z)));
      b.add(new THREE.ConeGeometry(1.8, 1.2, 4), stone.roof, placed(at(c.x, bottom + h + 1.4, c.z), [0, Math.PI / 4, 0]));
      flames.push(at(c.x, bottom + h + 0.5, c.z));
      return;
    }
    const broken = style === 'ruin' && rng.next() < 0.35;
    const top = ground + (broken ? wallH * 0.6 : wallH + 1.3 + 0.2 * level);
    b.add(new THREE.CylinderGeometry(turretR, turretR * 1.15, top - bottom, 8), stone.stone, placed(at(c.x, (bottom + top) / 2, c.z)), rng.range(0.88, 1.02));
    if (broken) return;
    b.add(new THREE.CylinderGeometry(turretR * 1.12, turretR * 1.12, 0.3, 8), stone.dark, placed(at(c.x, top, c.z)));
    for (let m = 0; m < 6; m++) {
      const a = (m / 6) * TAU + k;
      b.add(new THREE.BoxGeometry(0.42, 0.5, 0.42), stone.light, placed(at(c.x + Math.sin(a) * turretR * 0.9, top + 0.4, c.z + Math.cos(a) * turretR * 0.9), [0, a, 0]));
    }
    // A glowing window on the side facing out.
    const out = Math.atan2(c.x, c.z);
    flames.push(at(c.x + Math.sin(out) * (turretR + 0.05), top - 1.2, c.z + Math.cos(out) * (turretR + 0.05)));
    // Higher forts burn more braziers; the rest of the turrets get slate roofs and black flags.
    if (k % 2 === 0 && rng.next() > level * 0.12) {
      const roof = 1.5 + 0.25 * level;
      b.add(new THREE.ConeGeometry(turretR * 1.3, roof, 8), stone.roof, placed(at(c.x, top + 0.15 + roof / 2, c.z)));
      flag(b, origin.x + c.x, top + 0.15 + roof * 0.7, origin.z + c.z, rng);
    } else {
      b.add(new THREE.CylinderGeometry(0.38, 0.22, 0.45, 6), IRON, placed(at(c.x, top + 0.4, c.z)));
      flames.push(at(c.x, top + 0.95, c.z));
    }
  });

  // Gibbets on the beach, more of them at higher levels, their cages hung out toward the sea.
  for (let g = 0; g < Math.min(3, level - 1); g++) {
    const a = rng.range(0, TAU);
    const d = islandRadius * rng.range(0.76, 0.82);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    gibbet(b, origin.x + x, groundAt(x, z) - 0.1, origin.z + z, a);
  }
  // Wrecks, fires, shacks and bones on the beach. Its own random stream, so the walls above never change.
  addClutter(b, islandRadius, level, createRng(seed ^ 0xc1a7), groundAt, at, flames);
  // Candles and bones at the keep's feet.
  const keepR = keepBaseRadius(level) * keepScale(FORTS.keepLevel[Math.min(FORTS.levels, Math.max(1, level)) - 1]!);
  for (let c = 0; c < 3 + level; c++) {
    const a = rng.range(0, TAU);
    const d = keepR + rng.range(0.6, 1.8);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const y = groundAt(x, z);
    const h = rng.range(0.25, 0.6);
    b.add(new THREE.CylinderGeometry(0.07, 0.08, h, 5), '#D8D0B8', placed(at(x, y + h / 2, z)));
    flames.push(at(x, y + h + 0.12, z));
    if (rng.next() < 0.5) b.add(new THREE.SphereGeometry(0.18, 6, 5), BONE, placed(at(x + 0.3, y + 0.12, z + 0.2), [0, rng.range(0, TAU), 0]));
  }
  return { flames };
}

/** Spectral flames for a fort's braziers, windows and candles: one merged mesh of small glowing spikes. */
export function flameGeometry(points: readonly Vec3[]): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const [x, y, z] of points) b.add(new THREE.OctahedronGeometry(0.3, 0), PALETTE.spectral, placed([x, y, z], [0, 0, 0], [1, 1.7, 1]));
  return b.build();
}

/** The sweeping beam of a haunted keep's light: a long, faint cone that fades toward its end. */
export function beamGeometry(length: number, spread: number): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(spread, length, 18, 1, true);
  // Point the tip at the origin and the open end along +Z.
  cone.rotateX(-Math.PI / 2).translate(0, 0, length / 2);
  const position = cone.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const fade = Math.max(0, 1 - position.getZ(i) / length);
    colors[i * 3] = fade;
    colors[i * 3 + 1] = fade;
    colors[i * 3 + 2] = fade;
  }
  cone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return cone;
}

/** Additive spectral light for keep beams. */
export function beamMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.spectral).multiplyScalar(0.55),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
