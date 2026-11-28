import { SHIP } from '../sim/balance';
import { FLAG, type BattleInput } from '../sim/battle';
import type { ShipInput } from '../sim/ship';

const RAISE = ['KeyW', 'ArrowUp'];
const LOWER = ['KeyS', 'ArrowDown'];
const PORT = ['KeyA', 'ArrowLeft'];
const STARBOARD = ['KeyD', 'ArrowRight'];
const SAILING_KEYS = new Set([...RAISE, ...LOWER, ...PORT, ...STARBOARD]);
/** Keys the game uses, so the browser doesn't scroll or switch focus on them. */
const CAPTURED = new Set([...SAILING_KEYS, 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyB', 'KeyG', 'KeyT', 'Space', 'Tab']);

/** Keyboard state for sailing and battles, plus one-shot key handlers for menus. */
export class Keyboard {
  private readonly held = new Set<string>();
  private readonly handlers = new Map<string, Array<() => void>>();
  private firstKey: (() => void) | null = null;
  private retreat = false;
  /** The sail order: 0 Furled, 1 Half sail, 2 Full sail. */
  sailLevel = 0;
  /** True while Salt Shot is loaded instead of cannonballs. */
  salt = false;
  /** The locked target's id in battle, or 0. */
  lock = 0;
  /** While false, sailing and battle keys are ignored (menus and the title screen). */
  enabled = true;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (CAPTURED.has(event.code)) event.preventDefault();
    if (this.firstKey && SAILING_KEYS.has(event.code)) {
      const callback = this.firstKey;
      this.firstKey = null;
      callback();
    }
    if (!event.repeat) for (const handler of this.handlers.get(event.code) ?? []) handler();
    if (!this.enabled) return;
    this.held.add(event.code);
    if (event.repeat) return;
    if (RAISE.includes(event.code)) this.sailLevel = Math.min(SHIP.maxSailLevel, this.sailLevel + 1);
    if (LOWER.includes(event.code)) this.sailLevel = Math.max(0, this.sailLevel - 1);
  };
  private readonly onKeyUp = (event: KeyboardEvent) => this.held.delete(event.code);
  private readonly onBlur = () => this.held.clear();

  constructor(private readonly target: Window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  private holding(codes: readonly string[]): boolean {
    return codes.some((code) => this.held.has(code));
  }

  /** Runs `handler` every time `code` is pressed. Returns a function that removes it. */
  on(code: string, handler: () => void): () => void {
    const list = this.handlers.get(code) ?? [];
    list.push(handler);
    this.handlers.set(code, list);
    return () => this.handlers.set(code, (this.handlers.get(code) ?? []).filter((h) => h !== handler));
  }

  /** Called once, on the first sailing key press. */
  onFirstSailingKey(callback: () => void): void {
    this.firstKey = callback;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.held.clear();
  }

  /** Input for one sailing tick. */
  shipInput(): ShipInput {
    const rudder = (this.holding(STARBOARD) ? 1 : 0) - (this.holding(PORT) ? 1 : 0);
    return { rudder, sailLevel: this.sailLevel };
  }

  /** Asks to retreat; sent with the next battle tick. */
  requestRetreat(): void {
    this.retreat = true;
  }

  /** Input for one battle tick: steering, sails, held weapons and the loaded ammo. */
  battleInput(): BattleInput {
    const { rudder, sailLevel } = this.shipInput();
    let flags = 0;
    if (this.enabled) {
      if (this.held.has('KeyQ')) flags |= FLAG.port;
      if (this.held.has('KeyE')) flags |= FLAG.starboard;
      if (this.held.has('KeyF')) flags |= FLAG.barrel;
      if (this.held.has('KeyB')) flags |= FLAG.bats;
      if (this.held.has('KeyG')) flags |= FLAG.mortar;
    }
    if (this.salt) flags |= FLAG.salt;
    if (this.retreat) flags |= FLAG.retreat;
    this.retreat = false;
    return { rudder, sailLevel, flags, target: this.lock };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
