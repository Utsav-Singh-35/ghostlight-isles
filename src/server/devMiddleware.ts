import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from './api';
import { MemoryStore } from './memoryStore';
import type { ServerContext } from './router';

/** Serves the game API from Vite's dev and preview servers, with a memory store. */
export function createDevApi(): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const ctx: ServerContext = {
    store: new MemoryStore(),
    now: () => Date.now(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
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
