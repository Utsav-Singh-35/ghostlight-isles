import {
  DEFAULT_INPUT,
  createBattle,
  recordInput,
  stepBattle,
  type BattleEvent,
  type BattleInput,
  type BattleResult,
  type BattleSetup,
  type BattleState,
  type InputEvent,
} from '../sim/battle';

/** Runs one battle live at the fixed tick rate and records the player's inputs for the server. */
export class BattleRunner {
  prev: BattleState;
  current: BattleState;
  /** Input changes, sent to the server to replay the battle. */
  readonly inputs: InputEvent[] = [];
  private last: BattleInput = DEFAULT_INPUT;
  private pending: BattleEvent[] = [];

  constructor(readonly setup: BattleSetup) {
    this.current = createBattle(setup);
    this.prev = this.current;
  }

  /** Advances one tick with this input. Does nothing once the battle has ended. */
  step(input: BattleInput): void {
    if (this.current.result) return;
    this.last = recordInput(this.inputs, this.last, this.current.tick + 1, input);
    this.prev = this.current;
    this.current = stepBattle(this.current, input);
    for (const e of this.current.events) this.pending.push(e);
  }

  /** Events since the last call, for effects and sound. */
  takeEvents(): BattleEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  get result(): BattleResult | null {
    return this.current.result;
  }
}
