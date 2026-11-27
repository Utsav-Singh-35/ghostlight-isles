import type { BattleEvent } from '../sim/battle';
import { planCues, type Listener } from './cues';
import { Synth, type Effect } from './synth';

const SETTING_KEY = 'ghostlight.sound';

/** What the ambience follows, once per rendered frame. */
export interface SoundFrame {
  /** Seconds since the last frame. */
  readonly dt: number;
  /** Ship speed as a share of top speed, 0 to 1. */
  readonly speed: number;
  /** How red the night is, 0 to 1. */
  readonly blood: number;
  /** True while the ship lies in Davy Jones' Locker. */
  readonly underwater: boolean;
}

function readSetting(): boolean {
  try {
    return window.localStorage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeSetting(on: boolean): void {
  try {
    window.localStorage.setItem(SETTING_KEY, on ? 'on' : 'off');
  } catch {
    // Private windows may refuse storage; the choice then lasts for this visit.
  }
}

/**
 * The game's sound. Browsers only allow audio after the player's first click or key press,
 * so nothing is created until then. Without Web Audio the game simply stays silent.
 */
export class Sound {
  private synth: Synth | null = null;
  private on = readSetting();
  private unavailable = false;
  private heartbeatIn = 0;
  private bubbleIn = 0;
  private cues = 0;

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => this.apply());
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Turns sound on or off, remembers the choice and returns the new state. */
  toggle(): boolean {
    this.on = !this.on;
    writeSetting(this.on);
    if (this.on) this.unlock();
    else this.apply();
    return this.on;
  }

  /** Follows the ship, the Blood Moon and the Locker. Call once per rendered frame. */
  frame(f: SoundFrame): void {
    const synth = this.live();
    if (!synth) return;
    synth.setAmbience(f.speed, f.blood, f.underwater);
    if (f.blood > 0.5) {
      this.heartbeatIn -= f.dt;
      if (this.heartbeatIn <= 0) {
        synth.effect('heartbeat', f.blood * 0.8);
        this.heartbeatIn = 1.25 - 0.3 * f.blood;
      }
    } else this.heartbeatIn = 0;
    if (f.underwater) {
      this.bubbleIn -= f.dt;
      if (this.bubbleIn <= 0) {
        synth.effect('bubble');
        this.bubbleIn = 0.25 + Math.random() * 0.9;
      }
    }
  }

  /** Plays one frame's battle events as heard from the listener. */
  battle(events: readonly BattleEvent[], listener: Listener, islandRadius: number): void {
    const synth = this.live();
    if (!synth || events.length === 0) return;
    for (const cue of planCues(events, listener, islandRadius)) {
      synth.battle(cue.name, cue.gain, cue.pan);
      this.cues++;
    }
  }

  play(effect: Effect): void {
    this.live()?.effect(effect);
  }

  /** For the smoke test. */
  debug(): { enabled: boolean; state: string; cues: number } {
    return { enabled: this.on, state: this.synth?.ctx.state ?? (this.unavailable ? 'unavailable' : 'waiting'), cues: this.cues };
  }

  private live(): Synth | null {
    const synth = this.synth;
    return this.on && synth && synth.ctx.state === 'running' ? synth : null;
  }

  private unlock(): void {
    if (!this.on || this.unavailable) return;
    if (!this.synth) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) {
        this.unavailable = true;
        return;
      }
      try {
        this.synth = new Synth(new Context());
      } catch (error) {
        this.unavailable = true;
        console.warn('Sound is unavailable:', error);
        return;
      }
    }
    this.apply();
  }

  /** Runs audio only while sound is on and the tab is visible. */
  private apply(): void {
    const synth = this.synth;
    if (!synth) return;
    const audible = this.on && document.visibilityState !== 'hidden';
    synth.setVolume(audible ? 1 : 0);
    if (audible && synth.ctx.state === 'suspended') void synth.ctx.resume().catch(() => undefined);
    else if (!audible && synth.ctx.state === 'running') void synth.ctx.suspend().catch(() => undefined);
  }
}
