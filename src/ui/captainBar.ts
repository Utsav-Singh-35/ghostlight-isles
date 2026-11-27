import type { PublicProfile } from '../sim/profile';
import { capsFor } from '../sim/economy';
import { el, setText } from './dom';

/** The captain's name, resources and whether progress saves online or on this device. */
export class CaptainBar {
  private readonly root: HTMLElement;
  private readonly name: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly cursed: HTMLElement;
  private readonly ecto: HTMLElement;
  private readonly status: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'captain-bar');
    this.root.hidden = true;
    this.name = el('div', 'cb-name');
    const resources = el('div', 'cb-resources');
    this.gold = el('span', 'cb-gold');
    this.cursed = el('span', 'cb-cursed');
    this.ecto = el('span', 'cb-ecto');
    resources.append(this.gold, this.cursed, this.ecto);
    this.status = el('div', 'cb-status');
    this.root.append(this.name, resources, this.status);
    parent.append(this.root);
  }

  set(profile: PublicProfile, online: boolean): void {
    const caps = capsFor(profile.homeLevel);
    const r = profile.resources;
    setText(this.name, `Captain ${profile.name}`);
    setText(this.gold, `${r.gold} gold`);
    this.gold.title = `Storage: ${r.gold + r.cursedGold} of ${caps.gold} gold`;
    setText(this.cursed, r.cursedGold > 0 ? `${r.cursedGold} cursed gold` : '');
    this.cursed.hidden = r.cursedGold === 0;
    this.cursed.title = 'Cursed gold draws the ghost fleet. Spend it first, or cleanse it at the chapel.';
    setText(this.ecto, `${r.ectoplasm} ectoplasm`);
    this.ecto.title = `Storage: ${r.ectoplasm} of ${caps.ectoplasm} ectoplasm`;
    setText(this.status, online ? 'Saved online' : 'Saved on this device');
    this.status.classList.toggle('cb-offline', !online);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
