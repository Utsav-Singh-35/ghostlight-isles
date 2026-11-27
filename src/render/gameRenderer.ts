import * as THREE from 'three';
import { SHIP } from '../sim/balance';
import type { BattleEvent, BattleState } from '../sim/battle';
import type { ShipState } from '../sim/ship';
import type { World } from '../sim/world';
import { BattleLayer } from './battleLayer';
import { CameraRig, type CameraMode, type CameraTarget } from './cameraRig';
import { createGlows, createWake, createWisps, pointScale, type Glows, type Wake, type Wisps } from './effects';
import { createIslands, type IslandScene, type LightAnchor } from './islands';
import { createOcean, type Ocean } from './ocean';
import { PALETTE } from './palette';
import { createShipModel, type ShipModel } from './shipMesh';
import { createSky, type Sky } from './sky';
import { StructureSet, type StructureView } from './structureMeshes';
import { sampleWaveHeight } from './waves';

export type Quality = 'high' | 'low';

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly pointLights: number;
  readonly fps: number;
  readonly pixelRatio: number;
}

export interface BattleFrame {
  readonly prev: BattleState;
  readonly current: BattleState;
  readonly alpha: number;
  /** Battle events since the last frame. */
  readonly events: readonly BattleEvent[];
}

export interface Frame {
  /** The player's ship, already interpolated between ticks. */
  readonly ship: ShipState;
  /** Seconds since the game started (render clock, visual only). */
  readonly time: number;
  /** Seconds since the last frame. */
  readonly dt: number;
  readonly mode: CameraMode;
  /** What the camera looks at; the ship when left out. */
  readonly cameraTarget?: CameraTarget;
  readonly battle?: BattleFrame;
  /** How red the night is, 0 to 1. */
  readonly bloodMoon: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

// Low over the sea (about 13°), so it sits inside the chase camera's view.
const MOON_DIRECTION = new THREE.Vector3(-0.35, 0.25, 1.0).normalize();
const FOG_DENSITY = 0.0032;
const BLOOD_FOG_DENSITY = 0.0046;

/** Builds the 3D scene once and draws one frame at a time. Reads simulation state, never writes it. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private readonly fog: THREE.FogExp2;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly moon: THREE.DirectionalLight;
  private readonly ocean: Ocean;
  private readonly sky: Sky;
  private readonly islands: IslandScene;
  private readonly homeDefenses = new StructureSet(24);
  private readonly ship: ShipModel;
  private readonly glows: Glows;
  private readonly wisps: Wisps;
  private readonly wake: Wake;
  private readonly shipLight: THREE.PointLight;
  private readonly lighthouseLight: THREE.PointLight;
  private readonly ghostLight: THREE.PointLight;
  private readonly lighthousePosition = new THREE.Vector3();
  private readonly spectralAnchors: LightAnchor[];
  private readonly pointLightCount: number;
  private readonly pixelRatio: number;
  private battle: BattleLayer | null = null;
  private scale = 500;
  private fps = 60;
  private pitch = 0;
  private roll = 0;
  private bob = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly lanternColor = new THREE.Color(PALETTE.lantern);
  private readonly spectralColor = new THREE.Color(PALETTE.spectral);
  private readonly night = {
    top: new THREE.Color(PALETTE.skyTop),
    horizon: new THREE.Color(PALETTE.horizon),
    moon: new THREE.Color(PALETTE.moonlight),
    sky: new THREE.Color(PALETTE.hemisphereSky),
  };
  private readonly blood = {
    top: new THREE.Color('#14030A'),
    horizon: new THREE.Color('#2A0A12'),
    moon: new THREE.Color(PALETTE.bloodMoon).multiplyScalar(1.3),
    sky: new THREE.Color('#7A3040'),
  };
  private readonly mix = { top: new THREE.Color(), horizon: new THREE.Color(), moon: new THREE.Color(), sky: new THREE.Color() };
  private lastBlood = -1;
  private readonly onResize = () => this.resize();

  constructor(
    private readonly container: HTMLElement,
    world: World,
    readonly quality: Quality,
    onContextLost: () => void,
  ) {
    const high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: 'high-performance' });
    this.pixelRatio = high ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      onContextLost();
    });
    container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(this.renderer.domElement, 1);
    this.fog = new THREE.FogExp2(PALETTE.horizon, FOG_DENSITY);
    this.scene.fog = this.fog;

    // Moonlight and a cold night sky; lanterns add warm pools.
    this.hemisphere = new THREE.HemisphereLight(PALETTE.hemisphereSky, PALETTE.hemisphereGround, 2.4);
    this.moon = new THREE.DirectionalLight(PALETTE.moonlight, 1.8);
    this.moon.position.copy(MOON_DIRECTION).multiplyScalar(500);
    this.scene.add(this.hemisphere, this.moon);

    this.sky = createSky(MOON_DIRECTION, high ? 1400 : 700);
    this.sky.setPixelRatio(this.pixelRatio);
    this.scene.add(this.sky.dome, this.sky.stars);

    this.ocean = createOcean(high ? 4 : 8, MOON_DIRECTION);
    this.scene.add(this.ocean.mesh);

    this.islands = createIslands(world);
    this.islands.group.add(this.homeDefenses.group);
    this.scene.add(this.islands.group);

    this.ship = createShipModel();
    this.scene.add(this.ship.group);

    this.glows = createGlows(this.islands.glows, [
      { position: new THREE.Vector3(), kind: 'lantern', size: 1.9 },
      { position: new THREE.Vector3(), kind: 'lantern', size: 1.5 },
    ]);
    this.wisps = createWisps(this.islands.wisps);
    this.wake = createWake(high ? 260 : 120);
    this.scene.add(this.glows.points, this.wisps.points, this.wake.points);

    // At most three point lights: the ship's lantern, the lighthouse and the nearest ghost light.
    this.shipLight = new THREE.PointLight(PALETTE.lantern, 8, 18, 1.6);
    this.lighthouseLight = new THREE.PointLight(PALETTE.lantern, 260, 80, 1.6);
    this.ghostLight = new THREE.PointLight(PALETTE.spectral, 60, 38, 1.6);
    const lighthouse = this.islands.lights.find((anchor) => anchor.kind === 'lantern');
    if (lighthouse) this.lighthousePosition.copy(lighthouse.position).add(new THREE.Vector3(0, -1.5, 0));
    this.lighthouseLight.position.copy(this.lighthousePosition);
    this.spectralAnchors = this.islands.lights.filter((anchor) => anchor.kind === 'spectral');
    this.scene.add(this.shipLight, this.lighthouseLight, this.ghostLight);

    let lights = 0;
    this.scene.traverse((object) => {
      if ((object as THREE.PointLight).isPointLight) lights++;
    });
    this.pointLightCount = lights;

    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.rig.setAspect(width / Math.max(1, height));
    this.scale = pointScale(this.rig.camera, height * this.pixelRatio);
  }

  /** Switches the scene to a battle: the open sea's islands hide and the battle island appears. */
  enterBattle(state: BattleState): void {
    this.exitBattle();
    this.battle = new BattleLayer(state, this.quality);
    this.scene.add(this.battle.group);
    this.islands.group.visible = false;
    this.wisps.points.visible = false;
    this.glows.points.visible = false;
    this.rig.setView(0.5, 52);
    this.rig.snap();
  }

  /** Back to the open sea. */
  exitBattle(): void {
    if (!this.battle) return;
    this.scene.remove(this.battle.group);
    this.battle.dispose();
    this.battle = null;
    this.islands.group.visible = true;
    this.wisps.points.visible = true;
    this.glows.points.visible = true;
    this.rig.setView(0.3, 30);
    this.rig.snap();
  }

  get inBattle(): boolean {
    return this.battle !== null;
  }

  /** Draws the player's defenses on Last Light. Positions are in world space. */
  setHomeDefenses(views: readonly StructureView[]): void {
    this.homeDefenses.set(views);
  }

  /** Draws one frame. */
  render(frame: Frame): void {
    const { ship, time, dt } = frame;
    if (dt > 0) this.fps += (1 / dt - this.fps) * Math.min(1, dt * 2);
    const sea = (x: number, z: number) => sampleWaveHeight(x, z, time);
    this.applyBloodMoon(frame.bloodMoon);

    // Float the ship on the same waves the sea shader draws.
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    const px = Math.cos(ship.heading);
    const pz = -Math.sin(ship.heading);
    const bow = sea(ship.x + fx * 5, ship.z + fz * 5);
    const stern = sea(ship.x - fx * 5, ship.z - fz * 5);
    const port = sea(ship.x + px * 2, ship.z + pz * 2);
    const starboard = sea(ship.x - px * 2, ship.z - pz * 2);
    const heel = -ship.rudder * (ship.speed / SHIP.maxSpeed) * 0.12;
    const follow = 1 - Math.exp(-dt * 6);
    const sunk = frame.battle?.current.player.sunk ?? false;
    this.pitch += (Math.atan2(bow - stern, 10) - this.pitch) * follow;
    this.roll += (Math.atan2(port - starboard, 4) * 0.8 + heel + (sunk ? 0.9 : 0) - this.roll) * follow;
    this.bob += (((bow + stern + port + starboard) / 4) * 0.85 - (sunk ? 4 : 0) - this.bob) * follow;
    this.ship.group.position.set(ship.x, this.bob - 0.1, ship.z);
    this.ship.group.rotation.set(-this.pitch, ship.heading, this.roll, 'YXZ');
    this.ship.setSail(ship.sail);
    this.ship.animate(time);
    this.ship.group.updateMatrixWorld();

    const sternLantern = this.ship.group.localToWorld(this.tmp.copy(this.ship.sternLantern));
    this.shipLight.position.copy(sternLantern);
    this.glows.setMovable(0, sternLantern);
    this.ocean.setLight(0, sternLantern, 13, this.lanternColor, sunk ? 0 : 0.4);
    const bowLantern = this.ship.group.localToWorld(this.tmp.copy(this.ship.bowLantern));
    this.glows.setMovable(1, bowLantern);
    this.ocean.setLight(3, bowLantern, 9, this.lanternColor, sunk ? 0 : 0.4);

    if (this.battle && frame.battle) {
      const b = this.battle;
      const { prev, current, alpha, events } = frame.battle;
      b.update(prev, current, alpha, time, dt, this.scale, events);
      const keepStanding = !current.structures.find((s) => s.type === 'keep')?.destroyed;
      if (b.living) {
        this.lighthouseLight.position.copy(b.keepLantern).setY(b.keepLantern.y - 1.5);
        this.lighthouseLight.intensity = keepStanding ? 260 : 0;
        this.ocean.setLight(1, b.keepLantern, 95, this.lanternColor, keepStanding ? 0.55 : 0);
      } else {
        this.lighthouseLight.intensity = 0;
        this.ocean.setLight(1, b.keepLantern, 95, this.spectralColor, keepStanding ? 0.5 : 0);
      }
      const ghost = b.nearestGhost(current, ship.x, ship.z) ?? (!b.living && keepStanding ? b.keepLantern : null);
      this.ghostLight.intensity = ghost ? 60 : 0;
      if (ghost) {
        this.ghostLight.position.copy(ghost);
        this.ocean.setLight(2, ghost, 40, this.spectralColor, 0.9);
      } else {
        this.ocean.setLight(2, this.tmp.set(0, 0, 0), 0, this.spectralColor, 0);
      }
    } else {
      this.lighthouseLight.position.copy(this.lighthousePosition);
      this.lighthouseLight.intensity = 260;
      this.ocean.setLight(1, this.lighthouseLight.position, 95, this.lanternColor, 0.55);
      // Reuse one green light for whichever haunted island is closest.
      let nearest: LightAnchor | null = null;
      let best = Infinity;
      for (const anchor of this.spectralAnchors) {
        const d = Math.hypot(anchor.position.x - ship.x, anchor.position.z - ship.z);
        if (d < best) {
          best = d;
          nearest = anchor;
        }
      }
      this.ghostLight.intensity = nearest ? 60 : 0;
      if (nearest) {
        this.ghostLight.position.copy(nearest.position);
        this.ocean.setLight(2, nearest.position, 40, this.spectralColor, 0.9);
      }
      this.glows.update(time, this.scale);
      this.wisps.update(time, this.scale);
    }

    this.wake.update({ x: ship.x, z: ship.z, heading: ship.heading, speed: sunk ? 0 : ship.speed, maxSpeed: SHIP.maxSpeed }, dt, time, this.scale);
    this.rig.update(frame.cameraTarget ?? ship, dt, time, frame.mode, sea, this.battle ? { x: 0, z: 0 } : undefined);
    this.sky.update(this.rig.camera, time);
    this.ocean.update(this.rig.camera.position.x, this.rig.camera.position.z, time);

    this.renderer.render(this.scene, this.rig.camera);
  }

  private applyBloodMoon(amount: number): void {
    const t = Math.round(Math.min(1, Math.max(0, amount)) * 100) / 100;
    if (t === this.lastBlood) return;
    this.lastBlood = t;
    const { mix, night, blood } = this;
    mix.top.lerpColors(night.top, blood.top, t);
    mix.horizon.lerpColors(night.horizon, blood.horizon, t);
    mix.moon.lerpColors(night.moon, blood.moon, t);
    mix.sky.lerpColors(night.sky, blood.sky, t);
    this.sky.setColors(mix.top, mix.horizon, mix.moon);
    this.ocean.setColors(mix.moon, mix.horizon);
    this.fog.color.copy(mix.horizon);
    this.fog.density = FOG_DENSITY + (BLOOD_FOG_DENSITY - FOG_DENSITY) * t;
    this.moon.color.copy(mix.moon);
    this.hemisphere.color.copy(mix.sky);
  }

  /** Where a world position lands on screen, in CSS pixels. */
  project(position: THREE.Vector3, out: ScreenPoint): ScreenPoint {
    this.projected.copy(position).project(this.rig.camera);
    const canvas = this.renderer.domElement;
    out.visible = this.projected.z > -1 && this.projected.z < 1 && Math.abs(this.projected.x) < 1.1 && Math.abs(this.projected.y) < 1.1;
    out.x = ((this.projected.x + 1) / 2) * canvas.clientWidth;
    out.y = ((1 - this.projected.y) / 2) * canvas.clientHeight;
    return out;
  }

  get labelAnchors(): readonly THREE.Vector3[] {
    return this.islands.labelAnchors;
  }

  /** The battle layer, while a battle is shown (for health-bar anchors). */
  get battleLayer(): BattleLayer | null {
    return this.battle;
  }

  getStats(): RenderStats {
    const info = this.renderer.info.render;
    return {
      drawCalls: info.calls,
      triangles: info.triangles,
      pointLights: this.pointLightCount,
      fps: Math.round(this.fps),
      pixelRatio: this.pixelRatio,
    };
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.exitBattle();
    this.rig.dispose();
    this.ocean.dispose();
    this.sky.dispose();
    this.islands.dispose();
    this.homeDefenses.dispose();
    this.ship.dispose();
    this.glows.dispose();
    this.wisps.dispose();
    this.wake.dispose();
    this.renderer.dispose();
  }
}
