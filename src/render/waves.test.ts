import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_WAVE_HEIGHT, RIPPLES, WAVES, ripplePhases, rippleSlopeGlsl, sampleWaveHeight, sampleWaveSlope, waveHeightGlsl, wavePhases, waveSlopeGlsl } from './waves';

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

  // Feature: sailing, Property 15. Validates: Requirement 6.6
  it("Property 15: the sea's slope matches its height", () => {
    fc.assert(
      fc.property(real(-1500, 1500), real(-1500, 1500), real(0, 10_000), (x, z, t) => {
        const e = 1e-3;
        const slope = sampleWaveSlope(x, z, t);
        const dx = (sampleWaveHeight(x + e, z, t) - sampleWaveHeight(x - e, z, t)) / (2 * e);
        const dz = (sampleWaveHeight(x, z + e, t) - sampleWaveHeight(x, z - e, t)) / (2 * e);
        expect(Math.abs(slope.x - dx)).toBeLessThan(1e-4);
        expect(Math.abs(slope.z - dz)).toBeLessThan(1e-4);
      }),
      { numRuns: 200 },
    );
    const glsl = waveSlopeGlsl();
    expect(glsl).toContain('vec2 waveSlope(vec2 p, vec4 phase)');
    for (const w of WAVES) expect(glsl).toContain(w.k.toPrecision(9));
    expect(glsl.match(/cos\(/g)).toHaveLength(4);
  });

  it('ripples only light the sea, and Low leaves half of them out', () => {
    expect(rippleSlopeGlsl().match(/cos\(/g)).toHaveLength(RIPPLES.length);
    expect(rippleSlopeGlsl(4).match(/cos\(/g)).toHaveLength(4);
    // What Low leaves out still counts, so its highlights widen instead of turning sharp.
    expect(rippleSlopeGlsl(4)).not.toContain('lost = 0.0;');
    for (const p of ripplePhases(12345.6)) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
    expect(waveHeightGlsl()).not.toMatch(/phaseA|phaseB/);
  });

  it('the shader code is built from the same wave table', () => {
    const glsl = waveHeightGlsl();
    expect(glsl).toContain('float waveHeight(vec2 p, vec4 phase)');
    for (const w of WAVES) expect(glsl).toContain(w.k.toPrecision(9));
    expect(glsl.match(/sin\(/g)).toHaveLength(4);
  });
});
