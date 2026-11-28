/**
 * Password hashes (PBKDF2-SHA256) and login tokens (JSON Web Tokens signed with HS256), made with
 * Web Crypto only, so the same code runs on Netlify, in Vite's servers and in the browser.
 */
import { ACCOUNTS } from '../sim/balance';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto is not available here (it needs HTTPS or localhost).');
  return s;
}

/** True where Web Crypto works, so accounts can be offered. */
export function cryptoAvailable(): boolean {
  return globalThis.crypto?.subtle !== undefined;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let bytes: Uint8Array;
  try {
    const binary = atob(padded);
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  // The last character has spare bits; only the canonical spelling is accepted, so each token has exactly one form.
  return base64url(bytes) === text ? bytes : null;
}

/** Compares two byte arrays in time that doesn't depend on where they first differ. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`, with a fresh random salt. */
export async function hashPassword(password: string, iterations: number = ACCOUNTS.passwordIterations): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toHex(salt)}$${toHex(hash)}`;
}

/** True when `password` matches a hash made by `hashPassword`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, saltHex, hashHex, extra] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || extra !== undefined || !rounds || !/^\d{1,7}$/.test(rounds)) return false;
  const iterations = Number(rounds);
  const salt = fromHex(saltHex ?? '');
  const expected = fromHex(hashHex ?? '');
  if (iterations < 1 || !salt || !expected) return false;
  return sameBytes(await pbkdf2(password, salt, iterations), expected);
}

export interface TokenClaims {
  /** The player id. */
  readonly sub: string;
  /** The captain's token version when the token was issued. */
  readonly ver: number;
  /** Issued and expiry times, seconds since 1970. */
  readonly iat: number;
  readonly exp: number;
}

const HEADER = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

async function hmacKey(secret: string): Promise<CryptoKey> {
  return subtle().importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** A signed token for this player, valid for `ACCOUNTS.tokenDays` from `now` (milliseconds). */
export async function signToken(secret: string, sub: string, ver: number, now: number): Promise<string> {
  const iat = Math.floor(now / 1000);
  const claims: TokenClaims = { sub, ver, iat, exp: iat + ACCOUNTS.tokenDays * 86_400 };
  const body = `${HEADER}.${base64url(encoder.encode(JSON.stringify(claims)))}`;
  const signature = new Uint8Array(await subtle().sign('HMAC', await hmacKey(secret), encoder.encode(body)));
  return `${body}.${base64url(signature)}`;
}

/** The claims of a token this secret signed, still in date at `now` (milliseconds); null for anything else. */
export async function verifyToken(secret: string, token: string, now: number): Promise<TokenClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  // Only our exact header: rejects "none" and every other algorithm.
  if (header !== HEADER) return null;
  const signature = fromBase64url(sig);
  const json = fromBase64url(payload);
  if (!signature || !json || signature.length !== 32) return null;
  const ok = await subtle().verify('HMAC', await hmacKey(secret), signature as BufferSource, encoder.encode(`${header}.${payload}`));
  if (!ok) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(decoder.decode(json));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  const c = claims as Record<string, unknown>;
  if (typeof c.sub !== 'string' || !Number.isInteger(c.ver) || !Number.isInteger(c.iat) || !Number.isInteger(c.exp)) return null;
  if ((c.exp as number) * 1000 <= now) return null;
  return { sub: c.sub, ver: c.ver as number, iat: c.iat as number, exp: c.exp as number };
}
