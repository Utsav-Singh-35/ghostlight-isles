import { LOCKER } from '../sim/balance';
import { canAfford, describeCost, type Resources } from '../sim/economy';
import { el } from './dom';

export interface LockerHandlers {
  escape(): void;
  pay(): void;
}

/** Davy Jones' Locker: the seabed, rising bubbles and the Ferryman's offer. */
export class LockerView {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly handlers: LockerHandlers,
  ) {
    this.root = el('div', 'locker');
    this.root.hidden = true;
    const bubbles = el('div', 'locker-bubbles');
    for (let i = 0; i < 18; i++) {
      const b = el('span', 'locker-bubble');
      b.style.left = `${(i * 53) % 100}%`;
      b.style.animationDelay = `${(i * 0.73) % 6}s`;
      b.style.animationDuration = `${5 + ((i * 1.7) % 4)}s`;
      b.style.width = b.style.height = `${6 + ((i * 7) % 14)}px`;
      bubbles.append(b);
    }
    this.card = el('div', 'locker-card');
    this.root.append(bubbles, this.card);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Shows the Ferryman's offer. `busy` hides the buttons while the puzzle is open. */
  show(resources: Resources, busy = false): void {
    const fare = LOCKER.ferrymanCost;
    const card = this.card;
    const title = el('h2', 'locker-title', "Davy Jones' Locker");
    const text = el(
      'p',
      'locker-text',
      `Your ship lies on the seabed among older wrecks. A hooded Ferryman poles his boat through the dark water. "Light my lanterns in ${LOCKER.puzzleSeconds} seconds and you may go free. Or pay, and go now."`,
    );
    const actions = el('div', 'result-actions');
    if (!busy) {
      const escape = el('button', 'intro-start', `Escape: solve the Lantern Lines (${LOCKER.puzzleSeconds} s)`);
      escape.type = 'button';
      escape.addEventListener('click', () => this.handlers.escape());
      const pay = el('button', 'ghost-button', `Pay the Ferryman ${describeCost(fare)}`);
      pay.type = 'button';
      if (canAfford(resources, fare)) pay.addEventListener('click', () => this.handlers.pay());
      else {
        pay.disabled = true;
        pay.title = `You have ${resources.ectoplasm} ectoplasm.`;
      }
      actions.append(escape, pay);
    }
    const note = el('p', 'locker-note', `If the escape fails, the sea takes ${Math.round(LOCKER.goldLostOnFailure * 100)}% of your gold. Either way you wash up beside Last Light.`);
    card.replaceChildren(title, text, actions, note);
    this.root.hidden = false;
    this.canvas.classList.add('canvas-drowned');
  }

  hide(): void {
    this.root.hidden = true;
    this.canvas.classList.remove('canvas-drowned');
  }
}
