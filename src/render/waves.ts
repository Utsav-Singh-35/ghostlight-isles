/**
 * The sea's waves, shared by the GPU (the ocean shader) and the CPU (floating ships and foam).
 * Both are built from the same table, so ships sit on the waves the player sees.
 * Visual only: the simulation never reads wave heights.
 */

import { TAU } from '../sim/math';

const GRAVITY = 9.81;

export interface Wave {
  /** Unit direction the wave travels in, on the x/z plane. */
  readonly dirX: number;
  readonly dirZ: number;
  /** Wavenumber 2π / wavelength. */
  readonly k: number;
  /** Height of a crest above the mean sea level, metres. */
  readonly amplitude: number;
  /** Angular frequency, radians per second. */
  readonly omega: number;
  readonly phase: number;
}

function wave(angleDegrees: number, wavelength: number, amplitude: number, speedScale: number, phase: number): Wave {
  const angle = (angleDegrees * Math.PI) / 180;
  const k = TAU / wavelength;
  return {
    dirX: Math.sin(angle),
    dirZ: Math.cos(angle),
    k,
    amplitude,
    // Deep-water waves travel at sqrt(g / k); slowed down a little for a calm, eerie night.
    omega: Math.sqrt(GRAVITY * k) * speedScale,
    phase,
  };
}

/** Exactly four waves, so the shader can take their phases as one vec4. */
export const WAVES: readonly [Wave, Wave, Wave, Wave] = [
  wave(20, 62, 0.8, 0.6, 0.0),
  wave(-35, 33, 0.45, 0.65, 1.7),
  wave(75, 17, 0.22, 0.7, 4.1),
  wave(-110, 9, 0.1, 0.75, 2.6),
];

/** Highest possible crest: the sum of the amplitudes. */
export const MAX_WAVE_HEIGHT = WAVES.reduce((sum, w) => sum + w.amplitude, 0);

/**
 * Ripples: eight small waves that only bend the light, for the glitter under the moon and the
 * sparkle of lanterns on the water. They never move the surface, so ships still sit on the four
 * waves above and the CPU never needs them. Each tilts the surface by about 0.035 at most.
 */
export const RIPPLES: readonly [Wave, Wave, Wave, Wave, Wave, Wave, Wave, Wave] = [
  wave(5, 6.1, 0.033, 0.7, 0.3),
  wave(-60, 4.3, 0.026, 0.7, 2.2),
  wave(110, 3.1, 0.02, 0.7, 4.7),
  wave(-150, 2.3, 0.014, 0.7, 1.1),
  wave(35, 1.7, 0.0105, 0.7, 3.9),
  wave(-95, 1.25, 0.0078, 0.7, 5.4),
  wave(160, 0.95, 0.0059, 0.7, 0.8),
  wave(-20, 0.7, 0.0042, 0.7, 2.9),
];

function phasesOf(table: readonly Wave[], t: number, out: number[]): void {
  table.forEach((w, i) => {
    let p = (w.phase - w.omega * t) % TAU;
    if (p < 0) p += TAU;
    // A tiny negative phase plus 2π rounds to exactly 2π; keep the result in [0, 2π).
    if (p >= TAU) p -= TAU;
    out[i] = p;
  });
}

/**
 * Each wave's phase at time `t`, wrapped into [0, 2π) in double precision, so the GPU only
 * ever works with small numbers no matter how long the game runs.
 */
export function wavePhases(t: number, out: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
  phasesOf(WAVES, t, out);
  return out;
}

/** Each ripple's phase at time `t`, wrapped into [0, 2π) like `wavePhases`. */
export function ripplePhases(t: number, out: number[] = new Array<number>(RIPPLES.length).fill(0)): number[] {
  phasesOf(RIPPLES, t, out);
  return out;
}

const scratch: [number, number, number, number] = [0, 0, 0, 0];

/** Sea height at a world position and time, matching the ocean shader. */
export function sampleWaveHeight(x: number, z: number, t: number): number {
  const phases = wavePhases(t, scratch);
  let h = 0;
  for (let i = 0; i < 4; i++) {
    const w = WAVES[i] as Wave;
    h += w.amplitude * Math.sin(w.k * (w.dirX * x + w.dirZ * z) + phases[i]!);
  }
  return h;
}

/** The sea's slope at a world position and time: how fast the height rises along x and along z. */
export function sampleWaveSlope(x: number, z: number, t: number): { x: number; z: number } {
  const phases = wavePhases(t, scratch);
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < 4; i++) {
    const w = WAVES[i] as Wave;
    const c = w.amplitude * w.k * Math.cos(w.k * (w.dirX * x + w.dirZ * z) + phases[i]!);
    sx += c * w.dirX;
    sz += c * w.dirZ;
  }
  return { x: sx, z: sz };
}

function glslFloat(n: number): string {
  const text = n.toPrecision(9);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

const PARTS = ['x', 'y', 'z', 'w'] as const;

/** GLSL for `float waveHeight(vec2 p, vec4 phase)`, generated from the same table as the CPU version. */
export function waveHeightGlsl(): string {
  const terms = WAVES.map(
    (w, i) =>
      `${glslFloat(w.amplitude)} * sin(${glslFloat(w.k)} * (${glslFloat(w.dirX)} * p.x + ${glslFloat(w.dirZ)} * p.y) + phase.${PARTS[i]})`,
  );
  return `float waveHeight(vec2 p, vec4 phase) {\n  return ${terms.join('\n       + ')};\n}`;
}

/** GLSL for `vec2 waveSlope(vec2 p, vec4 phase)`, the same slope as `sampleWaveSlope`. */
export function waveSlopeGlsl(): string {
  const lines = WAVES.map((w, i) => {
    const ak = w.amplitude * w.k;
    return `  c = cos(${glslFloat(w.k)} * (${glslFloat(w.dirX)} * p.x + ${glslFloat(w.dirZ)} * p.y) + phase.${PARTS[i]});\n  s += vec2(${glslFloat(ak * w.dirX)}, ${glslFloat(ak * w.dirZ)}) * c;`;
  });
  return `vec2 waveSlope(vec2 p, vec4 phase) {\n  vec2 s = vec2(0.0);\n  float c;\n${lines.join('\n')}\n  return s;\n}`;
}

/**
 * GLSL for `vec2 rippleSlope(vec2 p, vec4 phaseA, vec4 phaseB, out float lost)`: the first `count`
 * ripples' slope. A ripple too fine for the pixel it lands on fades out instead of flickering, and
 * `lost` adds up the slope variance that faded, so the shader can widen its highlights to match.
 */
export function rippleSlopeGlsl(count: number = RIPPLES.length): string {
  const used = Math.max(0, Math.min(RIPPLES.length, Math.round(count)));
  // Ripples left out (on Low) count as lost from the start.
  const omitted = RIPPLES.slice(used).reduce((sum, w) => sum + (w.amplitude * w.k) ** 2 / 2, 0);
  const lines = RIPPLES.slice(0, used).map((w, i) => {
    const ak = w.amplitude * w.k;
    const phase = `${i < 4 ? 'phaseA' : 'phaseB'}.${PARTS[i % 4]}`;
    return [
      `  a = ${glslFloat(w.k)} * (${glslFloat(w.dirX)} * p.x + ${glslFloat(w.dirZ)} * p.y);`,
      `  f = 1.0 - smoothstep(0.7, 2.2, fwidth(a));`,
      `  s += vec2(${glslFloat(ak * w.dirX)}, ${glslFloat(ak * w.dirZ)}) * (cos(a + ${phase}) * f);`,
      `  lost += ${glslFloat((ak * ak) / 2)} * (1.0 - f);`,
    ].join('\n');
  });
  return `vec2 rippleSlope(vec2 p, vec4 phaseA, vec4 phaseB, out float lost) {\n  vec2 s = vec2(0.0);\n  float a;\n  float f;\n  lost = ${glslFloat(omitted)};\n${lines.join('\n')}\n  return s;\n}`;
}
