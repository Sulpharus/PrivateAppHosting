// Starts this repository's GitHub workflows (App-Bibliothek, app export) with the dispatch token.

import type { ApiEnv } from '../env.ts';
import { problem } from './auth.ts';

const DEFAULT_REPO = 'Sulpharus/PrivateAppHosting';

/** owner/repo whose workflows the API starts. */
export function workflowRepo(env: ApiEnv): string {
  return env.GITHUB_REPO ?? DEFAULT_REPO;
}

/**
 * Dispatches `workflow` on main. Returns the Actions page of the workflow, or a problem
 * response when the token is missing or GitHub refuses.
 */
export async function dispatchWorkflow(
  env: ApiEnv,
  workflow: string,
  inputs: Record<string, string>,
): Promise<{ runs: string } | Response> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token)
    return problem(
      503,
      'not_configured',
      'Noch nicht eingerichtet: der GitHub-Startschlüssel fehlt (LIBRARY_DISPATCH_TOKEN).',
    );
  const repo = workflowRepo(env);
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mininode-api',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
      signal: AbortSignal.timeout(15_000),
    },
  ).catch(() => null);
  if (!response) return problem(502, 'github_unavailable', 'GitHub ist gerade nicht erreichbar.');
  if (!response.ok)
    return problem(502, 'github_error', `GitHub hat den Start abgelehnt (${response.status}).`);
  return { runs: `https://github.com/${repo}/actions/workflows/${workflow}` };
}
