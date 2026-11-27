import type * as THREE from 'three';
import { fortDifficulty } from '../sim/layout';
import type { ShipState } from '../sim/ship';
import type { World } from '../sim/world';
import { el, setText } from './dom';

const LABEL_RANGE = 350;
const MAX_LABELS = 5;

export interface Projector {
  project(position: THREE.Vector3, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean };
}

export interface Labels {
  update(ship: ShipState, projector: Projector, anchors: readonly THREE.Vector3[]): void;
  setVisible(visible: boolean): void;
  /** Captured islands are labelled "Yours". */
  setCaptured(ids: readonly number[]): void;
}

/** Floating names over nearby islands: name, owner in words (not only color) and distance. */
export function createLabels(parent: HTMLElement, world: World): Labels {
  const root = el('div', 'labels');
  parent.append(root);
  const pool = Array.from({ length: MAX_LABELS }, () => {
    const label = el('div', 'island-label');
    const name = el('span', 'island-name');
    const detail = el('span', 'island-detail');
    label.append(name, detail);
    label.hidden = true;
    root.append(label);
    return { label, name, detail };
  });
  const point = { x: 0, y: 0, visible: false };
  let visible = false;
  let captured = new Set<number>();

  return {
    update(ship, projector, anchors) {
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
        slot.label.classList.toggle('island-home', ours);
        slot.label.classList.toggle('island-haunted', !ours);
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
