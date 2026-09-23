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
