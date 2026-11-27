import { el } from './dom';

export interface Intro {
  /** Hides the title screen with a fade. Safe to call more than once. */
  hide(): void;
  readonly visible: boolean;
}

/** The title screen shown while the camera circles the ship. */
export function createIntro(parent: HTMLElement, onStart: () => void): Intro {
  const root = el('div', 'intro');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'intro-title');

  const title = el('h1', 'intro-title', 'Ghostlight Isles');
  title.id = 'intro-title';
  const tagline = el('p', 'intro-tagline', 'The dead sail at night. Keep your lanterns lit.');
  const story = el(
    'p',
    'intro-story',
    'On Samhain the wall between the living and the dead grew thin, and here it never closed. You have one small ship, two crew and one lit island, Last Light. Every other island is haunted.',
  );

  const keys = el('ul', 'intro-keys');
  for (const [key, action] of [
    ['W / S', 'Raise or lower the sails'],
    ['A / D', 'Steer'],
    ['Drag', 'Look around'],
    ['Scroll', 'Zoom'],
  ]) {
    const item = el('li');
    item.append(el('kbd', undefined, key), el('span', undefined, action));
    keys.append(item);
  }

  const button = el('button', 'intro-start', 'Set sail');
  button.type = 'button';
  const hint = el('p', 'intro-hint', 'or press W');

  root.append(title, tagline, story, keys, button, hint);
  parent.append(root);

  let visible = true;
  const hide = () => {
    if (!visible) return;
    visible = false;
    root.classList.add('intro-hidden');
    window.setTimeout(() => root.remove(), 900);
  };
  button.addEventListener('click', () => {
    hide();
    onStart();
  });
  button.focus({ preventScroll: true });

  return {
    hide,
    get visible() {
      return visible;
    },
  };
}
