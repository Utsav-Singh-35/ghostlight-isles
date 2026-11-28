import { ECONOMY, TROOPS } from './balance';
import type { BattleSetup, CrewState, Loadout } from './battle';
import { capsFor, earn, tributeDue, type Resources } from './economy';
import type { DefenseLevel, PlacedDefense } from './layout';
import { clamp } from './math';
import type { TroopCounts } from './troops';

export interface CrewSlot {
  readonly state: CrewState;
  /** Battles left before a ghost crew member fades. */
  readonly battlesLeft: number;
}

export interface Weapons {
  readonly hull: number;
  readonly cannon: number;
  readonly salt: number;
  readonly barrel: number;
  readonly bats: number;
  /** The Pumpkin Mortar. Missing on captains saved before it existed, which means level 0. */
  readonly mortar?: number;
  /** Support boats, 0 to TROOPS.maxBoats. Missing means none. */
  readonly boats?: number;
}

/** A captain's fighters: the landing party aboard and the garrison ashore. */
export interface Crew {
  readonly ship: TroopCounts;
  readonly island: TroopCounts;
}

export interface Report {
  readonly at: number;
  readonly title: string;
  readonly detail: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  /** For raids on this captain: the raider's id and name, so they can be raided back. */
  readonly from?: { readonly id: string; readonly name: string };
}

export type BattleKind = 'capture' | 'raid' | 'ghost';

/** A battle or puzzle the server has handed out and is waiting to see finished. */
export interface PendingBattle {
  readonly id: string;
  readonly kind: BattleKind | 'locker';
  /** Battle setup, or null for puzzles. */
  readonly setup: BattleSetup | null;
  /** Puzzle seed, for puzzles. */
  readonly puzzleSeed: number;
  /** Island id for captures, player or rival id for raids. */
  readonly target: string;
  readonly startedAt: number;
}

export interface Stats {
  readonly raidsWon: number;
  readonly captures: number;
  readonly ghostRaidsRepelled: number;
  readonly ghostShipsSunk: number;
  readonly timesSunk: number;
}

/** A registered captain's login: kept on the server, never sent to the client. */
export interface Credentials {
  /** `pbkdf2-sha256$<iterations>$<salt>$<hash>`. */
  readonly passwordHash: string;
  /** Raised when a guest registers, so older tokens stop working. */
  readonly tokenVersion: number;
  /** Failed logins since `windowStart`, and the time the username is locked until. */
  readonly failures: number;
  readonly windowStart: number;
  readonly lockedUntil: number;
}

export interface Profile {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  /** Hash of a guest token's secret, for guest tokens issued before accounts. Empty for newer captains. */
  readonly tokenHash: string;
  /** The unique username, for registered captains; missing for guests. */
  readonly username?: string;
  /** Missing for guests. */
  readonly credentials?: Credentials;
  /** Token version for guests (0 when missing). Registered captains keep theirs in `credentials`. */
  readonly tokenVersion?: number;
  readonly createdAt: number;
  readonly resources: Resources;
  readonly homeLevel: DefenseLevel;
  readonly defenses: readonly PlacedDefense[];
  readonly weapons: Weapons;
  readonly crew: { readonly gunner: CrewSlot; readonly navigator: CrewSlot };
  /** Ids of captured islands. */
  readonly captured: readonly number[];
  /** Tribute has been paid up to this time. */
  readonly tributeAt: number;
  readonly infamy: number;
  /** Raids by other players are refused until this time. */
  readonly protectedUntil: number;
  /** The ghost fleet leaves the island alone until this time. */
  readonly ghostRestUntil: number;
  /** The player may summon a Blood Moon from this time. */
  readonly summonReadyAt: number;
  /** A personal Blood Moon lasts until this time. */
  readonly summonedUntil: number;
  /** Cursed gold being cleansed at the chapel. */
  readonly cleanse: { readonly amount: number; readyAt: number } | null;
  /** True while the ship lies in Davy Jones' Locker. */
  readonly sunk: boolean;
  readonly stats: Stats;
  readonly reports: readonly Report[];
  readonly battle: PendingBattle | null;
  /** Battles left in a new captain's trial of every weapon. Missing on captains saved before trials, which means none. */
  readonly trialBattles?: number;
  /** The captain's fighters. Missing on captains saved before troops, which means none. */
  readonly troops?: Crew;
}

/** A profile without its secrets: safe to send to the client. */
export type PublicProfile = Omit<Profile, 'tokenHash' | 'credentials' | 'tokenVersion'>;

export function createProfile(id: string, name: string, tokenHash: string, now: number): Profile {
  return {
    version: 1,
    id,
    name,
    tokenHash,
    createdAt: now,
    resources: { ...ECONOMY.start },
    homeLevel: 1,
    defenses: [{ type: 'cannonTower', level: 1, slot: 0 }],
    weapons: { hull: 1, cannon: 1, salt: 1, barrel: 0, bats: 0, mortar: 0 },
    crew: { gunner: { state: 'living', battlesLeft: 0 }, navigator: { state: 'living', battlesLeft: 0 } },
    captured: [],
    tributeAt: now,
    infamy: 0,
    protectedUntil: 0,
    ghostRestUntil: 0,
    summonReadyAt: 0,
    summonedUntil: 0,
    cleanse: null,
    sunk: false,
    stats: { raidsWon: 0, captures: 0, ghostRaidsRepelled: 0, ghostShipsSunk: 0, timesSunk: 0 },
    reports: [],
    battle: null,
    trialBattles: ECONOMY.trialBattles,
    troops: { ship: { ...TROOPS.start.ship }, island: { ...TROOPS.start.island } },
  };
}

export function publicProfile(profile: Profile): PublicProfile {
  const { tokenHash: _hash, credentials: _credentials, tokenVersion: _version, ...rest } = profile;
  void _hash;
  void _credentials;
  void _version;
  return rest;
}

/** Trial battles a profile has left. */
export function trialLeft(profile: Pick<Profile, 'trialBattles'>): number {
  const n = profile.trialBattles ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Uses up one trial battle, if any are left. */
export function useTrialBattle(profile: Profile): Profile {
  const left = trialLeft(profile);
  return left > 0 ? { ...profile, trialBattles: left - 1 } : profile;
}

/** The ship and crew a profile takes into battle. During a new captain's trial every weapon is at level 1 or more. */
export function loadoutOf(profile: Profile): Loadout {
  const hullLevel = clamp(profile.weapons.hull, 1, 3);
  const lend = trialLeft(profile) > 0 ? 1 : 0;
  return {
    hull: ECONOMY.hull[hullLevel - 1]!,
    cannon: Math.max(lend, profile.weapons.cannon),
    salt: Math.max(lend, profile.weapons.salt),
    barrel: Math.max(lend, profile.weapons.barrel),
    bats: Math.max(lend, profile.weapons.bats),
    mortar: Math.max(lend, profile.weapons.mortar ?? 0),
    boats: clamp(profile.weapons.boats ?? 0, 0, TROOPS.maxBoats),
    gunner: profile.crew.gunner.state,
    navigator: profile.crew.navigator.state,
  };
}

/** Adds a report, keeping the newest ECONOMY.maxReports. */
export function addReport(profile: Profile, report: Report): Profile {
  return { ...profile, reports: [report, ...profile.reports].slice(0, ECONOMY.maxReports) };
}

/** Returns cleansed gold once the chapel has finished, up to the storage cap. */
export function completeCleanse(profile: Profile, now: number): { profile: Profile; gold: number } {
  const cleanse = profile.cleanse;
  if (!cleanse || cleanse.readyAt > now) return { profile, gold: 0 };
  const before = profile.resources.gold;
  const resources = earn(profile.resources, { gold: cleanse.amount }, capsFor(profile.homeLevel));
  return { profile: { ...profile, resources, cleanse: null }, gold: resources.gold - before };
}

/** Collects tribute from captured islands, up to the storage cap. */
export function collectTribute(profile: Profile, now: number): { profile: Profile; gold: number } {
  const due = tributeDue(profile.captured.length, profile.tributeAt, now);
  if (due.gold <= 0) return { profile: { ...profile, tributeAt: due.paidUntil }, gold: 0 };
  const before = profile.resources.gold;
  const resources = earn(profile.resources, { gold: due.gold }, capsFor(profile.homeLevel));
  return { profile: { ...profile, resources, tributeAt: due.paidUntil }, gold: resources.gold - before };
}
