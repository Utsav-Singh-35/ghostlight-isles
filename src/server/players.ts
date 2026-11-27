import type { Profile } from '../sim/profile';
import { HttpError, type ServerContext, type Store } from './router';

/** A short public entry per captain, for the leaderboard and the raid list. */
export interface IndexEntry {
  readonly id: string;
  readonly name: string;
  readonly infamy: number;
  readonly homeLevel: number;
  readonly protectedUntil: number;
  /** Rough strength of the base, for matching raids. */
  readonly rating: number;
  readonly updatedAt: number;
}

const playerKey = (id: string) => `player:${id}`;
const INDEX_KEY = 'index';
const ID_PATTERN = /^[0-9a-f]{16}$/;

export function isPlayerId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export async function loadProfile(store: Store, id: string): Promise<Profile | null> {
  if (!isPlayerId(id)) return null;
  const text = await store.get(playerKey(id));
  if (!text) return null;
  try {
    const profile = JSON.parse(text) as Profile;
    return profile && profile.version === 1 && profile.id === id ? profile : null;
  } catch {
    return null;
  }
}

/** Rough base strength: each tower and mine counts its level; the home level counts double. */
export function baseRating(profile: Pick<Profile, 'defenses' | 'homeLevel'>): number {
  return profile.defenses.reduce((sum, d) => sum + d.level, 0) + profile.homeLevel * 2;
}

export async function readIndex(store: Store): Promise<Record<string, IndexEntry>> {
  const text = await store.get(INDEX_KEY);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as Record<string, IndexEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Saves a profile and its public index entry. */
export async function saveProfile(ctx: ServerContext, profile: Profile): Promise<void> {
  await ctx.store.set(playerKey(profile.id), JSON.stringify(profile));
  const index = await readIndex(ctx.store);
  index[profile.id] = {
    id: profile.id,
    name: profile.name,
    infamy: profile.infamy,
    homeLevel: profile.homeLevel,
    protectedUntil: profile.protectedUntil,
    rating: baseRating(profile),
    updatedAt: ctx.now(),
  };
  await ctx.store.set(INDEX_KEY, JSON.stringify(index));
}

const encoder = new TextEncoder();

/** SHA-256 of a secret, as hex. Falls back to FNV-1a where Web Crypto is missing (offline play over plain HTTP). */
export async function hashSecret(secret: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', encoder.encode(secret));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < secret.length; i++) {
    h ^= secret.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv-${(h >>> 0).toString(16)}`;
}

/** Compares two strings in time that doesn't depend on where they first differ. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Finds the captain a token belongs to, or throws a 401. */
export async function authenticate(ctx: ServerContext, header: string | null): Promise<Profile> {
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const [id, secret, extra] = token.split('.');
  if (!id || !secret || extra !== undefined || !isPlayerId(id) || !/^[0-9a-f]{32}$/.test(secret)) {
    throw new HttpError(401, 'Sign in again: this device has no valid captain.');
  }
  const profile = await loadProfile(ctx.store, id);
  if (!profile || !sameText(profile.tokenHash, await hashSecret(secret))) {
    throw new HttpError(401, 'Sign in again: this device has no valid captain.');
  }
  return profile;
}
