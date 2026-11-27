import { buildDefense, removeDefense, upgradeDefense, upgradeHome, upgradeShip, type CommandResult } from '../sim/base';
import { publicProfile, type Profile } from '../sim/profile';
import { saveProfile } from './players';
import { HttpError, route, type ServerContext } from './router';

/** Saves a successful command, or answers 400 with the reason it was refused. */
async function commit(ctx: ServerContext, result: CommandResult): Promise<{ profile: ReturnType<typeof publicProfile> }> {
  if (!result.ok) throw new HttpError(400, result.reason);
  const profile: Profile = result.profile;
  await saveProfile(ctx, profile);
  return { profile: publicProfile(profile) };
}

const slotOf = (body: Record<string, unknown>) => (typeof body.slot === 'number' ? body.slot : Number.NaN);

route('POST', '/base/build', true, async ({ ctx, body, profile }) => commit(ctx, buildDefense(profile, body.type, slotOf(body))));
route('POST', '/base/upgrade', true, async ({ ctx, body, profile }) => commit(ctx, upgradeDefense(profile, body.type, slotOf(body))));
route('POST', '/base/remove', true, async ({ ctx, body, profile }) => commit(ctx, removeDefense(profile, body.type, slotOf(body))));
route('POST', '/base/home', true, async ({ ctx, profile }) => commit(ctx, upgradeHome(profile)));
route('POST', '/ship/upgrade', true, async ({ ctx, body, profile }) => commit(ctx, upgradeShip(profile, body.part)));
