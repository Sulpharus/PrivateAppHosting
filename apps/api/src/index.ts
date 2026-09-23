import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { ApiEnv } from './env.ts';
import { type AppContext, problem, requireUser } from './lib/auth.ts';
import { adminClient } from './lib/supabase.ts';
import { hooks } from './routes/hooks.ts';
import { confirmUrl, invites } from './routes/invites.ts';
import { controlHeaders, remote } from './routes/remote.ts';

export const app = new Hono<AppContext>();

// Browsers call the API from the portal and from hosted apps on *.mininode.app.
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const portal = new URL(c.env.PORTAL_URL);
      try {
        const url = new URL(origin);
        const ok =
          url.protocol === portal.protocol &&
          (url.hostname === portal.hostname || url.hostname.endsWith(`.${portal.hostname}`));
        return ok ? origin : null;
      } catch {
        return null;
      }
    },
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'DELETE'],
    maxAge: 600,
  }),
);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/hooks', hooks);
app.route('/invites', invites);
app.route('/remote', remote);

app.delete('/admin/users/:id', requireUser({ role: 'admin', recentAuth: 600 }), async (c) => {
  const id = c.req.param('id');
  if (id === c.get('claims').sub)
    return problem(400, 'invalid_request', 'Du kannst dich nicht selbst löschen.');
  const { error } = await adminClient(c.env).auth.admin.deleteUser(id);
  if (error) return problem(500, 'auth_error', error.message);
  return c.body(null, 204);
});

// Password reset without email: the admin creates a one-time link and shares it directly.
app.post(
  '/admin/users/:id/recovery-link',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) return problem(400, 'invalid_request', 'Ungültige Nutzer-ID.');
    const actor = c.get('claims').sub;
    if (id.data === actor)
      return problem(
        400,
        'invalid_request',
        'Dein eigenes Passwort änderst du unter „Dein Konto“.',
      );
    const db = adminClient(c.env);
    const { data: found, error: userError } = await db.auth.admin.getUserById(id.data);
    if (userError || !found.user?.email) return problem(404, 'not_found', 'Nutzer nicht gefunden.');
    // Audit first: no link leaves the API without a record of who created it.
    const { error: auditError } = await db
      .schema('platform')
      .from('audit_log')
      .insert({ actor_id: actor, action: 'user.recovery_link', detail: { user_id: id.data } });
    if (auditError) return problem(500, 'db_error', auditError.message);
    const { data: link, error } = await db.auth.admin.generateLink({
      type: 'recovery',
      email: found.user.email,
    });
    if (error) return problem(500, 'auth_error', error.message);
    return c.json({
      link: confirmUrl(
        c.env.PORTAL_URL,
        link.properties.hashed_token,
        'recovery',
        '/account?reset=1',
      ),
    });
  },
);

app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'unhandled', path: c.req.path, error: String(error) }));
  return problem(500, 'internal', 'Unerwarteter Fehler.');
});

/**
 * Every 5 minutes: expire idle remote sessions, release stale AI reservations, tell the NucBox
 * which runtimes are still needed, and touch the database so the free project never pauses.
 */
export async function maintenance(env: ApiEnv): Promise<void> {
  const db = adminClient(env);
  const [expired, released, active] = await Promise.all([
    db.schema('platform').rpc('remote_expire_idle', { p_idle: '15 minutes' }),
    db.schema('platform').rpc('ai_release_stale', { p_older_than: '15 minutes' }),
    db.schema('platform').from('remote_sessions').select('app_slug').eq('status', 'active'),
  ]);
  for (const result of [expired, released, active]) {
    if (result.error) throw new Error(result.error.message);
  }

  const activeApps = [...new Set((active.data ?? []).map((row) => row.app_slug as string))];
  const sync = await fetch(`${env.NUCBOX_CONTROL_URL}/sessions/sync`, {
    method: 'POST',
    headers: controlHeaders(env),
    body: JSON.stringify({ activeApps }),
  }).catch((error: unknown) => error);
  if (sync instanceof Error || (sync instanceof Response && !sync.ok)) {
    console.warn(JSON.stringify({ event: 'nucbox_sync_failed', error: String(sync) }));
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(maintenance(env));
  },
} satisfies ExportedHandler<ApiEnv>;
