// The game server on Netlify: the shared handler with MongoDB as its store.
// Netlify serves it at /api/* (see `config` below). It needs MONGODB_URI and JWT_SECRET set in the
// site's environment variables (MONGODB_DB is optional, default "ghostlight"). Without them the health
// check fails and the game plays on the device instead of running with unsafe defaults.
import type { Config } from '@netlify/functions';
import { handle } from '../../src/server/api';
import type { ServerContext } from '../../src/server/router';
import { MongoStore } from '../../src/storage/mongoStore';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

let store: MongoStore | null = null;

export default async function api(request: Request): Promise<Response> {
  const uri = process.env.MONGODB_URI;
  const jwtSecret = process.env.JWT_SECRET;
  if (!uri || !jwtSecret || jwtSecret.length < 32) {
    console.error('The game server needs MONGODB_URI and a JWT_SECRET of at least 32 characters.');
    return new Response(JSON.stringify({ ok: false, error: 'The game server is not set up yet.' }), { status: 503, headers: JSON_HEADERS });
  }
  store ??= new MongoStore(uri, process.env.MONGODB_DB || 'ghostlight');
  const ctx: ServerContext = {
    store,
    now: () => Date.now(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
    jwtSecret,
  };
  return handle(request, ctx);
}

export const config: Config = { path: '/api/*' };
