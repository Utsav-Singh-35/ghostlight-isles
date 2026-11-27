import * as THREE from 'three';
import { MeshBuilder, placed, vertexColorMaterial, type Vec3 } from './meshBuilder';
import { PALETTE } from './palette';

/** A cross-section of the hull. The model faces +Z; port is +X, starboard is −X. */
interface Station {
  readonly z: number;
  readonly beam: number;
  readonly keel: number;
  readonly deck: number;
}

const STATIONS: readonly Station[] = [
  { z: -5.6, beam: 1.5, keel: -0.65, deck: 1.85 },
  { z: -4.5, beam: 1.85, keel: -1.0, deck: 1.55 },
  { z: -2.4, beam: 2.0, keel: -1.2, deck: 1.15 },
  { z: 0.3, beam: 2.05, keel: -1.25, deck: 1.05 },
  { z: 2.8, beam: 1.8, keel: -1.15, deck: 1.15 },
  { z: 4.6, beam: 1.15, keel: -0.8, deck: 1.4 },
  { z: 6.1, beam: 0.12, keel: 0.2, deck: 1.75 },
];

/** One side of a cross-section, from the deck edge down to the keel: [width share, depth share]. */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [1.0, 0],
  [1.03, 0.28],
  [0.93, 0.62],
  [0.55, 0.9],
];

export const SHIP_LENGTH = 11.7;
export const SHIP_BEAM = 4.1;

function deckHeight(z: number): number {
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = STATIONS[i]!;
    const b = STATIONS[i + 1]!;
    if (z >= a.z && z <= b.z) return a.deck + ((b.deck - a.deck) * (z - a.z)) / (b.z - a.z);
  }
  return z < 0 ? STATIONS[0]!.deck : STATIONS[STATIONS.length - 1]!.deck;
}

/** The closed loop of one cross-section: port deck edge, down to the keel, up to the starboard deck edge. */
function sectionLoop(s: Station): Vec3[] {
  const point = (side: number, [w, d]: readonly [number, number]): Vec3 => [
    side * s.beam * w,
    s.deck + (s.keel - s.deck) * d,
    s.z,
  ];
  const port = PROFILE.map((p) => point(1, p));
  const starboard = PROFILE.map((p) => point(-1, p)).reverse();
  return [...port, [0, s.keel, s.z], ...starboard];
}

function addFigure(b: MeshBuilder, at: Vec3, coat: string, facing: number): void {
  const [x, y, z] = at;
  b.add(new THREE.CylinderGeometry(0.2, 0.27, 1.0, 6).translate(0, 0.5, 0), coat, placed([x, y, z], [0, facing, 0]));
  b.add(new THREE.SphereGeometry(0.21, 6, 4).translate(0, 1.22, 0), PALETTE.crewSkin, placed([x, y, z]));
  b.add(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 7).translate(0, 1.42, 0), PALETTE.crewHat, placed([x, y, z]));
  b.add(new THREE.ConeGeometry(0.24, 0.3, 6).translate(0, 1.58, 0), PALETTE.crewHat, placed([x, y, z]));
}

function hullGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const loops = STATIONS.map(sectionLoop);
  const last = loops[0]!.length - 1;

  for (let s = 0; s < loops.length - 1; s++) {
    const a = loops[s]!;
    const c = loops[s + 1]!;
    for (let k = 0; k < last; k++) {
      const y = (a[k]![1] + a[k + 1]![1] + c[k]![1] + c[k + 1]![1]) / 4;
      const color = k === 0 || k === last - 1 ? PALETTE.hullTrim : y < -0.2 ? PALETTE.hullTar : PALETTE.hullDark;
      b.quad(a[k]!, a[k + 1]!, c[k + 1]!, c[k]!, color, k % 2 ? 0.92 : 1);
    }
    // Deck and bulwarks.
    b.quad(a[0]!, a[last]!, c[last]!, c[0]!, PALETTE.deck, s % 2 ? 0.9 : 1);
    for (const k of [0, last]) {
      const lift = (v: Vec3): Vec3 => [v[0] * 0.97, v[1] + 0.5, v[2]];
      b.quad(a[k]!, c[k]!, lift(c[k]!), lift(a[k]!), PALETTE.hullDark, 0.85);
    }
  }

  // Transom: a fan across the stern.
  const stern = loops[0]!;
  const centre: Vec3 = [0, (STATIONS[0]!.deck + STATIONS[0]!.keel) / 2, STATIONS[0]!.z];
  for (let k = 0; k < last; k++) b.tri(centre, stern[k]!, stern[k + 1]!, PALETTE.hullDark, 0.8);
  b.tri(centre, stern[last]!, stern[0]!, PALETTE.hullDark, 0.8);
  for (const x of [-0.7, 0, 0.7]) {
    b.add(new THREE.BoxGeometry(0.4, 0.35, 0.05), PALETTE.lantern, placed([x, 1.2, STATIONS[0]!.z - 0.03]), 0.55);
  }

  // Masts, yards, bowsprit and the wheel.
  b.add(new THREE.CylinderGeometry(0.12, 0.2, 10.2, 6), PALETTE.mast, placed([0, deckHeight(-0.6) + 5.1, -0.6]));
  b.add(new THREE.CylinderGeometry(0.1, 0.17, 8.4, 6), PALETTE.mast, placed([0, deckHeight(3.2) + 4.2, 3.2]));
  const yards: Array<[number, number, number]> = [
    [-0.6, 7.6, 6.6],
    [-0.6, 10.3, 4.6],
    [3.2, 6.4, 5.6],
    [3.2, 8.75, 4.0],
  ];
  for (const [z, y, width] of yards) {
    b.add(new THREE.CylinderGeometry(0.07, 0.07, width, 5), PALETTE.mast, placed([0, y, z + 0.15], [0, 0, Math.PI / 2]));
  }
  b.add(new THREE.CylinderGeometry(0.06, 0.12, 4.2, 5), PALETTE.mast, placed([0, 2.4, 7.4], [Math.PI / 2 - 0.35, 0, 0]));
  b.add(new THREE.BoxGeometry(0.1, 0.9, 0.1).translate(0, 0.45, 0), PALETTE.mast, placed([0, deckHeight(-3.1), -3.1]));
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 8), PALETTE.mast, placed([0, deckHeight(-3.1) + 1.0, -3.05], [Math.PI / 2, 0, 0]));

  // The stern lantern's frame.
  b.add(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(0, 0.55, 0), PALETTE.mast, placed([0, STATIONS[0]!.deck, -5.45]));
  b.add(new THREE.BoxGeometry(0.42, 0.06, 0.42), PALETTE.flag, placed([0, STATIONS[0]!.deck + 1.6, -5.45]));

  // The two crew: a helmsman at the wheel and a lookout at the bow.
  addFigure(b, [0, deckHeight(-3.7), -3.7], PALETTE.crewCoatBlue, 0);
  addFigure(b, [0.55, deckHeight(3.9), 3.9], PALETTE.crewCoatRed, 0.4);

  return b.build();
}

/** A square sail hanging down from its yard, bellied forward by the wind from astern. */
function sailGeometry(width: number, height: number, belly: number): THREE.BufferGeometry {
  const cols = 4;
  const rows = 4;
  const point = (i: number, j: number): Vec3 => {
    const u = i / cols;
    const v = j / rows;
    const flare = 1 + 0.12 * v;
    return [(u - 0.5) * width * flare, -v * height, belly * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.15 + 0.85 * v))];
  };
  const b = new MeshBuilder();
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      b.quad(point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1), PALETTE.sailCloth, 1 - j * 0.04);
    }
  }
  return b.build();
}

export interface ShipModel {
  readonly group: THREE.Group;
  /** Lantern positions in the model's own space. */
  readonly sternLantern: THREE.Vector3;
  readonly bowLantern: THREE.Vector3;
  /** 0 furled, 1 fully set. */
  setSail(deployment: number): void;
  animate(time: number): void;
  dispose(): void;
}

export function createShipModel(): ShipModel {
  const group = new THREE.Group();
  group.name = 'player-ship';
  const hullMaterial = vertexColorMaterial();
  const hull = new THREE.Mesh(hullGeometry(), hullMaterial);
  group.add(hull);

  const sailMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const sailSpecs: Array<[number, number, number, number, number]> = [
    // z, top y, width, height, belly
    [-0.6, 7.55, 6.4, 4.5, 0.9],
    [-0.6, 10.25, 4.4, 2.4, 0.55],
    [3.2, 6.35, 5.4, 3.5, 0.75],
    [3.2, 8.7, 3.8, 2.1, 0.45],
  ];
  const sails = sailSpecs.map(([z, y, width, height, belly]) => {
    const sail = new THREE.Mesh(sailGeometry(width, height, belly), sailMaterial);
    sail.position.set(0, y, z + 0.25);
    group.add(sail);
    return sail;
  });

  const flagGeometry = new THREE.BufferGeometry();
  flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.45, 0, 0, -0.45, 0, 1.6, 0, 0], 3));
  flagGeometry.computeVertexNormals();
  const flagMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.flag, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(flagGeometry, flagMaterial);
  flag.position.set(0, deckHeight(-0.6) + 10.0, -0.6);
  group.add(flag);

  const glassMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lantern).multiplyScalar(1.4) });
  const glassGeometry = new THREE.BoxGeometry(0.3, 0.42, 0.3);
  const sternLantern = new THREE.Vector3(0, STATIONS[0]!.deck + 1.35, -5.45);
  const bowLantern = new THREE.Vector3(0.95, deckHeight(3.9) + 0.95, 4.1);
  for (const at of [sternLantern, bowLantern]) {
    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.position.copy(at);
    group.add(glass);
  }

  return {
    group,
    sternLantern,
    bowLantern,
    setSail(deployment) {
      const d = Math.min(1, Math.max(0, deployment));
      for (const sail of sails) sail.scale.set(1, 0.07 + 0.93 * d, 0.05 + 0.95 * d);
    },
    animate(time) {
      flag.rotation.y = -Math.PI / 2 + Math.sin(time * 3.1) * 0.25 + Math.sin(time * 7.3) * 0.08;
    },
    dispose() {
      hull.geometry.dispose();
      hullMaterial.dispose();
      for (const sail of sails) sail.geometry.dispose();
      sailMaterial.dispose();
      flagGeometry.dispose();
      flagMaterial.dispose();
      glassGeometry.dispose();
      glassMaterial.dispose();
    },
  };
}
