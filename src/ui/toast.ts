import { el } from './dom';

/** Short messages that fade away on their own, like "+24 gold tribute". */
export class Toasts {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'toasts');
    this.root.setAttribute('aria-live', 'polite');
    parent.append(this.root);
  }

  show(message: string, tone: 'good' | 'bad' | 'neutral' = 'neutral', seconds = 4): void {
    const toast = el('div', `toast toast-${tone}`, message);
    this.root.append(toast);
    while (this.root.children.length > 4) this.root.firstElementChild?.remove();
    window.setTimeout(() => toast.classList.add('toast-out'), seconds * 1000);
    window.setTimeout(() => toast.remove(), seconds * 1000 + 600);
  }
}
