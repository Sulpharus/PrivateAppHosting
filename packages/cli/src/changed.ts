import { spawnSync } from 'node:child_process';

/** Hosted app folders touched between `base` and HEAD (for CI to deploy only what changed). */
export function changedApps(base: string, cwd: string): string[] {
  const result = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`, '--', 'hosted/'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return appsFromPaths(result.stdout.split('\n'));
}

export function appsFromPaths(paths: string[]): string[] {
  const apps = new Set<string>();
  for (const path of paths) {
    const match = /^hosted\/([a-z][a-z0-9-]*[a-z0-9])\//.exec(path.trim());
    if (match?.[1]) apps.add(match[1]);
  }
  return [...apps].sort();
}

/**
 * Paths every app ships or runs behind: when one of them changes, all apps have to be redeployed,
 * not only the ones whose folder changed.
 */
export const SHARED_PATHS = [
  'pnpm-lock.yaml',
  'packages/sdk/src',
  'packages/ui/kit',
  'packages/gate/src',
  'packages/manifest/src',
  'packages/cli/src',
];

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: result.status === 0, out: result.stdout };
}

/**
 * Apps whose files changed since the commit each one was last deployed from (its registered
 * version in the target environment). A failed deploy leaves the old version in place, so the
 * next run still ships the changes. An app with no usable version (never deployed, unknown
 * commit) is deployed too.
 */
export function appsToDeploy(
  slugs: string[],
  deployed: Map<string, string | null | undefined>,
  cwd: string,
): string[] {
  return slugs.filter((slug) => {
    const version = deployed.get(slug);
    if (!version || !git(cwd, ['cat-file', '-e', `${version}^{commit}`]).ok) return true;
    const diff = git(cwd, [
      'diff',
      '--name-only',
      version,
      'HEAD',
      '--',
      `hosted/${slug}`,
      ...SHARED_PATHS,
    ]);
    return !diff.ok || diff.out.trim() !== '';
  });
}
