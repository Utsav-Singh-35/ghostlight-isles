import type { BattleEvent } from '../sim/battle';

/** Every sound a battle can make. */
export type CueName =
  | 'cannon'
  | 'salt'
  | 'tower'
  | 'zap'
  | 'catapult'
  | 'barrel'
  | 'hit'
  | 'spiritHit'
  | 'fireball'
  | 'splash'
  | 'thud'
  | 'explosion'
  | 'keepFalls'
  | 'shipSinks'
  | 'ghostWail'
  | 'mine'
  | 'bats';

/** Where the ears are: the player's ship, and the camera's right-hand direction on the sea plane. */
export interface Listener {
  readonly x: number;
  readonly z: number;
  /** Unit vector toward the right of the screen, on the sea plane. */
  readonly rightX: number;
  readonly rightZ: number;
}

/** One battle sound to start this frame. */
export interface Cue {
  readonly name: CueName;
  /** MIN_GAIN to MAX_GAIN. */
  readonly gain: number;
  /** −MAX_PAN (left) to +MAX_PAN (right). */
  readonly pan: number;
}

/** Sounds that carry news the player needs. They are never dropped for lack of voices. */
export const CRITICAL_CUES: ReadonlySet<CueName> = new Set<CueName>(['explosion', 'keepFalls', 'shipSinks', 'ghostWail', 'mine']);
const NOTABLE_CUES: ReadonlySet<CueName> = new Set<CueName>(['hit', 'spiritHit', 'fireball', 'bats']);

/** At most this many battle sounds start in one frame. */
export const CUE_LIMIT = 7;
/** A sound this far from the listener plays at half loudness, metres. */
export const HALF_LOUDNESS_DISTANCE = 60;
/** The quietest a battle sound gets, however far away. */
export const MIN_GAIN = 0.05;
/** Several sounds of one kind in a frame play once, louder by this share for each extra one. */
const MERGE_BOOST = 0.1;
/** The loudest a merged sound gets. */
export const MAX_GAIN = 1.4;
/** A sound this far to one side pans as far as it goes, metres. */
const PAN_DISTANCE = 40;
/** Pan stops here, so nothing plays in one ear only. */
export const MAX_PAN = 0.8;

/** Which sound an event makes, or null for none. `islandRadius` tells shots that land ashore from splashes. */
export function cueOf(event: BattleEvent, islandRadius: number): CueName | null {
  if (event.type === 'fire') {
    if (event.kind === 'ball') return 'cannon';
    if (event.kind === 'salt') return 'salt';
    if (event.kind === 'tower') return 'tower';
    if (event.kind === 'lantern' || event.kind === 'bolt') return 'zap';
    if (event.kind === 'stone') return 'catapult';
    if (event.kind === 'barrel') return 'barrel';
    return null;
  }
  if (event.type === 'land') {
    if (event.kind === 'barrel') return 'fireball';
    if (event.hitId !== null) return event.kind === 'salt' || event.kind === 'lantern' || event.kind === 'bolt' ? 'spiritHit' : 'hit';
    return Math.hypot(event.x, event.z) < islandRadius ? 'thud' : 'splash';
  }
  if (event.type === 'destroyed') return event.structure === 'keep' ? 'keepFalls' : 'explosion';
  if (event.type === 'sunk') return event.kind === 'ghost' ? 'ghostWail' : 'shipSinks';
  if (event.type === 'mine') return 'mine';
  return 'bats';
}

/** How loud a sound is at this distance, from 1 close by down to MIN_GAIN far away. */
export function loudness(distance: number): number {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : Number.POSITIVE_INFINITY;
  return Math.max(MIN_GAIN, 1 / (1 + (d / HALF_LOUDNESS_DISTANCE) ** 2));
}

/** Stereo position of a sound at offset (dx, dz) from the listener. */
export function panOf(dx: number, dz: number, listener: Listener): number {
  const side = dx * listener.rightX + dz * listener.rightZ;
  if (!Number.isFinite(side)) return 0;
  return Math.max(-1, Math.min(1, side / PAN_DISTANCE)) * MAX_PAN;
}

const rank = (name: CueName): number => (CRITICAL_CUES.has(name) ? 2 : NOTABLE_CUES.has(name) ? 1 : 0);

/** The sounds to start for one frame's battle events: one per kind, most important first, at most `limit`. */
export function planCues(events: readonly BattleEvent[], listener: Listener, islandRadius: number, limit = CUE_LIMIT): Cue[] {
  const loudest = new Map<CueName, { gain: number; pan: number; count: number }>();
  for (const event of events) {
    const name = cueOf(event, islandRadius);
    if (name === null) continue;
    const dx = event.type === 'bats' ? 0 : event.x - listener.x;
    const dz = event.type === 'bats' ? 0 : event.z - listener.z;
    const gain = loudness(Math.hypot(dx, dz));
    const seen = loudest.get(name);
    if (!seen) loudest.set(name, { gain, pan: panOf(dx, dz, listener), count: 1 });
    else if (gain > seen.gain) loudest.set(name, { gain, pan: panOf(dx, dz, listener), count: seen.count + 1 });
    else loudest.set(name, { ...seen, count: seen.count + 1 });
  }
  const cues: Cue[] = [...loudest].map(([name, s]) => ({
    name,
    gain: Math.min(MAX_GAIN, s.gain * (1 + MERGE_BOOST * Math.min(4, s.count - 1))),
    pan: s.pan,
  }));
  cues.sort((a, b) => rank(b.name) - rank(a.name) || b.gain - a.gain);
  return cues.slice(0, Math.max(0, Math.floor(limit)));
}
