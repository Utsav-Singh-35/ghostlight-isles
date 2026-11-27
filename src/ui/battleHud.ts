import * as THREE from 'three';
import { TICK_SECONDS, WEAPONS } from '../sim/balance';
import { isRevealed, reloadTicks, revealRadius, secondsToTicks, timeLeft, type BattleState } from '../sim/battle';
import type { BattleLayer } from '../render/battleLayer';
import { el, setText } from './dom';
import type { Projector } from './labels';

export interface BattleHudInfo {
  readonly title: string;
  readonly objective: string;
}

interface Meter {
  readonly root: HTMLElement;
  readonly fill: HTMLElement;
  readonly text: HTMLElement;
}

function meter(parent: HTMLElement, key: string, label: string): Meter {
  const root = el('div', 'bh-meter');
  const head = el('div', 'bh-meter-head');
  head.append(el('kbd', undefined, key), el('span', 'bh-meter-label', label));
  const bar = el('div', 'bh-bar');
  const fill = el('div', 'bh-fill');
  bar.append(fill);
  const text = el('span', 'bh-meter-text');
  root.append(head, bar, text);
  parent.append(root);
  return { root, fill, text };
}

function setMeter(m: Meter, share: number, text: string, state: 'ready' | 'busy' | 'locked'): void {
  m.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, share)).toFixed(3)})`;
  setText(m.text, text);
  m.root.classList.toggle('bh-ready', state === 'ready');
  m.root.classList.toggle('bh-locked', state === 'locked');
}

const seconds = (ticks: number) => `${Math.ceil(ticks * TICK_SECONDS)} s`;

/** Everything the player needs during a fight, in words as well as bars. */
export class BattleHud {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly hullFill: HTMLElement;
  private readonly hullText: HTMLElement;
  private readonly port: Meter;
  private readonly starboard: Meter;
  private readonly ammo: HTMLElement;
  private readonly barrel: Meter;
  private readonly bats: Meter;
  private readonly retreat: HTMLButtonElement;
  private readonly tip: HTMLElement;
  private readonly bars: Array<{ root: HTMLElement; fill: HTMLElement }> = [];
  private readonly point = { x: 0, y: 0, visible: false };
  private readonly anchor = new THREE.Vector3();

  constructor(parent: HTMLElement, onRetreat: () => void) {
    this.root = el('div', 'battle-hud');
    this.root.hidden = true;

    const top = el('div', 'bh-top');
    this.title = el('div', 'bh-title');
    this.objective = el('div', 'bh-objective');
    this.clock = el('div', 'bh-clock');
    top.append(this.title, this.objective, this.clock);

    this.retreat = el('button', 'bh-retreat', 'Retreat');
    this.retreat.type = 'button';
    this.retreat.title = 'Leave the battle now. You keep what you destroyed.';
    this.retreat.addEventListener('click', onRetreat);

    const panel = el('div', 'bh-panel');
    const hull = el('div', 'bh-hull');
    const hullBar = el('div', 'bh-bar bh-bar-hull');
    this.hullFill = el('div', 'bh-fill');
    hullBar.append(this.hullFill);
    this.hullText = el('span', 'bh-meter-text');
    hull.append(el('span', 'bh-meter-label', 'Hull'), hullBar, this.hullText);
    const weapons = el('div', 'bh-weapons');
    this.port = meter(weapons, 'Q', 'Port guns');
    this.starboard = meter(weapons, 'E', 'Starboard guns');
    this.barrel = meter(weapons, 'F', 'Witchfire');
    this.bats = meter(weapons, 'B', 'Bat Swarm');
    this.ammo = el('div', 'bh-ammo');
    panel.append(hull, weapons, this.ammo);

    this.tip = el('div', 'bh-tip');
    const bars = el('div', 'bh-bars');
    for (let i = 0; i < 32; i++) {
      const root = el('div', 'bh-hp');
      const fill = el('div', 'bh-hp-fill');
      root.append(fill);
      root.hidden = true;
      bars.append(root);
      this.bars.push({ root, fill });
    }
    this.root.append(bars, top, this.retreat, panel, this.tip);
    parent.append(this.root);
  }

  show(info: BattleHudInfo, assault: boolean): void {
    setText(this.title, info.title);
    setText(this.objective, info.objective);
    this.retreat.hidden = !assault;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(state: BattleState, layer: BattleLayer, projector: Projector, salt: boolean): void {
    const { loadout } = state.setup;
    const assault = state.setup.mode === 'assault';
    const left = Math.ceil(timeLeft(state));
    setText(this.clock, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} until dawn`);

    const p = state.player;
    this.hullFill.style.transform = `scaleX(${(p.hp / p.maxHp).toFixed(3)})`;
    setText(this.hullText, p.sunk ? 'Sunk' : `${Math.ceil(p.hp)} / ${p.maxHp}`);

    const reload = reloadTicks(loadout);
    for (const [m, ticks] of [[this.port, p.reloadPort], [this.starboard, p.reloadStarboard]] as const) {
      setMeter(m, 1 - ticks / reload, p.sunk ? 'Sunk' : ticks === 0 ? 'Ready' : `Reloading ${seconds(ticks)}`, ticks === 0 && !p.sunk ? 'ready' : 'busy');
    }
    const barrelTotal = secondsToTicks(WEAPONS.barrel.cooldownSeconds);
    setMeter(
      this.barrel,
      loadout.barrel ? 1 - state.barrelCooldown / barrelTotal : 0,
      loadout.barrel ? (state.barrelCooldown === 0 ? 'Ready' : seconds(state.barrelCooldown)) : 'Not unlocked',
      !loadout.barrel ? 'locked' : state.barrelCooldown === 0 ? 'ready' : 'busy',
    );
    const batsTotal = secondsToTicks(WEAPONS.bats.cooldownSeconds);
    const batsOut = state.tick < state.revealUntil;
    setMeter(
      this.bats,
      loadout.bats ? 1 - state.batsCooldown / batsTotal : 0,
      !loadout.bats ? 'Not unlocked' : batsOut ? 'Bats out' : state.batsCooldown === 0 ? 'Ready' : seconds(state.batsCooldown),
      !loadout.bats ? 'locked' : state.batsCooldown === 0 ? 'ready' : 'busy',
    );
    const saltLoaded = salt && loadout.salt > 0;
    setText(this.ammo, loadout.salt ? `R: ${saltLoaded ? 'Salt Shot loaded (strong against ghosts)' : 'Cannonballs loaded (strong against towers)'}` : 'Cannonballs loaded');
    this.ammo.classList.toggle('bh-ammo-salt', saltLoaded);

    // Tips that explain the two threats as they come up.
    let tip = '';
    if (p.sunk) tip = 'Your ship sank. The towers fight on without you.';
    else if (!assault && state.ghosts.some((g) => !g.sunk && !isRevealed(state, g)))
      tip = `Faint ghosts hide in the fog, where your guns can't aim at them. Sail within ${revealRadius(loadout)} m to light them with your lantern; Spirit Lanterns and the Bat Swarm reveal them too.`;
    else if (!assault && !saltLoaded && loadout.salt) tip = 'Ghosts shrug off cannonballs. Press R for Salt Shot.';
    else if (assault && saltLoaded) tip = 'Salt Shot is weak against towers. Press R for cannonballs.';
    setText(this.tip, tip);
    this.tip.hidden = tip === '';

    // Health bars over structures and revealed ghosts.
    let n = 0;
    const place = (anchor: THREE.Vector3, share: number, kind: string) => {
      const bar = this.bars[n];
      if (!bar || !projector.project(anchor, this.point).visible) return;
      bar.root.hidden = false;
      bar.root.className = `bh-hp bh-hp-${kind}`;
      bar.root.style.transform = `translate(${this.point.x.toFixed(1)}px, ${this.point.y.toFixed(1)}px) translate(-50%, -50%)`;
      bar.fill.style.transform = `scaleX(${share.toFixed(3)})`;
      n++;
    };
    for (const s of state.structures) {
      if (s.destroyed || s.type === 'mine') continue;
      if (s.hp >= s.maxHp && assault === false) continue;
      place(layer.structureAnchor(state, s.id, this.anchor), s.hp / s.maxHp, assault ? 'enemy' : 'ours');
    }
    state.ghosts.forEach((g, i) => {
      if (g.sunk || !isRevealed(state, g)) return;
      place(layer.ghostAnchor(i, this.anchor), g.hp / g.maxHp, 'ghost');
    });
    for (let i = n; i < this.bars.length; i++) this.bars[i]!.root.hidden = true;
  }
}
