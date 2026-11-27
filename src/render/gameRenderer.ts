import * as THREE from 'three';
import { SHIP } from '../sim/balance';
import type { ShipState } from '../sim/ship';
import type { World } from '../sim/world';
import { CameraRig, type CameraMode } from './cameraRig';
import { createGlows, createWake, createWisps, pointScale, type Glows, type Wake, type Wisps } from './effects';
import { createIslands, type IslandScene, type LightAnchor } from './islands';
import { createOcean, type Ocean } from './ocean';
import { PALETTE } from './palette';
import { createShipModel, type ShipModel } from './shipMesh';
import { createSky, type Sky } from './sky';
import { sampleWaveHeight } from './waves';

export type Quality = 'high' | 'low';

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly pointLights: number;
  readonly fps: number;
  readonly pixelRatio: number;
}

export interface Frame {
  /** The ship's pose, already interpolated between ticks. */
  readonly ship: ShipState;
  /** Seconds since the game started (render clock, visual only). */
  readonly time: number;
  /** Seconds since the last frame. */
  readonly dt: number;
  readonly mode: CameraMode;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

// Low over the sea (about 13°), so it sits inside the chase camera's view.
const MOON_DIRECTION = new THREE.Vector3(-0.35, 0.25, 1.0).normalize();
const FOG_DENSITY = 0.0032;

/** Builds the 3D scene once and draws one frame at a time. Reads simulation state, never writes it. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private readonly ocean: Ocean;
  private readonly sky: Sky;
  private readonly islands: IslandScene;
  private readonly ship: ShipModel;
  private readonly glows: Glows;
  private readonly wisps: Wisps;
  private readonly wake: Wake;
  private readonly shipLight: THREE.PointLight;
  private readonly lighthouseLight: THREE.PointLight;
  private readonly ghostLight: THREE.PointLight;
  private readonly spectralAnchors: LightAnchor[];
  private readonly pointLightCount: number;
  private readonly pixelRatio: number;
  private scale = 500;
  private fps = 60;
  private pitch = 0;
  private roll = 0;
  private bob = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly lanternColor = new THREE.Color(PALETTE.lantern);
  private readonly spectralColor = new THREE.Color(PALETTE.spectral);
  private readonly onResize = () => this.resize();

  constructor(
    private readonly container: HTMLElement,
    world: World,
    quality: Quality,
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
    this.scene.fog = new THREE.FogExp2(PALETTE.horizon, FOG_DENSITY);

    // Moonlight and a cold night sky; lanterns add warm pools.
    this.scene.add(new THREE.HemisphereLight(PALETTE.hemisphereSky, PALETTE.hemisphereGround, 2.4));
    const moon = new THREE.DirectionalLight(PALETTE.moonlight, 1.8);
    moon.position.copy(MOON_DIRECTION).multiplyScalar(500);
    this.scene.add(moon);

    this.sky = createSky(MOON_DIRECTION, high ? 1400 : 700);
    this.sky.setPixelRatio(this.pixelRatio);
    this.scene.add(this.sky.dome, this.sky.stars);

    this.ocean = createOcean(high ? 4 : 8, MOON_DIRECTION);
    this.scene.add(this.ocean.mesh);

    this.islands = createIslands(world);
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
    if (lighthouse) this.lighthouseLight.position.copy(lighthouse.position).add(new THREE.Vector3(0, -1.5, 0));
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

  /** Draws one frame. */
  render(frame: Frame): void {
    const { ship, time, dt } = frame;
    if (dt > 0) this.fps += (1 / dt - this.fps) * Math.min(1, dt * 2);
    const sea = (x: number, z: number) => sampleWaveHeight(x, z, time);

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
    this.pitch += (Math.atan2(bow - stern, 10) - this.pitch) * follow;
    this.roll += (Math.atan2(port - starboard, 4) * 0.8 + heel - this.roll) * follow;
    this.bob += (((bow + stern + port + starboard) / 4) * 0.85 - this.bob) * follow;
    this.ship.group.position.set(ship.x, this.bob - 0.1, ship.z);
    this.ship.group.rotation.set(-this.pitch, ship.heading, this.roll, 'YXZ');
    this.ship.setSail(ship.sail);
    this.ship.animate(time);
    this.ship.group.updateMatrixWorld();

    const sternLantern = this.ship.group.localToWorld(this.tmp.copy(this.ship.sternLantern));
    this.shipLight.position.copy(sternLantern);
    this.glows.setMovable(0, sternLantern);
    this.ocean.setLight(0, sternLantern, 13, this.lanternColor, 0.4);
    const bowLantern = this.ship.group.localToWorld(this.tmp.copy(this.ship.bowLantern));
    this.glows.setMovable(1, bowLantern);
    this.ocean.setLight(3, bowLantern, 9, this.lanternColor, 0.4);
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
    if (nearest) {
      this.ghostLight.position.copy(nearest.position);
      this.ocean.setLight(2, nearest.position, 40, this.spectralColor, 0.9);
    }

    this.wake.update({ x: ship.x, z: ship.z, heading: ship.heading, speed: ship.speed, maxSpeed: SHIP.maxSpeed }, dt, time, this.scale);
    this.glows.update(time, this.scale);
    this.wisps.update(time, this.scale);

    this.rig.update(ship, dt, time, frame.mode, sea);
    this.sky.update(this.rig.camera, time);
    this.ocean.update(this.rig.camera.position.x, this.rig.camera.position.z, time);

    this.renderer.render(this.scene, this.rig.camera);
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
    this.rig.dispose();
    this.ocean.dispose();
    this.sky.dispose();
    this.islands.dispose();
    this.ship.dispose();
    this.glows.dispose();
    this.wisps.dispose();
    this.wake.dispose();
    this.renderer.dispose();
  }
}
