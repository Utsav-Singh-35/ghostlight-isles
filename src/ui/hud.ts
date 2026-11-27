import { headingToBearing } from '../sim/math';
import type { ShipState } from '../sim/ship';
import { el, setText } from './dom';

const SAIL_NAMES = ['Furled', 'Half sail', 'Full sail'] as const;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const KNOTS_PER_MPS = 1.943844;

export function compassPoint(bearing: number): string {
  return COMPASS[Math.round(bearing / 45) % 8] as string;
}

export interface Hud {
  update(ship: ShipState, sailOrder: number): void;
  setVisible(visible: boolean): void;
}

export interface HudButton {
  /** A fixed label, or a function for one that changes (read every frame). */
  readonly label: string | (() => string);
  readonly title: string;
  readonly run: () => void;
}

/** Bearing, sail setting, speed and the controls. */
export function createHud(parent: HTMLElement, quality: 'high' | 'low', onToggleQuality: () => void, buttons: readonly HudButton[] = []): Hud {
  const root = el('div', 'hud hud-hidden');

  const brand = el('div', 'hud-brand', 'Ghostlight Isles');
  const qualityButton = el('button', 'hud-quality', quality === 'high' ? 'Graphics: High' : 'Graphics: Low');
  qualityButton.type = 'button';
  qualityButton.title = 'Switch graphics quality (reloads the page)';
  qualityButton.addEventListener('click', onToggleQuality);
  const right = el('div', 'hud-top-right');
  const live: { button: HTMLElement; label: () => string }[] = [];
  for (const b of buttons) {
    const button = el('button', 'hud-base', typeof b.label === 'string' ? b.label : b.label());
    button.type = 'button';
    button.title = b.title;
    button.addEventListener('click', b.run);
    right.append(button);
    if (typeof b.label === 'function') live.push({ button, label: b.label });
  }
  right.append(qualityButton);
  const top = el('div', 'hud-top');
  top.append(brand, right);

  const panel = el('div', 'hud-panel');
  const bearing = el('div', 'hud-bearing');
  const bearingValue = el('span', 'hud-big');
  const bearingLabel = el('span', 'hud-small', 'Heading');
  bearing.append(bearingValue, bearingLabel);

  const sails = el('div', 'hud-sails');
  const pips = el('div', 'hud-pips');
  const pipEls = [el('span', 'pip'), el('span', 'pip')];
  pips.append(...pipEls);
  const sailName = el('span', 'hud-small');
  sails.append(pips, sailName);

  const speed = el('div', 'hud-speed');
  const speedValue = el('span', 'hud-big');
  const speedLabel = el('span', 'hud-small', 'knots');
  speed.append(speedValue, speedLabel);
  panel.append(bearing, sails, speed);

  const keys = el('div', 'hud-keys');
  for (const [key, action] of [
    ['W/S', 'Sails'],
    ['A/D', 'Steer'],
    ['Drag', 'Look'],
    ['Scroll', 'Zoom'],
    ['M', 'Sound'],
  ]) {
    const item = el('span', 'hud-key');
    item.append(el('kbd', undefined, key), document.createTextNode(` ${action}`));
    keys.append(item);
  }

  root.append(top, panel, keys);
  parent.append(root);

  return {
    update(ship, sailOrder) {
      const degrees = headingToBearing(ship.heading);
      setText(bearingValue, `${compassPoint(degrees)} ${Math.round(degrees) % 360}°`);
      const level = Math.max(0, Math.min(2, Math.round(sailOrder)));
      setText(sailName, SAIL_NAMES[level] as string);
      pipEls.forEach((pip, i) => pip.classList.toggle('pip-on', i < level));
      setText(speedValue, (ship.speed * KNOTS_PER_MPS).toFixed(1));
      for (const { button, label } of live) setText(button, label());
    },
    setVisible(visible) {
      root.classList.toggle('hud-hidden', !visible);
    },
  };
}
