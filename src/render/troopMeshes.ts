import * as THREE from 'three';
import { TICK_SECONDS } from '../sim/balance';
import { GHOST_TROOPS, TROOP_TYPES, type Troop, type TroopType } from '../sim/troops';
import { MeshBuilder, placed } from './meshBuilder';
import { PALETTE } from './palette';

/**
 * The crew and the dead, as low-poly figures facing +Z with their feet at y = 0. Parts drawn in
 * TEAM take the troop's side colour in the shader: blue for yours, red for the enemy's, green for
 * the dead. Every figure glows a little, so it reads at night; each has its own outline, and the
 * marker under its feet is a ring for yours and a diamond for an enemy, so sides never rest on colour alone.
 */

/** Placeholder colour for team-coloured parts; the shader swaps it for the side's colour. */
const TEAM = '#FF00FF';
const SKIN = '#E2B48C';
const LANTERN = '#FFC266';
const IRON = '#4A4A55';
const STEEL = '#C8CED6';
const WOOD = '#8A6440';
const LEATHER = '#7A5634';
const CLOTH = '#E8E2D4';
const BONE = '#EDE4CC';

/** Whose a troop is, for its colours: yours, the enemy's, or the dead's. */
export type Team = 'mine' | 'foe' | 'ghost';

const TEAM_COLORS: Readonly<Record<Team, THREE.Color>> = {
  mine: new THREE.Color(PALETTE.teamMine),
  foe: new THREE.Color(PALETTE.teamFoe),
  ghost: new THREE.Color(PALETTE.spectral),
};

export function teamColor(team: Team): THREE.Color {
  return TEAM_COLORS[team];
}

type B = MeshBuilder;

function legs(b: B, color: string, spread = 0.14, height = 0.8, width = 0.16): void {
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(width, height, width * 1.2), color, placed([s * spread, height / 2, 0]));
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(width * 1.15, 0.12, width * 1.8), '#3A2A20', placed([s * spread, 0.06, 0.04]));
}

function arm(b: B, side: number, y: number, x: number, color: string, out = 0.35, forward = 0, length = 0.62): void {
  b.add(new THREE.BoxGeometry(0.14, length, 0.14), color, placed([side * x, y - length / 2 + 0.08, forward], [forward * -0.8, 0, side * out]));
  b.add(new THREE.SphereGeometry(0.08, 5, 4), SKIN, placed([side * (x + Math.sin(out) * length * 0.9), y - Math.cos(out) * length * 0.95 + 0.08, forward]));
}

function head(b: B, y: number, r = 0.2, color: string = SKIN): void {
  b.add(new THREE.SphereGeometry(r, 8, 7), color, placed([0, y, 0], [0, 0, 0], [1, 1.08, 1]));
  // Eyes, so the figure has a face and a front.
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(r * 0.22, r * 0.18, 0.03), '#1A1414', placed([s * r * 0.38, y + r * 0.12, r * 0.95]));
}

function lantern(b: B, x: number, y: number, z: number, size = 0.13): void {
  b.add(new THREE.BoxGeometry(size, size * 1.3, size), LANTERN, placed([x, y, z]), 1.8);
  b.add(new THREE.BoxGeometry(size * 1.2, 0.03, size * 1.2), IRON, placed([x, y + size * 0.7, z]));
}

/** A team-coloured sash across the chest, worn by every living troop. */
function sash(b: B, y: number, width: number, depth: number): void {
  b.add(new THREE.BoxGeometry(width * 1.04, 0.12, depth * 1.06), TEAM, placed([0, y, 0], [0, 0, 0.55]));
}

/** Short and stocky, sleeves rolled, a mallet in hand and a plank on his back. */
function deckhand(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#4A4A58', 0.15, 0.6, 0.18);
  b.add(new THREE.BoxGeometry(0.6, 0.64, 0.38), TEAM, placed([0, 0.92, 0]));
  b.add(new THREE.BoxGeometry(0.62, 0.12, 0.4), LEATHER, placed([0, 0.64, 0]));
  head(b, 1.44, 0.23);
  b.add(new THREE.CylinderGeometry(0.24, 0.25, 0.12, 8), CLOTH, placed([0, 1.6, 0]));
  arm(b, -1, 1.18, 0.37, SKIN, 0.25);
  arm(b, 1, 1.18, 0.37, SKIN, 0.1, 0.18);
  b.add(new THREE.BoxGeometry(0.07, 0.6, 0.07), WOOD, placed([0.44, 0.8, 0.36], [0.3, 0, 0]));
  b.add(new THREE.BoxGeometry(0.26, 0.18, 0.18), STEEL, placed([0.44, 1.08, 0.44]), 0.9);
  b.add(new THREE.BoxGeometry(0.18, 1.3, 0.06), '#C49A62', placed([0, 1.0, -0.26], [0, 0, 0.5]));
  lantern(b, -0.32, 0.62, 0.22, 0.12);
  return b.build();
}

/** Lean, team bandana and striped shirt, cutlass held high, bare feet. */
function buccaneer(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#3A4258', 0.12, 0.82, 0.14);
  for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(0.42, 0.14, 0.26), i % 2 ? CLOTH : TEAM, placed([0, 0.92 + i * 0.14, 0]));
  b.add(new THREE.BoxGeometry(0.46, 0.08, 0.28), LEATHER, placed([0, 0.86, 0]));
  b.add(new THREE.BoxGeometry(0.1, 0.1, 0.04), LANTERN, placed([0, 0.86, 0.15]), 1.5);
  head(b, 1.62, 0.2);
  b.add(new THREE.SphereGeometry(0.215, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), TEAM, placed([0, 1.66, 0]));
  b.add(new THREE.BoxGeometry(0.06, 0.06, 0.3), TEAM, placed([0, 1.63, -0.3], [0.5, 0, 0]));
  arm(b, -1, 1.42, 0.27, SKIN, 0.3);
  // The sword arm, raised.
  b.add(new THREE.BoxGeometry(0.13, 0.6, 0.13), SKIN, placed([0.3, 1.66, 0.05], [0, 0, -2.6]));
  b.add(new THREE.BoxGeometry(0.06, 0.9, 0.14), STEEL, placed([0.44, 2.27, 0.05], [0, 0, -0.3]), 1.3);
  b.add(new THREE.BoxGeometry(0.24, 0.06, 0.16), LANTERN, placed([0.36, 1.88, 0.05], [0, 0, -0.3]));
  return b.build();
}

/** Wide and hunched behind a round shield made from a ship's wheel, painted in the team colour. */
function shieldbearer(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#4E4A44', 0.2, 0.7, 0.2);
  b.add(new THREE.BoxGeometry(0.8, 0.74, 0.52), '#8A6A4C', placed([0, 1.06, 0], [0.18, 0, 0]));
  sash(b, 1.08, 0.8, 0.52);
  head(b, 1.6, 0.22);
  b.add(new THREE.SphereGeometry(0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), STEEL, placed([0, 1.64, 0]), 0.85);
  b.add(new THREE.BoxGeometry(0.06, 0.22, 0.12), STEEL, placed([0, 1.55, 0.25]), 0.85);
  b.add(new THREE.ConeGeometry(0.06, 0.25, 4), TEAM, placed([0, 1.98, 0]));
  // The wheel: rim, painted face, spokes and a lantern boss, held in front.
  b.add(new THREE.TorusGeometry(0.58, 0.07, 5, 14), WOOD, placed([0, 1.0, 0.5]));
  b.add(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 14), TEAM, placed([0, 1.0, 0.47], [Math.PI / 2, 0, 0]));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.07, 0.32, 0.07), WOOD, placed([Math.sin(a) * 0.72, 1.0 + Math.cos(a) * 0.72, 0.5], [0, 0, -a]));
  }
  b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8), LANTERN, placed([0, 1.0, 0.52], [Math.PI / 2, 0, 0]), 1.5);
  b.add(new THREE.BoxGeometry(0.07, 0.6, 0.07), WOOD, placed([0.5, 1.2, 0.0], [0, 0, -0.4]));
  b.add(new THREE.BoxGeometry(0.06, 0.22, 0.28), STEEL, placed([0.62, 1.48, 0.0], [0, 0, -0.4]), 1.3);
  return b.build();
}

/** Tall and thin in a long team-coloured coat; a hooded lantern on a pole, and a curved bow. */
function archer(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#3A3C34', 0.1, 0.9, 0.12);
  b.add(new THREE.CylinderGeometry(0.2, 0.33, 1.0, 7), TEAM, placed([0, 1.1, 0]));
  b.add(new THREE.BoxGeometry(0.42, 0.08, 0.3), LEATHER, placed([0, 1.05, 0]));
  head(b, 1.78, 0.17);
  b.add(new THREE.ConeGeometry(0.25, 0.42, 7), '#3E4A3A', placed([0, 1.9, -0.03]));
  arm(b, -1, 1.55, 0.22, TEAM, 0.15, 0.25);
  arm(b, 1, 1.55, 0.22, TEAM, 0.6);
  for (let k = 0; k < 7; k++) {
    const a = -0.9 + (k / 6) * 1.8;
    b.add(new THREE.BoxGeometry(0.06, 0.26, 0.06), WOOD, placed([-0.3 + Math.cos(a) * 0.08, 1.35 + Math.sin(a) * 0.7, 0.42 + Math.cos(a) * 0.12], [0, 0, a]));
  }
  b.add(new THREE.BoxGeometry(0.02, 1.3, 0.02), BONE, placed([-0.36, 1.35, 0.36]));
  // A quiver of lantern-tipped arrows.
  b.add(new THREE.CylinderGeometry(0.1, 0.08, 0.6, 6), LEATHER, placed([-0.12, 1.5, -0.22], [0.2, 0, 0.2]));
  for (const dx of [-0.05, 0.03, 0.1]) b.add(new THREE.BoxGeometry(0.04, 0.12, 0.04), LANTERN, placed([-0.18 + dx, 1.86, -0.28]), 1.5);
  b.add(new THREE.BoxGeometry(0.05, 1.5, 0.05), WOOD, placed([0.18, 1.7, -0.2], [0.25, 0, -0.2]));
  lantern(b, 0.34, 2.42, -0.38, 0.17);
  return b.build();
}

/** A small kid in a team-coloured shirt under a huge keg, its fuse sparking. */
function powderMonkey(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#5A4A3A', 0.1, 0.5, 0.12);
  b.add(new THREE.BoxGeometry(0.38, 0.42, 0.26), TEAM, placed([0, 0.7, 0]));
  head(b, 1.04, 0.18);
  b.add(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 8), LEATHER, placed([0, 1.18, 0]));
  arm(b, -1, 1.02, 0.22, SKIN, -2.6);
  arm(b, 1, 1.02, 0.22, SKIN, 2.6);
  b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.6, 9), '#7A5634', placed([0, 1.52, 0], [0, 0, Math.PI / 2]));
  for (const x of [-0.22, 0.22]) b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 9), IRON, placed([x, 1.52, 0], [0, 0, Math.PI / 2]));
  b.add(new THREE.BoxGeometry(0.2, 0.2, 0.02), BONE, placed([0, 1.52, 0.35]));
  b.add(new THREE.BoxGeometry(0.03, 0.3, 0.03), '#2A2020', placed([0.1, 1.95, 0], [0, 0, 0.5]));
  b.add(new THREE.OctahedronGeometry(0.1, 0), LANTERN, placed([0.2, 2.1, 0]), 2);
  return b.build();
}

/** Huge and broad, a team-coloured vest under chains, swinging a ship's anchor; one eye a glowing lantern. */
function brute(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#4A4038', 0.3, 0.95, 0.3);
  b.add(new THREE.BoxGeometry(1.2, 1.0, 0.72), SKIN, placed([0, 1.45, 0]));
  b.add(new THREE.BoxGeometry(1.24, 0.75, 0.76), TEAM, placed([0, 1.35, 0]));
  b.add(new THREE.BoxGeometry(1.0, 0.3, 0.6), SKIN, placed([0, 2.05, 0]));
  head(b, 2.4, 0.27);
  b.add(new THREE.BoxGeometry(0.14, 0.09, 0.04), '#141414', placed([-0.1, 2.46, 0.27]));
  b.add(new THREE.SphereGeometry(0.07, 6, 5), LANTERN, placed([0.1, 2.46, 0.26]), 2);
  for (let k = 0; k < 7; k++) b.add(new THREE.TorusGeometry(0.07, 0.03, 4, 6), STEEL, placed([-0.5 + k * 0.17, 1.2 + k * 0.12, 0.39], [0, Math.PI / 2, 0]), 0.8);
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.28, 0.9, 0.28), SKIN, placed([s * 0.76, 1.6, 0.05], [0, 0, s * 0.3]));
  b.add(new THREE.BoxGeometry(0.13, 1.4, 0.13), IRON, placed([0.95, 1.4, 0.35]));
  b.add(new THREE.BoxGeometry(0.7, 0.11, 0.11), IRON, placed([0.95, 2.0, 0.35]));
  b.add(new THREE.TorusGeometry(0.4, 0.08, 5, 10, Math.PI), IRON, placed([0.95, 0.75, 0.35], [0, 0, Math.PI]));
  b.add(new THREE.ConeGeometry(0.11, 0.24, 4), IRON, placed([0.55, 0.78, 0.35], [0, 0, 0.6]));
  b.add(new THREE.ConeGeometry(0.11, 0.24, 4), IRON, placed([1.35, 0.78, 0.35], [0, 0, -0.6]));
  return b.build();
}

/** A team-coloured dress under a stained apron, a bone saw on her belt, and an amber lantern held up. */
function surgeon(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#3E3A40', 0.11, 0.82, 0.13);
  b.add(new THREE.CylinderGeometry(0.22, 0.34, 0.9, 7), TEAM, placed([0, 1.1, 0]));
  b.add(new THREE.BoxGeometry(0.46, 1.0, 0.04), CLOTH, placed([0, 1.0, 0.2]));
  for (const [x, y] of [[-0.1, 0.8], [0.12, 1.1], [0, 0.6]] as const) b.add(new THREE.BoxGeometry(0.1, 0.08, 0.02), '#9A2E2A', placed([x, y, 0.23]));
  // A white cross on the apron: the healer, at a glance.
  b.add(new THREE.BoxGeometry(0.2, 0.06, 0.02), '#FFFFFF', placed([0, 1.3, 0.23]), 1.3);
  b.add(new THREE.BoxGeometry(0.06, 0.2, 0.02), '#FFFFFF', placed([0, 1.3, 0.23]), 1.3);
  head(b, 1.78, 0.19);
  b.add(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 8), '#3A3A3A', placed([0, 1.95, 0]));
  arm(b, -1, 1.5, 0.27, TEAM, 0.3);
  b.add(new THREE.BoxGeometry(0.13, 0.6, 0.13), TEAM, placed([0.3, 1.8, 0.05], [0, 0, -2.7]));
  lantern(b, 0.44, 2.3, 0.05, 0.18);
  b.add(new THREE.BoxGeometry(0.3, 0.24, 0.16), LEATHER, placed([-0.34, 0.95, -0.05]));
  b.add(new THREE.BoxGeometry(0.04, 0.32, 0.1), BONE, placed([0.28, 0.9, 0.14], [0, 0, 0.2]));
  return b.build();
}

/** A skeleton with a rusted sword, jaw hanging open, ghost fire in its eyes. */
function rattler(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.08, 0.82, 0.08), BONE, placed([s * 0.12, 0.41, 0]));
  b.add(new THREE.BoxGeometry(0.38, 0.1, 0.16), BONE, placed([0, 0.86, 0]));
  b.add(new THREE.BoxGeometry(0.07, 0.6, 0.07), BONE, placed([0, 1.15, 0]));
  for (let r = 0; r < 4; r++) b.add(new THREE.BoxGeometry(0.38 - r * 0.04, 0.045, 0.22), BONE, placed([0, 1.05 + r * 0.11, 0.02]));
  b.add(new THREE.SphereGeometry(0.2, 8, 6), BONE, placed([0, 1.62, 0.02]));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.065, 5, 4), TEAM, placed([s * 0.075, 1.64, 0.17]));
  b.add(new THREE.BoxGeometry(0.2, 0.07, 0.14), BONE, placed([0, 1.42, 0.1], [0.4, 0, 0]));
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.07, 0.6, 0.07), BONE, placed([s * 0.24, 1.2, 0.05], [0, 0, s * 0.3]));
  b.add(new THREE.BoxGeometry(0.06, 0.78, 0.11), '#9A7A5A', placed([0.38, 1.25, 0.25], [0.6, 0, -0.2]));
  // A tattered sash of ghost light.
  b.add(new THREE.BoxGeometry(0.4, 0.08, 0.24), TEAM, placed([0, 0.95, 0], [0, 0, 0.5]));
  return b.build();
}

/** Bloated and dripping, wrapped in seaweed, reaching out with glowing hands. */
function grabber(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  legs(b, '#6A8A7A', 0.17, 0.62, 0.2);
  b.add(new THREE.SphereGeometry(0.46, 8, 7), '#8AAA98', placed([0, 1.05, 0], [0, 0, 0], [1, 1.1, 0.9]));
  for (let k = 0; k < 5; k++) b.add(new THREE.TorusGeometry(0.44, 0.045, 4, 10), '#4A6A40', placed([0, 0.8 + k * 0.12, 0], [Math.PI / 2 + k * 0.2, 0, k * 0.4]));
  head(b, 1.6, 0.21, '#9ABAA8');
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.17, 0.17, 0.7), '#8AAA98', placed([s * 0.42, 1.2, 0.4]));
    b.add(new THREE.SphereGeometry(0.13, 6, 5), TEAM, placed([s * 0.42, 1.2, 0.8]));
  }
  for (let k = 0; k < 4; k++) b.add(new THREE.BoxGeometry(0.04, 0.4, 0.04), '#4A6A40', placed([-0.3 + k * 0.2, 0.55, 0.3]));
  return b.build();
}

/** A floating hooded shape with no legs, drawing a bow of ghost light. */
function wraithArcher(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.ConeGeometry(0.42, 1.5, 7, 1, true), '#5A8A78', placed([0, 1.05, 0], [Math.PI, 0, 0]));
  b.add(new THREE.CylinderGeometry(0.16, 0.36, 0.7, 7), '#5A8A78', placed([0, 1.6, 0]));
  b.add(new THREE.ConeGeometry(0.27, 0.5, 7), '#3E6A5A', placed([0, 2.12, -0.03]));
  b.add(new THREE.SphereGeometry(0.15, 6, 5), '#0A120E', placed([0, 1.98, 0.07]));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.04, 4, 3), TEAM, placed([s * 0.05, 2.0, 0.19]));
  for (let k = 0; k < 7; k++) {
    const a = -0.9 + (k / 6) * 1.8;
    b.add(new THREE.BoxGeometry(0.06, 0.24, 0.06), TEAM, placed([-0.3 + Math.cos(a) * 0.08, 1.6 + Math.sin(a) * 0.62, 0.42]));
  }
  return b.build();
}

/** A giant skeleton carrying its own skull like a lantern. */
function bosun(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.15, 1.3, 0.15), BONE, placed([s * 0.26, 0.65, 0]));
  b.add(new THREE.BoxGeometry(0.7, 0.16, 0.3), BONE, placed([0, 1.36, 0]));
  b.add(new THREE.BoxGeometry(0.11, 1.0, 0.11), BONE, placed([0, 1.85, 0]));
  for (let r = 0; r < 5; r++) b.add(new THREE.BoxGeometry(0.8 - r * 0.07, 0.08, 0.4), BONE, placed([0, 1.55 + r * 0.16, 0.03]));
  b.add(new THREE.BoxGeometry(1.0, 0.15, 0.3), BONE, placed([0, 2.4, 0]));
  // A cape of ghost light where the head should be.
  b.add(new THREE.BoxGeometry(1.0, 1.1, 0.06), TEAM, placed([0, 1.95, -0.22], [0.15, 0, 0]));
  b.add(new THREE.BoxGeometry(0.13, 1.0, 0.13), BONE, placed([-0.62, 1.95, 0.1], [0, 0, 0.15]));
  b.add(new THREE.SphereGeometry(0.27, 8, 6), BONE, placed([-0.72, 1.3, 0.2]));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.085, 5, 4), TEAM, placed([-0.72 + s * 0.1, 1.33, 0.43]));
  b.add(new THREE.BoxGeometry(0.13, 1.0, 0.13), BONE, placed([0.62, 1.95, 0.25], [0.6, 0, -0.15]));
  b.add(new THREE.BoxGeometry(0.11, 1.3, 0.24), STEEL, placed([0.66, 2.5, 0.75], [1.0, 0, 0]), 0.7);
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

const isGhostType = (type: TroopType) => (GHOST_TROOPS as readonly string[]).includes(type);

/**
 * A troop material: vertex colours, with TEAM parts taking the instance's side colour, and a
 * glow of their own so figures never go black at night. Team parts glow brightest.
 */
function troopMaterial(ghostly: boolean): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: ghostly,
    opacity: ghostly ? 0.82 : 1,
    depthWrite: !ghostly,
  });
  const base = ghostly ? '0.45' : '0.28';
  const team = ghostly ? '1.1' : '0.75';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTeam;').replace(
      '#include <color_vertex>',
      `#include <color_vertex>
      vTeam = step(0.97, color.r) * step(color.g, 0.03) * step(0.97, color.b);
      #ifdef USE_INSTANCING_COLOR
        vColor.rgb = mix(color.rgb, instanceColor.rgb, vTeam);
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTeam;').replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * (${base} + vTeam * ${team});`,
    );
  };
  return material;
}

/** A troop to draw: from a battle, or a garrison idling on an island. */
export interface TroopView {
  readonly troop: Troop;
  readonly team: Team;
}

/** An arrow in flight, drawn only. */
interface Arrow {
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
  readonly fromY: number;
  readonly toY: number;
  readonly start: number;
  readonly team: Team;
}

const ARROW_SECONDS = 0.35;

/**
 * One instanced mesh per troop type, plus side markers, health bars and arrows. Living crews are
 * solid; the dead are see-through.
 */
export class TroopSet {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<TroopType, THREE.InstancedMesh>();
  private readonly living = troopMaterial(false);
  private readonly ghostly = troopMaterial(true);
  private readonly markerMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  /** Rings under your troops, diamonds under enemies'. */
  private readonly rings: THREE.InstancedMesh;
  private readonly diamonds: THREE.InstancedMesh;
  private readonly barMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false, transparent: true, toneMapped: false });
  private readonly barBack: THREE.InstancedMesh;
  private readonly barFill: THREE.InstancedMesh;
  private readonly arrowMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  private readonly arrowMesh: THREE.InstancedMesh;
  private readonly arrows: Arrow[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly dark = new THREE.Color('#14100E');
  private readonly flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  /** When each fallen troop fell, render seconds. */
  private readonly fellAt = new Map<number, number>();

  constructor(
    private readonly capacity = 48,
    /** Health bars and arrows are for battles; idle garrisons don't need them. */
    private readonly battle = true,
  ) {
    for (const type of TROOP_TYPES) {
      const ghost = isGhostType(type);
      const mesh = new THREE.InstancedMesh(BUILDERS[type](), ghost ? this.ghostly : this.living, capacity);
      // Colour every instance once, so the shader is built with instance colours.
      for (let i = 0; i < capacity; i++) mesh.setColorAt(i, TEAM_COLORS.mine);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `troop-${type}`;
      if (ghost) mesh.renderOrder = 3;
      this.meshes.set(type, mesh);
      this.group.add(mesh);
    }
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, order: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      for (let i = 0; i < count; i++) mesh.setColorAt(i, TEAM_COLORS.mine);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      this.group.add(mesh);
      return mesh;
    };
    this.rings = make(new THREE.RingGeometry(0.42, 0.56, 20), this.markerMaterial, capacity, 2);
    this.diamonds = make(new THREE.RingGeometry(0.4, 0.58, 4, 1, Math.PI / 4), this.markerMaterial, capacity, 2);
    this.barBack = make(new THREE.PlaneGeometry(1, 0.16), this.barMaterial, battle ? capacity : 1, 7);
    this.barFill = make(new THREE.PlaneGeometry(1, 0.1).translate(0.5, 0, 0.01), this.barMaterial, battle ? capacity : 1, 8);
    this.arrowMesh = make(new THREE.BoxGeometry(0.05, 0.05, 0.9), this.arrowMaterial, battle ? 32 : 1, 6);
  }

  /** An arrow (or a bolt of ghost light) from one point to another, for a ranged strike. */
  shoot(fromX: number, fromZ: number, toX: number, toZ: number, team: Team, time: number, groundAt: (x: number, z: number) => number): void {
    if (!this.battle) return;
    if (this.arrows.length >= 32) this.arrows.shift();
    this.arrows.push({ fromX, fromZ, toX, toZ, fromY: groundAt(fromX, fromZ) + 2.6, toY: groundAt(toX, toZ) + 1.6, start: time, team });
  }

  /**
   * Draws troops between two ticks. `teamOf` says whose each is; `camera` turns health bars to face
   * it. `groundAt` gives the terrain height at a point.
   */
  update(
    prev: readonly Troop[],
    current: readonly TroopView[],
    alpha: number,
    tick: number,
    time: number,
    groundAt: (x: number, z: number) => number,
    camera?: THREE.Camera,
  ): void {
    const before = new Map(prev.map((t) => [t.id, t]));
    const counts = new Map<TroopType, number>();
    let rings = 0;
    let diamonds = 0;
    let bars = 0;
    for (const { troop: t, team } of current) {
      const mesh = this.meshes.get(t.type)!;
      let fallen = 0;
      if (t.dead) {
        if (!this.fellAt.has(t.id)) this.fellAt.set(t.id, time);
        fallen = time - this.fellAt.get(t.id)!;
        // The fallen lie a while, then sink away.
        if (fallen > 3) continue;
      }
      const index = counts.get(t.type) ?? 0;
      if (index >= this.capacity) continue;
      counts.set(t.type, index + 1);
      const p = before.get(t.id) ?? t;
      const x = p.x + (t.x - p.x) * alpha;
      const z = p.z + (t.z - p.z) * alpha;
      const ground = groundAt(x, z);
      const moving = Math.hypot(t.x - p.x, t.z - p.z) > 1e-4;
      const ghost = isGhostType(t.type);
      const sinceStrike = (tick - t.struckAt) * TICK_SECONDS;
      const lunge = sinceStrike >= 0 && sinceStrike < 0.25 ? Math.sin((sinceStrike / 0.25) * Math.PI) * 0.4 : 0;
      const bob = moving ? Math.abs(Math.sin(time * 9 + t.id)) * 0.12 : 0;
      const hover = ghost ? 0.25 + Math.sin(time * 2 + t.id) * 0.12 : 0;
      this.pos.set(x, ground - 0.05 + bob + hover - (fallen > 1.5 ? (fallen - 1.5) * 0.6 : 0), z);
      this.euler.set(t.dead ? -Math.min(1.45, fallen * 4) : lunge, t.facing, moving ? Math.sin(time * 9 + t.id) * 0.06 : 0, 'YXZ');
      this.quat.setFromEuler(this.euler);
      this.scale.setScalar(TROOP_DRAW_SCALE);
      mesh.setMatrixAt(index, this.matrix.compose(this.pos, this.quat, this.scale));
      // The fallen fade to grey.
      this.color.copy(TEAM_COLORS[team]);
      if (t.dead) this.color.lerp(this.dark, Math.min(1, fallen));
      mesh.setColorAt(index, this.color);
      if (t.dead) continue;

      // A ring under your own, a diamond under the enemy's.
      const marker = team === 'mine' ? this.rings : this.diamonds;
      const m = team === 'mine' ? rings++ : diamonds++;
      if (m < this.capacity) {
        this.pos.set(x, ground + 0.08, z);
        this.scale.setScalar(t.type === 'brute' || t.type === 'bosun' ? 2.4 : 1.6);
        marker.setMatrixAt(m, this.matrix.compose(this.pos, this.flat, this.scale));
        marker.setColorAt(m, TEAM_COLORS[team]);
      }

      // A health bar over its head, facing the camera.
      if (this.battle && camera && bars < this.capacity) {
        const tall = t.type === 'brute' || t.type === 'bosun' ? 3.2 : t.type === 'powderMonkey' ? 2.4 : 2.7;
        this.pos.set(x, ground + tall * TROOP_DRAW_SCALE * 0.8 + hover, z);
        this.scale.set(1.2, 1, 1);
        this.barBack.setMatrixAt(bars, this.matrix.compose(this.pos, camera.quaternion, this.scale));
        this.barBack.setColorAt(bars, this.dark);
        const share = Math.max(0, Math.min(1, t.hp / t.maxHp));
        this.pos.set(x, ground + tall * TROOP_DRAW_SCALE * 0.8 + hover, z).add(new THREE.Vector3(-0.6, 0, 0).applyQuaternion(camera.quaternion));
        this.scale.set(1.2 * share, 1, 1);
        this.barFill.setMatrixAt(bars, this.matrix.compose(this.pos, camera.quaternion, this.scale));
        this.barFill.setColorAt(bars, TEAM_COLORS[team]);
        bars++;
      }
    }
    for (const [type, mesh] of this.meshes) {
      mesh.count = counts.get(type) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.finish(this.rings, rings);
    this.finish(this.diamonds, diamonds);
    this.finish(this.barBack, bars);
    this.finish(this.barFill, bars);

    // Arrows fly on a low arc and vanish when they land.
    let a = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i]!;
      const p = (time - arrow.start) / ARROW_SECONDS;
      if (p > 1 || p < 0) {
        if (p > 1) this.arrows.splice(i, 1);
        continue;
      }
      const x = arrow.fromX + (arrow.toX - arrow.fromX) * p;
      const z = arrow.fromZ + (arrow.toZ - arrow.fromZ) * p;
      const y = arrow.fromY + (arrow.toY - arrow.fromY) * p + Math.sin(p * Math.PI) * 1.2;
      const yaw = Math.atan2(arrow.toX - arrow.fromX, arrow.toZ - arrow.fromZ);
      this.pos.set(x, y, z);
      this.quat.setFromEuler(this.euler.set(-Math.cos(p * Math.PI) * 0.5, yaw, 0, 'YXZ'));
      this.scale.setScalar(1);
      this.arrowMesh.setMatrixAt(a, this.matrix.compose(this.pos, this.quat, this.scale));
      this.color.set(arrow.team === 'ghost' ? PALETTE.spectral : LANTERN).multiplyScalar(1.6);
      this.arrowMesh.setColorAt(a++, this.color);
    }
    this.finish(this.arrowMesh, a);
  }

  private finish(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = Math.min(count, mesh.instanceMatrix.count);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Lines every troop type up in a row facing `heading`, for looking at the art: living ones in your colours. */
  lineup(x: number, z: number, heading: number, groundAt: (x: number, z: number) => number, time: number): void {
    const px = Math.cos(heading);
    const pz = -Math.sin(heading);
    const views: TroopView[] = TROOP_TYPES.map((type, i) => {
      const offset = (i - (TROOP_TYPES.length - 1) / 2) * 2.6;
      const tx = x + px * offset;
      const tz = z + pz * offset;
      const troop: Troop = { id: 9000 + i, type, side: 'player', x: tx, z: tz, hp: 1, maxHp: 1, cooldown: 0, slowedUntil: 0, postX: tx, postZ: tz, facing: heading, struckAt: -100, dead: false };
      return { troop, team: isGhostType(type) ? 'ghost' : 'mine' };
    });
    this.update([], views, 1, 0, time, groundAt);
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    for (const mesh of [this.rings, this.diamonds, this.barBack, this.barFill, this.arrowMesh]) mesh.geometry.dispose();
    this.living.dispose();
    this.ghostly.dispose();
    this.markerMaterial.dispose();
    this.barMaterial.dispose();
    this.arrowMaterial.dispose();
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
  b.add(new THREE.BoxGeometry(0.03, 0.5, 0.7), PALETTE.teamMine, placed([0.05, 3.0, -0.4]), 1.2);
  b.add(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 7), '#2C2C32', placed([0, 0.95, 1.85], [Math.PI / 2 - 0.15, 0, 0]));
  b.add(new THREE.BoxGeometry(0.2, 0.3, 0.2), '#2C2C32', placed([0, 0.72, 1.6]));
  b.add(new THREE.BoxGeometry(0.16, 0.2, 0.16), LANTERN, placed([0, 0.9, -2.0]), 1.6);
  return b.build();
}

/** The rowboat that takes the landing party ashore: room for four, oars out, a lantern at the stern. */
export function rowboatGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const hull = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(hull, '#7A5A40', placed([0, 0.4, 0], [0, 0, 0], [0.85, 0.45, 2.1]));
  b.add(new THREE.BoxGeometry(1.65, 0.1, 4.0), '#5A4030', placed([0, 0.42, 0]));
  for (const z of [-0.8, 0.2, 1.1]) b.add(new THREE.BoxGeometry(1.5, 0.08, 0.28), PALETTE.deck, placed([0, 0.36, z]));
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.06, 0.06, 2.2), WOOD, placed([s * 1.0, 0.45, 0.2], [0, s * 0.5, s * 0.4]));
  b.add(new THREE.BoxGeometry(0.03, 0.4, 0.5), PALETTE.teamMine, placed([0, 1.0, -1.7]), 1.2);
  b.add(new THREE.BoxGeometry(0.03, 0.9, 0.03), WOOD, placed([0, 0.8, -1.7]));
  b.add(new THREE.BoxGeometry(0.15, 0.19, 0.15), LANTERN, placed([0, 0.62, -1.55]), 1.8);
  return b.build();
}

/** The gate's portcullis, drawn apart from the fort so it can fall. Faces along +X, `width` wide. */
export function portcullisGeometry(width: number, height: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (let i = 0; i < 5; i++) b.add(new THREE.BoxGeometry(0.12, height, 0.12), '#2C2C32', placed([0, height / 2, -width / 2 + ((i + 0.5) / 5) * width]));
  for (const y of [0.5, height * 0.55, height - 0.3]) b.add(new THREE.BoxGeometry(0.1, 0.1, width), '#2C2C32', placed([0, y, 0]));
  b.add(new THREE.BoxGeometry(0.2, 0.5, width * 0.5), '#3A2A1E', placed([0.05, 0.6, 0]));
  return b.build();
}
