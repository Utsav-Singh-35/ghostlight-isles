import { ACCOUNTS, ECONOMY } from '../sim/balance';
import { collectTribute, completeCleanse, createProfile, publicProfile, type Profile } from '../sim/profile';
import { hashPassword, signToken, verifyPassword } from './credentials';
import { loadProfile, saveProfile, tokenVersionOf, usernameKey } from './players';
import { HttpError, randomHex, route, stringField, type ServerContext } from './router';

const FIRST = ['Ashen', 'Salt-Eye', 'Grim', 'Lantern', 'Hollow', 'Bonny', 'Black', 'Pale', 'Storm', 'Rook', 'Cinder', 'Fog', 'Moth', 'Wren'];
const LAST = ['Gull', 'Marrow', 'Wick', 'Harrow', 'Tide', 'Crow', 'Bell', 'Spratt', 'Fenn', 'Brine', 'Vane', 'Kettle', 'Bone', 'Reed'];

/** True for 2 to 20 letters, digits, spaces, apostrophes or hyphens, with at least one letter. */
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length >= ECONOMY.nameMinLength &&
    trimmed.length <= ECONOMY.nameMaxLength &&
    /^[\p{L}\p{N} '-]+$/u.test(trimmed) &&
    /\p{L}/u.test(trimmed) &&
    !/\s{2,}/.test(trimmed)
  );
}

const USERNAME = new RegExp(`^[A-Za-z][A-Za-z0-9_]{${ACCOUNTS.usernameMinLength - 1},${ACCOUNTS.usernameMaxLength - 1}}$`);

/** True for a username: 3 to 16 letters, digits or underscores, starting with a letter. */
export function isValidUsername(username: string): boolean {
  return USERNAME.test(username);
}

/** An unpaired UTF-16 surrogate. Encoding turns every one into the same character, so two passwords could hash alike. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** True for a password of 8 to 72 characters of well-formed text. */
export function isValidPassword(password: string): boolean {
  return password.length >= ACCOUNTS.passwordMinLength && password.length <= ACCOUNTS.passwordMaxLength && !LONE_SURROGATE.test(password);
}


const USERNAME_RULE = `Usernames use ${ACCOUNTS.usernameMinLength} to ${ACCOUNTS.usernameMaxLength} letters, numbers or underscores, and start with a letter.`;
const PASSWORD_RULE = `Passwords need ${ACCOUNTS.passwordMinLength} to ${ACCOUNTS.passwordMaxLength} characters.`;
const WRONG_LOGIN = 'Wrong username or password.';

function generatedName(ctx: ServerContext): string {
  const r = ctx.random();
  return `${FIRST[r % FIRST.length]} ${LAST[(r >>> 8) % LAST.length]}`;
}

function iterations(ctx: ServerContext): number {
  return ctx.passwordIterations ?? ACCOUNTS.passwordIterations;
}

/** A hash nobody's password matches, so an unknown username takes as long to refuse as a wrong password. */
const decoys = new Map<number, Promise<string>>();
function decoy(rounds: number): Promise<string> {
  let hash = decoys.get(rounds);
  if (!hash) {
    hash = hashPassword(crypto.getRandomValues(new Uint32Array(4)).join('-'), rounds);
    decoys.set(rounds, hash);
  }
  return hash;
}

async function answer(ctx: ServerContext, profile: Profile) {
  return { token: await signToken(ctx.jwtSecret, profile.id, tokenVersionOf(profile), ctx.now()), profile: publicProfile(profile) };
}

route('GET', '/health', false, async ({ ctx }) => ({ ok: true, now: ctx.now() }));

route('POST', '/guest', false, async ({ ctx, body }) => {
  let name = generatedName(ctx);
  if (body.name !== undefined) {
    const asked = stringField(body, 'name', 60);
    if (!isValidName(asked)) throw new HttpError(400, 'Names use 2 to 20 letters, numbers, spaces, apostrophes or hyphens.');
    name = asked.trim();
  }
  const id = randomHex(ctx, 8);
  // Guests sign in with a login token only; the empty hash means no pre-account guest token works.
  const profile = createProfile(id, name, '', ctx.now());
  await saveProfile(ctx, profile);
  return answer(ctx, profile);
});

route('POST', '/register', true, async ({ ctx, body, profile }) => {
  if (profile.credentials) throw new HttpError(400, `You already have the username ${profile.username}.`);
  const username = stringField(body, 'username', 200);
  const password = stringField(body, 'password', 200);
  if (!isValidUsername(username)) throw new HttpError(400, USERNAME_RULE);
  if (!isValidPassword(password)) throw new HttpError(400, PASSWORD_RULE);
  // Hash before claiming the name, so a failure here can't leave a name claimed by nobody.
  const passwordHash = await hashPassword(password, iterations(ctx));
  if (!(await ctx.store.create(usernameKey(username), JSON.stringify({ id: profile.id })))) {
    throw new HttpError(409, `The username ${username} is taken. Try another.`);
  }
  const next: Profile = {
    ...profile,
    username,
    name: username,
    credentials: { passwordHash, tokenVersion: tokenVersionOf(profile) + 1, failures: 0, windowStart: 0, lockedUntil: 0 },
  };
  await saveProfile(ctx, next);
  return answer(ctx, next);
});

route('POST', '/login', false, async ({ ctx, body }) => {
  const username = stringField(body, 'username', 200);
  const password = stringField(body, 'password', 200);
  const now = ctx.now();
  const claim = isValidUsername(username) ? await ctx.store.get(usernameKey(username)) : null;
  let id = '';
  try {
    id = claim ? String((JSON.parse(claim) as { id?: unknown }).id ?? '') : '';
  } catch {
    id = '';
  }
  const profile = id ? await loadProfile(ctx.store, id) : null;
  const credentials = profile?.credentials;
  if (!profile || !credentials) {
    await verifyPassword(password, await decoy(iterations(ctx)));
    throw new HttpError(401, WRONG_LOGIN);
  }
  if (credentials.lockedUntil > now) {
    const minutes = Math.ceil((credentials.lockedUntil - now) / 60_000);
    throw new HttpError(429, `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
  if (!isValidPassword(password) || !(await verifyPassword(password, credentials.passwordHash))) {
    const fresh = now - credentials.windowStart > ACCOUNTS.loginWindowMinutes * 60_000;
    const failures = (fresh ? 0 : credentials.failures) + 1;
    const locked = failures >= ACCOUNTS.maxLoginFailures;
    await saveProfile(ctx, {
      ...profile,
      credentials: {
        ...credentials,
        failures: locked ? 0 : failures,
        windowStart: fresh ? now : credentials.windowStart,
        lockedUntil: locked ? now + ACCOUNTS.lockoutMinutes * 60_000 : credentials.lockedUntil,
      },
    });
    throw new HttpError(401, WRONG_LOGIN);
  }
  const next = credentials.failures > 0 ? { ...profile, credentials: { ...credentials, failures: 0, windowStart: 0 } } : profile;
  if (next !== profile) await saveProfile(ctx, next);
  return answer(ctx, next);
});

route('GET', '/profile', true, async ({ ctx, profile }) => ({ profile: publicProfile(profile), now: ctx.now() }));

route('POST', '/rename', true, async ({ ctx, body, profile }) => {
  if (profile.username) throw new HttpError(400, 'Your name is your username, so it stays as it is.');
  const name = stringField(body, 'name', 60);
  if (!isValidName(name)) throw new HttpError(400, 'Names use 2 to 20 letters, numbers, spaces, apostrophes or hyphens.');
  const next = { ...profile, name: name.trim() };
  await saveProfile(ctx, next);
  return { profile: publicProfile(next) };
});

route('POST', '/collect', true, async ({ ctx, profile }) => {
  const tribute = collectTribute(profile, ctx.now());
  const chapel = completeCleanse(tribute.profile, ctx.now());
  await saveProfile(ctx, chapel.profile);
  return { profile: publicProfile(chapel.profile), gold: tribute.gold, cleansed: chapel.gold, now: ctx.now() };
});
