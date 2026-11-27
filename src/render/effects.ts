import * as THREE from 'three';
import { createRng } from '../sim/rng';
import type { GlowKind, GlowSpec, WispSpec } from './islands';
import { PALETTE } from './palette';
import { sampleWaveHeight } from './waves';

/** Converts a world size in metres to pixels: drawing-buffer height / (2 tan(fov / 2)). */
export function pointScale(camera: THREE.PerspectiveCamera, bufferHeight: number): number {
  return bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

function colorFor(kind: GlowKind): THREE.Color {
  return new THREE.Color(kind === 'lantern' ? PALETTE.lantern : PALETTE.spectral);
}

// ---- Lantern glows: additive, ignore fog, so lanterns show where islands are ----

const glowVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uScale;
varying vec3 vColor;
varying float vIntensity;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float flicker = 0.88 + 0.08 * sin(uTime * 7.0 + aPhase * 11.0) + 0.04 * sin(uTime * 17.0 + aPhase * 5.0);
  float dist = -mv.z;
  vColor = aColor;
  vIntensity = flicker / (1.0 + dist / 700.0);
  gl_PointSize = clamp(aSize * flicker * uScale / max(dist, 0.1), 2.5, 600.0);
  gl_Position = projectionMatrix * mv;
}`;

const glowFragment = /* glsl */ `
varying vec3 vColor;
varying float vIntensity;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = exp(-d * d * 14.0);
  float halo = exp(-d * d * 3.5) * 0.45;
  float a = (core + halo) * (1.0 - smoothstep(0.75, 1.0, d)) * vIntensity;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <colorspace_fragment>
}`;

export interface Glows {
  readonly points: THREE.Points;
  /** Moves one of the extra, movable glows (such as the ship's lanterns). */
  setMovable(index: number, position: THREE.Vector3): void;
  /** Recolors the fixed glows of these islands: warm when captured, their original color otherwise. */
  setCaptured(ids: ReadonlySet<number>): void;
  update(time: number, scale: number): void;
  dispose(): void;
}

export function createGlows(fixed: readonly GlowSpec[], movable: readonly GlowSpec[]): Glows {
  const all = [...movable, ...fixed];
  const positions = new Float32Array(all.length * 3);
  const colors = new Float32Array(all.length * 3);
  const sizes = new Float32Array(all.length);
  const phases = new Float32Array(all.length);
  const rng = createRng(0x9107);
  all.forEach((glow, i) => {
    glow.position.toArray(positions, i * 3);
    colorFor(glow.kind).toArray(colors, i * 3);
    sizes[i] = glow.size;
    phases[i] = rng.next();
  });
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 500 } },
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;

  return {
    points,
    setMovable(index, position) {
      if (index < 0 || index >= movable.length) return;
      position.toArray(positions, index * 3);
      positionAttribute.needsUpdate = true;
    },
    setCaptured(ids) {
      const warm = colorFor('lantern');
      all.forEach((glow, i) => {
        const owned = glow.islandId !== undefined && ids.has(glow.islandId);
        (owned ? warm : colorFor(glow.kind)).toArray(colors, i * 3);
      });
      geometry.getAttribute('aColor').needsUpdate = true;
    },
    update(time, scale) {
      material.uniforms.uTime!.value = time;
      material.uniforms.uScale!.value = scale;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---- Ghost wisps: green motes drifting over haunted islands, animated on the GPU ----

const wispVertex = /* glsl */ `
attribute vec4 aMotion; // radius, speed, phase, size
uniform float uTime;
uniform float uScale;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  float t = uTime * aMotion.y + aMotion.z * 6.2831;
  vec3 p = position + vec3(sin(t) * aMotion.x, sin(t * 1.7 + aMotion.z * 3.0) * 0.8, cos(t * 0.8) * aMotion.x);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vAlpha = 0.55 + 0.45 * sin(uTime * 2.3 + aMotion.z * 20.0);
  gl_PointSize = aMotion.w <= 0.0 ? 0.0 : clamp(aMotion.w * uScale / max(-mvPosition.z, 0.1), 1.5, 200.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const wispFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-d * d * 6.0) * (1.0 - smoothstep(0.8, 1.0, d)) * vAlpha;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
  #ifdef USE_FOG
    // Ghost lights fade in fog more slowly than solid things do.
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.45);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * 0.7;
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}`;

export interface Wisps {
  readonly points: THREE.Points;
  update(time: number, scale: number): void;
  /** Captured islands lose their ghost lights. */
  setCaptured(ids: ReadonlySet<number>): void;
  dispose(): void;
}

export function createWisps(specs: readonly WispSpec[]): Wisps {
  const rng = createRng(0xa11);
  const positions = new Float32Array(specs.length * 3);
  const motion = new Float32Array(specs.length * 4);
  const sizes = new Float32Array(specs.length);
  specs.forEach((wisp, i) => {
    wisp.position.toArray(positions, i * 3);
    sizes[i] = rng.range(0.9, 1.7);
    motion.set([wisp.radius, rng.range(0.15, 0.45), rng.next(), sizes[i]!], i * 4);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aMotion', new THREE.BufferAttribute(motion, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uScale: { value: 500 }, uColor: { value: new THREE.Color(PALETTE.spectral).multiplyScalar(1.3) } },
    ]),
    vertexShader: wispVertex,
    fragmentShader: wispFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return {
    points,
    update(time, scale) {
      material.uniforms.uTime!.value = time;
      material.uniforms.uScale!.value = scale;
    },
    setCaptured(ids) {
      specs.forEach((wisp, i) => {
        motion[i * 4 + 3] = ids.has(wisp.islandId) ? 0 : sizes[i]!;
      });
      geometry.getAttribute('aMotion').needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---- Foam wake: a ring buffer of particles spawned at the stern, floating on the waves ----

const wakeVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vAlpha = aAlpha;
  gl_PointSize = aSize <= 0.0 ? 0.0 : clamp(aSize * uScale / max(-mvPosition.z, 0.1), 1.0, 300.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const wakeFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface WakeSource {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
  readonly maxSpeed: number;
}

export interface Wake {
  readonly points: THREE.Points;
  update(source: WakeSource, dt: number, time: number, scale: number): void;
  dispose(): void;
}

export function createWake(capacity: number): Wake {
  const rng = createRng(0x3a6e);
  const positions = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const age = new Float32Array(capacity).fill(1e9);
  const life = new Float32Array(capacity).fill(1);
  const vx = new Float32Array(capacity);
  const vz = new Float32Array(capacity);
  const size0 = new Float32Array(capacity);
  let next = 0;
  let pending = 0;

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aSize', sizeAttribute);
  geometry.setAttribute('aAlpha', alphaAttribute);
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uScale: { value: 500 }, uColor: { value: new THREE.Color(PALETTE.foam) } },
    ]),
    vertexShader: wakeVertex,
    fragmentShader: wakeFragment,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 4;

  const spawn = (x: number, z: number, outX: number, outZ: number, size: number, lifetime: number) => {
    const i = next;
    next = (next + 1) % capacity;
    positions[i * 3] = x + rng.range(-0.3, 0.3);
    positions[i * 3 + 2] = z + rng.range(-0.3, 0.3);
    vx[i] = outX;
    vz[i] = outZ;
    age[i] = 0;
    life[i] = lifetime;
    size0[i] = size;
  };

  return {
    points,
    update(source, dt, time, scale) {
      material.uniforms.uScale!.value = scale;
      const fx = Math.sin(source.heading);
      const fz = Math.cos(source.heading);
      const px = Math.cos(source.heading);
      const pz = -Math.sin(source.heading);
      const share = source.speed / source.maxSpeed;

      pending += dt * share * 70;
      while (pending >= 1) {
        pending -= 1;
        const side = rng.next() < 0.5 ? -1 : 1;
        const outward = rng.range(0.4, 1.1) * share;
        spawn(
          source.x - fx * 5.6 + px * side * 1.3,
          source.z - fz * 5.6 + pz * side * 1.3,
          px * side * outward,
          pz * side * outward,
          rng.range(0.7, 1.2),
          rng.range(2.2, 3.6),
        );
        if (share > 0.35 && rng.next() < 0.5) {
          // Spray from the bow at speed.
          spawn(source.x + fx * 5.4 + px * side * 1.2, source.z + fz * 5.4 + pz * side * 1.2, px * side * 1.6 * share, pz * side * 1.6 * share, 0.6, 1.2);
        }
      }

      const damping = Math.exp(-dt * 0.9);
      for (let i = 0; i < capacity; i++) {
        age[i]! += dt;
        const t = age[i]! / life[i]!;
        if (t >= 1) {
          sizes[i] = 0;
          alphas[i] = 0;
          continue;
        }
        vx[i]! *= damping;
        vz[i]! *= damping;
        const x = (positions[i * 3]! += vx[i]! * dt);
        const z = (positions[i * 3 + 2]! += vz[i]! * dt);
        positions[i * 3 + 1] = sampleWaveHeight(x, z, time) + 0.12;
        sizes[i] = size0[i]! * (1 + t * 2.4);
        alphas[i] = (1 - t) * Math.min(1, age[i]! * 5) * 0.3;
      }
      positionAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
