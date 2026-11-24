import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const SHARED_PATHS = [
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
 * Apps whose program is compiled from source in CI (hours for MuseScore, minutes for each patched
 * Craft app): hosted/<slug>/source.json, or a release.json that lists patches. They are rebuilt and
 * redeployed only when their own folder changes, never because a shared package did; a change
 * to the SDK or kit reaches them with their next own change (or a deploy with all_apps).
 */
export function builtFromSource(slug: string, cwd: string): boolean {
  const dir = join(cwd, 'hosted', slug);
  if (existsSync(join(dir, 'source.json'))) return true;
  try {
    const release = JSON.parse(readFileSync(join(dir, 'release.json'), 'utf8')) as {
      patches?: unknown[];
    };
    return (release.patches ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Apps whose files changed since the commit each one was last deployed from (its registered
 * version in the target environment). A failed deploy leaves the old version in place, so the
 * next run still ships the changes. An app with no usable version (never deployed, unknown
 * commit) is deployed too. Shared paths count for every app except those built from source.
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
      // Documentation and tests of an app built from source do not change its program.
      ...(builtFromSource(slug, cwd)
        ? [`:(exclude,glob)hosted/${slug}/**/*.md`, `:(exclude,glob)hosted/${slug}/test/**`]
        : SHARED_PATHS),
    ]);
    return !diff.ok || diff.out.trim() !== '';
  });
}
