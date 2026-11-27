import { el } from './dom';

export interface PanelTab {
  readonly id: string;
  readonly label: string;
}

/** A panel on the right for lists: raid targets, the Captain's Log. */
export class SidePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly body: HTMLElement;

  constructor(parent: HTMLElement, label: string, onClose: () => void) {
    this.root = el('aside', 'side-panel');
    this.root.hidden = true;
    this.root.setAttribute('aria-label', label);
    this.title = el('h2', 'bp-title');
    this.tabs = el('div', 'bp-tabs');
    this.body = el('div', 'bp-body');
    const close = el('button', 'ghost-button bp-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', onClose);
    this.root.append(this.title, this.tabs, this.body, close);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Shows the panel with a title, optional tabs and content. */
  show(title: string, content: readonly Node[], tabs: readonly PanelTab[] = [], active = '', onTab?: (id: string) => void): void {
    this.title.textContent = title;
    this.tabs.hidden = tabs.length === 0;
    this.tabs.replaceChildren(
      ...tabs.map((t) => {
        const b = el('button', `bp-tab${t.id === active ? ' bp-tab-on' : ''}`, t.label);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t.id === active));
        b.addEventListener('click', () => onTab?.(t.id));
        return b;
      }),
    );
    this.body.replaceChildren(...content);
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }
}

/** "just now", "5 min ago", "2 h ago", "3 days ago". */
export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** "3 h 59 min", "12 min". */
export function duration(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}
