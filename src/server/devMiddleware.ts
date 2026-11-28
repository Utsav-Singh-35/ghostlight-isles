import type { IncomingMessage, ServerResponse } from 'node:http';
import { MongoStore } from '../storage/mongoStore';
import { handle } from './api';
import { MemoryStore } from './memoryStore';
import type { ServerContext, Store } from './router';

export interface DevApiOptions {
  /** Use MongoDB at this address; memory when left out. */
  readonly mongoUri?: string;
  readonly mongoDb?: string;
  /** Signs tokens; a random per-process key when left out (logins then last until the server restarts). */
  readonly jwtSecret?: string;
}

function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Serves the game API from Vite's dev and preview servers. */
export function createDevApi(options: DevApiOptions = {}): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const store: Store = options.mongoUri ? new MongoStore(options.mongoUri, options.mongoDb || 'ghostlight') : new MemoryStore();
  const ctx: ServerContext = {
    store,
    now: () => Date.now(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
    jwtSecret: options.jwtSecret && options.jwtSecret.length >= 32 ? options.jwtSecret : randomSecret(),
  };
  return (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/')) {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
      }
      const method = req.method ?? 'GET';
      const request = new Request(`http://localhost${req.url}`, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
      const response = await handle(request, ctx);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    });
  };
}
