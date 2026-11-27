import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PUZZLE } from './balance';
import { generatePuzzle, isSolved, reflect, sanitizeOrientation, totemsOf, trace } from './puzzle';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const layout = fc.array(fc.constantFrom(0, 1), { minLength: PUZZLE.size * PUZZLE.size, maxLength: PUZZLE.size * PUZZLE.size });

describe('island-capture spec: Lantern Lines', () => {
  // Feature: island-capture, Property 1. Validates: Requirements 1.1, 1.2
  it('Property 1: every puzzle has a solution', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const p = generatePuzzle(s);
        expect(p.cells).toHaveLength(p.size * p.size);
        expect(totemsOf(p)).toHaveLength(PUZZLE.totems);
        expect(isSolved(p, p.solution)).toBe(true);
        const path = trace(p, p.solution);
        expect(path.steps.length).toBeGreaterThanOrEqual(PUZZLE.minPath);
        expect(path.steps.filter((step) => step.inDir[0] !== step.outDir[0] || step.inDir[1] !== step.outDir[1]).length).toBeGreaterThanOrEqual(PUZZLE.minTurns);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: island-capture, Property 2. Validates: Requirement 1.2
  it('Property 2: no puzzle starts solved', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const p = generatePuzzle(s);
        expect(isSolved(p, p.start)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: island-capture, Property 3. Validates: Requirements 1.3, 1.4
  it('Property 3: the beam behaves', () => {
    fc.assert(
      fc.property(seed, layout, (s, o) => {
        const p = generatePuzzle(s);
        const t = trace(p, o);
        expect(t.steps.length).toBeLessThanOrEqual(p.size * p.size * 4);
        for (const step of t.steps) expect(p.cells[step.row * p.size + step.col]).not.toBe('rock');
        expect(trace(p, o)).toEqual(t);
        expect(t.blocked && t.exited).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: island-capture, Property 4. Validates: Requirement 1.4
  it('Property 4: solved means every totem is lit', () => {
    fc.assert(
      fc.property(seed, layout, layout, (s, o, noise) => {
        const p = generatePuzzle(s);
        const lit = new Set(trace(p, o).lit);
        expect(isSolved(p, o)).toBe(totemsOf(p).every((t) => lit.has(t)));
        // Values on non-mirror cells make no difference.
        const mixed = o.map((v, i) => (p.cells[i] === 'mirror' ? v : noise[i]!));
        expect(isSolved(p, mixed)).toBe(isSolved(p, o));
        expect(sanitizeOrientation(p, mixed)).toEqual(sanitizeOrientation(p, o));
      }),
      { numRuns: 300 },
    );
  });

  it('mirrors reflect the way they look', () => {
    // '/' turns a beam heading right (east) upward (north); '\' turns it downward.
    expect(reflect(0, [0, 1])).toEqual([-1, 0]);
    expect(reflect(1, [0, 1])).toEqual([1, 0]);
    expect(reflect(0, [-1, 0])).toEqual([0, 1]);
    expect(reflect(1, [-1, 0])).toEqual([0, -1]);
  });

  it('the same seed always gives the same puzzle', () => {
    expect(generatePuzzle(42)).toEqual(generatePuzzle(42));
    expect(generatePuzzle(42)).not.toEqual(generatePuzzle(43));
  });
});
