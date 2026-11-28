import * as THREE from 'three';
import { extraPosition, fortLayout, slotPosition, type BonusType, type DefenseType } from '../sim/layout';
import type { World } from '../sim/world';
import { hauntedKeepGeometry } from './fortMeshes';
import { lighthouseGeometry } from './islands';
import { MeshBuilder, placed, vertexColorMaterial } from './meshBuilder';
import { PALETTE } from './palette';

const STONE = '#8A8478';
const STONE_DARK = '#5E5A52';
const IRON = '#26262A';
const WOOD = '#5A4028';
const BONE = '#D8CDB2';
const PUMPKIN = '#E07A1F';

const GOLD = '#E8B04A';
const POWDER_RED = '#8A1E1A';

/** Height of each defense's glowing part above its base, metres. */
export const GLOW_HEIGHT: Readonly<Record<DefenseType | 'keep' | BonusType, number>> = {
  cannonTower: 2.6,
  spiritLantern: 6.85,
  boneCatapult: 2.2,
  mine: 0.4,
  keep: 10.5,
  vault: 1.9,
  powder: 1.7,
};

/** A treasure vault: a squat stone crypt with iron bands, its lid pushed aside on a heap of gold. */
function vaultGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.BoxGeometry(2.8, 0.4, 2.2).translate(0, 0.2, 0), STONE_DARK);
  b.add(new THREE.BoxGeometry(2.4, 1.2, 1.8).translate(0, 1.0, 0), STONE);
  for (const x of [-0.8, 0.8]) b.add(new THREE.BoxGeometry(0.16, 1.25, 1.86).translate(x, 1.0, 0), IRON);
  b.add(new THREE.BoxGeometry(2.6, 0.25, 2.0), STONE_DARK, placed([0.5, 1.75, 0.3], [0.12, 0.5, 0.18]));
  // Gold spilling out of it: coins, bars and a chalice.
  for (const [x, z, s] of [[-0.5, -0.2, 0.55], [0.1, 0.25, 0.45], [-0.15, -0.5, 0.35]] as const) {
    b.add(new THREE.SphereGeometry(s, 6, 4), GOLD, placed([x, 1.6 + s * 0.3, z], [0, 0, 0], [1, 0.45, 1]), 1.15);
  }
  b.add(new THREE.BoxGeometry(0.5, 0.15, 0.22), GOLD, placed([0.45, 1.68, -0.45], [0, 0.4, 0]), 1.2);
  b.add(new THREE.CylinderGeometry(0.14, 0.08, 0.35, 6).translate(-0.7, 1.85, 0.4), GOLD, undefined, 1.2);
  // A skull on the front, so nobody mistakes it for a gift.
  b.add(new THREE.SphereGeometry(0.22, 6, 5), BONE, placed([0, 1.05, 0.92]));
  return b.build();
}

/** A powder store: barrels of black powder on a pallet, banded red, under a skull-and-bones board. */
function powderGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.BoxGeometry(2.6, 0.2, 2.0).translate(0, 0.1, 0), WOOD);
  const barrel = (x: number, y: number, z: number, lying: boolean) => {
    const rotation: [number, number, number] = lying ? [0, 0, Math.PI / 2] : [0, 0, 0];
    b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 8), '#4A3524', placed([x, y, z], rotation));
    b.add(new THREE.CylinderGeometry(0.44, 0.44, 0.12, 8), POWDER_RED, placed([x, y, z], rotation));
  };
  barrel(-0.6, 0.68, -0.4, false);
  barrel(0.45, 0.68, -0.45, false);
  barrel(-0.1, 0.68, 0.5, false);
  barrel(-0.1, 1.55, -0.4, true);
  // The warning board, on a post.
  b.add(new THREE.BoxGeometry(0.12, 2.0, 0.12).translate(1.05, 1.0, 0.7), WOOD);
  b.add(new THREE.BoxGeometry(0.85, 0.6, 0.06).translate(1.05, 1.95, 0.76), '#2A2020');
  b.add(new THREE.SphereGeometry(0.15, 6, 5), BONE, placed([1.05, 2.0, 0.81]));
  b.add(new THREE.BoxGeometry(0.5, 0.06, 0.04), BONE, placed([1.05, 1.82, 0.81], [0, 0, 0.6]));
  b.add(new THREE.BoxGeometry(0.5, 0.06, 0.04), BONE, placed([1.05, 1.82, 0.81], [0, 0, -0.6]));
  return b.build();
}

function cannonTowerGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.CylinderGeometry(2.3, 2.7, 1.0, 8).translate(0, 0.5, 0), STONE_DARK);
  b.add(new THREE.CylinderGeometry(1.9, 2.2, 3.2, 8).translate(0, 2.6, 0), STONE);
  b.add(new THREE.CylinderGeometry(2.25, 2.25, 0.4, 8).translate(0, 4.4, 0), STONE_DARK);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    b.add(new THREE.BoxGeometry(0.7, 0.6, 0.45), STONE, placed([Math.sin(a) * 2, 4.9, Math.cos(a) * 2], [0, a, 0]));
  }
  b.add(new THREE.CylinderGeometry(0.28, 0.36, 2.6, 8), IRON, placed([0, 4.45, 1.5], [Math.PI / 2, 0, 0]));
  b.add(new THREE.BoxGeometry(0.5, 0.7, 0.1), PALETTE.lantern, placed([0, 2.6, 2.13]), 0.8);
  return b.build();
}

function spiritLanternGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.CylinderGeometry(1.1, 1.4, 0.8, 6).translate(0, 0.4, 0), STONE_DARK);
  b.add(new THREE.BoxGeometry(0.35, 5.4, 0.35).translate(0, 3.5, 0), PALETTE.deadWood);
  b.add(new THREE.BoxGeometry(1.25, 0.12, 1.25).translate(0, 6.1, 0), IRON);
  b.add(new THREE.BoxGeometry(1.25, 0.12, 1.25).translate(0, 7.6, 0), IRON);
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]] as const) {
    b.add(new THREE.BoxGeometry(0.08, 1.5, 0.08).translate(x, 6.85, z), IRON);
  }
  b.add(new THREE.ConeGeometry(0.9, 0.8, 4).translate(0, 8.05, 0), IRON, placed([0, 0, 0], [0, Math.PI / 4, 0]));
  return b.build();
}

function boneCatapultGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const x of [-0.9, 0.9]) {
    b.add(new THREE.BoxGeometry(0.3, 0.4, 3.2).translate(x, 0.3, 0), WOOD);
    b.add(new THREE.BoxGeometry(0.25, 1.9, 0.25).translate(x, 1.35, -0.2), WOOD, undefined, 0.9);
  }
  b.add(new THREE.BoxGeometry(2.1, 0.25, 0.3).translate(0, 0.3, 1.3), WOOD);
  b.add(new THREE.BoxGeometry(2.1, 0.25, 0.3).translate(0, 2.2, -0.2), WOOD, undefined, 0.85);
  b.add(new THREE.BoxGeometry(0.22, 0.22, 3.4).translate(0, 0, 1.2), BONE, placed([0, 2.2, -0.2], [-0.65, 0, 0]));
  b.add(new THREE.SphereGeometry(0.48, 7, 5), BONE, placed([0, 3.85, 1.95]));
  b.add(new THREE.BoxGeometry(0.16, 0.12, 0.05), IRON, placed([-0.17, 3.9, 2.42]));
  b.add(new THREE.BoxGeometry(0.16, 0.12, 0.05), IRON, placed([0.17, 3.9, 2.42]));
  for (const [x, z, r] of [[-0.6, -1.3, 0.4], [0.7, -1.4, -0.3], [0.1, -1.6, 1.2]] as const) {
    b.add(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 4), BONE, placed([x, 0.1, z], [Math.PI / 2, r, 0]));
  }
  return b.build();
}

function mineGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const body = new THREE.SphereGeometry(1.0, 10, 6);
  const position = body.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const ribs = 1 + 0.08 * Math.cos(Math.atan2(x, z) * 10);
    position.setXYZ(i, x * ribs, position.getY(i) * 0.72, z * ribs);
  }
  b.add(body, PUMPKIN);
  b.add(new THREE.CylinderGeometry(0.1, 0.16, 0.45, 5).translate(0, 0.85, 0), '#4A5A2A');
  // A carved face that faces the shore, outward.
  b.add(new THREE.BoxGeometry(0.22, 0.2, 0.08), '#FFD27A', placed([-0.3, 0.18, 0.96]));
  b.add(new THREE.BoxGeometry(0.22, 0.2, 0.08), '#FFD27A', placed([0.3, 0.18, 0.96]));
  b.add(new THREE.BoxGeometry(0.62, 0.12, 0.08), '#FFD27A', placed([0, -0.22, 0.97]));
  return b.build();
}

export interface StructureView {
  readonly type: DefenseType | BonusType;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Direction the defense faces, radians (heading convention). */
  readonly facing: number;
  readonly destroyed: boolean;
  /** Hidden mines are not drawn. */
  readonly visible: boolean;
}

type DrawnType = DefenseType | BonusType;
const TYPES: readonly DrawnType[] = ['cannonTower', 'spiritLantern', 'boneCatapult', 'mine', 'vault', 'powder'];
const LEVEL_SCALE = [1, 1.12, 1.25] as const;

/** Every defense of one island, drawn as one instanced mesh per type plus one for lantern glass. */
export class StructureSet {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<DrawnType, THREE.InstancedMesh>();
  private readonly glass: THREE.InstancedMesh;
  private readonly material = vertexColorMaterial();
  private readonly glassMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly spectral = new THREE.Color(PALETTE.spectral).multiplyScalar(1.4);
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private readonly capacity = 24) {
    const builders: Record<DrawnType, () => THREE.BufferGeometry> = {
      cannonTower: cannonTowerGeometry,
      spiritLantern: spiritLanternGeometry,
      boneCatapult: boneCatapultGeometry,
      mine: mineGeometry,
      vault: vaultGeometry,
      powder: powderGeometry,
    };
    for (const type of TYPES) {
      const mesh = new THREE.InstancedMesh(builders[type](), this.material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `defense-${type}`;
      this.meshes.set(type, mesh);
      this.group.add(mesh);
    }
    this.glass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 1.3, 0.95), this.glassMaterial, capacity);
    this.glass.count = 0;
    this.glass.frustumCulled = false;
    this.group.add(this.glass);
  }

  /** Draws these defenses. Destroyed ones become dark rubble; hidden mines vanish. */
  set(views: readonly StructureView[]): void {
    const counts = new Map<DrawnType, number>();
    let glassCount = 0;
    for (const v of views) {
      const mesh = this.meshes.get(v.type);
      const index = counts.get(v.type) ?? 0;
      if (!mesh || index >= this.capacity) continue;
      counts.set(v.type, index + 1);
      const s = LEVEL_SCALE[Math.min(2, Math.max(0, v.level - 1))]!;
      if (!v.visible) {
        mesh.setMatrixAt(index, this.hidden);
      } else if (v.destroyed) {
        this.matrix.compose(
          new THREE.Vector3(v.x, v.y - 0.3, v.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, v.facing, 0.18)),
          new THREE.Vector3(s, s * 0.32, s),
        );
        mesh.setMatrixAt(index, this.matrix);
      } else {
        this.matrix.compose(new THREE.Vector3(v.x, v.y, v.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.facing, 0)), new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(index, this.matrix);
      }
      this.color.setScalar(v.destroyed ? 0.22 : v.level === 3 ? 1.12 : 1);
      mesh.setColorAt(index, this.color);
      if (v.type === 'spiritLantern' && !v.destroyed && glassCount < this.capacity) {
        this.matrix.compose(new THREE.Vector3(v.x, v.y + GLOW_HEIGHT.spiritLantern * s, v.z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
        this.glass.setMatrixAt(glassCount, this.matrix);
        this.glass.setColorAt(glassCount, this.spectral);
        glassCount++;
      }
    }
    for (const [type, mesh] of this.meshes) {
      mesh.count = counts.get(type) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.glass.count = glassCount;
    this.glass.instanceMatrix.needsUpdate = true;
    if (this.glass.instanceColor) this.glass.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.glass.geometry.dispose();
    this.material.dispose();
    this.glassMaterial.dispose();
  }
}

/** A keep as drawn in a battle. */
export interface KeepMesh {
  readonly mesh: THREE.Group;
  /** The lamp glass, or a skull tower's burning eyes. Hidden when the keep falls. */
  readonly glass: THREE.Mesh;
  /** Height of the keep's light above its base, after scaling. */
  readonly lanternHeight: number;
  /** Height of the keep's highest point above its base, after scaling. */
  readonly top: number;
  /** Whether the keep has a lamp (true) or burning eyes (false). */
  readonly lamp: boolean;
  readonly scale: number;
  dispose(): void;
}

/**
 * A keep model, `scale` times its normal size: the lighthouse for living islands, and for haunted
 * ones the keep of its fort level (ghost spire, broken lighthouse or skull tower).
 */
export function createKeepMesh(living: boolean, scale = 1, fortLevel = 1): KeepMesh {
  const group = new THREE.Group();
  group.scale.setScalar(scale);
  const { body, lanternHeight, eyes } = living ? { ...lighthouseGeometry(), eyes: [] } : hauntedKeepGeometry(fortLevel);
  body.computeBoundingBox();
  const top = body.boundingBox?.max.y ?? lanternHeight + 2;
  const material = vertexColorMaterial();
  group.add(new THREE.Mesh(body, material));
  const glassMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(living ? PALETTE.lantern : PALETTE.spectral).multiplyScalar(1.4),
    toneMapped: false,
  });
  let glassGeometry: THREE.BufferGeometry;
  if (eyes.length > 0) {
    const b = new MeshBuilder();
    for (const [x, y, z] of eyes) b.add(new THREE.BoxGeometry(0.62, 0.42, 0.3), '#ffffff', placed([x, y, z]));
    glassGeometry = b.build();
  } else {
    glassGeometry = new THREE.BoxGeometry(living ? 2.3 : 1.4, living ? 1.5 : 1.7, living ? 2.3 : 1.4).translate(0, lanternHeight, 0);
  }
  const glass = new THREE.Mesh(glassGeometry, glassMaterial);
  group.add(glass);
  return {
    mesh: group,
    glass,
    lanternHeight: lanternHeight * scale,
    top: top * scale,
    lamp: eyes.length === 0,
    scale,
    dispose() {
      body.dispose();
      material.dispose();
      glassGeometry.dispose();
      glassMaterial.dispose();
    },
  };
}

/** A haunted fort's towers, vaults and powder stores as seen from the open sea, before anyone attacks. Mines stay hidden. */
export function fortDefenseViews(world: World, groundAt: (islandId: number, x: number, z: number) => number): Array<StructureView & { readonly islandId: number }> {
  const views: Array<StructureView & { readonly islandId: number }> = [];
  for (const island of world.islands) {
    if (island.kind !== 'haunted') continue;
    const layout = fortLayout(island);
    const add = (type: DrawnType, level: number, p: { x: number; z: number }) => {
      const x = island.x + p.x;
      const z = island.z + p.z;
      views.push({ islandId: island.id, type, level, x, y: groundAt(island.id, x, z), z, facing: Math.atan2(p.x, p.z), destroyed: false, visible: true });
    };
    for (const d of layout.defenses) if (d.type !== 'mine') add(d.type, d.level, slotPosition(island.radius, d.slot, layout.slotCount));
    for (const e of layout.extras) add(e.type, layout.level, extraPosition(island.radius, e.slot, layout.slotCount));
  }
  return views;
}
