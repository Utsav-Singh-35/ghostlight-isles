/**
 * Lantern Lines: rotate mirrors on a small grid to carry the lighthouse's beam through every
 * spirit totem. Pure and deterministic, so the server can check a solution itself.
 */
import { PUZZLE } from './balance';
import { createRng, type Rng } from './rng';

export type CellKind = 'empty' | 'mirror' | 'totem' | 'rock';
/** 0 is '/', 1 is '\'. */
export type Orientation = 0 | 1;
/** A direction as [row step, column step]. Rows grow downward. */
export type Dir = readonly [number, number];

export interface Puzzle {
  readonly size: number;
  /** The beam enters the grid's left edge on this row, heading right. */
  readonly sourceRow: number;
  readonly cells: readonly CellKind[];
  /** Mirror layout the player starts with (never solved). */
  readonly start: readonly Orientation[];
  /** A layout that solves the puzzle. */
  readonly solution: readonly Orientation[];
}

export interface TraceStep {
  readonly row: number;
  readonly col: number;
  readonly inDir: Dir;
  readonly outDir: Dir;
}

export interface Trace {
  readonly steps: readonly TraceStep[];
  /** Cell indices of the totems the beam passed through, ascending. */
  readonly lit: readonly number[];
  /** True when the beam ended on a rock. */
  readonly blocked: boolean;
  /** True when the beam left the grid. */
  readonly exited: boolean;
}

const EAST: Dir = [0, 1];

/** Where a beam goes after a mirror. '/' maps (dr, dc) to (−dc, −dr); '\' maps it to (dc, dr). */
export function reflect(orientation: Orientation, [dr, dc]: Dir): Dir {
  return orientation === 0 ? [-dc + 0, -dr + 0] : [dc + 0, dr + 0];
}

const same = (a: Dir, b: Dir) => a[0] === b[0] && a[1] === b[1];

function mirrorFor(inDir: Dir, outDir: Dir): Orientation | null {
  if (same(reflect(0, inDir), outDir)) return 0;
  if (same(reflect(1, inDir), outDir)) return 1;
  return null;
}

/** Follows the beam from the lighthouse through a mirror layout. */
export function trace(puzzle: Puzzle, orientation: readonly number[]): Trace {
  const n = puzzle.size;
  const steps: TraceStep[] = [];
  const lit = new Set<number>();
  let r = puzzle.sourceRow;
  let c = 0;
  let dir: Dir = EAST;
  let blocked = false;
  let exited = false;
  // Each cell can be entered from at most four directions before the beam must repeat itself.
  for (let i = 0; i < n * n * 4; i++) {
    if (r < 0 || r >= n || c < 0 || c >= n) {
      exited = true;
      break;
    }
    const index = r * n + c;
    const kind = puzzle.cells[index];
    if (kind === 'rock') {
      blocked = true;
      break;
    }
    const inDir = dir;
    if (kind === 'mirror') dir = reflect(orientation[index] === 1 ? 1 : 0, dir);
    if (kind === 'totem') lit.add(index);
    steps.push({ row: r, col: c, inDir, outDir: dir });
    r += dir[0];
    c += dir[1];
  }
  return { steps, lit: [...lit].sort((a, b) => a - b), blocked, exited };
}

/** Cell indices of the puzzle's totems. */
export function totemsOf(puzzle: Puzzle): number[] {
  return puzzle.cells.flatMap((kind, i) => (kind === 'totem' ? [i] : []));
}

/** True when the beam passes through every totem. */
export function isSolved(puzzle: Puzzle, orientation: readonly number[]): boolean {
  const lit = new Set(trace(puzzle, orientation).lit);
  return totemsOf(puzzle).every((t) => lit.has(t));
}

/** Turns an untrusted layout into one value per cell: mirrors keep 0 or 1, every other cell is 0. */
export function sanitizeOrientation(puzzle: Puzzle, raw: unknown): Orientation[] {
  const list = Array.isArray(raw) ? raw : [];
  return puzzle.cells.map((kind, i) => (kind === 'mirror' && list[i] === 1 ? 1 : 0));
}

function attempt(rng: Rng): Puzzle | null {
  const n = PUZZLE.size;
  const sourceRow = rng.int(0, n - 1);
  const cells: CellKind[] = new Array<CellKind>(n * n).fill('empty');
  const solution: Orientation[] = new Array<Orientation>(n * n).fill(0);
  const visited = new Set<number>();
  const path: number[] = [];
  const inside = (r: number, c: number) => r >= 0 && r < n && c >= 0 && c < n;
  let r = sourceRow;
  let c = 0;
  let dir: Dir = EAST;
  let turns = 0;

  for (let step = 0; step < n * n; step++) {
    const index = r * n + c;
    visited.add(index);
    path.push(index);
    const left: Dir = [-dir[1] + 0, dir[0] + 0];
    const right: Dir = [dir[1] + 0, -dir[0] + 0];
    const free = (d: Dir) => inside(r + d[0], c + d[1]) && !visited.has((r + d[0]) * n + (c + d[1]));
    const leaves = (d: Dir) => !inside(r + d[0], c + d[1]);
    const turnsFree = [left, right].filter(free);
    let next: Dir;
    if (turnsFree.length > 0 && (rng.next() < 0.5 || !free(dir)) && !(leaves(dir) && path.length >= PUZZLE.minPath && turns >= PUZZLE.minTurns && rng.next() < 0.7)) {
      next = rng.pick(turnsFree);
    } else if (free(dir) || leaves(dir)) {
      next = dir;
    } else {
      const out = [left, right].find(leaves);
      if (!out) return null;
      next = out;
    }
    if (!same(next, dir)) {
      cells[index] = 'mirror';
      solution[index] = mirrorFor(dir, next)!;
      turns++;
    }
    dir = next;
    r += dir[0];
    c += dir[1];
    if (!inside(r, c)) break;
  }
  if (inside(r, c) || path.length < PUZZLE.minPath || turns < PUZZLE.minTurns) return null;

  // Totems sit on straight stretches of the beam's path.
  const straight = path.slice(1).filter((i) => cells[i] === 'empty');
  if (straight.length < PUZZLE.totems) return null;
  for (const i of rng.shuffle(straight).slice(0, PUZZLE.totems)) cells[i] = 'totem';

  // Decoy mirrors and rocks off the path.
  const offPath = rng.shuffle(Array.from({ length: n * n }, (_, i) => i).filter((i) => !visited.has(i)));
  for (const i of offPath.slice(0, PUZZLE.decoys)) {
    cells[i] = 'mirror';
    solution[i] = rng.next() < 0.5 ? 0 : 1;
  }
  for (const i of offPath.slice(PUZZLE.decoys, PUZZLE.decoys + 2)) cells[i] = 'rock';

  const puzzle: Puzzle = { size: n, sourceRow, cells, start: solution, solution };
  if (!isSolved(puzzle, solution)) return null;

  // Scramble: flip mirrors until the starting layout no longer works.
  const start = solution.slice();
  const pathMirrors = path.filter((i) => cells[i] === 'mirror');
  for (const i of pathMirrors) if (rng.next() < 0.6) start[i] = start[i] === 1 ? 0 : 1;
  for (const i of offPath.slice(0, PUZZLE.decoys)) start[i] = rng.next() < 0.5 ? 0 : 1;
  for (const i of rng.shuffle(pathMirrors)) {
    if (!isSolved(puzzle, start)) break;
    start[i] = start[i] === 1 ? 0 : 1;
  }
  if (isSolved(puzzle, start)) return null;
  return { ...puzzle, start };
}

/** Builds the Lantern Lines puzzle for a seed. The same seed always gives the same puzzle. */
export function generatePuzzle(seed: number): Puzzle {
  const rng = createRng((seed ^ 0x1a7e) >>> 0);
  for (let i = 0; i < PUZZLE.attempts; i++) {
    const puzzle = attempt(rng);
    if (puzzle) return puzzle;
  }
  // Practically unreachable; keep trying fixed seeds so every seed still gets a valid puzzle.
  for (let fallback = 1; ; fallback++) {
    const puzzle = attempt(createRng(fallback));
    if (puzzle) return puzzle;
  }
}
