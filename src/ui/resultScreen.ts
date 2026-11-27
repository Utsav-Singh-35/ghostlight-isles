import { el } from './dom';

export interface ResultAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly run: () => void;
}

export interface ResultInfo {
  readonly title: string;
  readonly tone: 'win' | 'loss' | 'neutral';
  readonly subtitle?: string;
  /** 0 to 3, or leave out for no stars. */
  readonly stars?: number;
  readonly lines: readonly string[];
  readonly actions: readonly ResultAction[];
}

/** A centred card for outcomes: battles won or lost, puzzles, raids. */
export class ResultScreen {
  private readonly root: HTMLElement;

  constructor(private readonly parent: HTMLElement) {
    this.root = el('div', 'result');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(info: ResultInfo): void {
    const card = el('div', `result-card result-${info.tone}`);
    card.append(el('h2', 'result-title', info.title));
    if (info.subtitle) card.append(el('p', 'result-subtitle', info.subtitle));
    if (info.stars !== undefined) {
      const stars = el('div', 'result-stars');
      stars.setAttribute('aria-label', `${info.stars} of 3 stars`);
      for (let i = 0; i < 3; i++) stars.append(el('span', i < info.stars ? 'star star-on' : 'star', i < info.stars ? '★' : '☆'));
      card.append(stars);
    }
    const list = el('ul', 'result-lines');
    for (const line of info.lines) list.append(el('li', undefined, line));
    card.append(list);
    const buttons = el('div', 'result-actions');
    let first: HTMLButtonElement | null = null;
    for (const action of info.actions) {
      const button = el('button', action.primary ? 'intro-start' : 'ghost-button', action.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        this.hide();
        action.run();
      });
      buttons.append(button);
      if (action.primary || !first) first = button;
    }
    card.append(buttons);
    this.root.replaceChildren(card);
    this.root.hidden = false;
    first?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  dispose(): void {
    this.root.remove();
    void this.parent;
  }
}
