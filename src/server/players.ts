import type { Profile } from '../sim/profile';
import { verifyToken } from './credentials';
import { HttpError, type ServerContext, type Store } from './router';

/** A short public entry per captain, for the leaderboard and the raid list. */
export interface IndexEntry {
  readonly id: string;
  readonly name: string;
  /** Registered captains only. */
  readonly username?: string;
  readonly infamy: number;
  readonly homeLevel: number;
  readonly protectedUntil: number;
  /** Rough strength of the base, for matching raids. */
  readonly rating: number;
  readonly updatedAt: number;
}

const playerKey = (id: string) => `player:${id}`;
const indexKey = (id: string) => `index:${id}`;
/** The single index record saved before each captain got their own. Read, never written. */
const LEGACY_INDEX_KEY = 'index';
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

function parseEntry(text: string): IndexEntry | null {
  try {
    const e = JSON.parse(text) as IndexEntry;
    return e && typeof e === 'object' && typeof e.id === 'string' && isPlayerId(e.id) ? e : null;
  } catch {
    return null;
  }
}

/** Every captain's public entry, by id. */
export async function readIndex(store: Store): Promise<Record<string, IndexEntry>> {
  const out: Record<string, IndexEntry> = {};
  const legacy = await store.get(LEGACY_INDEX_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as Record<string, IndexEntry>;
      if (parsed && typeof parsed === 'object') for (const [id, e] of Object.entries(parsed)) if (isPlayerId(id) && e) out[id] = e;
    } catch {
      // A broken old index is skipped; every captain rewrites their own entry when they next save.
    }
  }
  for (const [, text] of await store.list('index:')) {
    const e = parseEntry(text);
    if (e) out[e.id] = e;
  }
  return out;
}

/** Saves a profile and its public index entry. Only this captain's entry is written. */
export async function saveProfile(ctx: ServerContext, profile: Profile): Promise<void> {
  await ctx.store.set(playerKey(profile.id), JSON.stringify(profile));
  const entry: IndexEntry = {
    id: profile.id,
    name: profile.name,
    ...(profile.username ? { username: profile.username } : {}),
    infamy: profile.infamy,
    homeLevel: profile.homeLevel,
    protectedUntil: profile.protectedUntil,
    rating: baseRating(profile),
    updatedAt: ctx.now(),
  };
  await ctx.store.set(indexKey(profile.id), JSON.stringify(entry));
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

/** The token version a profile's tokens must carry. */
export function tokenVersionOf(profile: Profile): number {
  return profile.credentials?.tokenVersion ?? profile.tokenVersion ?? 0;
}

const SIGN_IN_AGAIN = 'Sign in again: this device has no valid captain.';

/** Finds the captain a token belongs to, or throws a 401. Accepts login tokens and pre-account guest tokens. */
export async function authenticate(ctx: ServerContext, header: string | null): Promise<Profile> {
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const parts = token.split('.');
  if (parts.length === 3) {
    const claims = await verifyToken(ctx.jwtSecret, token, ctx.now());
    const profile = claims && isPlayerId(claims.sub) ? await loadProfile(ctx.store, claims.sub) : null;
    if (!claims || !profile || claims.ver !== tokenVersionOf(profile)) throw new HttpError(401, SIGN_IN_AGAIN);
    return profile;
  }
  // A guest token from before accounts: `<id>.<secret>`, checked against the stored hash.
  const [id, secret] = parts;
  if (parts.length !== 2 || !id || !secret || !isPlayerId(id) || !/^[0-9a-f]{32}$/.test(secret)) throw new HttpError(401, SIGN_IN_AGAIN);
  const profile = await loadProfile(ctx.store, id);
  // Registering retires the old guest token along with every token issued before it.
  if (!profile || profile.tokenHash === '' || profile.credentials || (profile.tokenVersion ?? 0) > 0 || !sameText(profile.tokenHash, await hashSecret(secret))) {
    throw new HttpError(401, SIGN_IN_AGAIN);
  }
  return profile;
}
