import { el, setText } from './dom';

/** How long the "every order carried out" message stays, milliseconds. */
const FINISHED_MS = 8000;

/** The captain's orders: one tutorial step at a time, with a mark for each step. */
export class OrdersView {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly marks: HTMLElement[];
  private shownNumber = 0;
  private finishing = false;

  constructor(parent: HTMLElement, total: number, onHide: () => void) {
    this.root = el('aside', 'orders');
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-label', "Captain's orders");
    const head = el('div', 'orders-head');
    this.title = el('span', 'orders-title');
    const hide = el('button', 'orders-hide', 'Hide');
    hide.type = 'button';
    hide.title = "Hide the captain's orders for good";
    hide.addEventListener('click', () => {
      this.root.hidden = true;
      onHide();
    });
    head.append(this.title, hide);
    this.text = el('p', 'orders-text');
    const row = el('div', 'orders-marks');
    row.setAttribute('aria-hidden', 'true');
    this.marks = Array.from({ length: total }, () => el('span', 'orders-mark'));
    row.append(...this.marks);
    this.root.append(head, this.text, row);
    parent.append(this.root);
  }

  /** Shows order `number` (from 1). `done` has one entry per order. */
  show(number: number, total: number, text: string, done: readonly boolean[]): void {
    if (this.finishing) return;
    setText(this.title, `Captain's orders · ${number} of ${total}`);
    setText(this.text, text);
    this.marks.forEach((mark, i) => {
      mark.classList.toggle('orders-mark-done', done[i] === true);
      mark.classList.toggle('orders-mark-now', i === number - 1);
    });
    if (number !== this.shownNumber) {
      this.shownNumber = number;
      this.root.classList.remove('orders-fresh');
      void this.root.offsetWidth;
      this.root.classList.add('orders-fresh');
    }
    this.root.hidden = false;
  }

  /** Says every order is done, then hides; `onDone` runs once it has gone. */
  finish(onDone: () => void): void {
    if (this.finishing) return;
    this.finishing = true;
    setText(this.title, "Captain's orders · done");
    setText(this.text, 'Every order carried out. The sea is yours, captain.');
    for (const mark of this.marks) {
      mark.classList.add('orders-mark-done');
      mark.classList.remove('orders-mark-now');
    }
    this.root.hidden = false;
    window.setTimeout(() => {
      this.root.hidden = true;
      onDone();
    }, FINISHED_MS);
  }

  hide(): void {
    if (!this.finishing) this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
