import { BLOOD_MOON, COSTS, CREW, ECONOMY, WEAPONS, type Cost } from '../sim/balance';
import { fleetFor } from '../sim/bloodMoon';
import { CREW_NAMES, CREW_ROLES, crewEffect, type CrewRole } from '../sim/crew';
import { DEFENSE_NAMES, SHIP_PART_NAMES, SHIP_PARTS, defenseCost, homeUpgradeCost, shipUpgradeCost, slotsFor, spentOn, type ShipPart } from '../sim/base';
import { canAfford, capsFor, describeCost } from '../sim/economy';
import { TOWER_TYPES, type DefenseType, type PlacedDefense } from '../sim/layout';
import type { PublicProfile } from '../sim/profile';
import { el } from './dom';

export interface BasePanelHandlers {
  build(type: DefenseType, slot: number): void;
  upgrade(type: DefenseType, slot: number): void;
  remove(type: DefenseType, slot: number): void;
  upgradeHome(): void;
  upgradeShip(part: ShipPart): void;
  cleanse(): void;
  keepCrew(role: CrewRole): void;
  hireCrew(role: CrewRole): void;
  close(): void;
}

const ROLES: Readonly<Record<DefenseType, string>> = {
  cannonTower: 'Strong against living ships. Half damage to ghosts, and it can only aim at revealed ones.',
  spiritLantern: 'Reveals ghosts in the fog and burns them. Weak against living ships.',
  boneCatapult: 'Lobs bones over a wide area. Slow, so fast ships can dodge it.',
  mine: 'Floats off the shore and bursts under any hostile ship.',
};

function partDetail(part: ShipPart, level: number): string {
  if (level === 0) return 'Not unlocked yet.';
  const i = level - 1;
  switch (part) {
    case 'hull':
      return `${ECONOMY.hull[i]} health.`;
    case 'cannon':
      return `${WEAPONS.cannon.balls[i]} shots a side, ${WEAPONS.cannon.damage[i]} damage each.`;
    case 'salt':
      return `${WEAPONS.salt.damage[i]} damage to ghosts, slows them for ${WEAPONS.salt.slowSeconds[i]} s. Press R in battle.`;
    case 'barrel':
      return `Burns ${WEAPONS.barrel.radius[i]} m around it for ${WEAPONS.barrel.burnSeconds} s. Press F in battle.`;
    case 'bats':
      return `Reveals ghosts and mines for ${WEAPONS.bats.revealSeconds[i]} s. Press B in battle.`;
    case 'mortar':
      return `Lobs a burning pumpkin ${WEAPONS.mortar.minRange} to ${WEAPONS.mortar.range} m: ${WEAPONS.mortar.damage[i]} damage across ${WEAPONS.mortar.splash[i]} m, every ${WEAPONS.mortar.cooldownSeconds} s. Press G in battle; it aims at your locked target.`;
  }
}

/** Plain words for what is missing to afford a cost. */
function shortfall(profile: PublicProfile, cost: Cost): string {
  const r = profile.resources;
  const parts: string[] = [];
  const gold = cost.gold - (r.gold + r.cursedGold);
  if (gold > 0) parts.push(`${gold} more gold`);
  const ecto = cost.ectoplasm - r.ectoplasm;
  if (ecto > 0) parts.push(`${ecto} more ectoplasm`);
  return `Needs ${parts.join(' and ')}`;
}

/** Last Light's defenses and the shipwright, side by side with the island in view. */
export class BasePanel {
  private readonly root: HTMLElement;
  private tab: 'defenses' | 'ship' = 'defenses';
  private profile: PublicProfile | null = null;
  private now = Date.now();

  constructor(
    parent: HTMLElement,
    private readonly handlers: BasePanelHandlers,
  ) {
    this.root = el('aside', 'base-panel');
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Last Light base');
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  open(profile: PublicProfile, now: number): void {
    this.root.hidden = false;
    this.update(profile, now);
  }

  close(): void {
    this.root.hidden = true;
  }

  update(profile: PublicProfile, now = Date.now()): void {
    this.profile = profile;
    this.now = now;
    if (this.root.hidden) return;
    const caps = capsFor(profile.homeLevel);
    const r = profile.resources;
    const slots = slotsFor(profile.homeLevel);

    const head = el('div', 'bp-head');
    head.append(el('h2', 'bp-title', `Last Light · level ${profile.homeLevel}`));
    head.append(el('p', 'bp-storage', `Storage: ${r.gold + r.cursedGold} of ${caps.gold} gold, ${r.ectoplasm} of ${caps.ectoplasm} ectoplasm`));
    const homeCost = homeUpgradeCost(profile);
    if (homeCost) {
      const next = slotsFor(profile.homeLevel + 1);
      const nextCaps = capsFor(profile.homeLevel + 1);
      head.append(
        this.button(
          `Upgrade Last Light: ${describeCost(homeCost)}`,
          `${next.towers} tower slots, ${next.mines} mine slots, storage for ${nextCaps.gold} gold.`,
          canAfford(r, homeCost) ? null : shortfall(profile, homeCost),
          () => this.handlers.upgradeHome(),
          'bp-home',
        ),
      );
    } else {
      head.append(el('p', 'bp-note', 'Last Light is at its highest level.'));
    }

    const tabs = el('div', 'bp-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [['defenses', 'Defenses'], ['ship', 'Shipwright']] as const) {
      const t = el('button', `bp-tab${this.tab === id ? ' bp-tab-on' : ''}`, label);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(this.tab === id));
      t.addEventListener('click', () => {
        this.tab = id;
        if (this.profile) this.update(this.profile, this.now);
      });
      tabs.append(t);
    }

    const body = el('div', 'bp-body');
    if (this.tab === 'defenses') {
      body.append(this.chapelRow(profile));
      body.append(el('h3', 'bp-section', 'Towers'));
      for (let slot = 0; slot < slots.towers; slot++) body.append(this.slotRow(profile, slot, false));
      body.append(el('h3', 'bp-section', 'Mines in the water'));
      for (let slot = 0; slot < slots.mines; slot++) body.append(this.slotRow(profile, slot, true));
    } else {
      const trial = profile.trialBattles ?? 0;
    if (trial > 0) body.append(el('p', 'bp-note', `Your trial: every weapon sails with you at level 1 for ${trial} more ${trial === 1 ? 'battle' : 'battles'}. Refit a weapon here to keep it after that.`));
    for (const part of SHIP_PARTS) body.append(this.partRow(profile, part));
      body.append(el('h3', 'bp-section', 'Crew'));
      for (const role of CREW_ROLES) body.append(this.crewRow(profile, role));
    }

    const close = el('button', 'ghost-button bp-close', 'Close (Tab)');
    close.type = 'button';
    close.addEventListener('click', () => this.handlers.close());
    this.root.replaceChildren(head, tabs, body, close);
  }

  private button(label: string, detail: string, blocked: string | null, run: () => void, className = ''): HTMLButtonElement {
    const b = el('button', `bp-action ${className}`.trim());
    b.type = 'button';
    b.append(el('span', 'bp-action-label', label));
    if (detail) b.append(el('span', 'bp-action-detail', detail));
    if (blocked) {
      b.disabled = true;
      b.append(el('span', 'bp-action-blocked', blocked));
    } else {
      b.addEventListener('click', run);
    }
    return b;
  }

  private slotRow(profile: PublicProfile, slot: number, mine: boolean): HTMLElement {
    const row = el('div', 'bp-slot');
    const d: PlacedDefense | undefined = profile.defenses.find((x) => (x.type === 'mine') === mine && x.slot === slot);
    const label = `${mine ? 'Mine' : 'Slot'} ${slot + 1}`;
    if (d) {
      row.append(el('div', 'bp-slot-name', `${label}: ${DEFENSE_NAMES[d.type]}, level ${d.level}`), el('p', 'bp-role', ROLES[d.type]));
      const actions = el('div', 'bp-slot-actions');
      if (d.level < 3) {
        const cost = defenseCost(d.type, d.level + 1);
        actions.append(this.button(`Upgrade: ${describeCost(cost)}`, '', canAfford(profile.resources, cost) ? null : shortfall(profile, cost), () => this.handlers.upgrade(d.type, slot)));
      }
      const spent = spentOn(d.type, d.level);
      const refund = { gold: Math.floor(spent.gold * COSTS.refund), ectoplasm: Math.floor(spent.ectoplasm * COSTS.refund) };
      actions.append(this.button(`Remove: get back ${describeCost(refund)}`, '', null, () => this.handlers.remove(d.type, slot), 'bp-remove'));
      row.append(actions);
      return row;
    }
    row.append(el('div', 'bp-slot-name bp-empty', `${label}: empty`));
    const actions = el('div', 'bp-slot-actions');
    for (const type of mine ? (['mine'] as const) : TOWER_TYPES) {
      const cost = defenseCost(type, 1);
      const unlock = COSTS.unlockLevel[type];
      const blocked = profile.homeLevel < unlock ? `Needs Last Light at level ${unlock}` : canAfford(profile.resources, cost) ? null : shortfall(profile, cost);
      actions.append(this.button(`Build ${DEFENSE_NAMES[type]}: ${describeCost(cost)}`, ROLES[type], blocked, () => this.handlers.build(type, slot)));
    }
    row.append(actions);
    return row;
  }

  private crewRow(profile: PublicProfile, role: CrewRole): HTMLElement {
    const slot = profile.crew[role];
    const row = el('div', 'bp-slot');
    const state = slot.state === 'ghost' ? `a ghost, ${slot.battlesLeft} ${slot.battlesLeft === 1 ? 'battle' : 'battles'} left` : slot.state === 'living' ? 'alive' : 'gone';
    row.append(el('div', 'bp-slot-name', `${CREW_NAMES[role]}: ${state}`), el('p', 'bp-role', crewEffect(role, slot.state)));
    if (slot.state === 'ghost') {
      const cost = CREW.keepGhostCost;
      row.append(this.button(`Keep for ${CREW.ghostBattles} more battles: ${describeCost(cost)}`, 'Ghosts fade when their battles run out.', canAfford(profile.resources, cost) ? null : shortfall(profile, cost), () => this.handlers.keepCrew(role)));
    } else if (slot.state === 'none') {
      const cost = CREW.hireCost;
      row.append(this.button(`Hire a new ${CREW_NAMES[role]}: ${describeCost(cost)}`, crewEffect(role, 'living'), canAfford(profile.resources, cost) ? null : shortfall(profile, cost), () => this.handlers.hireCrew(role)));
    }
    return row;
  }

  /** The next ghost fleet, and the chapel where cursed gold is cleansed. */
  private chapelRow(profile: PublicProfile): HTMLElement {
    const row = el('div', 'bp-slot bp-chapel');
    const fleet = fleetFor(profile);
    row.append(
      el('div', 'bp-slot-name', `Next ghost fleet: ${fleet.count} ${fleet.count === 1 ? 'ship' : 'ships'} at level ${fleet.level}`),
      el('p', 'bp-role', `Every ${BLOOD_MOON.cursedGoldPerExtraShip} cursed gold you hold adds a ship. Spirit Lanterns reveal ghosts; Cannon Towers can't see them in the fog.`),
    );
    const cleanse = profile.cleanse;
    if (cleanse) {
      const minutes = Math.max(0, Math.ceil((cleanse.readyAt - this.now) / 60_000));
      row.append(el('p', 'bp-note', minutes > 0 ? `The chapel is cleansing ${cleanse.amount} cursed gold: ready in ${minutes} min.` : `${cleanse.amount} gold is cleansed and arrives with your next tribute.`));
    } else if (profile.resources.cursedGold > 0) {
      row.append(
        this.button(
          `Cleanse ${profile.resources.cursedGold} cursed gold at the chapel`,
          `It comes back as plain gold in ${Math.round(BLOOD_MOON.cleanseSeconds / 60)} minutes, and stops drawing ghosts at once.`,
          null,
          () => this.handlers.cleanse(),
        ),
      );
    }
    return row;
  }

  private partRow(profile: PublicProfile, part: ShipPart): HTMLElement {
    // Captains saved before a part existed don't have it yet.
    const level = profile.weapons[part] ?? 0;
    const row = el('div', 'bp-slot');
    row.append(el('div', 'bp-slot-name', `${SHIP_PART_NAMES[part]}: ${level === 0 ? 'locked' : `level ${level} of 3`}`), el('p', 'bp-role', partDetail(part, level)));
    const cost = shipUpgradeCost(profile, part);
    if (cost) {
      const verb = level === 0 ? 'Unlock' : 'Upgrade';
      row.append(this.button(`${verb}: ${describeCost(cost)}`, partDetail(part, level + 1), canAfford(profile.resources, cost) ? null : shortfall(profile, cost), () => this.handlers.upgradeShip(part)));
    }
    return row;
  }
}
