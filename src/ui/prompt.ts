import { el, setText } from './dom';

export interface PromptAction {
  /** Key code that triggers it, like 'Digit1'. */
  readonly code: string;
  /** What the key cap shows, like '1'. */
  readonly key: string;
  readonly label: string;
  readonly run: () => void;
}

/** What you can do here: a small panel of actions with their keys, shown near islands. */
export class ContextPrompt {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly list: HTMLElement;
  private actions: readonly PromptAction[] = [];
  private signature = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'context-prompt');
    this.root.hidden = true;
    this.title = el('div', 'cp-title');
    this.detail = el('div', 'cp-detail');
    this.list = el('div', 'cp-actions');
    this.root.append(this.title, this.detail, this.list);
    parent.append(this.root);
  }

  /** Shows the prompt with one detail line or several (a fort report); rebuilds only when something changed. */
  show(title: string, detail: string | readonly string[], actions: readonly PromptAction[]): void {
    const lines = typeof detail === 'string' ? (detail ? [detail] : []) : detail;
    const signature = `${title}|${lines.join('\n')}|${actions.map((a) => a.code + a.label).join(',')}`;
    this.actions = actions;
    this.root.hidden = false;
    if (signature === this.signature) return;
    this.signature = signature;
    setText(this.title, title);
    this.detail.replaceChildren(...lines.map((line) => el('div', 'cp-line', line)));
    this.detail.hidden = lines.length === 0;
    this.list.replaceChildren(
      ...actions.map((action) => {
        const button = el('button', 'cp-action');
        button.type = 'button';
        button.append(el('kbd', undefined, action.key), document.createTextNode(` ${action.label}`));
        button.addEventListener('click', () => action.run());
        return button;
      }),
    );
  }

  hide(): void {
    this.root.hidden = true;
    this.actions = [];
    this.signature = '';
  }

  /** Runs the action bound to a key, if the prompt is showing one. */
  press(code: string): boolean {
    if (this.root.hidden) return false;
    const action = this.actions.find((a) => a.code === code);
    if (!action) return false;
    action.run();
    return true;
  }
}
