// Uninstalling a hosted app from Verwaltung → Apps → Löschen (ADR 0020). The work is done by the
// uninstall-app.yml workflow (Worker, data, code); the API checks the request, starts it and takes
// the app offline right away.
//   POST /admin/apps/:slug/uninstall   admin + recent sign-in; { purge, confirm } → 202
//     confirm must be the slug again (a typed confirmation, not a click)
//     purge    true: the data goes too (schema, files, logo, registry entry); false: offline only

import { RESERVED_SLUGS, slugSchema } from '@mininode/manifest';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { dispatchWorkflow } from '../lib/github.ts';
import { adminClient } from '../lib/supabase.ts';

export const uninstall = new Hono<AppContext>();

const requestSchema = z.object({ purge: z.boolean(), confirm: z.string().max(64) }).strict();

uninstall.post(
  '/admin/apps/:slug/uninstall',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const slug = slugSchema.safeParse(c.req.param('slug'));
    if (!slug.success || (RESERVED_SLUGS as readonly string[]).includes(slug.data))
      return problem(404, 'not_found', 'Diese App gibt es nicht.');
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return problem(400, 'invalid_request', 'Ungültige Anfrage.');
    if (parsed.data.confirm !== slug.data)
      return problem(
        400,
        'not_confirmed',
        'Zur Bestätigung musst du die Adresse der App eintippen.',
      );

    const db = adminClient(c.env);
    const { data: app, error } = await db
      .schema('platform')
      .from('apps')
      .select('slug, kind, manifest')
      .eq('slug', slug.data)
      .maybeSingle();
    if (error) return problem(500, 'db_error', error.message);
    if (!app) return problem(404, 'not_found', 'Diese App gibt es nicht.');
    if (app.kind === 'link')
      return problem(400, 'is_link', 'Link-Kacheln entfernst du mit „Entfernen“.');

    const environment =
      new URL(c.env.PORTAL_URL).hostname === 'mininode.app' ? 'production' : 'staging';
    const library = (app.manifest as { library?: string } | null)?.library;

    // A program from the App-Bibliothek runs on the NucBox: that workflow stops it there.
    if (library) {
      const stopped = await dispatchWorkflow(c.env, 'library.yml', {
        action: 'remove',
        entry: library,
        slug: slug.data,
        environment,
      });
      if (stopped instanceof Response) return stopped;
    }
    const started = await dispatchWorkflow(c.env, 'uninstall-app.yml', {
      slug: slug.data,
      purge: String(parsed.data.purge),
      environment,
    });
    if (started instanceof Response) return started;

    // Offline at once; the workflow does the rest and can be repeated.
    const { error: disableError } = await db
      .schema('platform')
      .from('apps')
      .update({ status: 'disabled' })
      .eq('slug', slug.data);
    if (disableError) console.error(`disabling ${slug.data} failed: ${disableError.message}`);

    const { error: auditError } = await db
      .schema('platform')
      .from('audit_log')
      .insert({
        actor_id: c.get('claims').sub,
        app_slug: slug.data,
        action: 'app.uninstall_started',
        detail: { purge: parsed.data.purge, kind: app.kind, library: library ?? null },
      });
    // The workflow already runs; a missing audit row must not turn that into an error.
    if (auditError)
      console.error(`audit of the uninstall of ${slug.data} failed: ${auditError.message}`);

    return c.json(
      {
        started: true,
        runs: started.runs,
        // What no workflow can do for the owner.
        manual:
          app.kind === 'remote'
            ? 'Das Programm bleibt auf der Windows-VM installiert. Deinstalliere es dort, wenn du es nicht mehr brauchst.'
            : library
              ? 'Der Container wird auf der NucBox gestoppt; sein Datenordner dort bleibt liegen, bis du ihn selbst löschst (runbooks/uninstall.md).'
              : null,
      },
      202,
    );
  },
);
