import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES } from './api';
import { testServer } from './testServer';

/** The name rule from the spec, written out independently of the server. */
const nameRule = (s: string): boolean => {
  const t = s.trim();
  return t.length >= 2 && t.length <= 20 && /^[\p{L}\p{N} '-]+$/u.test(t) && /\p{L}/u.test(t) && !/\s{2,}/.test(t);
};

const names = fc.oneof(
  fc.string({ maxLength: 30 }),
  fc.stringMatching(/^[A-Za-z][A-Za-z '-]{0,22}[a-z]$/),
  fc.constantFrom('Mara Vane', "O'Rourke", 'Bo', 'x', '  Spaced  Out  ', 'Émile Gris', '<script>', 'Ana-Lu 7', ''),
);

describe('persistence spec: the handler', () => {
  // Feature: persistence, Property 4. Validates: Requirements 1.2, 2.4
  it('Property 4: profiles round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000 }), fc.option(fc.constantFrom('Mara Vane', 'Bo', "Kit O'Hara"), { nil: undefined }), async (seed, name) => {
        const server = testServer(seed);
        const created = await server.call('POST', '/guest', name === undefined ? {} : { name });
        expect(created.status).toBe(200);
        const again = await server.call('GET', '/profile', undefined, created.data.token);
        expect(again.status).toBe(200);
        expect(again.data.profile).toEqual(created.data.profile);
        for (const text of [created.text, again.text]) expect(text).not.toContain('tokenHash');
        if (name) expect(created.data.profile.name).toBe(name);
      }),
      { numRuns: 40 },
    );
  });

  // Feature: persistence, Property 5. Validates: Requirement 2.2
  it('Property 5: wrong tokens change nothing', async () => {
    const badTokens = fc.oneof(
      fc.string({ maxLength: 60 }),
      fc.stringMatching(/^[0-9a-f]{16}$/).map((id: string) => `${id}.${'0'.repeat(32)}`),
      fc.constantFrom('', '.', 'abc.def', `${'a'.repeat(16)}.${'b'.repeat(32)}.extra`),
    );
    await fc.assert(
      fc.asyncProperty(badTokens, async (token) => {
        const server = testServer(7);
        const { token: real } = await server.guest();
        // A real captain's id with a wrong secret must fail too.
        const forged = `${real.split('.')[0]}.${'f'.repeat(32)}`;
        const before = server.store.snapshot();
        for (const t of [token, forged]) {
          for (const [method, path] of [['GET', '/profile'], ['POST', '/rename'], ['POST', '/collect']] as const) {
            const response = await server.call(method, path, { name: 'Hacker' }, t || null);
            expect(response.status).toBe(401);
          }
        }
        expect(server.store.snapshot()).toEqual(before);
      }),
      { numRuns: 60 },
    );
  });

  // Feature: persistence, Property 6. Validates: Requirement 1.4
  it('Property 6: names are validated', async () => {
    const server = testServer(3);
    const { token } = await server.guest();
    await fc.assert(
      fc.asyncProperty(names, async (name) => {
        const response = await server.call('POST', '/rename', { name }, token);
        expect(response.status === 200).toBe(nameRule(name));
        if (response.status === 200) expect(response.data.profile.name).toBe(name.trim());
      }),
      { numRuns: 200 },
    );
  });

  describe('examples', () => {
    it('answers health checks, unknown routes, bad JSON and oversized bodies', async () => {
      const server = testServer();
      expect((await server.call('GET', '/health')).data.ok).toBe(true);
      expect((await server.call('GET', '/nowhere')).status).toBe(404);
      expect((await server.call('POST', '/guest', '{not json')).status).toBe(400);
      expect((await server.call('POST', '/guest', '[1,2]')).status).toBe(400);
      expect((await server.call('POST', '/guest', JSON.stringify({ name: 'x'.repeat(MAX_BODY_BYTES) }))).status).toBe(400);
    });

    it('pays tribute for captured islands once per minute, up to the cap', async () => {
      const server = testServer();
      const { token } = await server.guest();
      // Capture two islands by editing the stored profile directly.
      const key = [...server.store.data.keys()].find((k) => k.startsWith('player:'))!;
      const stored = JSON.parse(server.store.data.get(key)!);
      server.store.data.set(key, JSON.stringify({ ...stored, captured: [1, 2] }));
      server.advance(5 * 60_000 + 30_000);
      const first = await server.call('POST', '/collect', {}, token);
      expect(first.data.gold).toBe(5 * 12 * 2);
      const second = await server.call('POST', '/collect', {}, token);
      expect(second.data.gold).toBe(0);
    });
  });
});
