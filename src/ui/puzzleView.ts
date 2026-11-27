import { isSolved, totemsOf, trace, type Orientation, type Puzzle } from '../sim/puzzle';
import { el, setText } from './dom';

const SVG = 'http://www.w3.org/2000/svg';
const CELL = 64;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export interface PuzzleOptions {
  readonly title: string;
  readonly subtitle: string;
  /** Seconds to solve it, or leave out for no limit. */
  readonly timeLimitSeconds?: number;
  readonly giveUpLabel?: string;
  readonly onSolved: (orientation: Orientation[]) => void;
  readonly onGiveUp: (orientation: Orientation[]) => void;
  readonly onTimeout?: (orientation: Orientation[]) => void;
}

/** The Lantern Lines board: click mirrors to turn them and carry the lighthouse beam through every totem. */
export class PuzzleView {
  private readonly root: HTMLElement;
  private timer = 0;
  private current: { puzzle: Puzzle; orientation: Orientation[] } | null = null;

  /** Read-only view of the open puzzle, for the smoke test. The solution follows from the seed anyway. */
  debugState(): { cell: number; current: Orientation; solution: Orientation }[] | null {
    const c = this.current;
    if (!c) return null;
    return c.puzzle.cells.flatMap((kind, i) => (kind === 'mirror' ? [{ cell: i, current: c.orientation[i]!, solution: c.puzzle.solution[i]! }] : []));
  }

  constructor(parent: HTMLElement) {
    this.root = el('div', 'puzzle');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  open(puzzle: Puzzle, options: PuzzleOptions): void {
    this.close();
    const n = puzzle.size;
    const orientation: Orientation[] = puzzle.start.slice();
    const totems = totemsOf(puzzle);
    let done = false;
    this.current = { puzzle, orientation };

    const card = el('div', 'puzzle-card');
    card.append(el('h2', 'puzzle-title', options.title), el('p', 'puzzle-subtitle', options.subtitle));
    const status = el('p', 'puzzle-status');
    const clock = el('p', 'puzzle-clock');
    clock.hidden = options.timeLimitSeconds === undefined;

    const size = n * CELL;
    const board = svg('svg', { viewBox: `${-CELL} -8 ${size + CELL + 8} ${size + 16}`, class: 'puzzle-board', role: 'group', 'aria-label': 'Lantern Lines board' });
    const defs = svg('defs');
    const glow = svg('filter', { id: 'beam-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    glow.append(svg('feGaussianBlur', { stdDeviation: 3, result: 'blur' }));
    const merge = svg('feMerge');
    merge.append(svg('feMergeNode', { in: 'blur' }), svg('feMergeNode', { in: 'SourceGraphic' }));
    glow.append(merge);
    defs.append(glow);
    board.append(defs);

    // The lighthouse on the left edge of the source row.
    const ly = puzzle.sourceRow * CELL + CELL / 2;
    const lighthouse = svg('g', { class: 'pz-lighthouse' });
    lighthouse.append(
      svg('path', { d: `M ${-CELL * 0.72} ${ly + 22} L ${-CELL * 0.6} ${ly - 14} L ${-CELL * 0.4} ${ly - 14} L ${-CELL * 0.28} ${ly + 22} Z`, class: 'pz-tower' }),
      svg('rect', { x: -CELL * 0.62, y: ly - 24, width: CELL * 0.24, height: 12, rx: 2, class: 'pz-lamp' }),
    );
    board.append(lighthouse);

    const cellsLayer = svg('g');
    const beam = svg('polyline', { class: 'pz-beam', filter: 'url(#beam-glow)', fill: 'none' });
    const totemNodes = new Map<number, SVGGElement>();
    const mirrorNodes = new Map<number, SVGLineElement>();

    puzzle.cells.forEach((kind, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      const x = c * CELL;
      const y = r * CELL;
      const g = svg('g', { transform: `translate(${x} ${y})` });
      g.append(svg('rect', { x: 2, y: 2, width: CELL - 4, height: CELL - 4, rx: 8, class: `pz-cell pz-tile-${kind}` }));
      if (kind === 'rock') {
        g.append(svg('path', { d: 'M 14 46 L 20 24 L 34 16 L 48 24 L 52 44 Z', class: 'pz-rock-shape' }));
      } else if (kind === 'totem') {
        const t = svg('g', { class: 'pz-totem' });
        t.append(
          svg('rect', { x: 24, y: 18, width: 16, height: 30, rx: 4 }),
          svg('circle', { cx: 32, cy: 16, r: 8 }),
          svg('circle', { cx: 29, cy: 15, r: 1.6, class: 'pz-eye' }),
          svg('circle', { cx: 35, cy: 15, r: 1.6, class: 'pz-eye' }),
        );
        g.append(t);
        totemNodes.set(i, t);
      } else if (kind === 'mirror') {
        const line = svg('line', { x1: 14, y1: 50, x2: 50, y2: 14, class: 'pz-mirror' });
        g.append(line);
        g.setAttribute('class', 'pz-clickable');
        g.setAttribute('data-cell', String(i));
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `Mirror, row ${r + 1}, column ${c + 1}. Press to turn it.`);
        const turn = () => {
          if (done) return;
          orientation[i] = orientation[i] === 1 ? 0 : 1;
          redraw();
        };
        g.addEventListener('click', turn);
        g.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            turn();
          }
        });
        mirrorNodes.set(i, line);
      }
      cellsLayer.append(g);
    });
    board.append(cellsLayer, beam);

    const giveUp = el('button', 'ghost-button', options.giveUpLabel ?? 'Give up');
    giveUp.type = 'button';
    giveUp.addEventListener('click', () => {
      if (done) return;
      done = true;
      this.close();
      options.onGiveUp(orientation.slice());
    });

    const redraw = () => {
      for (const [i, line] of mirrorNodes) {
        const slash = orientation[i] === 0;
        line.setAttribute('x1', '14');
        line.setAttribute('x2', '50');
        line.setAttribute('y1', slash ? '50' : '14');
        line.setAttribute('y2', slash ? '14' : '50');
      }
      const t = trace(puzzle, orientation);
      const points: string[] = [`${-CELL * 0.4},${ly - 18}`, `0,${ly}`];
      for (const step of t.steps) points.push(`${step.col * CELL + CELL / 2},${step.row * CELL + CELL / 2}`);
      const last = t.steps[t.steps.length - 1];
      if (last && t.exited) points.push(`${last.col * CELL + CELL / 2 + (last.outDir[1] * CELL) / 2},${last.row * CELL + CELL / 2 + (last.outDir[0] * CELL) / 2}`);
      beam.setAttribute('points', points.join(' '));
      const lit = new Set(t.lit);
      for (const [i, node] of totemNodes) node.classList.toggle('pz-lit', lit.has(i));
      setText(status, `${lit.size} of ${totems.length} totems lit${t.blocked ? ' · the beam hits a rock' : ''}`);
      if (!done && isSolved(puzzle, orientation)) {
        done = true;
        card.classList.add('puzzle-solved');
        setText(status, 'Every totem is lit!');
        window.setTimeout(() => {
          this.close();
          options.onSolved(orientation.slice());
        }, 1100);
      }
    };

    const actions = el('div', 'result-actions');
    actions.append(giveUp);
    card.append(clock, board, status, el('p', 'puzzle-hint', 'Click a mirror (or Tab to it and press Enter) to turn it.'), actions);
    this.root.replaceChildren(card);
    this.root.hidden = false;
    redraw();

    if (options.timeLimitSeconds !== undefined) {
      const ends = performance.now() + options.timeLimitSeconds * 1000;
      const tick = () => {
        const left = Math.max(0, Math.ceil((ends - performance.now()) / 1000));
        setText(clock, `${left} s before the deep keeps you`);
        clock.classList.toggle('puzzle-clock-low', left <= 15);
        if (done) return;
        if (left <= 0) {
          done = true;
          this.close();
          (options.onTimeout ?? options.onGiveUp)(orientation.slice());
          return;
        }
        this.timer = window.setTimeout(tick, 250);
      };
      tick();
    }
    (mirrorNodes.size ? (cellsLayer.querySelector('.pz-clickable') as SVGGElement | null) : null)?.focus({ preventScroll: true });
  }

  close(): void {
    window.clearTimeout(this.timer);
    this.current = null;
    this.root.hidden = true;
    this.root.replaceChildren();
  }
}
