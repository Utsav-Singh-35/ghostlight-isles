import * as THREE from 'three';
import { createRng } from '../sim/rng';
import type { GlowKind, GlowSpec, WispSpec } from './islands';
import { PALETTE } from './palette';
import { waveHeightGlsl, wavePhases } from './waves';

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

// ---- Foam wake: a ring buffer of flat foam patches spawned at the stern, lying on the waves ----

const wakeVertex = /* glsl */ `
attribute vec4 aPatch; // x, z, size, turn
attribute float aAlpha;
uniform vec4 uWavePhase;
uniform float uLift;
varying vec2 vLocal;
varying vec2 vWorld;
varying float vAlpha;
#include <fog_pars_vertex>
${waveHeightGlsl()}
void main() {
  float c = cos(aPatch.w);
  float s = sin(aPatch.w);
  vec2 local = position.xy * aPatch.z;
  vec2 xz = aPatch.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  // Every corner sits on the wave under it, so the patch bends with the sea. The lift covers the
  // gap between the true wave and the sea's coarser grid.
  vec3 world = vec3(xz.x, waveHeight(xz, uWavePhase) + uLift, xz.y);
  vLocal = position.xy * 2.0;
  vWorld = xz;
  vAlpha = aPatch.z <= 0.0 ? 0.0 : aAlpha;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const wakeFragment = /* glsl */ `
uniform vec3 uColor;
varying vec2 vLocal;
varying vec2 vWorld;
varying float vAlpha;
#include <fog_pars_fragment>
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float edge = 1.0 - smoothstep(0.3, 1.0, length(vLocal));
  // Lace pinned to the water, not to the patch, so overlapping patches join up into one trail.
  float lace = noise(vWorld * 1.6) * 0.6 + noise(vWorld * 4.3 + 1.7) * 0.4;
  float a = smoothstep(0.42, 0.7, lace * 0.75 + edge * 0.45) * edge * vAlpha;
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
  readonly points: THREE.Mesh;
  update(source: WakeSource, dt: number, time: number, scale: number): void;
  dispose(): void;
}

/** A foam wake of up to `capacity` patches, lifted `lift` metres so the sea's grid never swallows them. */
export function createWake(capacity: number, lift = 0.15): Wake {
  const rng = createRng(0x3a6e);
  /** Per patch: x, z, size and turn, as the shader reads them. */
  const patches = new Float32Array(capacity * 4);
  const alphas = new Float32Array(capacity);
  const age = new Float32Array(capacity).fill(1e9);
  const life = new Float32Array(capacity).fill(1);
  const vx = new Float32Array(capacity);
  const vz = new Float32Array(capacity);
  const size0 = new Float32Array(capacity);
  let next = 0;
  let pending = 0;

  const plane = new THREE.PlaneGeometry(1, 1, 2, 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute('position', plane.getAttribute('position'));
  const patchAttribute = new THREE.InstancedBufferAttribute(patches, 4).setUsage(THREE.DynamicDrawUsage);
  const alphaAttribute = new THREE.InstancedBufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPatch', patchAttribute);
  geometry.setAttribute('aAlpha', alphaAttribute);
  geometry.instanceCount = capacity;
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uWavePhase: { value: new THREE.Vector4() }, uLift: { value: lift }, uColor: { value: new THREE.Color(PALETTE.foam).multiplyScalar(0.8) } },
    ]),
    vertexShader: wakeVertex,
    fragmentShader: wakeFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  const phases: [number, number, number, number] = [0, 0, 0, 0];

  const spawn = (x: number, z: number, outX: number, outZ: number, size: number, lifetime: number) => {
    const i = next;
    next = (next + 1) % capacity;
    patches[i * 4] = x + rng.range(-0.3, 0.3);
    patches[i * 4 + 1] = z + rng.range(-0.3, 0.3);
    patches[i * 4 + 3] = rng.range(0, Math.PI * 2);
    vx[i] = outX;
    vz[i] = outZ;
    age[i] = 0;
    life[i] = lifetime;
    size0[i] = size;
  };

  return {
    points: mesh,
    update(source, dt, time) {
      (material.uniforms.uWavePhase!.value as THREE.Vector4).fromArray(wavePhases(time, phases));
      const fx = Math.sin(source.heading);
      const fz = Math.cos(source.heading);
      const px = Math.cos(source.heading);
      const pz = -Math.sin(source.heading);
      const share = source.speed / source.maxSpeed;

      pending += dt * share * 46;
      while (pending >= 1) {
        pending -= 1;
        const side = rng.next() < 0.5 ? -1 : 1;
        const outward = rng.range(0.5, 1.2) * share;
        spawn(
          source.x - fx * 5.4 + px * side * 1.2,
          source.z - fz * 5.4 + pz * side * 1.2,
          px * side * outward,
          pz * side * outward,
          rng.range(1.6, 2.4),
          rng.range(3.5, 5.5),
        );
        if (share > 0.35 && rng.next() < 0.6) {
          // The bow wave, peeling away from the stem at speed.
          spawn(source.x + fx * 5.0 + px * side * 1.3, source.z + fz * 5.0 + pz * side * 1.3, px * side * 2.2 * share, pz * side * 2.2 * share, 1.3, 1.8);
        }
      }

      const damping = Math.exp(-dt * 0.9);
      for (let i = 0; i < capacity; i++) {
        age[i]! += dt;
        const t = age[i]! / life[i]!;
        if (t >= 1) {
          patches[i * 4 + 2] = 0;
          alphas[i] = 0;
          continue;
        }
        vx[i]! *= damping;
        vz[i]! *= damping;
        patches[i * 4]! += vx[i]! * dt;
        patches[i * 4 + 1]! += vz[i]! * dt;
        patches[i * 4 + 2] = size0[i]! * (1 + t * 1.8);
        alphas[i] = (1 - t) * (1 - t) * Math.min(1, age[i]! * 4) * 0.75;
      }
      patchAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
    },
    dispose() {
      plane.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
