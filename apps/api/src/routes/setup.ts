import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem } from '../lib/auth.ts';
import { adminClient } from '../lib/supabase.ts';

const claim = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(200),
});

/**
 * First-run setup (ADR 0027): while nobody has an account, anyone who reaches the portal may
 * create the first one, and it becomes the admin. Both routes are public and close for good as
 * soon as a profile exists.
 */
export const setup = new Hono<AppContext>();

setup.get('/', async (c) => {
  const { data, error } = await adminClient(c.env).schema('platform').rpc('needs_setup');
  if (error) return problem(500, 'db_error', 'Der Setup-Status ist nicht lesbar.');
  return c.json({ open: data === true }, 200, { 'Cache-Control': 'no-store' });
});

setup.post('/', async (c) => {
  const parsed = claim.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return problem(
      400,
      'invalid_request',
      'Bitte eine gültige E-Mail-Adresse und ein Passwort mit mindestens 12 Zeichen angeben.',
    );
  }
  const db = adminClient(c.env);
  const closed = () => problem(409, 'setup_closed', 'Die Einrichtung ist bereits abgeschlossen.');

  const { data: open, error: statusError } = await db.schema('platform').rpc('needs_setup');
  if (statusError) return problem(500, 'db_error', 'Der Setup-Status ist nicht lesbar.');
  if (open !== true) return closed();

  const { data: created, error } = await db.auth.admin.createUser({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !created.user) {
    return problem(500, 'auth_error', 'Der Account konnte nicht angelegt werden.');
  }

  // Two people claiming at once: the database gives the admin role to exactly one of them.
  // Only an account that is known to have lost is removed; an unreadable profile removes nothing.
  const { data: profile, error: profileError } = await db
    .schema('platform')
    .from('profiles')
    .select('role')
    .eq('user_id', created.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return problem(500, 'db_error', 'Der Account wurde angelegt, die Rolle ist nicht lesbar.');
  }
  if (profile.role !== 'admin') {
    const { error: removeError } = await db.auth.admin.deleteUser(created.user.id);
    if (removeError) {
      return problem(
        500,
        'auth_error',
        'Die Einrichtung war schon abgeschlossen; Aufräumen schlug fehl.',
      );
    }
    return closed();
  }
  await db
    .schema('platform')
    .from('audit_log')
    .insert({ actor_id: created.user.id, action: 'setup.completed', detail: {} });
  return c.json({ ok: true }, 201);
});
