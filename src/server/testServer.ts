import { createRng } from '../sim/rng';
import { handle } from './api';
import { MemoryStore } from './memoryStore';
import type { ServerContext } from './router';

export interface TestServer {
  readonly store: MemoryStore;
  readonly ctx: ServerContext;
  /** Moves the fake clock forward. */
  advance(ms: number): void;
  call(method: 'GET' | 'POST', path: string, body?: unknown, token?: string | null): Promise<{ status: number; data: any; text: string }>;
  /** Creates a guest and returns its token and profile. */
  guest(name?: string): Promise<{ token: string; profile: any }>;
}

/** A server with a memory store, a fake clock and reproducible random numbers. */
export function testServer(seed = 1, start = Date.UTC(2026, 10, 27, 12, 0, 0)): TestServer {
  const store = new MemoryStore();
  const rng = createRng(seed);
  let now = start;
  const ctx: ServerContext = { store, now: () => now, random: () => Math.floor(rng.next() * 4294967296) >>> 0 };
  const call: TestServer['call'] = async (method, path, body, token) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const request = new Request(`http://test/api${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body ?? {}),
    });
    const response = await handle(request, ctx);
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { status: response.status, data, text };
  };
  return {
    store,
    ctx,
    advance(ms) {
      now += ms;
    },
    call,
    async guest(name) {
      const { data } = await call('POST', '/guest', name === undefined ? {} : { name });
      return data;
    },
  };
}
