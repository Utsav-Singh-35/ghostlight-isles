import * as THREE from 'three';
import { clamp, wrapAngle } from '../sim/math';

export type CameraMode = 'intro' | 'chase';

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

  update(target: CameraTarget, dt: number, time: number, mode: CameraMode, seaHeight: (x: number, z: number) => number): void {
    this.clock = time;
    let yaw: number;
    let pitch: number;
    let distance: number;
    if (mode === 'intro') {
      yaw = time * 0.09 + 2.4;
      pitch = 0.16;
      distance = 34;
    } else {
      // Ease back behind the ship after the player lets go, once it is moving.
      if (!this.dragging && time - this.lastDrag > 1.5 && target.speed > 1) {
        this.yaw = wrapAngle(this.yaw * Math.exp(-dt * 0.8));
      }
      yaw = this.yaw;
      pitch = this.pitch;
      distance = this.distance;
    }

    const around = target.heading + Math.PI + yaw;
    const flat = distance * Math.cos(pitch);
    this.desired.set(
      target.x + Math.sin(around) * flat,
      distance * Math.sin(pitch) + 3.5,
      target.z + Math.cos(around) * flat,
    );
    const ahead = mode === 'intro' ? 0 : 8;
    this.desiredLook.set(
      target.x + Math.sin(target.heading) * ahead,
      mode === 'intro' ? 4.5 : 3.5,
      target.z + Math.cos(target.heading) * ahead,
    );

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
