/**
 * The game server: one function from a web Request to a Response. It runs as a Netlify Function
 * online, in Vite's dev and preview servers, and in the browser when no server is reachable.
 */
import './account';
import './base';
import './capture';
import './raids';
import { authenticate } from './players';
import { HttpError, findRoute, type ServerContext } from './router';

export type { ServerContext, Store } from './router';

/** Largest request body accepted, bytes. */
export const MAX_BODY_BYTES = 256 * 1024;

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method === 'GET') return {};
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new HttpError(400, 'That request is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(400, 'That request is too large.');
  if (text.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'That request is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'The request body must be a JSON object.');
  return parsed as Record<string, unknown>;
}

export async function handle(request: Request, ctx: ServerContext): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api/, '') || '/';
    const found = findRoute(request.method, path);
    if (!found) return json(404, { error: 'There is nothing here.' });
    const body = await readBody(request);
    const profile = found.route.auth ? await authenticate(ctx, request.headers.get('authorization')) : (null as never);
    const data = await found.route.handler({ ctx, body, params: found.params, profile });
    return json(200, data);
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message });
    console.error(error);
    return json(500, { error: 'The server lost its bearings. Try again.' });
  }
}
