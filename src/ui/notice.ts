import { el, setText } from './dom';

export interface Notice {
  /** Shows a message, or hides the notice when `message` is null. */
  show(message: string | null, action?: { label: string; run: () => void }): void;
}

/** A small message under the top edge, with an optional button. */
export function createNotice(parent: HTMLElement, className = ''): Notice {
  const root = el('div', `notice ${className}`.trim());
  root.setAttribute('role', 'status');
  root.hidden = true;
  const text = el('span', 'notice-text');
  const button = el('button', 'notice-action');
  button.type = 'button';
  button.hidden = true;
  root.append(text, button);
  parent.append(root);
  let current: (() => void) | null = null;
  button.addEventListener('click', () => current?.());

  return {
    show(message, action) {
      if (message === null) {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      setText(text, message);
      current = action?.run ?? null;
      button.hidden = !action;
      if (action) setText(button, action.label);
    },
  };
}

/** Replaces the page with a plain explanation, for when the game can't run at all. */
export function showFatal(parent: HTMLElement, title: string, body: string, reload = false): void {
  parent.replaceChildren();
  const box = el('div', 'fatal');
  box.append(el('h1', undefined, title), el('p', undefined, body));
  if (reload) {
    const button = el('button', 'intro-start', 'Reload');
    button.type = 'button';
    button.addEventListener('click', () => window.location.reload());
    box.append(button);
  }
  parent.append(box);
}
