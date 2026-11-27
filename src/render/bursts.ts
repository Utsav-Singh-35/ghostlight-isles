import * as THREE from 'three';
import { createRng } from '../sim/rng';

export type BurstKind = 'splash' | 'blast' | 'smoke' | 'witchfire' | 'spirit' | 'sparks';

interface Style {
  readonly color: THREE.Color;
  readonly count: number;
  readonly speed: number;
  readonly up: number;
  readonly gravity: number;
  readonly life: number;
  readonly size: number;
  readonly grow: number;
}

const STYLES: Record<BurstKind, Style> = {
  splash: { color: new THREE.Color('#BFD6E2'), count: 14, speed: 2.5, up: 6, gravity: 14, life: 0.9, size: 0.9, grow: 0.6 },
  blast: { color: new THREE.Color('#FFB347').multiplyScalar(1.6), count: 26, speed: 7, up: 4, gravity: 3, life: 0.6, size: 0.9, grow: 1.0 },
  smoke: { color: new THREE.Color('#3A3A44'), count: 10, speed: 1.2, up: 2.2, gravity: -0.6, life: 2.6, size: 2.2, grow: 2.2 },
  witchfire: { color: new THREE.Color('#5CFFB0').multiplyScalar(1.3), count: 3, speed: 0.6, up: 2.4, gravity: -1, life: 1.0, size: 1.4, grow: 0.4 },
  spirit: { color: new THREE.Color('#5CFFB0').multiplyScalar(1.6), count: 26, speed: 6, up: 5, gravity: 1, life: 1.2, size: 1.5, grow: 1.0 },
  sparks: { color: new THREE.Color('#FFE2A8').multiplyScalar(1.8), count: 8, speed: 9, up: 3, gravity: 9, life: 0.35, size: 0.5, grow: 0 },
};

const vertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vColor = aColor;
  vAlpha = aAlpha;
  gl_PointSize = aSize <= 0.0 ? 0.0 : clamp(aSize * uScale / max(-mvPosition.z, 0.1), 1.0, 400.0);
  gl_Position = projectionMatrix * mvPosition;
}`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.8, 1.0, d)) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <colorspace_fragment>
}`;

/** A pool of short-lived particles for explosions, splashes, smoke and witchfire. One draw call. */
export class Bursts {
  readonly points: THREE.Points;
  private readonly rng = createRng(0xb0057);
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly velocity: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly grow: Float32Array;
  private readonly gravity: Float32Array;
  private next = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly capacity: number) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(1e9);
    this.life = new Float32Array(capacity).fill(1);
    this.size0 = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
  }

  /** Spawns one burst at a point. `scale` makes it bigger. */
  spawn(kind: BurstKind, x: number, y: number, z: number, scale = 1, countScale = 1): void {
    const style = STYLES[kind];
    const count = Math.max(1, Math.round(style.count * countScale));
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const a = this.rng.range(0, Math.PI * 2);
      const out = this.rng.range(0.3, 1) * style.speed * scale;
      this.positions[i * 3] = x + this.rng.range(-0.5, 0.5) * scale;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z + this.rng.range(-0.5, 0.5) * scale;
      this.velocity[i * 3] = Math.sin(a) * out;
      this.velocity[i * 3 + 1] = this.rng.range(0.4, 1) * style.up * Math.sqrt(scale);
      this.velocity[i * 3 + 2] = Math.cos(a) * out;
      style.color.toArray(this.colors, i * 3);
      this.age[i] = 0;
      this.life[i] = style.life * this.rng.range(0.7, 1.3);
      this.size0[i] = style.size * scale * this.rng.range(0.7, 1.2);
      this.grow[i] = style.grow;
      this.gravity[i] = style.gravity;
    }
  }

  update(dt: number, scale: number): void {
    this.material.uniforms.uScale!.value = scale;
    for (let i = 0; i < this.capacity; i++) {
      this.age[i]! += dt;
      const t = this.age[i]! / this.life[i]!;
      if (t >= 1) {
        this.sizes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }
      this.velocity[i * 3 + 1]! -= this.gravity[i]! * dt;
      this.positions[i * 3]! += this.velocity[i * 3]! * dt;
      this.positions[i * 3 + 1]! += this.velocity[i * 3 + 1]! * dt;
      this.positions[i * 3 + 2]! += this.velocity[i * 3 + 2]! * dt;
      if (this.positions[i * 3 + 1]! < -0.5) this.positions[i * 3 + 1] = -0.5;
      this.sizes[i] = this.size0[i]! * (1 + this.grow[i]! * t);
      this.alphas[i] = (1 - t) * (1 - t);
    }
    const geometry = this.points.geometry;
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) geometry.getAttribute(name).needsUpdate = true;
  }

  clear(): void {
    this.age.fill(1e9);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
