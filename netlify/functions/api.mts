// The game server on Netlify: the shared handler with Netlify Blobs as its store.
// Netlify serves it at /api/* (see `config` below). No keys are needed: Blobs is built in.
import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { handle } from '../../src/server/api';
import type { ServerContext, Store } from '../../src/server/router';

function blobStore(): Store {
  const blobs = getStore({ name: 'ghostlight-isles', consistency: 'strong' });
  return {
    get: (key) => blobs.get(key, { type: 'text' }),
    set: async (key, value) => {
      await blobs.set(key, value);
    },
  };
}

export default async function api(request: Request): Promise<Response> {
  const ctx: ServerContext = {
    store: blobStore(),
    now: () => Date.now(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
  };
  return handle(request, ctx);
}

export const config: Config = { path: '/api/*' };
