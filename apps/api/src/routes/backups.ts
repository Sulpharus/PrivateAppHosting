// Backups from Verwaltung → Sicherung (ADR 0019). The work is done by the backup.yml workflow
// (a pg_dump snapshot, the stored files, a password-protected 7z archive kept as an artifact for
// 30 days); the API only starts it, lists the runs with their archives and hands out a short-lived
// download address. Nothing of the data passes through the Worker.
//   GET  /admin/backups                       admin → { configured, runs: [...] }
//   POST /admin/backups                       admin + recent sign-in; { files } → 202
//   POST /admin/backups/:artifact/download    admin + recent sign-in → { url } (valid ~1 minute)

import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { artifactDownloadUrl, dispatchWorkflow, githubGet } from '../lib/github.ts';
import { adminClient } from '../lib/supabase.ts';

export const backups = new Hono<AppContext>();

export const BACKUP_WORKFLOW = 'backup.yml';
/** The artifact names the workflow gives (`mininode-backup-<date>[-nofiles]`). */
export const ARTIFACT_PREFIX = 'mininode-backup-';

interface GithubRun {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  run_started_at?: string | null;
}

interface GithubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  expires_at: string | null;
  created_at: string | null;
  workflow_run?: { id: number } | null;
}

export type BackupState = 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';

export interface BackupRow {
  runId: number;
  startedAt: string;
  state: BackupState;
  runUrl: string;
  withFiles: boolean | null;
  artifact: { id: number; name: string; sizeBytes: number; expiresAt: string | null } | null;
}

/** The runs of the backup workflow, each with the archive it left (if it still exists). */
export function joinRuns(runs: GithubRun[], artifacts: GithubArtifact[]): BackupRow[] {
  const byRun = new Map<number, GithubArtifact>();
  for (const artifact of artifacts) {
    if (artifact.name.startsWith(ARTIFACT_PREFIX) && artifact.workflow_run)
      byRun.set(artifact.workflow_run.id, artifact);
  }
  return runs
    .map((run): BackupRow => {
      const artifact = byRun.get(run.id) ?? null;
      let state: BackupState;
      if (run.status !== 'completed') state = 'running';
      else if (run.conclusion === 'success')
        state = !artifact || artifact.expired ? 'expired' : 'ready';
      else if (run.conclusion === 'cancelled') state = 'cancelled';
      else state = 'failed';
      return {
        runId: run.id,
        startedAt: run.run_started_at ?? run.created_at,
        state,
        runUrl: run.html_url,
        withFiles: artifact ? !artifact.name.endsWith('-nofiles') : null,
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

/** Writes the audit row; false when it could not be written. */
async function audit(
  c: Context<AppContext>,
  action: string,
  detail: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await adminClient(c.env)
    .schema('platform')
    .from('audit_log')
    .insert({ actor_id: c.get('claims').sub, action, detail });
  if (error) console.error(`audit of ${action} failed: ${error.message}`);
  return !error;
}

backups.get('/admin/backups', requireUser({ role: 'admin' }), async (c) => {
  if (!c.env.GITHUB_DISPATCH_TOKEN) return c.json({ configured: false, runs: [] });
  const runs = await githubGet<{ workflow_runs: GithubRun[] }>(
    c.env,
    `/actions/workflows/${BACKUP_WORKFLOW}/runs?per_page=15`,
  );
  if (runs instanceof Response) return runs;
  // The archives of each finished run, asked for by run: the repository's artifact list is shared
  // with every CI run (Playwright reports), so older backups would fall off its first page.
  const perRun = await Promise.all(
    runs.workflow_runs
      .filter((run) => run.status === 'completed' && run.conclusion === 'success')
      .map((run) =>
        githubGet<{ artifacts: GithubArtifact[] }>(c.env, `/actions/runs/${run.id}/artifacts`),
      ),
  );
  const failed = perRun.find((result) => result instanceof Response);
  if (failed instanceof Response) return failed;
  const artifacts = perRun.flatMap((result) =>
    result instanceof Response ? [] : result.artifacts,
  );
  return c.json({ configured: true, runs: joinRuns(runs.workflow_runs, artifacts) });
});

const startSchema = z.object({ files: z.boolean() }).strict();

backups.post('/admin/backups', requireUser({ role: 'admin', recentAuth: 600 }), async (c) => {
  const parsed = startSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'invalid_request', 'Ungültige Anfrage.');
  const started = await dispatchWorkflow(c.env, BACKUP_WORKFLOW, {
    files: String(parsed.data.files),
  });
  if (started instanceof Response) return started;
  // The backup already runs; a missing audit row must not turn that into an error.
  await audit(c, 'backup.started', { files: parsed.data.files });
  return c.json({ started: true, runs: started.runs }, 202);
});

backups.post(
  '/admin/backups/:artifact/download',
  requireUser({ role: 'admin', recentAuth: 300 }),
  async (c) => {
    const id = z.coerce.number().int().safe().positive().safeParse(c.req.param('artifact'));
    if (!id.success) return problem(404, 'not_found', 'Diese Sicherung gibt es nicht.');
    // Only archives of the backup workflow: the repository has other artifacts too.
    const artifact = await githubGet<GithubArtifact>(c.env, `/actions/artifacts/${id.data}`, {
      notFound: 'Diese Sicherung gibt es nicht.',
    });
    if (artifact instanceof Response) return artifact;
    if (!artifact.name.startsWith(ARTIFACT_PREFIX))
      return problem(404, 'not_found', 'Diese Sicherung gibt es nicht.');
    if (artifact.expired) return problem(410, 'expired', 'Diese Sicherung ist abgelaufen.');
    // Recorded before the address is issued: no download without a trace.
    if (!(await audit(c, 'backup.downloaded', { artifact: artifact.name })))
      return problem(500, 'audit_failed', 'Der Download konnte nicht protokolliert werden.');
    const url = await artifactDownloadUrl(c.env, id.data);
    if (url instanceof Response) return url;
    return c.json({ url, name: `${artifact.name}.zip` });
  },
);
