/**
 * A tiny router for the game's API. Feature modules register routes with `route()`;
 * `server/api.ts` imports them all and exports `handle()`.
 */
import type { Profile } from '../sim/profile';

/**
 * Where records are kept: MongoDB online, localStorage offline, memory in tests and the preview
 * server. Keys are `<kind>:<id>`; values are JSON text.
 */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  /** Writes the value only if the key is new, atomically. Returns whether it did. */
  create(key: string, value: string): Promise<boolean>;
  /** Every record whose key starts with `prefix`, which must have the form `<kind>:`. */
  list(prefix: string): Promise<Array<[key: string, value: string]>>;
}

export interface ServerContext {
  readonly store: Store;
  /** Milliseconds since 1970. */
  readonly now: () => number;
  /** A random unsigned 32-bit integer. */
  readonly random: () => number;
  /** The key that signs login tokens. */
  readonly jwtSecret: string;
  /** PBKDF2 rounds for new password hashes. Tests lower it; online it is `ACCOUNTS.passwordIterations`. */
  readonly passwordIterations?: number;
}

/** True for a list prefix of the form `<kind>:`. */
export function isListPrefix(prefix: string): boolean {
  return /^[a-z]+:$/.test(prefix);
}

/** An error with an HTTP status and a message that is safe to show to the player. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RouteRequest {
  readonly ctx: ServerContext;
  readonly body: Record<string, unknown>;
  readonly params: Readonly<Record<string, string>>;
  /** The caller's profile, for routes that need a captain. */
  readonly profile: Profile;
}

export type RouteHandler = (r: RouteRequest) => Promise<unknown>;

interface Route {
  readonly method: 'GET' | 'POST';
  readonly parts: readonly string[];
  readonly auth: boolean;
  readonly handler: RouteHandler;
}

const routes: Route[] = [];

/** Registers a route. Path parts starting with ':' are parameters, for example '/battles/:id'. */
export function route(method: 'GET' | 'POST', path: string, auth: boolean, handler: RouteHandler): void {
  routes.push({ method, parts: path.split('/').filter(Boolean), auth, handler });
}

export function findRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    r.parts.forEach((part, i) => {
      if (!ok) return;
      const actual = parts[i]!;
      if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(actual);
      else if (part !== actual) ok = false;
    });
    if (ok) return { route: r, params };
  }
  return null;
}

/** Reads a string field from a request body, or throws a 400. */
export function stringField(body: Record<string, unknown>, name: string, maxLength = 200): string {
  const value = body[name];
  if (typeof value !== 'string' || value.length > maxLength) throw new HttpError(400, `"${name}" must be text of at most ${maxLength} characters.`);
  return value;
}

/** Reads a whole-number field from a request body, or throws a 400. */
export function intField(body: Record<string, unknown>, name: string, min: number, max: number): number {
  const value = body[name];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `"${name}" must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

/** A random id of `bytes` random bytes, as hex. */
export function randomHex(ctx: ServerContext, bytes: number): string {
  let out = '';
  while (out.length < bytes * 2) out += ctx.random().toString(16).padStart(8, '0');
  return out.slice(0, bytes * 2);
}
