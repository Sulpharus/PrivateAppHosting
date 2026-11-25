// Uploads from Verwaltung (ADR 0013): the integrate workflow fetches the stored ZIP and reports
// how it went. Runs with the service key, like the other deploy-time commands.

import { writeFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type DeployEnv, environmentSettings } from './deploy/environment.ts';
import type { IntegrateResult } from './integrate/types.ts';

export type SubmissionStatus =
  | 'integrating'
  | 'integrated'
  | 'pr_open'
  | 'needs_review'
  | 'failed'
  | 'dismissed'
  | 'queued';

interface StatusExtras {
  pr?: string;
  review?: string;
  run?: string;
  /**
   * Only change an upload that waits on this pull request (status `pr_open`, same `pr_url`):
   * a merge event cannot move another upload, and a late write cannot undo a merge.
   */
  onlyIfPr?: string;
}

const BUCKET = 'submissions';
const MAX_LOG = 20_000;

function client(envName: DeployEnv): SupabaseClient {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required');
  return createClient(environmentSettings(envName).supabaseUrl, secret, {
    auth: { persistSession: false },
  });
}

/** The row update for a finished integration: what the portal shows under the upload. */
export function submissionPatch(
  status: SubmissionStatus,
  result: IntegrateResult | null,
  report: string | null,
  extras: StatusExtras = {},
): Record<string, unknown> {
  return {
    status,
    ...(result?.slug ? { slug: result.slug } : {}),
    ...(result?.name ? { name: result.name.slice(0, 60) } : {}),
    ...(result
      ? {
          summary: {
            framework: result.framework,
            reasons: result.reasons,
            warnings: result.warnings,
            actions: result.actions,
          },
        }
      : {}),
    ...(report !== null ? { log: report.slice(0, MAX_LOG) } : {}),
    ...(extras.pr ? { pr_url: extras.pr } : {}),
    ...(extras.review ? { review_url: extras.review } : {}),
    ...(extras.run ? { run_url: extras.run } : {}),
  };
}

/**
 * Where an upload comes from: `{ repository, autoUpdate }` for an app installed from a GitHub link
 * (ADR 0029; the workflow clones it), `{}` for a stored ZIP (`fetchSubmission`).
 */
export async function submissionSource(
  envName: DeployEnv,
  id: string,
): Promise<{ repository?: string; autoUpdate?: boolean }> {
  const { data: row, error } = await client(envName)
    .schema('platform')
    .from('submissions')
    .select('repository, auto_update, kind')
    .eq('id', id)
    .maybeSingle<{ repository: string | null; auto_update: boolean; kind: string }>();
  if (error) throw new Error(`looking up the upload failed: ${error.message}`);
  if (!row) throw new Error(`no upload ${id}`);
  if (row.kind !== 'webapp') throw new Error(`upload ${id} is not a web app`);
  if (!row.repository) return {};
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.repository) ||
    /(^|\/)\.+(\/|$)/.test(row.repository)
  )
    throw new Error(`upload ${id} has an invalid repository`);
  return { repository: row.repository, autoUpdate: row.auto_update };
}

export async function fetchSubmission(
  envName: DeployEnv,
  id: string,
  out: string,
): Promise<string> {
  const db = client(envName);
  const { data: row, error } = await db
    .schema('platform')
    .from('submissions')
    .select('storage_path, filename, kind')
    .eq('id', id)
    .maybeSingle<{ storage_path: string; filename: string; kind: string }>();
  if (error) throw new Error(`looking up the upload failed: ${error.message}`);
  if (!row) throw new Error(`no upload ${id}`);
  if (row.kind !== 'webapp') throw new Error(`upload ${id} is not a web app`);
  if (row.storage_path.startsWith('github:'))
    throw new Error(`upload ${id} comes from GitHub: clone it (mininode submission source)`);
  const file = await db.storage.from(BUCKET).download(row.storage_path);
  if (file.error) throw new Error(`downloading the upload failed: ${file.error.message}`);
  writeFileSync(out, Buffer.from(await file.data.arrayBuffer()));
  return row.filename;
}

export async function setSubmissionStatus(
  envName: DeployEnv,
  id: string,
  status: SubmissionStatus,
  result: IntegrateResult | null,
  report: string | null,
  extras: StatusExtras = {},
): Promise<void> {
  let query = client(envName)
    .schema('platform')
    .from('submissions')
    .update(submissionPatch(status, result, report, extras))
    .eq('id', id);
  if (extras.onlyIfPr) query = query.eq('status', 'pr_open').eq('pr_url', extras.onlyIfPr);
  const { error } = await query;
  if (error) throw new Error(`updating the upload failed: ${error.message}`);
}
