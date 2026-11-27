import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_WAVE_HEIGHT, WAVES, sampleWaveHeight, waveHeightGlsl, wavePhases } from './waves';

const real = (min: number, max: number) => fc.double({ noNaN: true, noDefaultInfinity: true, min, max });

describe('sailing spec: waves', () => {
  // Feature: sailing, Property 13. Validates: Requirement 6.2
  it('Property 13: wave heights are bounded', () => {
    fc.assert(
      fc.property(real(-1500, 1500), real(-1500, 1500), real(0, 100_000), (x, z, t) => {
        const h = sampleWaveHeight(x, z, t);
        expect(Number.isFinite(h)).toBe(true);
        expect(Math.abs(h)).toBeLessThanOrEqual(MAX_WAVE_HEIGHT + 1e-9);
      }),
      { numRuns: 200 },
    );
  });

  it('wrapped phases give the same heights as unwrapped ones', () => {
    fc.assert(
      fc.property(real(-500, 500), real(-500, 500), real(0, 10_000), (x, z, t) => {
        let direct = 0;
        for (const w of WAVES) direct += w.amplitude * Math.sin(w.k * (w.dirX * x + w.dirZ * z) + w.phase - w.omega * t);
        expect(Math.abs(sampleWaveHeight(x, z, t) - direct)).toBeLessThan(1e-6);
        for (const p of wavePhases(t)) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThan(Math.PI * 2);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Regression: fast-check found t = 5e-324, where −5e-324 + 2π rounded to exactly 2π.
  it('phases stay below 2π for a tiny positive time', () => {
    for (const p of wavePhases(5e-324)) expect(p).toBeLessThan(Math.PI * 2);
  });

  it('the shader code is built from the same wave table', () => {
    const glsl = waveHeightGlsl();
    expect(glsl).toContain('float waveHeight(vec2 p, vec4 phase)');
    for (const w of WAVES) expect(glsl).toContain(w.k.toPrecision(9));
    expect(glsl.match(/sin\(/g)).toHaveLength(4);
  });
});
