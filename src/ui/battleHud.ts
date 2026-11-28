import * as THREE from 'three';
import { TICK_SECONDS, TROOPS, WEAPONS } from '../sim/balance';
import { canLand, isRevealed, reloadTicks, revealRadius, secondsToTicks, timeLeft, type BattleState } from '../sim/battle';
import { troopTotal } from '../sim/troops';
import { DEFENSE_NAMES } from '../sim/base';
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

/** What a target is called on the HUD. */
export function targetName(state: BattleState, id: number): string | null {
  const s = state.structures.find((st) => st.id === id);
  if (s) {
    if (s.type === 'vault') return 'Treasure vault';
    if (s.type === 'powder') return 'Powder store';
    const name = s.type === 'keep' ? (state.setup.island.living ? 'Lighthouse' : 'Ghost light') : DEFENSE_NAMES[s.type];
    return `${name} (level ${s.level})`;
  }
  return state.ghosts.some((g) => g.id === id) ? 'Ghost ship' : null;
}

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
  private readonly mortar: Meter;
  private readonly target: HTMLElement;
  private readonly party: HTMLElement;
  private readonly retreat: HTMLButtonElement;
  private readonly tip: HTMLElement;
  private readonly bars: Array<{ hit: HTMLButtonElement; root: HTMLElement; fill: HTMLElement }> = [];
  private readonly point = { x: 0, y: 0, visible: false };
  private readonly anchor = new THREE.Vector3();

  /** `onLock` hears a click on a health bar: lock that target. */
  constructor(parent: HTMLElement, onRetreat: () => void, private readonly onLock: (id: number) => void = () => {}) {
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
    this.mortar = meter(weapons, 'G', 'Mortar');
    this.ammo = el('div', 'bh-ammo');
    this.target = el('div', 'bh-target');
    this.party = el('div', 'bh-party');
    const lines = el('div', 'bh-lines');
    lines.append(this.ammo, this.target, this.party);
    panel.append(hull, weapons, lines);

    this.tip = el('div', 'bh-tip');
    const bars = el('div', 'bh-bars');
    for (let i = 0; i < 32; i++) {
      // Each health bar is a button: click it to lock that target.
      const hit = el('button', 'bh-hit');
      hit.type = 'button';
      hit.title = 'Lock this target (or press T)';
      const root = el('div', 'bh-hp');
      const fill = el('div', 'bh-hp-fill');
      root.append(fill);
      hit.append(root);
      hit.hidden = true;
      hit.addEventListener('click', () => {
        const id = Number(hit.dataset.target);
        if (id > 0) this.onLock(id);
      });
      bars.append(hit);
      this.bars.push({ hit, root, fill });
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

  update(state: BattleState, layer: BattleLayer, projector: Projector, salt: boolean, lock = 0): void {
    const { loadout } = state.setup;
    const assault = state.setup.mode === 'assault';
    const left = Math.ceil(timeLeft(state));
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const urgent = left <= 30 && !state.result;
    setText(this.clock, assault ? `${clock} until dawn${urgent ? ': the fort must fall before the sun rises' : ''}` : `${clock} until dawn`);
    this.clock.classList.toggle('bh-clock-urgent', urgent);

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
    const mortarTotal = secondsToTicks(WEAPONS.mortar.cooldownSeconds);
    setMeter(
      this.mortar,
      loadout.mortar ? 1 - state.mortarCooldown / mortarTotal : 0,
      !loadout.mortar ? 'Not fitted' : state.mortarCooldown === 0 ? 'Ready' : seconds(state.mortarCooldown),
      !loadout.mortar ? 'locked' : state.mortarCooldown === 0 ? 'ready' : 'busy',
    );
    const locked = lock ? targetName(state, lock) : null;
    if (locked) {
      const s = state.structures.find((st) => st.id === lock);
      const g = state.ghosts.find((gh) => gh.id === lock);
      const at = s ?? g?.ship;
      const d = at ? Math.round(Math.hypot(at.x - p.ship.x, at.z - p.ship.z)) : 0;
      setText(this.target, `T: locked on ${locked}, ${d} m. Broadsides and the mortar fire at it when they can.`);
    } else setText(this.target, 'T: lock a target, or click its health bar. Unlocked guns fire at the nearest.');
    this.target.classList.toggle('bh-target-on', locked !== null);

    setText(this.party, partyLine(state));
    this.party.classList.toggle('bh-party-ready', canLand(state));
    this.party.hidden = this.party.textContent === '';

    const saltLoaded = salt && loadout.salt > 0;
    setText(this.ammo, loadout.salt ? `R: ${saltLoaded ? 'Salt Shot loaded (strong against ghosts)' : 'Cannonballs loaded (strong against towers)'}` : 'Cannonballs loaded');
    this.ammo.classList.toggle('bh-ammo-salt', saltLoaded);

    // Tips that explain the two threats as they come up.
    let tip = '';
    const afloat = state.ghosts.filter((g) => !g.sunk);
    const veiled = afloat.some((g) => !isRevealed(state, g));
    const seen = afloat.some((g) => isRevealed(state, g));
    if (p.sunk) tip = 'Your ship sank. The towers fight on without you.';
    else if (veiled)
      tip = `${assault ? "The fort's ghosts" : 'Faint ghosts'} hide in the fog, where your guns can't aim at them. Sail within ${revealRadius(loadout)} m to light them with your lantern; Spirit Lanterns and the Bat Swarm reveal them too.`;
    else if (seen && !saltLoaded && loadout.salt) tip = 'Ghosts take half damage from cannonballs. Press R for Salt Shot.';
    else if (assault && saltLoaded && !seen) tip = 'Salt Shot is weak against towers. Press R for cannonballs.';
    setText(this.tip, tip);
    this.tip.hidden = tip === '';

    // Health bars over structures and revealed ghosts.
    let n = 0;
    const place = (anchor: THREE.Vector3, share: number, kind: string, id: number) => {
      const bar = this.bars[n];
      if (!bar || !projector.project(anchor, this.point).visible) return;
      bar.hit.hidden = false;
      bar.hit.dataset.target = String(id);
      bar.root.className = `bh-hp bh-hp-${kind}${id === lock ? ' bh-hp-locked' : ''}`;
      bar.hit.style.transform = `translate(${this.point.x.toFixed(1)}px, ${this.point.y.toFixed(1)}px) translate(-50%, -50%)`;
      bar.fill.style.transform = `scaleX(${share.toFixed(3)})`;
      n++;
    };
    for (const s of state.structures) {
      if (s.destroyed || s.type === 'mine') continue;
      if (s.hp >= s.maxHp && assault === false) continue;
      place(layer.structureAnchor(state, s.id, this.anchor), s.hp / s.maxHp, s.type === 'vault' ? 'gold' : assault ? 'enemy' : 'ours', s.id);
    }
    state.ghosts.forEach((g, i) => {
      if (g.sunk || !isRevealed(state, g)) return;
      place(layer.ghostAnchor(i, this.anchor), g.hp / g.maxHp, 'ghost', g.id);
    });
    for (let i = n; i < this.bars.length; i++) this.bars[i]!.hit.hidden = true;
  }
}

/** The landing party in words: who is aboard, whether L will land them, and how the fight ashore goes. */
export function partyLine(state: BattleState): string {
  const mine = state.troops.filter((t) => t.side === 'player');
  const ashore = mine.filter((t) => !t.dead).length;
  const fallen = mine.length - ashore;
  const aboard = troopTotal(state.aboard) - (state.aboard.deckhand ?? 0);
  const hands = state.aboard.deckhand ?? 0;
  const repairs = hands > 0 ? ` ${hands} Deckhand${hands === 1 ? '' : 's'} patch the hull.` : '';
  if (state.setup.mode !== 'assault') {
    const garrison = state.troops.filter((t) => t.side === 'island' && !t.dead).length;
    const boarders = state.troops.filter((t) => t.side === 'ghost' && !t.dead).length;
    return garrison + boarders > 0 ? `Ashore: ${garrison} of your crew against ${boarders} ghost boarders. C: watch the fight.${repairs}` : repairs.trim();
  }
  const enemies = state.troops.filter((t) => t.side === 'island' && !t.dead).length;
  const gate = state.gate ? (state.gate.destroyed ? ' The gate is open.' : ` Gate ${Math.ceil(state.gate.hp)} / ${state.gate.maxHp}.`) : '';
  if (state.landing?.done) return `Ashore: ${ashore}${fallen ? `, ${fallen} fallen` : ''}. ${enemies} defenders left.${gate} C: watch the fight.${repairs}`;
  if (state.landing) return `Your party is rowing ashore.${repairs}`;
  if (aboard === 0) return repairs.trim();
  if (canLand(state)) return `L: land your party of ${aboard}.${gate}${repairs}`;
  const reach = state.boats.some((b) => !b.sunk) ? TROOPS.boatLandReach : TROOPS.landReach;
  return `Party of ${aboard} aboard: sail within ${reach} m of the shore, then press L.${repairs}`;
}