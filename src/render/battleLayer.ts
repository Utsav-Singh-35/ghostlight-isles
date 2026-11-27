import * as THREE from 'three';
import { isMineVisible, isRevealed, type BattleEvent, type BattleState, type Shot } from '../sim/battle';
import { clamp, lerp, lerpAngle } from '../sim/math';
import { createRng } from '../sim/rng';
import type { Island } from '../sim/world';
import { Bursts } from './bursts';
import { buildTerrain } from './islands';
import { MeshBuilder, vertexColorMaterial } from './meshBuilder';
import { PALETTE } from './palette';
import { createGhostShipModel, type GhostShipModel } from './shipMesh';
import { GLOW_HEIGHT, StructureSet, createKeepMesh, type StructureView } from './structureMeshes';
import { sampleWaveHeight } from './waves';

const LAUNCH_HEIGHT: Record<Shot['kind'], number> = { ball: 2.6, salt: 2.6, tower: 4.4, lantern: 6.8, stone: 3.8, bolt: 3.0, barrel: 3.0, fire: 0, mine: 0 };
const ARC: Record<Shot['kind'], number> = { ball: 2.2, salt: 2.2, tower: 3, lantern: 2, stone: 16, bolt: 1, barrel: 6, fire: 0, mine: 0 };

/** Draws one battle: the island, its defenses, ghost ships, shots, fire and explosions. Reads battle state only. */
export class BattleLayer {
  readonly group = new THREE.Group();
  readonly bursts: Bursts;
  /** Where the keep's lantern burns, for lights and the camera. */
  readonly keepLantern: THREE.Vector3;
  readonly living: boolean;
  private readonly radius: number;
  private readonly terrain: THREE.Mesh;
  private readonly terrainMaterial = vertexColorMaterial();
  private readonly keep: ReturnType<typeof createKeepMesh>;
  private readonly structures = new StructureSet(24);
  private readonly ground = new Map<number, number>();
  private readonly ghostModels: GhostShipModel[] = [];
  private readonly sinkTime = new Map<number, number>();
  private readonly darkShots: THREE.InstancedMesh;
  private readonly glowShots: THREE.InstancedMesh;
  private readonly barrels: THREE.InstancedMesh;
  private readonly shotMaterials: THREE.Material[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly fireRng = createRng(0xf12e);
  private readonly anchor = new THREE.Vector3();

  constructor(state: BattleState, quality: 'high' | 'low') {
    this.group.name = 'battle';
    const { island } = state.setup;
    this.radius = island.radius;
    this.living = island.living;
    const spec: Island = { id: 0, name: 'battle', kind: island.living ? 'home' : 'haunted', x: 0, z: 0, radius: island.radius, seed: island.seed };
    const { geometry, peak } = buildTerrain(spec, createRng(island.seed));
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrain.updateMatrixWorld();
    this.group.add(this.terrain);

    this.keep = createKeepMesh(island.living);
    this.keep.mesh.position.set(0, peak - 0.6, 0);
    this.group.add(this.keep.mesh);
    this.keepLantern = new THREE.Vector3(0, peak - 0.6 + this.keep.lanternHeight, 0);

    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    for (const s of state.structures) {
      if (s.type === 'keep' || s.type === 'mine') continue;
      raycaster.set(new THREE.Vector3(s.x, 200, s.z), down);
      const hit = raycaster.intersectObject(this.terrain, false)[0];
      this.ground.set(s.id, hit ? hit.point.y - 0.05 : 1);
    }
    this.group.add(this.structures.group);

    state.ghosts.forEach((g, i) => {
      const model = createGhostShipModel(i);
      model.group.position.set(g.ship.x, 0, g.ship.z);
      this.ghostModels.push(model);
      this.group.add(model.group);
    });

    const dark = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const glow = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const barrelMaterial = vertexColorMaterial();
    this.shotMaterials.push(dark, glow, barrelMaterial);
    this.darkShots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 7, 5), dark, 240);
    this.glowShots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 7, 5), glow, 160);
    const barrel = new MeshBuilder()
      .add(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 8), PALETTE.deck)
      .add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 8).translate(0, 0.28, 0), PALETTE.spectral)
      .add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 8).translate(0, -0.28, 0), PALETTE.spectral)
      .build();
    this.barrels = new THREE.InstancedMesh(barrel, barrelMaterial, 8);
    for (const mesh of [this.darkShots, this.glowShots, this.barrels]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    this.bursts = new Bursts(quality === 'high' ? 1100 : 500);
    this.group.add(this.bursts.points);
  }

  /** Terrain height under a structure. */
  groundOf(id: number): number {
    return this.ground.get(id) ?? 1;
  }

  /** Where a structure's health bar floats. */
  structureAnchor(state: BattleState, id: number, out: THREE.Vector3): THREE.Vector3 {
    const s = state.structures.find((st) => st.id === id);
    if (!s) return out.set(0, -1000, 0);
    if (s.type === 'keep') return out.copy(this.keepLantern).setY(this.keepLantern.y + 3);
    return out.set(s.x, this.groundOf(id) + GLOW_HEIGHT[s.type] + 2.4, s.z);
  }

  update(prev: BattleState, current: BattleState, alpha: number, time: number, dt: number, scale: number, events: readonly BattleEvent[]): void {
    // Defenses.
    const views: StructureView[] = [];
    for (const s of current.structures) {
      if (s.type === 'keep') continue;
      const mine = s.type === 'mine';
      views.push({
        type: s.type,
        level: s.level,
        x: s.x,
        y: mine ? sampleWaveHeight(s.x, s.z, time) - 0.15 : this.groundOf(s.id),
        z: s.z,
        facing: Math.atan2(s.x, s.z),
        destroyed: s.destroyed,
        visible: mine ? !s.destroyed && isMineVisible(current, s) : true,
      });
    }
    this.structures.set(views);
    const keep = current.structures.find((s) => s.type === 'keep');
    if (keep) {
      this.keep.mesh.scale.set(1, keep.destroyed ? 0.35 : 1, 1);
      this.keep.mesh.rotation.z = keep.destroyed ? 0.12 : 0;
      (this.keep.mesh.children[1] as THREE.Mesh).visible = !keep.destroyed;
    }

    // Ghost ships.
    current.ghosts.forEach((g, i) => {
      const model = this.ghostModels[i];
      if (!model) return;
      const before = prev.ghosts[i] ?? g;
      const x = lerp(before.ship.x, g.ship.x, alpha);
      const z = lerp(before.ship.z, g.ship.z, alpha);
      const heading = lerpAngle(before.ship.heading, g.ship.heading, alpha);
      let opacity = isRevealed(current, g) ? 0.85 + 0.15 * Math.sin(time * 6 + i) : 0.16 + 0.05 * Math.sin(time * 2 + i);
      let sink = 0;
      if (g.sunk) {
        if (!this.sinkTime.has(g.id)) this.sinkTime.set(g.id, time);
        const t = clamp((time - this.sinkTime.get(g.id)!) / 2, 0, 1);
        opacity *= 1 - t;
        sink = t * 6;
      }
      model.setOpacity(opacity);
      model.group.position.set(x, sampleWaveHeight(x, z, time) * 0.8 + 0.4 - sink + Math.sin(time * 1.3 + i) * 0.4, z);
      model.group.rotation.set(Math.sin(time * 0.9 + i) * 0.05, heading, Math.sin(time * 0.7 + i * 2) * 0.07 + (g.sunk ? sink * 0.08 : 0), 'YXZ');
    });

    // Shots in flight, along arcs.
    const t = current.tick - 1 + alpha;
    let dark = 0;
    let glow = 0;
    let barrels = 0;
    for (const shot of current.shots) {
      const span = Math.max(1, shot.landTick - shot.launchTick);
      const p = clamp((t - shot.launchTick) / span, 0, 1);
      const x = lerp(shot.fromX, shot.toX, p);
      const z = lerp(shot.fromZ, shot.toZ, p);
      const end = Math.hypot(shot.toX, shot.toZ) < this.radius ? 2.5 : 0.3;
      const y = lerp(LAUNCH_HEIGHT[shot.kind], end, p) + ARC[shot.kind] * 4 * p * (1 - p);
      if (shot.kind === 'barrel') {
        if (barrels < 8) {
          this.matrix.makeRotationX(time * 8).setPosition(x, y, z);
          this.barrels.setMatrixAt(barrels++, this.matrix);
        }
      } else if (shot.kind === 'salt' || shot.kind === 'lantern' || shot.kind === 'bolt') {
        if (glow < 160) {
          const size = shot.kind === 'bolt' ? 1.4 : 1;
          this.matrix.makeScale(size, size, size).setPosition(x, y, z);
          this.glowShots.setMatrixAt(glow, this.matrix);
          if (shot.kind === 'salt') this.color.set('#F4F7FF').multiplyScalar(1.5);
          else this.color.set(PALETTE.spectral).multiplyScalar(shot.kind === 'bolt' ? 1.2 : 1.6);
          this.glowShots.setColorAt(glow++, this.color);
        }
      } else if (dark < 240) {
        const size = shot.kind === 'stone' ? 2.2 : 1;
        this.matrix.makeScale(size, size, size).setPosition(x, y, z);
        this.darkShots.setMatrixAt(dark, this.matrix);
        this.color.set(shot.kind === 'stone' ? '#D8CDB2' : '#2A2A30');
        this.darkShots.setColorAt(dark++, this.color);
      }
    }
    this.darkShots.count = dark;
    this.glowShots.count = glow;
    this.barrels.count = barrels;
    for (const mesh of [this.darkShots, this.glowShots, this.barrels]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Witchfire flickers while it burns.
    for (const f of current.fires) {
      const n = Math.max(1, Math.round(dt * f.radius * 6));
      for (let k = 0; k < n; k++) {
        const a = this.fireRng.range(0, Math.PI * 2);
        const r = Math.sqrt(this.fireRng.next()) * f.radius;
        this.bursts.spawn('witchfire', f.x + Math.sin(a) * r, 0.3, f.z + Math.cos(a) * r, 1);
      }
    }

    for (const e of events) this.effect(current, e);
    this.bursts.update(dt, scale);
  }

  private effect(state: BattleState, e: BattleEvent): void {
    const b = this.bursts;
    switch (e.type) {
      case 'fire':
        if (e.kind === 'ball' || e.kind === 'tower') b.spawn('sparks', e.x, e.kind === 'tower' ? 4.4 : 2.4, e.z, 1);
        else if (e.kind === 'salt') b.spawn('sparks', e.x, 2.4, e.z, 0.8);
        else if (e.kind === 'lantern' || e.kind === 'bolt') b.spawn('spirit', e.x, e.kind === 'lantern' ? 6.8 : 3, e.z, 0.35, 0.4);
        break;
      case 'land': {
        const onIsland = Math.hypot(e.x, e.z) < this.radius;
        if (e.kind === 'barrel') b.spawn('spirit', e.x, 0.5, e.z, 1.2);
        else if (e.hitId !== null) {
          const spectral = e.kind === 'salt' || e.kind === 'lantern' || e.kind === 'bolt';
          const target = state.structures.find((s) => s.id === e.hitId);
          const y = target && target.type !== 'keep' ? this.groundOf(target.id) + 2 : target ? this.keepLantern.y - 4 : 2;
          b.spawn(spectral ? 'spirit' : 'blast', e.x, y, e.z, e.splash > 0 ? 1.6 : 0.7, spectral ? 0.5 : 0.6);
        } else if (onIsland) b.spawn('smoke', e.x, 2, e.z, 0.6, 0.5);
        else b.spawn('splash', e.x, 0.2, e.z, e.splash > 0 ? 1.6 : 1);
        break;
      }
      case 'destroyed': {
        const y = e.structure === 'keep' ? this.keepLantern.y - 3 : this.groundOf(e.id) + 2;
        b.spawn('blast', e.x, y, e.z, 2.2, 1.5);
        b.spawn('smoke', e.x, y, e.z, 2, 2);
        break;
      }
      case 'sunk':
        if (e.kind === 'ghost') b.spawn('spirit', e.x, 2, e.z, 2.4, 2);
        else {
          b.spawn('blast', e.x, 2, e.z, 2.4, 1.6);
          b.spawn('smoke', e.x, 2, e.z, 2.2, 2);
        }
        break;
      case 'mine':
        b.spawn('blast', e.x, 0.6, e.z, 2.4, 1.4);
        b.spawn('splash', e.x, 0.2, e.z, 2.4, 1.5);
        break;
      case 'bats':
        break;
    }
  }

  /** The nearest revealed ghost to a point, for the green point light. */
  nearestGhost(state: BattleState, x: number, z: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestD = Infinity;
    state.ghosts.forEach((g, i) => {
      if (g.sunk) return;
      const d = Math.hypot(g.ship.x - x, g.ship.z - z);
      if (d < bestD) {
        bestD = d;
        best = this.anchor.copy(this.ghostModels[i]!.group.position).setY(5);
      }
    });
    return best;
  }

  /** Where a ghost's health bar floats. */
  ghostAnchor(index: number, out: THREE.Vector3): THREE.Vector3 {
    const model = this.ghostModels[index];
    return model ? out.copy(model.group.position).setY(model.group.position.y + 12) : out.set(0, -1000, 0);
  }

  dispose(): void {
    this.terrain.geometry.dispose();
    this.terrainMaterial.dispose();
    this.keep.dispose();
    this.structures.dispose();
    for (const model of this.ghostModels) model.dispose();
    this.darkShots.geometry.dispose();
    this.glowShots.geometry.dispose();
    this.barrels.geometry.dispose();
    for (const m of this.shotMaterials) m.dispose();
    this.bursts.dispose();
  }
}
