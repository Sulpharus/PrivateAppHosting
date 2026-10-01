// Apps as GitHub projects (ADR 0012): the admin exports one hosted app, without data or keys,
// as its own repository. The API only starts the export-app.yml workflow on main.
//   POST /admin/apps/:slug/export   admin + recent sign-in → { repo, visibility }

import { slugSchema } from '@mininode/manifest';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { dispatchWorkflow } from '../lib/github.ts';
import { adminClient } from '../lib/supabase.ts';

export const appExports = new Hono<AppContext>();

const requestSchema = z
  .object({
    repo: z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/, 'invalid repository name'),
    visibility: z.enum(['private', 'public']),
  })
  .strict();

appExports.post(
  '/admin/apps/:slug/export',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const slug = slugSchema.safeParse(c.req.param('slug'));
    if (!slug.success) return problem(404, 'not_found', 'Diese App gibt es nicht.');
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return problem(
        400,
        'invalid_request',
        'Der Projektname darf Buchstaben, Ziffern, Punkt, Binde- und Unterstrich enthalten (bis 100 Zeichen).',
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
    const manifest = app.manifest as { library?: string } | null;
    if (app.kind === 'link' || manifest?.library)
      return problem(
        400,
        'not_exportable',
        'Nur selbst gehostete Apps lassen sich exportieren, keine Link-Kacheln oder Bibliotheks-Programme.',
      );

    const { repo, visibility } = parsed.data;
    const started = await dispatchWorkflow(c.env, 'export-app.yml', {
      slug: slug.data,
      repo,
      visibility,
    });
    if (started instanceof Response) return started;

    const { error: auditError } = await db
      .schema('platform')
      .from('audit_log')
      .insert({
        actor_id: c.get('claims').sub,
        app_slug: slug.data,
        action: 'app.exported',
        detail: { repo, visibility },
      });
    // The workflow already runs; a missing audit row must not turn that into an error.
    if (auditError)
      console.error(`audit of the export of ${slug.data} failed: ${auditError.message}`);
    return c.json({ started: true, runs: started.runs }, 202);
  },
);
