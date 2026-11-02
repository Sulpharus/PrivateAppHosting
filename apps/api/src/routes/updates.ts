// Updates from Verwaltung → Updates (ADR 0028): the newest version of the platform, and of every
// hosted app that has a GitHub repository. The work is done by the update-platform.yml and
// update-app.yml workflows, which open a pull request; the API shows what is available and
// starts them.
//   GET  /admin/updates                  admin: installed and newest versions
//   POST /admin/updates/platform         admin + recent sign-in; { version? } → 202
//   POST /admin/updates/apps/:slug       admin + recent sign-in → 202

import { GITHUB_REPO, slugSchema } from '@mininode/manifest';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { dispatchWorkflow, githubReadRepo } from '../lib/github.ts';
import { adminClient } from '../lib/supabase.ts';

export const updates = new Hono<AppContext>();

const REPO = GITHUB_REPO;
const versionSchema = z.string().regex(/^v[0-9A-Za-z._-]{1,40}$/);
const platformRequest = z.object({ version: versionSchema.optional() }).strict();

interface Release {
  tag_name: string;
  name: string | null;
  prerelease: boolean;
  html_url: string;
  published_at: string | null;
}

/** A file of this repository's contents API, decoded (the file is small JSON). */
async function readJsonFile<T>(
  env: Parameters<typeof githubReadRepo>[0],
  path: string,
): Promise<T | null> {
  const repo = env.GITHUB_REPO;
  if (!repo) return null;
  const file = await githubReadRepo<{ content?: string; encoding?: string }>(
    env,
    repo,
    `/contents/${path}`,
  );
  if (!file?.content || file.encoding !== 'base64') return null;
  try {
    return JSON.parse(atob(file.content.replace(/\n/g, ''))) as T;
  } catch {
    return null;
  }
}

updates.get('/admin/updates', requireUser({ role: 'admin' }), async (c) => {
  const source = REPO.test(c.env.UPDATES_SOURCE ?? '') ? c.env.UPDATES_SOURCE : null;

  const db = adminClient(c.env);
  const { data: rows, error } = await db
    .schema('platform')
    .from('apps')
    .select('slug, name, kind, status, manifest')
    .neq('kind', 'link');
  if (error) return problem(500, 'db_error', error.message);

  const [installed, releases, apps] = await Promise.all([
    readJsonFile<{ version?: string }>(c.env, '.mininode/platform-files.json'),
    source ? githubReadRepo<Release[]>(c.env, source, '/releases?per_page=1') : null,
    Promise.all(
      (rows ?? [])
        .map((row) => ({
          slug: row.slug as string,
          name: row.name as string,
          repository: (row.manifest as { repository?: unknown } | null)?.repository,
        }))
        .filter(
          (row): row is { slug: string; name: string; repository: string } =>
            typeof row.repository === 'string' && REPO.test(row.repository),
        )
        .map(async (row) => {
          const [known, latest] = await Promise.all([
            readJsonFile<{ commit?: string }>(c.env, `hosted/${row.slug}/.mininode-source.json`),
            githubReadRepo<{ sha: string }[]>(c.env, row.repository, '/commits?per_page=1'),
          ]);
          const installedCommit = known?.commit ?? null;
          const latestCommit = latest?.[0]?.sha ?? null;
          return {
            slug: row.slug,
            name: row.name,
            repository: row.repository,
            installedCommit,
            latestCommit,
            // null: unknown (never updated from the repository, or GitHub did not answer)
            upToDate: installedCommit && latestCommit ? installedCommit === latestCommit : null,
          };
        }),
    ),
  ]);

  const newest = releases?.[0] ?? null;
  const installedVersion = installed?.version ?? null;
  return c.json(
    {
      platform: {
        source,
        installed: installedVersion,
        latest: newest
          ? {
              tag: newest.tag_name,
              name: newest.name,
              prerelease: newest.prerelease,
              url: newest.html_url,
              publishedAt: newest.published_at,
            }
          : null,
        upToDate:
          installedVersion && newest
            ? `v${installedVersion}` === newest.tag_name || installedVersion === newest.tag_name
            : null,
      },
      apps,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
});

updates.post(
  '/admin/updates/platform',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    if (!REPO.test(c.env.UPDATES_SOURCE ?? ''))
      return problem(
        503,
        'not_configured',
        'Noch nicht eingerichtet: updates.source fehlt in mininode.config.json.',
      );
    const parsed = platformRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return problem(400, 'invalid_request', 'Ungültige Versionsangabe.');
    const db = adminClient(c.env);
    const { error } = await db
      .schema('platform')
      .from('audit_log')
      .insert({
        actor_id: c.get('claims').sub,
        action: 'platform.update_started',
        detail: { version: parsed.data.version ?? 'latest' },
      });
    if (error) return problem(500, 'audit_failed', 'Das Update konnte nicht protokolliert werden.');
    const started = await dispatchWorkflow(
      c.env,
      'update-platform.yml',
      parsed.data.version ? { version: parsed.data.version } : {},
    );
    if (started instanceof Response) return started;
    return c.json({ started: true, runs: started.runs }, 202);
  },
);

updates.post(
  '/admin/updates/apps/:slug',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const slug = slugSchema.safeParse(c.req.param('slug'));
    if (!slug.success) return problem(404, 'not_found', 'Diese App gibt es nicht.');
    const db = adminClient(c.env);
    const { data: app, error } = await db
      .schema('platform')
      .from('apps')
      .select('slug, kind, manifest')
      .eq('slug', slug.data)
      .maybeSingle();
    if (error) return problem(500, 'db_error', error.message);
    if (!app || app.kind === 'link') return problem(404, 'not_found', 'Diese App gibt es nicht.');
    const repository = (app.manifest as { repository?: unknown } | null)?.repository;
    if (typeof repository !== 'string' || !REPO.test(repository))
      return problem(
        400,
        'no_repository',
        'Diese App hat kein GitHub-Repository (Feld „repository“ in mininode.json).',
      );
    const { error: auditError } = await db
      .schema('platform')
      .from('audit_log')
      .insert({
        actor_id: c.get('claims').sub,
        app_slug: slug.data,
        action: 'app.update_started',
        detail: { repository },
      });
    if (auditError)
      return problem(500, 'audit_failed', 'Das Update konnte nicht protokolliert werden.');
    const started = await dispatchWorkflow(c.env, 'update-app.yml', { slug: slug.data });
    if (started instanceof Response) return started;
    return c.json({ started: true, runs: started.runs }, 202);
  },
);
