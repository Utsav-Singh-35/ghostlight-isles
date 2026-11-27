import { DEFAULT_INPUT, FLAG, createBattle, recordInput, stepBattle, type BattleSetup, type BattleState, type InputEvent } from '../sim/battle';
import { angleDelta, clamp } from '../sim/math';
import { collisionRadius } from '../sim/world';

/**
 * A scripted captain for tests: circles the island just outside its shore with the island to
 * port, firing both broadsides. Returns the recorded inputs and the final state.
 */
export function autopilot(setup: BattleSetup, flags = FLAG.port | FLAG.starboard): { inputs: InputEvent[]; state: BattleState } {
  let state = createBattle(setup);
  const ring = collisionRadius(state.arena.islands[0]!) + 14;
  const inputs: InputEvent[] = [];
  let last = DEFAULT_INPUT;
  while (!state.result) {
    const { x, z, heading } = state.player.ship;
    const error = Math.hypot(x, z) - ring;
    const desired = Math.atan2(x, z) - (Math.PI / 2 + clamp(error * 0.03, -0.6, 0.9));
    // Round the rudder so input changes stay few, like a player's keys.
    const rudder = Math.round(clamp(-angleDelta(heading, desired) * 2.5, -1, 1));
    const input = { rudder, sailLevel: 1, flags };
    last = recordInput(inputs, last, state.tick + 1, input);
    state = stepBattle(state, input);
  }
  return { inputs, state };
}
