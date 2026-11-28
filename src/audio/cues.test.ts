import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { BattleEvent, ShotType } from '../sim/battle';
import type { DefenseType } from '../sim/layout';
import { CRITICAL_CUES, CUE_LIMIT, MAX_GAIN, MAX_PAN, MIN_GAIN, cueOf, loudness, panOf, planCues, type Listener } from './cues';

const coord = fc.double({ noNaN: true, noDefaultInfinity: true, min: -400, max: 400 });
const shot = fc.constantFrom<ShotType>('ball', 'salt', 'tower', 'lantern', 'stone', 'bolt', 'barrel', 'fire', 'mine', 'pumpkin');
const structure = fc.constantFrom<DefenseType | 'keep'>('cannonTower', 'spiritLantern', 'boneCatapult', 'mine', 'keep');
const id = fc.nat({ max: 60 });

const event: fc.Arbitrary<BattleEvent> = fc.oneof(
  fc.record({ type: fc.constant('fire' as const), kind: shot, side: fc.constantFrom('player' as const, 'island' as const, 'ghost' as const), x: coord, z: coord, sourceId: id, targetId: fc.option(id, { nil: null }) }),
  fc.record({ type: fc.constant('land' as const), kind: shot, x: coord, z: coord, hitId: fc.option(id, { nil: null }), splash: fc.constantFrom(0, 7, 9) }),
  fc.record({ type: fc.constant('destroyed' as const), id, structure, x: coord, z: coord }),
  fc.record({ type: fc.constant('sunk' as const), id, kind: fc.constantFrom('player' as const, 'ghost' as const), x: coord, z: coord }),
  fc.record({ type: fc.constant('mine' as const), id, x: coord, z: coord }),
  fc.record({ type: fc.constant('powder' as const), id, x: coord, z: coord }),
  fc.constant({ type: 'bats' as const }),
);

const listener: fc.Arbitrary<Listener> = fc
  .record({ x: coord, z: coord, angle: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 2 * Math.PI }) })
  .map(({ x, z, angle }) => ({ x, z, rightX: Math.cos(angle), rightZ: Math.sin(angle) }));

const radius = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 120 });

describe('battle sound cues', () => {
  // Feature: sound, Property 1. Validates: Requirements 1.1, 1.4
  it('Property 1: cues are well formed', () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 80 }), listener, radius, (events, ears, r) => {
        const cues = planCues(events, ears, r);
        const names = new Set(cues.map((c) => c.name));
        const ok = cues.every((c) => Number.isFinite(c.gain) && c.gain >= MIN_GAIN && c.gain <= MAX_GAIN && Math.abs(c.pan) <= MAX_PAN);
        expect(ok).toBe(true);
        expect(names.size).toBe(cues.length);
        expect(cues.length).toBeLessThanOrEqual(CUE_LIMIT);
        // Every event that makes a sound is represented unless the frame is full.
        const wanted = new Set(events.map((e) => cueOf(e, r)).filter((n) => n !== null));
        expect(cues.length).toBe(Math.min(CUE_LIMIT, wanted.size));
      }),
      { numRuns: 200 },
    );
  });

  // Feature: sound, Property 2. Validates: Requirement 1.2
  it('Property 2: nearer is never quieter', () => {
    const distance = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 5000 });
    fc.assert(
      fc.property(distance, distance, listener, fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 2 * Math.PI }), (a, b, ears, bearing) => {
        const [near, far] = a <= b ? [a, b] : [b, a];
        expect(loudness(near)).toBeGreaterThanOrEqual(loudness(far));
        expect(loudness(far)).toBeGreaterThanOrEqual(MIN_GAIN);
        // The same holds for a real event placed at that distance.
        const at = (d: number): BattleEvent => ({ type: 'mine', id: 1, x: ears.x + Math.cos(bearing) * d, z: ears.z + Math.sin(bearing) * d });
        const gainAt = (d: number) => planCues([at(d)], ears, 0)[0]!.gain;
        expect(gainAt(near)).toBeGreaterThanOrEqual(gainAt(far) - 1e-12);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: sound, Property 3. Validates: Requirement 1.3
  it('Property 3: sounds come from their side', () => {
    const offset = fc.double({ noNaN: true, noDefaultInfinity: true, min: -300, max: 300 });
    fc.assert(
      fc.property(listener, offset, offset, (ears, dx, dz) => {
        const side = dx * ears.rightX + dz * ears.rightZ;
        const pan = panOf(dx, dz, ears);
        if (Math.abs(side) > 1e-9) expect(Math.sign(pan)).toBe(Math.sign(side));
        // Reflect the offset across the listener's forward line.
        const mx = dx - 2 * side * ears.rightX;
        const mz = dz - 2 * side * ears.rightZ;
        expect(panOf(mx, mz, ears)).toBeCloseTo(-pan, 9);
        const heard = planCues([{ type: 'sunk', id: 1, kind: 'ghost', x: ears.x + dx, z: ears.z + dz }], ears, 0)[0]!;
        expect(heard.pan).toBeCloseTo(panOf(ears.x + dx - ears.x, ears.z + dz - ears.z, ears), 9);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: sound, Property 4. Validates: Requirement 1.5
  it('Property 4: news is never dropped', () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 120 }), listener, radius, (events, ears, r) => {
        const planned = new Set(planCues(events, ears, r).map((c) => c.name));
        for (const e of events) {
          const name = cueOf(e, r);
          if (name !== null && CRITICAL_CUES.has(name)) expect(planned.has(name)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a broadside beside the ship is full loudness and centred', () => {
    const ears: Listener = { x: 10, z: -5, rightX: 1, rightZ: 0 };
    const [cue] = planCues([{ type: 'fire', kind: 'ball', side: 'player', x: 10, z: -5, sourceId: 0, targetId: null }], ears, 50);
    expect(cue).toEqual({ name: 'cannon', gain: 1, pan: 0 });
  });

  it('three ghosts sinking in one frame make one louder wail', () => {
    const ears: Listener = { x: 0, z: 0, rightX: 1, rightZ: 0 };
    const sunk = (n: number): BattleEvent => ({ type: 'sunk', id: n, kind: 'ghost', x: 0, z: 0 });
    const cues = planCues([sunk(1), sunk(2), sunk(3)], ears, 0);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.name).toBe('ghostWail');
    expect(cues[0]!.gain).toBeCloseTo(1.2, 9);
  });

  it('shots that miss splash at sea and thud ashore', () => {
    const miss = (x: number): BattleEvent => ({ type: 'land', kind: 'ball', x, z: 0, hitId: null, splash: 0 });
    expect(cueOf(miss(80), 50)).toBe('splash');
    expect(cueOf(miss(20), 50)).toBe('thud');
  });
});
