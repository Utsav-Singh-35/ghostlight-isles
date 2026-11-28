import { handle } from '../server/api';
import type { ServerContext } from '../server/router';
import { LocalStore } from './localStore';

/** An error from the game server, with a message that is safe to show. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Backend {
  /** 'online' talks to the Netlify Function; 'offline' runs the same handler in this browser. */
  readonly kind: 'online' | 'offline';
  request<T>(method: 'GET' | 'POST', path: string, body: unknown, token: string | null): Promise<T>;
}

async function parse<T>(response: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Fall through to the status check.
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : `The server answered ${response.status}.`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

function headers(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

class OnlineBackend implements Backend {
  readonly kind = 'online' as const;

  async request<T>(method: 'GET' | 'POST', path: string, body: unknown, token: string | null): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method,
      headers: headers(token),
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    return parse<T>(response);
  }
}

const OFFLINE_SECRET_KEY = 'ghostlight.offlineSecret';

/** The key that signs offline tokens. They only ever meet this browser's own handler, so it stays on the device. */
function offlineSecret(): string {
  try {
    const saved = window.localStorage.getItem(OFFLINE_SECRET_KEY);
    if (saved && saved.length >= 32) return saved;
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    window.localStorage.setItem(OFFLINE_SECRET_KEY, fresh);
    return fresh;
  } catch {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

class OfflineBackend implements Backend {
  readonly kind = 'offline' as const;
  private readonly ctx: ServerContext = {
    store: new LocalStore(),
    now: () => Date.now(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
    jwtSecret: offlineSecret(),
    // A phone hashing 600,000 rounds would stall the page; offline accounts never leave the device.
    passwordIterations: 100_000,
  };

  async request<T>(method: 'GET' | 'POST', path: string, body: unknown, token: string | null): Promise<T> {
    const request = new Request(`${window.location.origin}/api${path}`, {
      method,
      headers: headers(token),
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    return parse<T>(await handle(request, this.ctx));
  }
}

/** Uses the server when /api/health answers quickly, otherwise plays offline in this browser. */
export async function connectBackend(forceOffline = false): Promise<Backend> {
  if (!forceOffline) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
      const data = (await response.json()) as { ok?: boolean };
      if (response.ok && data.ok === true) return new OnlineBackend();
    } catch {
      // No server: play offline.
    } finally {
      window.clearTimeout(timer);
    }
  }
  return new OfflineBackend();
}
