import * as THREE from 'three';
import { FORTS } from '../sim/balance';
import { fortDifficulty } from '../sim/layout';
import { createRng, type Rng } from '../sim/rng';
import type { Island, World } from '../sim/world';
import { addFort, blockedByFort, fortStyle, hauntedKeepGeometry, keepScale } from './fortMeshes';
import { MeshBuilder, placed, vertexColorMaterial, type Vec3 } from './meshBuilder';
import type { Shore } from './ocean';
import { PALETTE } from './palette';

export type GlowKind = 'lantern' | 'spectral';

export interface GlowSpec {
  readonly position: THREE.Vector3;
  readonly kind: GlowKind;
  /** Glow diameter in metres. */
  readonly size: number;
  /** The island it belongs to, or −1 for the ship's lanterns. */
  readonly islandId?: number;
}

export interface WispSpec {
  readonly position: THREE.Vector3;
  /** How far the wisp wanders from its anchor, metres. */
  readonly radius: number;
  readonly islandId: number;
}

export interface LightAnchor {
  readonly islandId: number;
  readonly position: THREE.Vector3;
  readonly kind: GlowKind;
}

export interface IslandScene {
  readonly group: THREE.Group;
  readonly glows: readonly GlowSpec[];
  readonly wisps: readonly WispSpec[];
  /** Candidates for real point lights: the lighthouse and one lantern per haunted island. */
  readonly lights: readonly LightAnchor[];
  /** Where each island's label floats, by island id. */
  readonly labelAnchors: readonly THREE.Vector3[];
  /** Every island's shore, for surf on the sea. */
  readonly shores: readonly Shore[];
  readonly drawCalls: number;
  /** Lights captured islands' lantern glass warm instead of green. */
  setCaptured(ids: ReadonlySet<number>): void;
  /** Terrain height at a world position on an island, or 1 if off the island. */
  groundAt(islandId: number, x: number, z: number): number;
  dispose(): void;
}

interface Placement {
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3 | number;
}

interface Colors {
  readonly sand: string;
  readonly moss: string;
  readonly rock: string;
}

const HOME_COLORS: Colors = { sand: PALETTE.homeSand, moss: PALETTE.homeMoss, rock: PALETTE.homeRock };
const HAUNTED_COLORS: Colors = { sand: PALETTE.hauntedSand, moss: PALETTE.hauntedMoss, rock: PALETTE.hauntedRock };

/** How far out an island's waterline lies, as a share of its radius, before its coast wobbles in and out. */
export const WATERLINE = 0.94;

/**
 * A jittered radial island: underwater skirt, beach, hill and peak, colored per face. `coast` holds
 * the phases of the coastline's wobble, `radius · (1 + 0.05 sin(2θ + c0) + 0.03 sin(3θ + c1) + 0.02 sin(5θ + c2))`,
 * so the sea can draw surf along the real shore.
 */
export function buildTerrain(island: Island, rng: Rng): { geometry: THREE.BufferGeometry; peak: number; coast: readonly [number, number, number] } {
  const home = island.kind === 'home';
  const colors = home ? HOME_COLORS : HAUNTED_COLORS;
  const r = island.radius;
  const segments = r < 40 ? 18 : 24;
  const hill = home ? r * 0.15 : r * rng.range(0.14, 0.3);
  const rings = [
    { f: 1.12, y: -3.0, jitter: 0.01, lift: 0 },
    { f: 1.0, y: -0.4, jitter: 0.015, lift: 0 },
    { f: 0.86, y: 0.55, jitter: 0.02, lift: 0.15 },
    { f: 0.74, y: 1.15, jitter: 0.03, lift: 0.25 },
    { f: 0.58, y: 1.6 + hill * 0.3, jitter: 0.05, lift: 0.5 },
    { f: 0.38, y: 1.6 + hill * 0.68, jitter: 0.06, lift: 0.6 },
    { f: 0.17, y: 1.6 + hill * 0.93, jitter: 0.08, lift: 0.5 },
  ];
  const peak = 1.6 + hill;

  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const p3 = rng.range(0, Math.PI * 2);
  const coast = (theta: number) =>
    0.05 * Math.sin(theta * 2 + p1) + 0.03 * Math.sin(theta * 3 + p2) + 0.02 * Math.sin(theta * 5 + p3);

  const angles = Array.from({ length: segments }, (_, i) => ((i + rng.range(-0.25, 0.25)) / segments) * Math.PI * 2);
  const verts: Vec3[][] = rings.map((ring) =>
    angles.map((theta) => {
      const radius = r * ring.f * (1 + coast(theta) + rng.range(-ring.jitter, ring.jitter));
      const y = ring.y + rng.range(-ring.lift, ring.lift);
      return [Math.sin(theta) * radius, y, Math.cos(theta) * radius] as Vec3;
    }),
  );

  const b = new MeshBuilder();
  const a = new THREE.Vector3();
  const c = new THREE.Vector3();
  const face = (p: Vec3, q: Vec3, s: Vec3) => {
    a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    c.set(s[0] - p[0], s[1] - p[1], s[2] - p[2]);
    const slope = Math.abs(a.cross(c).normalize().y);
    const y = (p[1] + q[1] + s[1]) / 3;
    let color = colors.moss;
    let shade = rng.range(0.9, 1.06);
    if (y < 1.0) {
      color = colors.sand;
      if (y < -0.6) shade *= 0.6;
    } else if (slope < 0.74) {
      color = colors.rock;
    }
    b.tri(p, q, s, color, shade);
  };

  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const outer = verts[ring]!;
      const inner = verts[ring + 1]!;
      face(outer[i]!, outer[j]!, inner[j]!);
      face(outer[i]!, inner[j]!, inner[i]!);
    }
  }
  const top = verts[rings.length - 1]!;
  const apex: Vec3 = [rng.range(-0.5, 0.5), peak, rng.range(-0.5, 0.5)];
  for (let i = 0; i < segments; i++) face(top[i]!, top[(i + 1) % segments]!, apex);

  return { geometry: b.build(), peak, coast: [p1, p2, p3] };
}

// ---- Prop models, built once and shared by instanced meshes ----

function palmGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const lean = 0.13;
  let x = 0;
  let y = 0;
  for (let s = 0; s < 5; s++) {
    const h = 1.1;
    const radius = 0.22 - s * 0.025;
    const segment = new THREE.CylinderGeometry(radius - 0.025, radius, h + 0.05, 6).translate(0, h / 2, 0);
    b.add(segment, PALETTE.palmTrunk, placed([x, y, 0], [0, 0, -lean * s]), 1 - s * 0.04);
    x += Math.sin(lean * s) * h;
    y += Math.cos(lean * s) * h;
  }
  for (let k = 0; k < 7; k++) {
    const angle = (k / 7) * Math.PI * 2;
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    const length = 2.7;
    const top: Vec3 = [x, y, 0];
    const tip: Vec3 = [x + dx * length, y - 1.0, dz * length];
    const midY = y + 0.3;
    const left: Vec3 = [x + dx * length * 0.5 - dz * 0.5, midY, dz * length * 0.5 + dx * 0.5];
    const right: Vec3 = [x + dx * length * 0.5 + dz * 0.5, midY, dz * length * 0.5 - dx * 0.5];
    b.tri(top, left, tip, PALETTE.palmLeaf, 1.0).tri(top, tip, right, PALETTE.palmLeaf, 0.82);
  }
  return b.build();
}

export function deadTreeGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.CylinderGeometry(0.1, 0.3, 3.4, 5).translate(0, 1.7, 0), PALETTE.deadWood, placed([0, 0, 0], [0, 0, 0.08]));
  const branches: Array<[number, number, number, number]> = [
    [1.5, 0.3, 0.95, 1.4],
    [2.1, 2.4, -0.85, 1.2],
    [2.6, 4.2, 0.75, 1.0],
    [3.0, 1.2, -0.6, 0.8],
  ];
  for (const [height, around, tilt, length] of branches) {
    const branch = new THREE.CylinderGeometry(0.03, 0.09, length, 4).translate(0, length / 2, 0);
    b.add(branch, PALETTE.deadWood, placed([0.08 * height, height, 0], [0, around, tilt]), 0.9);
  }
  return b.build();
}

export function rockGeometry(): THREE.BufferGeometry {
  const source = new THREE.IcosahedronGeometry(1, 0);
  const position = source.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // Same jitter for the same corner, so faces stay joined.
    const hash = Math.abs(Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453) % 1;
    const s = 0.8 + hash * 0.35;
    position.setXYZ(i, x * s, y * s * 0.7 + 0.25, z * s);
  }
  return new MeshBuilder().add(source, PALETTE.stone).build();
}

export function tombstoneGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.BoxGeometry(0.75, 0.95, 0.2).translate(0, 0.475, 0), PALETTE.tombstone);
  b.add(
    new THREE.CylinderGeometry(0.375, 0.375, 0.2, 8, 1, false, Math.PI / 2, Math.PI),
    PALETTE.tombstone,
    placed([0, 0.95, 0], [Math.PI / 2, 0, 0]),
  );
  return b.build();
}

/** Where the glass of a lantern post sits, relative to the post's base. */
const LANTERN_OFFSET: Vec3 = [0.42, 2.22, 0];

function lanternPostGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.add(new THREE.BoxGeometry(0.14, 2.7, 0.14).translate(0, 1.35, 0), PALETTE.deadWood);
  b.add(new THREE.BoxGeometry(0.55, 0.08, 0.08).translate(0.25, 2.62, 0), PALETTE.deadWood);
  const [x, y, z] = LANTERN_OFFSET;
  b.add(new THREE.BoxGeometry(0.34, 0.06, 0.34).translate(x, y + 0.24, z), PALETTE.flag);
  b.add(new THREE.BoxGeometry(0.34, 0.06, 0.34).translate(x, y - 0.22, z), PALETTE.flag);
  return b.build();
}

export function lighthouseGeometry(): { body: THREE.BufferGeometry; lanternHeight: number } {
  const b = new MeshBuilder();
  const stone = '#B8B2A4';
  const band = '#7A2E2A';
  b.add(new THREE.CylinderGeometry(2.4, 3.0, 2, 10).translate(0, 1, 0), PALETTE.stone);
  b.add(new THREE.CylinderGeometry(1.55, 2.1, 3, 10).translate(0, 3.5, 0), stone);
  b.add(new THREE.CylinderGeometry(1.42, 1.55, 1.4, 10).translate(0, 5.7, 0), band);
  b.add(new THREE.CylinderGeometry(1.3, 1.42, 3, 10).translate(0, 7.9, 0), stone);
  b.add(new THREE.CylinderGeometry(2.0, 2.0, 0.3, 10).translate(0, 9.55, 0), PALETTE.flag);
  b.add(new THREE.ConeGeometry(1.6, 1.4, 10).translate(0, 12.0, 0), PALETTE.flag);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.12, 1.6, 0.12).translate(Math.sin(angle) * 1.15, 10.5, Math.cos(angle) * 1.15), PALETTE.flag);
  }
  return { body: b.build(), lanternHeight: 10.5 };
}

function dockGeometry(length: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const count = Math.floor(length / 1.05);
  for (let i = 0; i < count; i++) {
    b.add(new THREE.BoxGeometry(2.6, 0.16, 0.95).translate(0, 0, i * 1.05), PALETTE.deck, undefined, i % 2 ? 0.85 : 1);
  }
  for (let i = 0; i <= count; i += 4) {
    for (const side of [-1.25, 1.25]) {
      b.add(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 5).translate(side, -1.4, i * 1.05), PALETTE.mast);
    }
  }
  return b.build();
}

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  colors?: readonly THREE.Color[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
  mesh.count = placements.length;
  placements.forEach((p, i) => mesh.setMatrixAt(i, placed(p.position, p.rotation, p.scale)));
  if (colors) colors.forEach((color, i) => mesh.setColorAt(i, color));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Builds every island, its props, lantern glows and ghost-light anchors. */
export function createIslands(world: World): IslandScene {
  const group = new THREE.Group();
  group.name = 'islands';
  const terrainMaterial = vertexColorMaterial();
  const propMaterial = vertexColorMaterial();
  const glassMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lanternColor = new THREE.Color(PALETTE.lantern).multiplyScalar(1.4);
  const spectralColor = new THREE.Color(PALETTE.spectral).multiplyScalar(1.2);

  const palms: Placement[] = [];
  const deadTrees: Placement[] = [];
  const rocks: Placement[] = [];
  const tombstones: Placement[] = [];
  const posts: Placement[] = [];
  const glass: Placement[] = [];
  const glassColors: THREE.Color[] = [];
  /** The island each glowing lantern glass belongs to, for recoloring captured islands. */
  const glassIslands: number[] = [];
  const glows: GlowSpec[] = [];
  const wisps: WispSpec[] = [];
  const lights: LightAnchor[] = [];
  const labelAnchors: THREE.Vector3[] = [];
  const shores: Shore[] = [];
  const disposables: Array<{ dispose(): void }> = [terrainMaterial, propMaterial, glassMaterial];

  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const terrains = new Map<number, THREE.Mesh>();
  /** Every haunted fort and its keep, merged into one mesh. */
  const forts = new MeshBuilder();
  /** Keep models by kind (spire, broken lighthouse, skull tower), built once and copied into each fort. */
  const keeps = new Map<number, ReturnType<typeof hauntedKeepGeometry> & { readonly top: number }>();
  const keepFor = (level: number) => {
    const kind = level >= 4 ? 4 : level === 3 ? 3 : 1;
    let keep = keeps.get(kind);
    if (!keep) {
      const model = hauntedKeepGeometry(kind);
      model.body.computeBoundingBox();
      keep = { ...model, top: model.body.boundingBox?.max.y ?? model.lanternHeight + 2 };
      keeps.set(kind, keep);
    }
    return keep;
  };
  const homeIsland = world.islands.find((i) => i.kind === 'home');

  for (const island of world.islands) {
    const rng = createRng(island.seed);
    const home = island.kind === 'home';
    const { geometry, peak, coast } = buildTerrain(island, rng);
    shores.push({ x: island.x, z: island.z, radius: island.radius, coast });
    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.position.set(island.x, 0, island.z);
    terrain.name = `island-${island.id}`;
    terrain.updateMatrixWorld();
    group.add(terrain);
    terrains.set(island.id, terrain);
    disposables.push(geometry);
    // Labels float above the lighthouse; a fort's label is raised to clear its keep below.
    labelAnchors[island.id] = new THREE.Vector3(island.x, peak + 16, island.z);

    /** Terrain height under a point given in polar form around the island's centre. */
    const ground = (angle: number, fraction: number): Vec3 | null => {
      const x = island.x + Math.sin(angle) * island.radius * fraction;
      const z = island.z + Math.cos(angle) * island.radius * fraction;
      origin.set(x, 200, z);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(terrain, false)[0];
      return hit ? [x, hit.point.y, z] : null;
    };
    /** Terrain height under a point given relative to the island's centre. */
    const heightAt = (x: number, z: number): number => {
      origin.set(island.x + x, 200, island.z + z);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(terrain, false)[0];
      return hit ? hit.point.y : 0.5;
    };
    const style = home ? null : fortStyle(fortDifficulty(island), island.seed);
    const scatter = (count: number, min: number, max: number, into: Placement[], scale: () => number, tilt = 0) => {
      for (let i = 0; i < count; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const fraction = rng.range(min, max);
        // Nothing grows through a haunted fort's walls.
        const at = style && blockedByFort(fraction * island.radius, island.radius, style) ? null : ground(angle, fraction);
        if (!at) continue;
        into.push({
          position: [at[0], at[1] - 0.05, at[2]],
          rotation: [rng.range(-tilt, tilt), rng.range(0, Math.PI * 2), rng.range(-tilt, tilt)],
          scale: scale(),
        });
      }
    };
    const addPost = (angle: number, fraction: number, kind: GlowKind): Vec3 | null => {
      const at = ground(angle, fraction);
      if (!at) return null;
      const turn = angle + Math.PI / 2;
      posts.push({ position: at, rotation: [0, turn, 0], scale: 1 });
      const [ox, oy, oz] = LANTERN_OFFSET;
      const gx = at[0] + Math.cos(turn) * ox + Math.sin(turn) * oz;
      const gz = at[2] - Math.sin(turn) * ox + Math.cos(turn) * oz;
      const glassPos: Vec3 = [gx, at[1] + oy, gz];
      glass.push({ position: glassPos, rotation: [0, turn, 0], scale: [0.24, 0.36, 0.24] });
      glassColors.push(kind === 'lantern' ? lanternColor : spectralColor);
      glows.push({ position: new THREE.Vector3(...glassPos), kind, size: kind === 'lantern' ? 2.6 : 3.0, islandId: island.id });
      glassIslands.push(island.id);
      return glassPos;
    };

    scatter(home ? 3 : rng.int(3, 6), 0.3, 0.8, rocks, () => rng.range(0.7, 1.8));

    if (home) {
      scatter(7, 0.62, 0.8, palms, () => rng.range(0.85, 1.2), 0.05);
      // The lighthouse on the hilltop: the "ghost light" that keeps Last Light safe.
      const { body, lanternHeight } = lighthouseGeometry();
      const lighthouse = new THREE.Mesh(body, propMaterial);
      lighthouse.position.set(island.x, peak - 0.6, island.z);
      group.add(lighthouse);
      disposables.push(body);
      const lampY = peak - 0.6 + lanternHeight;
      glass.push({ position: [island.x, lampY, island.z], rotation: [0, 0, 0], scale: [2.3, 1.5, 2.3] });
      glassColors.push(lanternColor);
      glows.push({ position: new THREE.Vector3(island.x, lampY, island.z), kind: 'lantern', size: 14, islandId: island.id });
      glassIslands.push(island.id);
      lights.push({ islandId: island.id, position: new THREE.Vector3(island.x, lampY, island.z), kind: 'lantern' });

      // A dock pointing at the spawn, with lanterns at its end.
      const dockStart = island.radius * 0.8;
      const dockLength = island.radius * 0.5;
      const dockGeo = dockGeometry(dockLength);
      const dock = new THREE.Mesh(dockGeo, propMaterial);
      dock.position.set(island.x, 1.0, island.z + dockStart);
      group.add(dock);
      disposables.push(dockGeo);
      for (const side of [-1.6, 1.6]) {
        const base: Vec3 = [island.x + side, 1.0, island.z + dockStart + dockLength - 1];
        posts.push({ position: base, rotation: [0, side < 0 ? Math.PI : 0, 0], scale: 0.8 });
        const glassPos: Vec3 = [base[0] + (side < 0 ? -0.34 : 0.34), base[1] + 1.78, base[2]];
        glass.push({ position: glassPos, rotation: [0, 0, 0], scale: [0.2, 0.3, 0.2] });
        glassColors.push(lanternColor);
        glows.push({ position: new THREE.Vector3(...glassPos), kind: 'lantern', size: 2.4, islandId: island.id });
        glassIslands.push(island.id);
      }
      addPost(Math.PI * 0.75, 0.72, 'lantern');
      addPost(-Math.PI * 0.6, 0.72, 'lantern');
    } else {
      scatter(rng.int(3, 7), 0.25, 0.75, deadTrees, () => rng.range(0.8, 1.4), 0.12);
      // The fort: walls in a style of its own around a keep that grows more fearsome with the level.
      const level = fortDifficulty(island);
      const { flames } = addFort(forts, island.radius, level, island.seed, heightAt, island);
      const s = keepScale(FORTS.keepLevel[level - 1]!);
      const keep = keepFor(level);
      const baseY = peak - 0.6;
      // A skull tower stares at Last Light.
      const yaw = keep.eyes.length > 0 && homeIsland ? Math.atan2(homeIsland.x - island.x, homeIsland.z - island.z) : 0;
      forts.addColored(keep.body, placed([island.x, baseY, island.z], [0, yaw, 0], s));
      labelAnchors[island.id] = new THREE.Vector3(island.x, baseY + keep.top * s + 3, island.z);
      if (keep.eyes.length === 0) {
        const lampY = baseY + keep.lanternHeight * s;
        glass.push({ position: [island.x, lampY, island.z], rotation: [0, 0, 0], scale: [1.4 * s, 1.7 * s, 1.4 * s] });
        glassColors.push(spectralColor);
        glassIslands.push(island.id);
        glows.push({ position: new THREE.Vector3(island.x, lampY, island.z), kind: 'spectral', size: 6, islandId: island.id });
      } else {
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        for (const [ex, ey, ez] of keep.eyes) {
          const eye: Vec3 = [island.x + (ex * cos + ez * sin) * s, baseY + ey * s, island.z + (ez * cos - ex * sin) * s];
          glass.push({ position: eye, rotation: [0, yaw, 0], scale: [0.62 * s, 0.42 * s, 0.3 * s] });
          glassColors.push(spectralColor);
          glassIslands.push(island.id);
          glows.push({ position: new THREE.Vector3(...eye), kind: 'spectral', size: 3.4, islandId: island.id });
        }
      }
      for (const f of flames) glows.push({ position: new THREE.Vector3(...f), kind: 'spectral', size: 2.2, islandId: island.id });

      // A small graveyard on one side of the island, outside the walls.
      const yard = rng.range(0, Math.PI * 2);
      for (let i = 0; i < rng.int(4, 9); i++) {
        const fraction = rng.range(0.3, 0.6);
        const at = style && blockedByFort(fraction * island.radius, island.radius, style) ? null : ground(yard + rng.range(-0.5, 0.5), fraction);
        if (!at) continue;
        tombstones.push({
          position: [at[0], at[1] - 0.1, at[2]],
          rotation: [rng.range(-0.15, 0.15), yard + rng.range(-0.3, 0.3), rng.range(-0.15, 0.15)],
          scale: rng.range(0.8, 1.25),
        });
      }
      const postCount = rng.int(2, 3);
      let first: Vec3 | null = null;
      for (let i = 0; i < postCount; i++) {
        const at = addPost(rng.range(0, Math.PI * 2), rng.range(0.55, 0.75), 'spectral');
        first ??= at;
      }
      if (first) lights.push({ islandId: island.id, position: new THREE.Vector3(...first), kind: 'spectral' });
      // Ghost lights drifting over the island.
      for (let i = 0; i < rng.int(8, 14); i++) {
        const at = ground(rng.range(0, Math.PI * 2), rng.range(0, 0.9));
        if (!at) continue;
        wisps.push({
          islandId: island.id,
          position: new THREE.Vector3(at[0], at[1] + rng.range(1.5, 7), at[2]),
          radius: rng.range(1, 4),
        });
      }
    }
  }

  const props: Array<[THREE.BufferGeometry, Placement[]]> = [
    [palmGeometry(), palms],
    [deadTreeGeometry(), deadTrees],
    [rockGeometry(), rocks],
    [tombstoneGeometry(), tombstones],
    [lanternPostGeometry(), posts],
  ];
  for (const [geometry, placements] of props) {
    group.add(instanced(geometry, propMaterial, placements));
    disposables.push(geometry);
  }
  for (const keep of keeps.values()) keep.body.dispose();
  if (forts.triangleCount > 0) {
    const fortGeometry = forts.build();
    const fortMesh = new THREE.Mesh(fortGeometry, propMaterial);
    fortMesh.name = 'haunted-forts';
    group.add(fortMesh);
    disposables.push(fortGeometry);
  }
  const glassGeometry = new THREE.BoxGeometry(1, 1, 1);
  const glassMesh = instanced(glassGeometry, glassMaterial, glass, glassColors);
  group.add(glassMesh);
  disposables.push(glassGeometry);

  const drawCalls = group.children.length;

  return {
    group,
    glows,
    wisps,
    lights,
    labelAnchors,
    shores,
    drawCalls,
    setCaptured(ids) {
      glassColors.forEach((original, i) => {
        const island = glassIslands[i];
        glassMesh.setColorAt(i, island !== undefined && ids.has(island) ? lanternColor : original);
      });
      if (glassMesh.instanceColor) glassMesh.instanceColor.needsUpdate = true;
    },
    groundAt(islandId, x, z) {
      const terrain = terrains.get(islandId);
      if (!terrain) return 1;
      raycaster.set(origin.set(x, 200, z), down);
      const hit = raycaster.intersectObject(terrain, false)[0];
      return hit ? hit.point.y - 0.05 : 1;
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
