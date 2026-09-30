// App-Bibliothek (ADR 0011): the admin installs curated programs on the NucBox. The API only
// starts the GitHub workflow (library.yml); the NucBox reads the entry from main itself.
//   GET  /admin/library   admin → whether installs can be started
//   POST /admin/library   admin + recent sign-in → { action, entry, slug } starts the workflow

import { slugSchema } from '@mininode/manifest';
import { libraryEntry } from '@mininode/manifest/library';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { adminClient } from '../lib/supabase.ts';

export const library = new Hono<AppContext>();

const DEFAULT_REPO = 'Sulpharus/PrivateAppHosting';

const requestSchema = z
  .object({
    action: z.enum(['install', 'remove']),
    entry: z.string().max(40),
    slug: slugSchema,
  })
  .strict();

library.get('/admin/library', requireUser({ role: 'admin' }), (c) =>
  c.json({ configured: Boolean(c.env.GITHUB_DISPATCH_TOKEN) }, 200, {
    'Cache-Control': 'no-store',
  }),
);

library.post('/admin/library', requireUser({ role: 'admin', recentAuth: 600 }), async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return problem(
      400,
      'invalid_request',
      'Die Adresse braucht 2–32 Zeichen: Kleinbuchstaben, Ziffern und Bindestriche.',
    );
  const { action, entry: entryId, slug } = parsed.data;
  const entry = libraryEntry(entryId);
  if (!entry) return problem(404, 'not_found', 'Diesen Eintrag gibt es nicht in der Bibliothek.');
  const token = c.env.GITHUB_DISPATCH_TOKEN;
  if (!token)
    return problem(
      503,
      'not_configured',
      'Installationen sind noch nicht eingerichtet (GITHUB_DISPATCH_TOKEN fehlt).',
    );

  const db = adminClient(c.env);
  const { data: app, error } = await db
    .schema('platform')
    .from('apps')
    .select('slug, manifest')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return problem(500, 'db_error', error.message);
  const installedAs = (app?.manifest as { library?: string } | null | undefined)?.library;
  if (action === 'install' && app && installedAs !== entryId)
    return problem(409, 'slug_taken', `${slug} ist schon vergeben. Wähle eine andere Adresse.`);
  if (action === 'remove' && installedAs !== entryId)
    return problem(404, 'not_installed', `${entry.name} ist unter ${slug} nicht installiert.`);

  const repo = c.env.GITHUB_REPO ?? DEFAULT_REPO;
  const environment =
    new URL(c.env.PORTAL_URL).hostname === 'mininode.app' ? 'production' : 'staging';
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/library.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mininode-api',
      },
      body: JSON.stringify({ ref: 'main', inputs: { action, entry: entryId, slug, environment } }),
      signal: AbortSignal.timeout(15_000),
    },
  ).catch(() => null);
  if (!response) return problem(502, 'github_unavailable', 'GitHub ist gerade nicht erreichbar.');
  if (!response.ok)
    return problem(502, 'github_error', `GitHub hat den Start abgelehnt (${response.status}).`);

  await db
    .schema('platform')
    .from('audit_log')
    .insert({
      actor_id: c.get('claims').sub,
      app_slug: app ? slug : null,
      action: `library.${action}`,
      detail: { entry: entryId, slug, image: entry.image },
    });
  return c.json(
    { started: true, runs: `https://github.com/${repo}/actions/workflows/library.yml` },
    202,
  );
});
