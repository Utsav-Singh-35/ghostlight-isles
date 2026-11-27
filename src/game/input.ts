import { SHIP } from '../sim/balance';
import type { ShipInput } from '../sim/ship';

const RAISE = new Set(['KeyW', 'ArrowUp']);
const LOWER = new Set(['KeyS', 'ArrowDown']);
const PORT = new Set(['KeyA', 'ArrowLeft']);
const STARBOARD = new Set(['KeyD', 'ArrowRight']);
const GAME_KEYS = new Set([...RAISE, ...LOWER, ...PORT, ...STARBOARD]);

export interface KeyboardInput {
  /** The input for the next simulation tick. */
  snapshot(): ShipInput;
  /** The sail order shown in the HUD. */
  readonly sailLevel: number;
  /** Called once for the first sail or steering key press. */
  onFirstGameKey(callback: () => void): void;
  /** While disabled (for example during the intro), key presses are ignored. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/** Sail order changes one step per key press; the rudder follows the keys held down. */
export function createKeyboardInput(target: Window): KeyboardInput {
  const held = new Set<string>();
  let sailLevel = 0;
  let enabled = true;
  let firstKey: (() => void) | null = null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (firstKey) {
      const callback = firstKey;
      firstKey = null;
      callback();
    }
    if (!enabled) return;
    held.add(event.code);
    if (event.repeat) return;
    if (RAISE.has(event.code)) sailLevel = Math.min(SHIP.maxSailLevel, sailLevel + 1);
    if (LOWER.has(event.code)) sailLevel = Math.max(0, sailLevel - 1);
  };
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onBlur = () => held.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  const holding = (keys: Set<string>) => [...keys].some((key) => held.has(key));

  return {
    snapshot() {
      const rudder = (holding(STARBOARD) ? 1 : 0) - (holding(PORT) ? 1 : 0);
      return { rudder, sailLevel };
    },
    get sailLevel() {
      return sailLevel;
    },
    onFirstGameKey(callback) {
      firstKey = callback;
    },
    setEnabled(value) {
      enabled = value;
      if (!value) held.clear();
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
