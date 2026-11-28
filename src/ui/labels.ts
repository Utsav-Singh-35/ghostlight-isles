import type * as THREE from 'three';
import { fortDifficulty } from '../sim/layout';
import type { ShipState } from '../sim/ship';
import type { World } from '../sim/world';
import { el, setText } from './dom';

/** Labels show for islands whose shore is within this far of the ship, metres. */
export const LABEL_RANGE = 350;
const MAX_LABELS = 5;

export interface Projector {
  project(position: THREE.Vector3, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean };
}

export interface Labels {
  /** `selected` is the island whose fort report is open, or null. */
  update(ship: ShipState, projector: Projector, anchors: readonly THREE.Vector3[], selected?: number | null): void;
  setVisible(visible: boolean): void;
  /** Captured islands are labelled "Yours". */
  setCaptured(ids: readonly number[]): void;
}

/**
 * Floating names over nearby islands: name, owner and fort level in words (not only color) and
 * distance. Haunted islands' labels are buttons: click one to read its fort report.
 */
export function createLabels(parent: HTMLElement, world: World, onSelect: (islandId: number) => void = () => {}): Labels {
  const root = el('div', 'labels');
  parent.append(root);
  const pool = Array.from({ length: MAX_LABELS }, () => {
    const label = el('button', 'island-label');
    label.type = 'button';
    const name = el('span', 'island-name');
    const detail = el('span', 'island-detail');
    label.append(name, detail);
    label.hidden = true;
    label.addEventListener('click', () => {
      const id = Number(label.dataset.island);
      if (label.classList.contains('island-haunted') && id > 0) onSelect(id);
    });
    root.append(label);
    return { label, name, detail };
  });
  const point = { x: 0, y: 0, visible: false };
  let visible = false;
  let captured = new Set<number>();

  return {
    update(ship, projector, anchors, selected = null) {
      const nearby = world.islands
        .map((island) => ({ island, distance: Math.hypot(island.x - ship.x, island.z - ship.z) - island.radius }))
        .filter((entry) => entry.distance < LABEL_RANGE)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_LABELS);

      pool.forEach((slot, i) => {
        const entry = nearby[i];
        const anchor = entry ? anchors[entry.island.id] : undefined;
        if (!visible || !entry || !anchor || !projector.project(anchor, point).visible) {
          slot.label.hidden = true;
          return;
        }
        slot.label.hidden = false;
        const home = entry.island.kind === 'home';
        const ours = home || captured.has(entry.island.id);
        slot.label.dataset.island = String(entry.island.id);
        slot.label.classList.toggle('island-home', ours);
        slot.label.classList.toggle('island-haunted', !ours);
        slot.label.classList.toggle('island-selected', entry.island.id === selected);
        slot.label.tabIndex = ours ? -1 : 0;
        slot.label.title = ours ? '' : `Read the fort report for ${entry.island.name}`;
        setText(slot.name, entry.island.name);
        const metres = Math.max(0, Math.round(entry.distance / 10) * 10);
        setText(slot.detail, `${home ? 'Your home' : ours ? 'Yours' : `Haunted · fort ${fortDifficulty(entry.island)}`} · ${metres} m`);
        slot.label.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -100%)`;
      });
    },
    setVisible(value) {
      visible = value;
      // Hide at once: battles don't call update(), so a label left showing would hang over the fight.
      if (!value) for (const slot of pool) slot.label.hidden = true;
    },
    setCaptured(ids) {
      captured = new Set(ids);
    },
  };
}
