import { Hono } from 'hono';
import { z } from 'zod';
import { inviteEmail } from '../email/templates.ts';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { adminClient } from '../lib/supabase.ts';

const createInvite = z.object({
  email: z.email().max(254),
  role: z.enum(['user', 'trusted']).default('user'),
  apps: z
    .array(z.string().regex(/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/))
    .max(50)
    .default([]),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
});

export function confirmUrl(
  portalUrl: string,
  tokenHash: string,
  type: string,
  next: string,
): string {
  const url = new URL('/auth/confirm', portalUrl);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  url.searchParams.set('next', next);
  return url.toString();
}

export const invites = new Hono<AppContext>();

// Admin + recent sign-in for everything below.
invites.use('*', requireUser({ role: 'admin', recentAuth: 600 }));

invites.post('/', async (c) => {
  const parsed = createInvite.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return problem(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  const input = parsed.data;
  const email = input.email.toLowerCase();
  const db = adminClient(c.env);
  const claims = c.get('claims');

  const { data: registered, error: lookupError } = await db
    .schema('platform')
    .rpc('email_registered', { p_email: email });
  if (lookupError) return problem(500, 'db_error', lookupError.message);
  if (registered === true) {
    return problem(409, 'user_exists', 'Zu dieser Adresse gibt es bereits einen Account.');
  }

  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const { data: invite, error: insertError } = await db
    .schema('platform')
    .from('invites')
    .insert({
      email,
      role: input.role,
      app_slugs: input.apps,
      created_by: claims.sub,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();
  if (insertError) {
    if (insertError.code === '23505')
      return problem(
        409,
        'invite_exists',
        'Für diese Adresse gibt es schon eine offene Einladung.',
      );
    return problem(500, 'db_error', insertError.message);
  }

  // Creates the (unconfirmed) user now; the platform trigger applies role and grants from the invite.
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${c.env.PORTAL_URL}/welcome` },
  });
  if (linkError) {
    await db
      .schema('platform')
      .from('invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invite.id);
    return problem(409, 'user_exists', 'Zu dieser Adresse gibt es bereits einen Account.');
  }

  const url = confirmUrl(c.env.PORTAL_URL, link.properties.hashed_token, 'invite', '/welcome');
  const { data: inviter } = await db
    .schema('platform')
    .from('profiles')
    .select('display_name')
    .eq('user_id', claims.sub)
    .single();
  const mail = inviteEmail({ inviterName: inviter?.display_name ?? 'Der Admin', url, expiresAt });

  let emailSent = false;
  if (c.env.EMAIL) {
    try {
      await c.env.EMAIL.send({
        from: { email: c.env.MAIL_FROM, name: 'MiniNode' },
        to: email,
        ...mail,
      });
      emailSent = true;
    } catch (error) {
      console.error(
        JSON.stringify({ event: 'invite_email_failed', inviteId: invite.id, error: String(error) }),
      );
    }
  }

  // The link is returned so the admin can also share it directly (e.g. via messenger).
  return c.json({ id: invite.id, link: url, emailSent, expiresAt: expiresAt.toISOString() }, 201);
});

invites.delete('/:id', async (c) => {
  const db = adminClient(c.env);
  const { data: invite, error } = await db
    .schema('platform')
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', c.req.param('id'))
    .is('revoked_at', null)
    .select('email, accepted_by')
    .maybeSingle();
  if (error) return problem(500, 'db_error', error.message);
  if (!invite) return problem(404, 'not_found', 'Einladung nicht gefunden.');

  // Remove the pre-created account if the person never signed in.
  if (invite.accepted_by) {
    const { data } = await db.auth.admin.getUserById(invite.accepted_by);
    if (data.user && !data.user.last_sign_in_at) await db.auth.admin.deleteUser(invite.accepted_by);
  }
  return c.body(null, 204);
});
