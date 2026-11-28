import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { signToken } from './credentials';
import { hashSecret, readIndex } from './players';
import { createProfile } from '../sim/profile';
import { TEST_JWT_SECRET, testServer, type TestServer } from './testServer';

/** The rules from the spec, written out independently of the server. */
const usernameRule = (u: string) => /^[A-Za-z][A-Za-z0-9_]{2,15}$/.test(u);
/** Well-formed text: every UTF-16 surrogate is part of a pair. */
const wellFormed = (p: string) => encodeURIComponentSafe(p);
function encodeURIComponentSafe(p: string): boolean {
  try {
    encodeURIComponent(p);
    return true;
  } catch {
    return false;
  }
}
const passwordRule = (p: string) => p.length >= 8 && p.length <= 72 && wellFormed(p);

/** Password hashing makes these slower than most tests, so they get room when the whole suite runs at once. */
const SLOW = 60_000;

const SECRET_WORDS = ['passwordHash', 'credentials', 'tokenHash', 'tokenVersion'];

async function registered(server: TestServer, username: string, password: string) {
  const guest = await server.guest();
  const reg = await server.call('POST', '/register', { username, password }, guest.token);
  expect(reg.status).toBe(200);
  return { guest, token: reg.data.token as string, profile: reg.data.profile };
}

/** Flips the case of every other letter: `mara_vane` → `MaRa_VaNe`. */
const mixCase = (s: string) => [...s].map((c, i) => (i % 2 ? c.toLowerCase() : c.toUpperCase())).join('');

describe('accounts spec: the handler', () => {
  // Feature: accounts, Property 1. Validates: Requirements 1.2, 1.3
  it('Property 1: usernames are unique, ignoring case', async () => {
    const pool = ['Mara_Vane', 'mara_vane', 'MARA_VANE', 'Kit_Reed', 'kit_REED', 'Bo3'];
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom(...pool), { minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 9999 }), async (names, seed) => {
        const server = testServer(seed);
        const holders = new Map<string, string>();
        for (const username of names) {
          const guest = await server.guest();
          const before = server.store.snapshot();
          const reg = await server.call('POST', '/register', { username, password: 'lanterns-lit' }, guest.token);
          if (holders.has(username.toLowerCase())) {
            expect(reg.status).toBe(409);
            expect(server.store.snapshot()).toEqual(before);
          } else {
            expect(reg.status).toBe(200);
            holders.set(username.toLowerCase(), reg.data.profile.id);
          }
        }
        const claims = [...server.store.data.keys()].filter((k) => k.startsWith('user:'));
        expect(claims.length).toBe(holders.size);
        for (const key of claims) expect(JSON.parse(server.store.data.get(key)!).id).toBe(holders.get(key.slice(5)));
      }),
      { numRuns: 60 },
    );
  }, SLOW);

  // Feature: accounts, Property 2. Validates: Requirement 1.1
  it('Property 2: usernames and passwords are validated', async () => {
    const usernames = fc.oneof(fc.string({ maxLength: 20 }), fc.stringMatching(/^[A-Za-z0-9_]{1,18}$/), fc.constantFrom('ab', 'abc', '1abc', '_abc', 'a'.repeat(16), 'a'.repeat(17), 'Émile', 'kit reed'));
    const passwords = fc.oneof(fc.string({ maxLength: 80 }), fc.constantFrom('1234567', '12345678', 'x'.repeat(72), 'x'.repeat(73)));
    await fc.assert(
      fc.asyncProperty(usernames, passwords, async (username, password) => {
        const server = testServer(5);
        const { token } = await server.guest();
        const reg = await server.call('POST', '/register', { username, password }, token);
        expect(reg.status === 200).toBe(usernameRule(username) && passwordRule(password));
        if (reg.status !== 200) expect(reg.status).toBe(400);
      }),
      { numRuns: 200 },
    );
  }, SLOW);

  // Feature: accounts, Property 3. Validates: Requirement 1.4
  it('Property 3: registering keeps progress', async () => {
    const progress = fc.record({
      gold: fc.integer({ min: 0, max: 3000 }),
      ectoplasm: fc.integer({ min: 0, max: 300 }),
      captured: fc.uniqueArray(fc.integer({ min: 1, max: 13 }), { maxLength: 6 }),
      infamy: fc.integer({ min: 0, max: 5000 }),
      homeLevel: fc.constantFrom(1, 2, 3),
    });
    await fc.assert(
      fc.asyncProperty(progress, async (p) => {
        const server = testServer(9);
        const guest = await server.guest();
        const key = `player:${guest.profile.id}`;
        const stored = JSON.parse(server.store.data.get(key)!);
        server.store.data.set(key, JSON.stringify({ ...stored, resources: { ...stored.resources, gold: p.gold, ectoplasm: p.ectoplasm }, captured: p.captured, infamy: p.infamy, homeLevel: p.homeLevel }));
        const before = (await server.call('GET', '/profile', undefined, guest.token)).data.profile;
        const reg = await server.call('POST', '/register', { username: 'Salt_Eye', password: 'a-long-night' }, guest.token);
        expect(reg.status).toBe(200);
        expect(reg.data.profile).toEqual({ ...before, username: 'Salt_Eye', name: 'Salt_Eye' });
      }),
      { numRuns: 60 },
    );
  }, SLOW);

  // Feature: accounts, Property 4. Validates: Requirements 2.1, 2.2
  it('Property 4: only the right password logs in', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 8, maxLength: 40 }), fc.string({ maxLength: 40 }), async (password, other) => {
        fc.pre(password !== other);
        const server = testServer(11);
        const { profile } = await registered(server, 'Grim_Wick', password);
        const wrong = await server.call('POST', '/login', { username: 'Grim_Wick', password: other });
        expect(wrong.status).toBe(401);
        expect(wrong.data.token).toBeUndefined();
        const right = await server.call('POST', '/login', { username: mixCase('grim_wick'), password });
        expect(right.status).toBe(200);
        expect(right.data.profile.id).toBe(profile.id);
        expect((await server.call('GET', '/profile', undefined, right.data.token)).data.profile.id).toBe(profile.id);
      }),
      { numRuns: 60 },
    );
  }, SLOW);

  // Feature: accounts, Property 5. Validates: Requirement 3.3
  it('Property 5: altered tokens are refused', async () => {
    const server = testServer(13);
    const { token, profile } = await registered(server, 'Rook_Tide', 'harbour-lights');
    const other = await registered(server, 'Pale_Gull', 'harbour-lights');
    const [header, payload] = token.split('.') as [string, string, string];
    const otherSignature = other.token.split('.')[2]!;
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const forged = [
      await signToken('some-other-secret-that-is-long-enough-0123456789', profile.id, 1, server.ctx.now()),
      `${b64({ alg: 'none', typ: 'JWT' })}.${payload}.`,
      `${header}.${other.token.split('.')[1]}.${token.split('.')[2]}`,
      `${header}.${payload}.${otherSignature}`,
      await signToken(TEST_JWT_SECRET, profile.id, 0, server.ctx.now()),
    ];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.';
    await fc.assert(
      fc.asyncProperty(fc.nat(token.length - 1), fc.constantFrom(...alphabet), fc.nat(forged.length - 1), async (at, ch, pick) => {
        fc.pre(token[at] !== ch);
        const before = server.store.snapshot();
        for (const t of [token.slice(0, at) + ch + token.slice(at + 1), forged[pick]!]) {
          for (const [method, path] of [['GET', '/profile'], ['POST', '/collect'], ['POST', '/register']] as const) {
            expect((await server.call(method, path, { username: 'Thief_99', password: 'stolen-keys' }, t)).status).toBe(401);
          }
        }
        expect(server.store.snapshot()).toEqual(before);
      }),
      { numRuns: 200 },
    );
    // And an honest token stops working once it expires.
    server.advance(31 * 86_400_000);
    expect((await server.call('GET', '/profile', undefined, token)).status).toBe(401);
  }, SLOW);

  // Feature: accounts, Property 6. Validates: Requirements 3.1, 3.2
  it('Property 6: no secret leaves the server', async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[A-Za-z0-9!#%&*+=?@^~-]{6,30}$/), async (tail) => {
        const password = `pw!${tail}`;
        const server = testServer(17);
        const guest = await server.guest();
        const texts = [(await server.call('POST', '/register', { username: 'Moth_Bell', password }, guest.token)).text];
        const login = await server.call('POST', '/login', { username: 'moth_bell', password });
        texts.push(login.text, (await server.call('GET', '/profile', undefined, login.data.token)).text);
        texts.push((await server.call('GET', '/raids/targets', undefined, login.data.token)).text);
        texts.push((await server.call('GET', '/leaderboard', undefined, login.data.token)).text);
        for (const text of texts) {
          expect(text).not.toContain(password);
          for (const word of SECRET_WORDS) expect(text).not.toContain(word);
        }
        for (const value of server.store.data.values()) expect(value).not.toContain(password);
      }),
      { numRuns: 40 },
    );
  }, SLOW);

  describe('examples', () => {
    it('locks a username after 5 wrong passwords, for 15 minutes', async () => {
      const server = testServer(19);
      await registered(server, 'Storm_Crow', 'right-password');
      for (let i = 0; i < 5; i++) expect((await server.call('POST', '/login', { username: 'Storm_Crow', password: 'wrong-password' })).status).toBe(401);
      expect((await server.call('POST', '/login', { username: 'Storm_Crow', password: 'right-password' })).status).toBe(429);
      server.advance(15 * 60_000 + 1000);
      expect((await server.call('POST', '/login', { username: 'Storm_Crow', password: 'right-password' })).status).toBe(200);
    });

    it('forgets old failures after the window and clears them on a success', async () => {
      const server = testServer(23);
      await registered(server, 'Wren_Vane', 'right-password');
      for (let i = 0; i < 4; i++) await server.call('POST', '/login', { username: 'Wren_Vane', password: 'nope-nope' });
      server.advance(16 * 60_000);
      for (let i = 0; i < 4; i++) await server.call('POST', '/login', { username: 'Wren_Vane', password: 'nope-nope' });
      expect((await server.call('POST', '/login', { username: 'Wren_Vane', password: 'right-password' })).status).toBe(200);
    });

    it('refuses a second registration and renaming a registered captain', async () => {
      const server = testServer(29);
      const { token } = await registered(server, 'Bonny_Reed', 'lantern-oil');
      expect((await server.call('POST', '/register', { username: 'Other_Name', password: 'lantern-oil' }, token)).status).toBe(400);
      expect((await server.call('POST', '/rename', { name: 'Someone Else' }, token)).status).toBe(400);
      expect([...server.store.data.keys()].filter((k) => k.startsWith('user:'))).toEqual(['user:bonny_reed']);
    });

    it('treats unknown usernames like wrong passwords', async () => {
      const server = testServer(31);
      const unknown = await server.call('POST', '/login', { username: 'Nobody_Here', password: 'whatever-it-is' });
      const bad = await server.call('POST', '/login', { username: '!!', password: 'x' });
      expect(unknown.status).toBe(401);
      expect(bad.status).toBe(401);
      expect(unknown.data.error).toBe(bad.data.error);
    });

    it('keeps old guest tokens working until the guest registers', async () => {
      const server = testServer(37);
      const id = '0123456789abcdef';
      const secret = 'f'.repeat(32);
      server.store.data.set(`player:${id}`, JSON.stringify(createProfile(id, 'Old Salt', await hashSecret(secret), server.ctx.now())));
      const legacy = `${id}.${secret}`;
      expect((await server.call('GET', '/profile', undefined, legacy)).status).toBe(200);
      const reg = await server.call('POST', '/register', { username: 'Old_Salt', password: 'seven-seas' }, legacy);
      expect(reg.status).toBe(200);
      expect((await server.call('GET', '/profile', undefined, legacy)).status).toBe(401);
      expect((await server.call('GET', '/profile', undefined, reg.data.token)).status).toBe(200);
    });

    it("retires a guest's tokens when they register", async () => {
      const server = testServer(41);
      const guest = await server.guest();
      const reg = await server.call('POST', '/register', { username: 'Ashen_Fenn', password: 'cold-moon' }, guest.token);
      expect((await server.call('GET', '/profile', undefined, guest.token)).status).toBe(401);
      expect((await server.call('GET', '/profile', undefined, reg.data.token)).status).toBe(200);
    });

    it('keeps both leaderboard entries when two captains save at once', async () => {
      const server = testServer(43);
      const a = await server.guest();
      const b = await server.guest();
      await Promise.all([
        server.call('POST', '/rename', { name: 'Captain A' }, a.token),
        server.call('POST', '/rename', { name: 'Captain B' }, b.token),
      ]);
      const index = await readIndex(server.store);
      expect(index[a.profile.id]?.name).toBe('Captain A');
      expect(index[b.profile.id]?.name).toBe('Captain B');
    });

    it('still reads leaderboard entries saved in the old single index record', async () => {
      const server = testServer(47);
      const entry = { id: 'aaaaaaaaaaaaaaaa', name: 'Old Timer', infamy: 9, homeLevel: 1, protectedUntil: 0, rating: 3, updatedAt: 0 };
      server.store.data.set('index', JSON.stringify({ [entry.id]: entry }));
      expect((await readIndex(server.store))[entry.id]?.name).toBe('Old Timer');
    });
  });
});
