import * as THREE from 'three';
import { PALETTE } from './palette';
import { MAX_WAVE_HEIGHT, waveHeightGlsl, wavePhases } from './waves';

/** Number of warm or spectral light pools the sea can show at once. */
export const OCEAN_LIGHTS = 4;

export interface Ocean {
  readonly mesh: THREE.Mesh;
  /** Moves the grid under the camera (snapped to whole cells) and advances the waves. */
  update(centerX: number, centerZ: number, time: number): void;
  /** Sets one light pool on the water. A radius of 0 turns it off. */
  setLight(index: number, position: THREE.Vector3, radius: number, color: THREE.Color, strength: number): void;
  dispose(): void;
}

const SIZE = 800;

const vertexShader = /* glsl */ `
uniform vec4 uWavePhase;
varying vec3 vWorld;
varying float vHeight;
#include <fog_pars_vertex>
${waveHeightGlsl()}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float h = waveHeight(world.xz, uWavePhase);
  world.y += h;
  vWorld = world.xyz;
  vHeight = h;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform vec3 uHorizon;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform float uMoonStrength;
uniform float uGlitter;
uniform float uMaxHeight;
uniform vec2 uCenter;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec4 uLightPos[${OCEAN_LIGHTS}];
uniform vec3 uLightColor[${OCEAN_LIGHTS}];
varying vec3 vWorld;
varying float vHeight;
#include <fog_pars_fragment>

void main() {
  // A flat normal per facet, from screen-space derivatives.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 viewDir = normalize(cameraPosition - vWorld);

  float crest = smoothstep(-0.3, 1.0, vHeight / uMaxHeight);
  vec3 base = mix(uDeep, uCrest, crest * 0.85);

  vec3 ambient = mix(uAmbientGround, uAmbientSky, n.y * 0.5 + 0.5);
  vec3 col = base * (ambient + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonStrength);

  // The horizon reflects in the water at grazing angles.
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
  col = mix(col, uHorizon, fresnel * 0.5);

  // A sharp glitter path under the moon.
  vec3 halfMoon = normalize(uMoonDir + viewDir);
  col += uMoonColor * pow(max(dot(n, halfMoon), 0.0), 700.0) * uGlitter;

  // Warm and spectral pools of light from lanterns.
  for (int i = 0; i < ${OCEAN_LIGHTS}; i++) {
    float radius = uLightPos[i].w;
    if (radius <= 0.0) continue;
    vec3 toLight = uLightPos[i].xyz - vWorld;
    float d = max(length(toLight), 0.001);
    float fall = clamp(1.0 - d / radius, 0.0, 1.0);
    fall *= fall;
    vec3 l = toLight / d;
    vec3 halfLight = normalize(l + viewDir);
    col += uLightColor[i] * fall * (0.35 * max(dot(n, l), 0.0) + 1.2 * pow(max(dot(n, halfLight), 0.0), 60.0));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #ifdef USE_FOG
    // Fade to the fog color before the grid ends, so the sea has no visible edge.
    float edge = smoothstep(uFadeStart, uFadeEnd, distance(vWorld.xz, uCenter));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, edge);
  #endif
}`;

export function createOcean(cellSize: number, moonDir: THREE.Vector3): Ocean {
  const segments = Math.round(SIZE / cellSize);
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const lightPos = Array.from({ length: OCEAN_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0));
  const lightColor = Array.from({ length: OCEAN_LIGHTS }, () => new THREE.Color(0, 0, 0));

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uWavePhase: { value: new THREE.Vector4() },
      uDeep: { value: new THREE.Color(PALETTE.deepWater) },
      uCrest: { value: new THREE.Color(PALETTE.waveCrest) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
      uMoonDir: { value: moonDir.clone().normalize() },
      uMoonColor: { value: new THREE.Color(PALETTE.moonlight) },
      uAmbientSky: { value: new THREE.Color(PALETTE.hemisphereSky).multiplyScalar(0.55) },
      uAmbientGround: { value: new THREE.Color(PALETTE.hemisphereGround).multiplyScalar(0.55) },
      uMoonStrength: { value: 0.9 },
      uGlitter: { value: 0.75 },
      uMaxHeight: { value: MAX_WAVE_HEIGHT },
      uCenter: { value: new THREE.Vector2() },
      uFadeStart: { value: SIZE * 0.36 },
      uFadeEnd: { value: SIZE * 0.49 },
      uLightPos: { value: lightPos },
      uLightColor: { value: lightColor },
    },
  ]);
  // UniformsUtils.merge clones values; keep references to the live arrays.
  uniforms.uLightPos!.value = lightPos;
  uniforms.uLightColor!.value = lightColor;

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  const phases: [number, number, number, number] = [0, 0, 0, 0];

  return {
    mesh,
    update(centerX, centerZ, time) {
      mesh.position.set(Math.round(centerX / cellSize) * cellSize, 0, Math.round(centerZ / cellSize) * cellSize);
      (uniforms.uCenter!.value as THREE.Vector2).set(mesh.position.x, mesh.position.z);
      wavePhases(time, phases);
      (uniforms.uWavePhase!.value as THREE.Vector4).set(phases[0], phases[1], phases[2], phases[3]);
    },
    setLight(index, position, radius, color, strength) {
      lightPos[index]?.set(position.x, position.y, position.z, radius);
      lightColor[index]?.copy(color).multiplyScalar(strength);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
