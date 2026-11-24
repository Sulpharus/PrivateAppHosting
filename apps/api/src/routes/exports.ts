// Apps as GitHub projects (ADR 0012): the admin exports one hosted app, without data or keys,
// as its own repository, or as a ZIP file for someone who hosts MiniNode too (they install it
// under Verwaltung → Hochladen). The API only starts the export-app.yml workflow on main; the ZIP
// stays a workflow artifact for 7 days and is downloaded like a backup.
//   POST /admin/apps/:slug/export            admin + recent sign-in → { repo, visibility } | { target: 'zip' }
//   GET  /admin/app-zips                     admin → { configured, zips: [...] }
//   POST /admin/app-zips/:artifact/download  admin + recent sign-in → { url, name } (valid ~1 minute)

import { slugSchema } from '@mininode/manifest';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { artifactDownloadUrl, dispatchWorkflow, githubGet } from '../lib/github.ts';
import { adminClient } from '../lib/supabase.ts';

export const appExports = new Hono<AppContext>();

const requestSchema = z.union([
  z
    .object({
      target: z.literal('github').optional(),
      repo: z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/, 'invalid repository name'),
      visibility: z.enum(['private', 'public']),
    })
    .strict(),
  z.object({ target: z.literal('zip') }).strict(),
]);

const EXPORT_WORKFLOW = 'export-app.yml';
/** The run name of a ZIP export (`run-name` in export-app.yml) and its artifact names. */
const ZIP_RUN = 'App als ZIP ';
const ZIP_ARTIFACT = 'mininode-app-';

interface GithubRun {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  run_started_at?: string | null;
  display_title?: string;
}

interface GithubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  expires_at: string | null;
  workflow_run?: { id: number } | null;
}

export interface ZipRow {
  runId: number;
  slug: string;
  startedAt: string;
  state: 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';
  runUrl: string;
  artifact: { id: number; name: string; sizeBytes: number; expiresAt: string | null } | null;
}

/** The ZIP export runs (newest first), each with its file while GitHub still keeps it. */
export function zipRows(runs: GithubRun[], artifacts: GithubArtifact[]): ZipRow[] {
  const byRun = new Map<number, GithubArtifact>();
  for (const artifact of artifacts)
    if (artifact.name.startsWith(ZIP_ARTIFACT) && artifact.workflow_run)
      byRun.set(artifact.workflow_run.id, artifact);
  return runs
    .filter((run) => run.display_title?.startsWith(ZIP_RUN))
    .map((run): ZipRow => {
      const artifact = byRun.get(run.id) ?? null;
      let state: ZipRow['state'];
      if (run.status !== 'completed') state = 'running';
      else if (run.conclusion === 'success')
        state = !artifact || artifact.expired ? 'expired' : 'ready';
      else if (run.conclusion === 'cancelled') state = 'cancelled';
      else state = 'failed';
      return {
        runId: run.id,
        slug: (run.display_title ?? '').slice(ZIP_RUN.length).trim(),
        startedAt: run.run_started_at ?? run.created_at,
        state,
        runUrl: run.html_url,
        artifact:
          artifact && !artifact.expired
            ? {
                id: artifact.id,
                name: artifact.name,
                sizeBytes: artifact.size_in_bytes,
                expiresAt: artifact.expires_at,
              }
            : null,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

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

    const request = parsed.data;
    const inputs: Record<string, string> =
      request.target === 'zip'
        ? { slug: slug.data, target: 'zip' }
        : { slug: slug.data, target: 'github', repo: request.repo, visibility: request.visibility };
    const started = await dispatchWorkflow(c.env, EXPORT_WORKFLOW, inputs);
    if (started instanceof Response) return started;

    const { error: auditError } = await db
      .schema('platform')
      .from('audit_log')
      .insert({
        actor_id: c.get('claims').sub,
        app_slug: slug.data,
        action: 'app.exported',
        detail:
          request.target === 'zip'
            ? { target: 'zip' }
            : { target: 'github', repo: request.repo, visibility: request.visibility },
      });
    // The workflow already runs; a missing audit row must not turn that into an error.
    if (auditError)
      console.error(`audit of the export of ${slug.data} failed: ${auditError.message}`);
    return c.json({ started: true, runs: started.runs }, 202);
  },
);

appExports.get('/admin/app-zips', requireUser({ role: 'admin' }), async (c) => {
  if (!c.env.GITHUB_DISPATCH_TOKEN) return c.json({ configured: false, zips: [] });
  const runs = await githubGet<{ workflow_runs: GithubRun[] }>(
    c.env,
    `/actions/workflows/${EXPORT_WORKFLOW}/runs?per_page=20`,
  );
  if (runs instanceof Response) return runs;
  // Asked for by run: the repository's artifact list is shared with every CI run.
  const perRun = await Promise.all(
    runs.workflow_runs
      .filter(
        (run) =>
          run.display_title?.startsWith(ZIP_RUN) &&
          run.status === 'completed' &&
          run.conclusion === 'success',
      )
      .map((run) =>
        githubGet<{ artifacts: GithubArtifact[] }>(c.env, `/actions/runs/${run.id}/artifacts`),
      ),
  );
  const failed = perRun.find((result) => result instanceof Response);
  if (failed instanceof Response) return failed;
  const artifacts = perRun.flatMap((result) =>
    result instanceof Response ? [] : result.artifacts,
  );
  return c.json({ configured: true, zips: zipRows(runs.workflow_runs, artifacts) }, 200, {
    'Cache-Control': 'no-store',
  });
});

appExports.post(
  '/admin/app-zips/:artifact/download',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const id = z.coerce.number().int().safe().positive().safeParse(c.req.param('artifact'));
    if (!id.success) return problem(404, 'not_found', 'Diese ZIP-Datei gibt es nicht.');
    // Only ZIPs of the export workflow: the repository has other artifacts (backups) too.
    const artifact = await githubGet<GithubArtifact>(c.env, `/actions/artifacts/${id.data}`, {
      notFound: 'Diese ZIP-Datei gibt es nicht.',
    });
    if (artifact instanceof Response) return artifact;
    if (!artifact.name.startsWith(ZIP_ARTIFACT))
      return problem(404, 'not_found', 'Diese ZIP-Datei gibt es nicht.');
    if (artifact.expired) return problem(410, 'expired', 'Diese ZIP-Datei ist abgelaufen.');
    const { error } = await adminClient(c.env)
      .schema('platform')
      .from('audit_log')
      .insert({
        actor_id: c.get('claims').sub,
        action: 'app.zip_downloaded',
        detail: { artifact: artifact.name },
      });
    if (error)
      return problem(500, 'audit_failed', 'Der Download konnte nicht protokolliert werden.');
    const url = await artifactDownloadUrl(c.env, id.data);
    if (url instanceof Response) return url;
    return c.json({ url, name: `${artifact.name}.zip` });
  },
);
