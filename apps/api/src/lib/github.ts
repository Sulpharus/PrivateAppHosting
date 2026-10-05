// Starts this repository's GitHub workflows (App-Bibliothek, app export) with the dispatch token.

import type { ApiEnv } from '../env.ts';
import { problem } from './auth.ts';

const DEFAULT_REPO = 'Sulpharus/PrivateAppHosting';

/** owner/repo whose workflows the API starts. */
export function workflowRepo(env: ApiEnv): string {
  return env.GITHUB_REPO ?? DEFAULT_REPO;
}

/** What a refused call usually means, so the owner knows what to fix. */
export function refusalHint(status: number): string {
  if (status === 401) return 'Der Startschlüssel ist ungültig oder abgelaufen.';
  if (status === 403)
    return 'Dem Startschlüssel fehlt die Berechtigung „Actions: Read and write“ für dieses Repository.';
  if (status === 404)
    return 'Der Startschlüssel sieht das Repository oder den Workflow nicht (falsches Repository oder Workflow nicht auf main).';
  if (status === 422)
    return 'Der Workflow lässt sich auf main nicht starten (Eingaben oder workflow_dispatch fehlen).';
  return 'unerwartete Antwort von GitHub.';
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
  if (!response.ok) {
    const detail = await response
      .json<{ message?: string }>()
      .then((body) => body.message ?? '')
      .catch(() => '');
    console.error('github dispatch refused', { workflow, status: response.status, detail });
    return problem(
      502,
      'github_error',
      `GitHub hat den Start abgelehnt (${response.status}): ${refusalHint(response.status)}${
        detail ? ` [${detail.slice(0, 120)}]` : ''
      }`,
    );
  }
  return { runs: `https://github.com/${repo}/actions/workflows/${workflow}` };
}

/** GitHub headers for the API calls with the dispatch token. */
function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mininode-api',
  };
}

/** GET on the repository's API (`/actions/...`), or a problem response when it cannot be done. */
export async function githubGet<T>(
  env: ApiEnv,
  path: string,
  options: { notFound?: string } = {},
): Promise<T | Response> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token)
    return problem(
      503,
      'not_configured',
      'Noch nicht eingerichtet: der GitHub-Startschlüssel fehlt (LIBRARY_DISPATCH_TOKEN).',
    );
  const response = await fetch(`https://api.github.com/repos/${workflowRepo(env)}${path}`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) return problem(502, 'github_unavailable', 'GitHub ist gerade nicht erreichbar.');
  if (response.status === 404 && options.notFound)
    return problem(404, 'not_found', options.notFound);
  if (!response.ok) {
    console.error('github read refused', { path, status: response.status });
    return problem(
      502,
      'github_error',
      `GitHub hat die Anfrage abgelehnt (${response.status}): ${refusalHint(response.status)}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * The short-lived address GitHub gives for an artifact's ZIP (valid about a minute, no key
 * needed to use it), or a problem response. The ZIP itself never passes through the Worker.
 */
export async function artifactDownloadUrl(
  env: ApiEnv,
  artifactId: number,
): Promise<string | Response> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token)
    return problem(
      503,
      'not_configured',
      'Noch nicht eingerichtet: der GitHub-Startschlüssel fehlt.',
    );
  const response = await fetch(
    `https://api.github.com/repos/${workflowRepo(env)}/actions/artifacts/${artifactId}/zip`,
    {
      headers: githubHeaders(token),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    },
  ).catch(() => null);
  if (!response) return problem(502, 'github_unavailable', 'GitHub ist gerade nicht erreichbar.');
  const location = response.headers.get('Location');
  if (response.status === 410)
    return problem(410, 'expired', 'Diese Sicherung ist bei GitHub abgelaufen.');
  if (response.status !== 302 || !location) {
    console.error('artifact download refused', { artifactId, status: response.status });
    return problem(
      502,
      'github_error',
      `GitHub gibt die Sicherung nicht heraus (${response.status}): ${refusalHint(response.status)}`,
    );
  }
  // Only GitHub's own storage: the browser is sent to this address.
  let target: URL;
  try {
    target = new URL(location);
  } catch {
    return problem(502, 'github_error', 'GitHub hat eine ungültige Adresse geliefert.');
  }
  const trusted = ['.githubusercontent.com', '.blob.core.windows.net', '.github.com'];
  if (target.protocol !== 'https:' || !trusted.some((suffix) => target.hostname.endsWith(suffix)))
    return problem(502, 'github_error', 'GitHub hat eine unerwartete Adresse geliefert.');
  return target.toString();
}
