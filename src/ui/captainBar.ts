import type { PublicProfile } from '../sim/profile';
import { capsFor } from '../sim/economy';
import { el, setText } from './dom';
import { duration } from './sidePanel';

/** The captain's name, resources and whether progress saves online or on this device. */
export class CaptainBar {
  private readonly root: HTMLElement;
  private readonly name: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly cursed: HTMLElement;
  private readonly ecto: HTMLElement;
  private readonly status: HTMLElement;
  private readonly moon: HTMLElement;
  private readonly trial: HTMLElement;

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
    this.moon = el('div', 'cb-moon');
    this.trial = el('div', 'cb-trial');
    this.trial.title = 'A new captain carries every ship weapon at level 1. Buy them at the shipwright to keep them.';
    this.root.append(this.name, resources, this.status, this.trial, this.moon);
    parent.append(this.root);
  }

  set(profile: PublicProfile, online: boolean, now = Date.now()): void {
    const caps = capsFor(profile.homeLevel);
    const r = profile.resources;
    setText(this.name, `Captain ${profile.name}${profile.username ? '' : ' · Guest'}`);
    this.name.title = profile.username ? `Signed in as ${profile.username}` : 'A guest captain. Use Account to keep this captain on any device.';
    setText(this.gold, `${r.gold} gold`);
    this.gold.title = `Storage: ${r.gold + r.cursedGold} of ${caps.gold} gold`;
    setText(this.cursed, r.cursedGold > 0 ? `${r.cursedGold} cursed gold` : '');
    this.cursed.hidden = r.cursedGold === 0;
    this.cursed.title = 'Cursed gold draws the ghost fleet. Spend it first, or cleanse it at the chapel.';
    setText(this.ecto, `${r.ectoplasm} ectoplasm`);
    this.ecto.title = `Storage: ${r.ectoplasm} of ${caps.ectoplasm} ectoplasm`;
    const saved = online ? 'Saved online' : 'Saved on this device';
    const shield = profile.protectedUntil > now ? ` · protected from raids for ${duration(profile.protectedUntil - now)}` : '';
    setText(this.status, saved + shield);
    this.status.classList.toggle('cb-offline', !online);
    const trial = profile.trialBattles ?? 0;
    setText(this.trial, trial > 0 ? `Trial: every weapon for ${trial} more ${trial === 1 ? 'battle' : 'battles'}` : '');
    this.trial.hidden = trial <= 0;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** The column under the captain's details, for panels that should hide with it (the captain's orders). */
  get column(): HTMLElement {
    return this.root;
  }

  /** The Blood Moon clock, in words. */
  setMoon(text: string, urgent: boolean): void {
    setText(this.moon, text);
    this.moon.classList.toggle('cb-moon-up', urgent);
  }
}
