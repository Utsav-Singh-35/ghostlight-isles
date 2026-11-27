import { ECONOMY } from '../sim/balance';
import { collectTribute, completeCleanse, createProfile, publicProfile } from '../sim/profile';
import { hashSecret, saveProfile } from './players';
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

function generatedName(ctx: ServerContext): string {
  const r = ctx.random();
  return `${FIRST[r % FIRST.length]} ${LAST[(r >>> 8) % LAST.length]}`;
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
  const secret = randomHex(ctx, 16);
  const profile = createProfile(id, name, await hashSecret(secret), ctx.now());
  await saveProfile(ctx, profile);
  return { token: `${id}.${secret}`, profile: publicProfile(profile) };
});

route('GET', '/profile', true, async ({ ctx, profile }) => ({ profile: publicProfile(profile), now: ctx.now() }));

route('POST', '/rename', true, async ({ ctx, body, profile }) => {
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
