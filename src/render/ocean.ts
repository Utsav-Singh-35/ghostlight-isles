import * as THREE from 'three';
import { WATERLINE } from './islands';
import { PALETTE } from './palette';
import { MAX_WAVE_HEIGHT, ripplePhases, rippleSlopeGlsl, waveHeightGlsl, wavePhases, waveSlopeGlsl } from './waves';

/** A number as a GLSL float literal. */
function glslNumber(n: number): string {
  const text = String(n);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

/** Number of warm or spectral light pools the sea can show at once. */
export const OCEAN_LIGHTS = 4;
/** Number of island shores the sea can draw surf and shallows around at once. */
export const OCEAN_SHORES = 8;

/** An island's shore: its centre, radius and the phases of its coastline's wobble (see `buildTerrain`). */
export interface Shore {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly coast: readonly [number, number, number];
}

export interface Ocean {
  readonly mesh: THREE.Mesh;
  /** Moves the grid under the camera (snapped to whole cells) and advances the waves. */
  update(centerX: number, centerZ: number, time: number): void;
  /** Sets one light pool on the water. A radius of 0 turns it off. */
  setLight(index: number, position: THREE.Vector3, radius: number, color: THREE.Color, strength: number): void;
  /** Sets the shores that get surf and shallows, nearest first. Shores past `OCEAN_SHORES` are left out. */
  setShores(shores: readonly Shore[]): void;
  /** Sets the moonlight and horizon colors (for the Blood Moon). */
  setColors(moon: THREE.Color, horizon: THREE.Color, skyTop: THREE.Color): void;
  dispose(): void;
}

const SIZE = 800;
/** A whole number of surf cycles (the surf rolls at 1.5 radians a second), close to ten minutes. */
const FOAM_PERIOD = ((Math.PI * 2) / 1.5) * 143;

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

function fragmentShader(ripples: number, foamOctaves: number): string {
  return /* glsl */ `
uniform vec4 uWavePhase;
uniform vec4 uRippleA;
uniform vec4 uRippleB;
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uHorizon;
uniform vec3 uSkyTop;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform float uMoonStrength;
uniform float uGlitter;
uniform float uMaxHeight;
uniform float uTime;
uniform vec2 uCenter;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec4 uLightPos[${OCEAN_LIGHTS}];
uniform vec3 uLightColor[${OCEAN_LIGHTS}];
uniform vec4 uShores[${OCEAN_SHORES}];
uniform vec3 uCoasts[${OCEAN_SHORES}];
varying vec3 vWorld;
varying float vHeight;
#include <fog_pars_fragment>

${waveSlopeGlsl()}
${rippleSlopeGlsl(ripples)}

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

// Value noise and its gradient, for ripples with no pattern to them.
vec3 noiseGrad(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
}

// The same sky as the dome, for reflections.
vec3 skyColor(vec3 dir) {
  vec3 col = mix(uHorizon, uSkyTop, pow(clamp(dir.y, 0.0, 1.0), 0.5));
  float m = max(dot(dir, uMoonDir), 0.0);
  return col + uMoonColor * (pow(m, 160.0) * 0.22 + pow(m, 14.0) * 0.07);
}

void main() {
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 viewDir = toEye / max(dist, 0.001);

  // Smooth normals from the waves' own slopes, roughened by ripples that only bend the light, and
  // by drifting noise that hides the ripples' repeating pattern.
  float lost;
  vec2 slope = waveSlope(vWorld.xz, uWavePhase) + rippleSlope(vWorld.xz, uRippleA, uRippleB, lost);
  vec2 np = vWorld.xz * 0.55 + vec2(uTime * 0.31, uTime * 0.17);
  float noiseFade = 1.0 - smoothstep(0.35, 1.1, fwidth(np.x) + fwidth(np.y));
  slope += noiseGrad(np).yz * 0.05 * noiseFade;
  ${ripples > 4 ? 'slope += noiseGrad(np * 2.3 + 11.0).yz * 0.03 * (1.0 - smoothstep(0.15, 0.5, fwidth(np.x) + fwidth(np.y)));' : ''}
  lost += 0.0006 * (1.0 - noiseFade);
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

  // Shores nearby: paler shallows, and surf that follows the coastline and rolls in toward the beach.
  float shallow = 0.0;
  float surf = 0.0;
  for (int i = 0; i < ${OCEAN_SHORES}; i++) {
    vec4 s = uShores[i];
    if (s.z <= 0.0) continue;
    vec2 off = vWorld.xz - s.xy;
    float d = length(off);
    if (d > s.z * 1.6) continue;
    float theta = atan(off.x, off.y);
    vec3 c = uCoasts[i];
    float coast = s.z * ${glslNumber(WATERLINE)} * (1.0 + 0.05 * sin(2.0 * theta + c.x) + 0.03 * sin(3.0 * theta + c.y) + 0.02 * sin(5.0 * theta + c.z));
    // Metres out from the waterline.
    float out_ = d - coast;
    shallow = max(shallow, 1.0 - smoothstep(0.0, s.z * 0.35, out_));
    float band = smoothstep(-1.5, 0.5, out_) * (1.0 - smoothstep(1.5, 7.0 + s.z * 0.05, out_));
    float roll = 0.5 + 0.5 * sin(out_ * 0.9 + uTime * 1.5);
    surf = max(surf, band * (0.3 + 0.7 * roll));
  }

  float crest = smoothstep(-0.3, 1.0, vHeight / uMaxHeight);
  vec3 body = mix(uDeep, uCrest, crest * 0.75);
  body = mix(body, uShallow, shallow * 0.6);
  vec3 ambient = mix(uAmbientGround, uAmbientSky, n.y * 0.5 + 0.5);
  vec3 col = body * (ambient + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonStrength);

  // The night sky reflects in the water, more and more as the view grazes it (Fresnel, for water).
  float cosV = max(dot(n, viewDir), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
  vec3 r = reflect(-viewDir, n);
  r.y = abs(r.y);
  col = mix(col, skyColor(r), fresnel);

  // The moon's road: sharp glints close by, a soft band far off where the ripples are too fine to see.
  float shininess = 1.0 / (0.0007 + lost * 1.5);
  vec3 halfMoon = normalize(uMoonDir + viewDir);
  float glint = pow(max(dot(n, halfMoon), 0.0), shininess) * (shininess + 8.0) * 0.016;
  col += uMoonColor * glint * uGlitter * (0.12 + fresnel);

  // Foam: lace on the highest crests and in the surf, fading out before it turns to noise.
  vec2 fp = vWorld.xz * 0.42 + vec2(uTime * 0.11, uTime * -0.07);
  float pattern = noise(fp);
  ${foamOctaves > 1 ? 'pattern = pattern * 0.62 + noise(fp * 2.9 + 7.3) * 0.38;' : ''}
  float caps = smoothstep(0.58, 0.95, vHeight / uMaxHeight) * 0.5;
  float cover = max(caps, surf) * (1.0 - smoothstep(220.0, 360.0, dist));
  float foam = cover > 0.001 ? smoothstep(1.0 - cover, 1.18 - cover, pattern) : 0.0;
  col = mix(col, uFoam * (ambient * 0.55 + uMoonColor * (0.12 + 0.3 * max(dot(n, uMoonDir), 0.0))), foam * 0.85);

  // Warm and spectral pools of light from lanterns, and their glitter on the ripples.
  float lightShine = min(shininess, 260.0);
  for (int i = 0; i < ${OCEAN_LIGHTS}; i++) {
    float radius = uLightPos[i].w;
    if (radius <= 0.0) continue;
    vec3 toLight = uLightPos[i].xyz - vWorld;
    float d = max(length(toLight), 0.001);
    float fall = clamp(1.0 - d / radius, 0.0, 1.0);
    float reach = clamp(1.0 - d / (radius * 2.2), 0.0, 1.0);
    vec3 l = toLight / d;
    vec3 halfLight = normalize(l + viewDir);
    float shine = pow(max(dot(n, halfLight), 0.0), lightShine) * (lightShine + 8.0) * 0.012;
    col += uLightColor[i] * (fall * fall * 0.32 * max(dot(n, l), 0.0) * (1.0 + foam * 2.5) + reach * reach * shine);
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
}

/**
 * The sea. `detail` 'low' draws half the ripples and plainer foam, for the Low graphics setting.
 */
export function createOcean(cellSize: number, moonDir: THREE.Vector3, detail: 'high' | 'low' = 'high'): Ocean {
  const segments = Math.round(SIZE / cellSize);
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const lightPos = Array.from({ length: OCEAN_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0));
  const lightColor = Array.from({ length: OCEAN_LIGHTS }, () => new THREE.Color(0, 0, 0));
  const shores = Array.from({ length: OCEAN_SHORES }, () => new THREE.Vector4(0, 0, 0, 0));
  const coasts = Array.from({ length: OCEAN_SHORES }, () => new THREE.Vector3(0, 0, 0));

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uWavePhase: { value: new THREE.Vector4() },
      uRippleA: { value: new THREE.Vector4() },
      uRippleB: { value: new THREE.Vector4() },
      uDeep: { value: new THREE.Color(PALETTE.deepWater) },
      uCrest: { value: new THREE.Color(PALETTE.waveCrest) },
      uShallow: { value: new THREE.Color(PALETTE.shallowWater) },
      uFoam: { value: new THREE.Color(PALETTE.foam) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
      uSkyTop: { value: new THREE.Color(PALETTE.skyTop) },
      uMoonDir: { value: moonDir.clone().normalize() },
      uMoonColor: { value: new THREE.Color(PALETTE.moonlight) },
      uAmbientSky: { value: new THREE.Color(PALETTE.hemisphereSky).multiplyScalar(0.55) },
      uAmbientGround: { value: new THREE.Color(PALETTE.hemisphereGround).multiplyScalar(0.55) },
      uMoonStrength: { value: 0.8 },
      uGlitter: { value: 0.75 },
      uMaxHeight: { value: MAX_WAVE_HEIGHT },
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uFadeStart: { value: SIZE * 0.36 },
      uFadeEnd: { value: SIZE * 0.49 },
      uLightPos: { value: lightPos },
      uLightColor: { value: lightColor },
      uShores: { value: shores },
      uCoasts: { value: coasts },
    },
  ]);
  // UniformsUtils.merge clones values; keep references to the live arrays.
  uniforms.uLightPos!.value = lightPos;
  uniforms.uLightColor!.value = lightColor;
  uniforms.uShores!.value = shores;
  uniforms.uCoasts!.value = coasts;

  const low = detail === 'low';
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: fragmentShader(low ? 4 : 8, low ? 1 : 2),
    fog: true,
  });
  // Ripples fade by their own screen-space size, which needs derivatives (core in WebGL 2).
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  const phases: [number, number, number, number] = [0, 0, 0, 0];
  const ripples = ripplePhases(0);

  return {
    mesh,
    update(centerX, centerZ, time) {
      mesh.position.set(Math.round(centerX / cellSize) * cellSize, 0, Math.round(centerZ / cellSize) * cellSize);
      (uniforms.uCenter!.value as THREE.Vector2).set(mesh.position.x, mesh.position.z);
      wavePhases(time, phases);
      (uniforms.uWavePhase!.value as THREE.Vector4).set(phases[0], phases[1], phases[2], phases[3]);
      ripplePhases(time, ripples);
      (uniforms.uRippleA!.value as THREE.Vector4).set(ripples[0]!, ripples[1]!, ripples[2]!, ripples[3]!);
      (uniforms.uRippleB!.value as THREE.Vector4).set(ripples[4]!, ripples[5]!, ripples[6]!, ripples[7]!);
      // Wrapping the foam's clock about every ten minutes keeps the GPU's numbers small.
      uniforms.uTime!.value = time % FOAM_PERIOD;
    },
    setLight(index, position, radius, color, strength) {
      lightPos[index]?.set(position.x, position.y, position.z, radius);
      lightColor[index]?.copy(color).multiplyScalar(strength);
    },
    setShores(list) {
      shores.forEach((s, i) => {
        const shore = list[i];
        if (shore) {
          s.set(shore.x, shore.z, shore.radius, 0);
          coasts[i]!.set(shore.coast[0], shore.coast[1], shore.coast[2]);
        } else {
          s.set(0, 0, 0, 0);
        }
      });
    },
    setColors(moon, horizon, skyTop) {
      (uniforms.uMoonColor!.value as THREE.Color).copy(moon);
      (uniforms.uHorizon!.value as THREE.Color).copy(horizon);
      (uniforms.uSkyTop!.value as THREE.Color).copy(skyTop);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
