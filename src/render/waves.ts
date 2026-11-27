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
 * Each wave's phase at time `t`, wrapped into [0, 2π) in double precision, so the GPU only
 * ever works with small numbers no matter how long the game runs.
 */
export function wavePhases(t: number, out: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
  for (let i = 0; i < 4; i++) {
    const w = WAVES[i] as Wave;
    let p = (w.phase - w.omega * t) % TAU;
    if (p < 0) p += TAU;
    // A tiny negative phase plus 2π rounds to exactly 2π; keep the result in [0, 2π).
    if (p >= TAU) p -= TAU;
    out[i] = p;
  }
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

function glslFloat(n: number): string {
  const text = n.toPrecision(9);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

/** GLSL for `float waveHeight(vec2 p, vec4 phase)`, generated from the same table as the CPU version. */
export function waveHeightGlsl(): string {
  const parts = ['x', 'y', 'z', 'w'];
  const terms = WAVES.map(
    (w, i) =>
      `${glslFloat(w.amplitude)} * sin(${glslFloat(w.k)} * (${glslFloat(w.dirX)} * p.x + ${glslFloat(w.dirZ)} * p.y) + phase.${parts[i]})`,
  );
  return `float waveHeight(vec2 p, vec4 phase) {\n  return ${terms.join('\n       + ')};\n}`;
}
