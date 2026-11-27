import * as THREE from 'three';
import { createRng } from '../sim/rng';
import { PALETTE } from './palette';

export interface Sky {
  readonly dome: THREE.Mesh;
  readonly stars: THREE.Points;
  /** Keeps the sky centred on the camera, and twinkles the stars. */
  update(camera: THREE.Camera, time: number): void;
  /** Sets the sky's colors (for the Blood Moon). */
  setColors(top: THREE.Color, horizon: THREE.Color, moon: THREE.Color): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

const DOME_RADIUS = 4000;
const STAR_RADIUS = 3500;

const domeVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Not tone mapped, so the horizon matches the fog color exactly and the sea has no visible end.
const domeFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
varying vec3 vDir;

float crater(vec2 uv, vec2 centre, float radius) {
  return 1.0 - smoothstep(radius * 0.8, radius, length(uv - centre));
}

void main() {
  vec3 dir = normalize(vDir);
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(up, 0.5));

  float m = max(dot(dir, uMoonDir), 0.0);
  col += uMoonColor * (pow(m, 160.0) * 0.22 + pow(m, 14.0) * 0.07);

  // The moon's disc, about 2.4 degrees across, with a few soft craters.
  float disc = smoothstep(0.99905, 0.99925, m);
  vec3 t1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(t1, uMoonDir);
  vec2 uv = vec2(dot(dir, t1), dot(dir, t2)) / 0.042;
  float dark = crater(uv, vec2(0.28, 0.22), 0.22) + crater(uv, vec2(-0.3, -0.12), 0.16)
             + crater(uv, vec2(0.05, -0.42), 0.12) + crater(uv, vec2(-0.12, 0.38), 0.1);
  vec3 moon = uMoonColor * (1.05 - 0.16 * clamp(dark, 0.0, 1.0));
  col = mix(col, moon, disc);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const starVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  vec3 dir = normalize(position);
  vAlpha = smoothstep(0.03, 0.3, dir.y) * (0.65 + 0.35 * sin(uTime * (1.2 + aPhase * 0.4) + aPhase * 6.0));
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const starFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vAlpha;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky(moonDir: THREE.Vector3, starCount: number): Sky {
  const domeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
      uMoonDir: { value: moonDir.clone().normalize() },
      uMoonColor: { value: new THREE.Color(PALETTE.moonlight) },
    },
    vertexShader: domeVertex,
    fragmentShader: domeFragment,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), domeMaterial);
  dome.renderOrder = -10;
  dome.frustumCulled = false;

  const rng = createRng(0x51a75);
  const positions = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const y = Math.pow(rng.next(), 0.8);
    const around = rng.range(0, Math.PI * 2);
    const flat = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.sin(around) * flat * STAR_RADIUS;
    positions[i * 3 + 1] = y * STAR_RADIUS;
    positions[i * 3 + 2] = Math.cos(around) * flat * STAR_RADIUS;
    sizes[i] = rng.next() < 0.08 ? rng.range(2.4, 3.4) : rng.range(1.0, 2.2);
    phases[i] = rng.next();
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(PALETTE.star) },
    },
    vertexShader: starVertex,
    fragmentShader: starFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = -9;
  stars.frustumCulled = false;

  return {
    dome,
    stars,
    update(camera, time) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      starMaterial.uniforms.uTime!.value = time;
    },
    setPixelRatio(ratio) {
      starMaterial.uniforms.uPixelRatio!.value = ratio;
    },
    setColors(top, horizon, moon) {
      (domeMaterial.uniforms.uTop!.value as THREE.Color).copy(top);
      (domeMaterial.uniforms.uHorizon!.value as THREE.Color).copy(horizon);
      (domeMaterial.uniforms.uMoonColor!.value as THREE.Color).copy(moon);
    },
    dispose() {
      dome.geometry.dispose();
      domeMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
