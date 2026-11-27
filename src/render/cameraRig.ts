import * as THREE from 'three';
import { clamp, wrapAngle } from '../sim/math';

export type CameraMode = 'intro' | 'chase' | 'battle' | 'base';

export interface CameraTarget {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
}

export const MIN_ZOOM = 14;
export const MAX_ZOOM = 70;

/** Follows the ship from behind; drag to orbit, scroll to zoom. Visual only. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0.3;
  private distance = 30;
  private dragging = false;
  private lastDrag = -Infinity;
  private lastX = 0;
  private lastY = 0;
  private clock = 0;
  private placed = false;
  private readonly position = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly cleanup: Array<() => void> = [];

  constructor(element: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.5, 5000);

    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      element.addEventListener(type, handler as EventListener, options);
      this.cleanup.push(() => element.removeEventListener(type, handler as EventListener, options));
    };

    listen('pointerdown', (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      element.setPointerCapture(event.pointerId);
    });
    listen('pointermove', (event) => {
      if (!this.dragging) return;
      this.yaw = wrapAngle(this.yaw - (event.clientX - this.lastX) * 0.006);
      this.pitch = clamp(this.pitch + (event.clientY - this.lastY) * 0.004, 0.06, 1.1);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    const release = () => {
      this.dragging = false;
      this.lastDrag = this.clock;
    };
    listen('pointerup', release);
    listen('pointercancel', release);
    listen(
      'wheel',
      (event) => {
        event.preventDefault();
        this.distance = clamp(this.distance * Math.exp(event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
      },
      { passive: false },
    );
    listen('contextmenu', (event) => event.preventDefault());
  }

  get zoom(): number {
    return this.distance;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Sets the look angle and distance, for example when a battle starts. */
  setView(pitch: number, distance: number): void {
    this.yaw = 0;
    this.pitch = clamp(pitch, 0.06, 1.3);
    this.distance = clamp(distance, MIN_ZOOM, MAX_ZOOM);
  }

  /** Jumps straight to the desired view on the next update, instead of gliding there. */
  snap(): void {
    this.placed = false;
  }

  /**
   * Moves the camera. In battles, `focus` is the island: the camera sits behind the ship on
   * the line from the island, so the ship and the island stay in view together.
   */
  update(
    target: CameraTarget,
    dt: number,
    time: number,
    mode: CameraMode,
    seaHeight: (x: number, z: number) => number,
    focus?: { readonly x: number; readonly z: number },
  ): void {
    this.clock = time;
    let yaw: number;
    let pitch: number;
    let distance: number;
    if (mode === 'intro') {
      yaw = time * 0.09 + 2.4;
      pitch = 0.16;
      distance = 34;
    } else if (mode === 'base') {
      // Overlook the island slowly, unless the player is dragging.
      if (!this.dragging && time - this.lastDrag > 4) this.yaw = wrapAngle(this.yaw + dt * 0.05);
      yaw = this.yaw;
      pitch = Math.max(this.pitch, 0.55);
      distance = this.distance;
    } else {
      // Ease back behind the ship after the player lets go, once it is moving.
      if (!this.dragging && time - this.lastDrag > 1.5 && target.speed > 1) {
        this.yaw = wrapAngle(this.yaw * Math.exp(-dt * 0.8));
      }
      yaw = this.yaw;
      pitch = this.pitch;
      distance = this.distance;
    }

    const framing = mode === 'battle' && focus !== undefined;
    const fromFocus = framing ? Math.atan2(target.x - focus.x, target.z - focus.z) : 0;
    const around = (framing ? fromFocus : target.heading + Math.PI) + yaw;
    const flat = distance * Math.cos(pitch);
    this.desired.set(
      target.x + Math.sin(around) * flat,
      distance * Math.sin(pitch) + 3.5,
      target.z + Math.cos(around) * flat,
    );
    if (framing) {
      // Look a little past the ship toward the island.
      this.desiredLook.set(target.x + (focus.x - target.x) * 0.35, 3.5, target.z + (focus.z - target.z) * 0.35);
    } else {
      const ahead = mode === 'chase' ? 8 : 0;
      this.desiredLook.set(
        target.x + Math.sin(target.heading) * ahead,
        mode === 'intro' ? 4.5 : mode === 'base' ? 2 : 3.5,
        target.z + Math.cos(target.heading) * ahead,
      );
    }

    if (!this.placed) {
      this.position.copy(this.desired);
      this.look.copy(this.desiredLook);
      this.placed = true;
    } else {
      this.position.lerp(this.desired, 1 - Math.exp(-dt * (mode === 'intro' ? 2 : 5)));
      this.look.lerp(this.desiredLook, 1 - Math.exp(-dt * 8));
    }
    this.position.y = Math.max(this.position.y, seaHeight(this.position.x, this.position.z) + 1.6);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
  }

  dispose(): void {
    for (const remove of this.cleanup) remove();
  }
}
