// `mininode update platform|app` (ADR 0028): bring a newer copy of the platform, or of one hosted
// app that has a GitHub repository, into this repository. The functions only read and write
// files; the workflows (update-platform.yml, update-app.yml) fetch the new copy, call these and
// open a pull request, so nothing reaches `main` without the checks and nothing is deployed
// before the pull request is merged.
//
// What makes an update safe for data:
//   - Data lives in Supabase and in the app's tables, never in these files.
//   - A database migration that was already applied is never changed: a new copy that edits an
//     existing migration is refused (`conflicts`), new migrations are added.
//   - This installation's own files (hosted apps, mininode.config.json, STATUS.md) are never
//     touched by a platform update.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { parseManifest } from '@mininode/manifest';

/** Which files the platform owns, as they were when this copy was installed (path → sha256). */
export const PLATFORM_FILES = '.mininode/platform-files.json';
/** Where an updated app remembers the commit of its repository it came from. */
export const APP_SOURCE = '.mininode-source.json';

/** Never part of a platform update: this installation's own state, and tooling folders. */
const PLATFORM_KEEP = [
  'hosted/',
  'inbox/',
  'node_modules/',
  '.git/',
  'graphify-out/',
  '.mininode/',
  'mininode.config.json',
  'docs/STATUS.md',
  // Holds one exemption per integrated app; a copy from the starter would drop them.
  'biome.json',
  '.gitleaksignore',
  'VERSION',
  'README-EDITION.md',
];
const WORKFLOWS = '.github/workflows/';
/** Folders whose existing files are history: a changed copy is a conflict, a removed one stays. */
const PLATFORM_APPEND_ONLY = ['supabase/migrations/'];
const APP_APPEND_ONLY = ['db/'];
const APP_KEEP = ['node_modules/', '.git/', APP_SOURCE, '.mininode-export'];

const sha = (data: Buffer): string => createHash('sha256').update(data).digest('hex');
const startsWithAny = (path: string, prefixes: string[]): boolean =>
  prefixes.some((prefix) => (prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix));

/** All files below `root` as posix paths relative to it, with their hashes. */
function snapshot(root: string, skip: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join('/');
      const isDir = statSync(full).isDirectory();
      if (startsWithAny(isDir ? `${rel}/` : rel, skip)) continue;
      if (isDir) walk(full);
      else files.set(rel, sha(readFileSync(full)));
    }
  };
  if (existsSync(root)) walk(root);
  return files;
}

export interface UpdatePlan {
  /** What the new copy is called (platform: first line of its VERSION file; app: the commit). */
  version: string;
  add: string[];
  change: string[];
  remove: string[];
  /** Already-applied history that the new copy would rewrite; any entry stops the update. */
  conflicts: string[];
  /** Files of the new copy by path, to write the next platform file list. */
  incoming: Map<string, string>;
}

function plan(
  incoming: Map<string, string>,
  current: Map<string, string>,
  removable: Set<string> | null,
  appendOnly: string[],
  version: string,
): UpdatePlan {
  const result: UpdatePlan = {
    version,
    add: [],
    change: [],
    remove: [],
    conflicts: [],
    incoming,
  };
  for (const [path, hash] of incoming) {
    const existing = current.get(path);
    if (existing === undefined) result.add.push(path);
    else if (existing !== hash) {
      if (startsWithAny(path, appendOnly)) result.conflicts.push(path);
      else result.change.push(path);
    }
  }
  if (removable) {
    for (const path of removable) {
      if (!incoming.has(path) && current.has(path) && !startsWithAny(path, appendOnly))
        result.remove.push(path);
    }
  }
  for (const list of [result.add, result.change, result.remove, result.conflicts]) list.sort();
  return result;
}

function writeFiles(plan: UpdatePlan, from: string, to: string): void {
  for (const path of [...plan.add, ...plan.change]) {
    const target = join(to, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(from, path)));
  }
  for (const path of plan.remove) rmSync(join(to, path), { force: true });
}

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/**
 * Writes the list of platform files of a directory (a starter package being built, or a
 * repository after an update), so the next update knows which files the platform owns.
 */
export function writePlatformList(dir: string, source: string): void {
  const versionFile = join(dir, 'VERSION');
  const version = existsSync(versionFile)
    ? (readFileSync(versionFile, 'utf8').split('\n')[0]?.trim() ?? 'unknown')
    : 'unknown';
  const files = snapshot(dir, PLATFORM_KEEP);
  mkdirSync(join(dir, '.mininode'), { recursive: true });
  writeFileSync(
    join(dir, PLATFORM_FILES),
    `${JSON.stringify({ version, source, files: Object.fromEntries(files) }, null, 2)}\n`,
  );
}

export interface PlatformOptions {
  /** The repository to update. */
  root: string;
  /** The unpacked starter package of the new version. */
  from: string;
  /** Leave `.github/workflows/` alone (a token that may not change workflows cannot push them). */
  skipWorkflows?: boolean;
}

/** What a platform update would do. Reads only. */
export function planPlatformUpdate(options: PlatformOptions): UpdatePlan {
  const skip = [...PLATFORM_KEEP, ...(options.skipWorkflows ? [WORKFLOWS] : [])];
  const incoming = snapshot(options.from, skip);
  const versionFile = join(options.from, 'VERSION');
  const version = existsSync(versionFile)
    ? (readFileSync(versionFile, 'utf8').split('\n')[0]?.trim() ?? 'unknown')
    : 'unknown';
  // Only the folders of the new copy are compared: other files of this repository are its own.
  const current = new Map<string, string>();
  for (const [path] of incoming) {
    const file = join(options.root, path);
    if (existsSync(file)) current.set(path, sha(readFileSync(file)));
  }
  const previous = readJson(join(options.root, PLATFORM_FILES)) as {
    files?: Record<string, string>;
  } | null;
  const removable = previous?.files ? new Set(Object.keys(previous.files)) : null;
  if (removable) {
    for (const path of removable) {
      const file = join(options.root, path);
      if (existsSync(file) && !startsWithAny(path, skip))
        current.set(path, sha(readFileSync(file)));
    }
  }
  const result = plan(incoming, current, removable, PLATFORM_APPEND_ONLY, version);
  return {
    ...result,
    remove: result.remove.filter((path) => !startsWithAny(path, skip)),
  };
}

/** Applies a platform plan and records the new file list. Refuses a plan with conflicts. */
export function applyPlatformUpdate(
  options: PlatformOptions,
  updatePlan: UpdatePlan,
  source: string,
): void {
  if (updatePlan.conflicts.length > 0)
    throw new Error(`refused: ${updatePlan.conflicts.length} applied migration(s) would change`);
  writeFiles(updatePlan, options.from, options.root);
  const list = join(options.root, PLATFORM_FILES);
  mkdirSync(dirname(list), { recursive: true });
  writeFileSync(
    list,
    `${JSON.stringify(
      { version: updatePlan.version, source, files: Object.fromEntries(updatePlan.incoming) },
      null,
      2,
    )}\n`,
  );
}

export interface AppOptions {
  /** `hosted/<slug>` of this repository. */
  appDir: string;
  slug: string;
  /** A checkout of the app's own repository. */
  from: string;
  repository: string;
  commit: string;
}

/** What an app update would do. Reads only. Throws when the new copy is not this app. */
export function planAppUpdate(options: AppOptions): UpdatePlan {
  const parsed = parseManifest(readJson(join(options.from, 'mininode.json')));
  if (!parsed.ok) throw new Error(`mininode.json of the repository: ${parsed.errors.join('; ')}`);
  if (parsed.manifest.slug !== options.slug)
    throw new Error(
      `the repository holds the app "${parsed.manifest.slug}", not "${options.slug}": nothing changed`,
    );
  const incoming = snapshot(options.from, APP_KEEP);
  const current = snapshot(options.appDir, APP_KEEP);
  return plan(incoming, current, new Set(current.keys()), APP_APPEND_ONLY, options.commit);
}

/** Applies an app plan and records where it came from. Refuses a plan with conflicts. */
export function applyAppUpdate(options: AppOptions, updatePlan: UpdatePlan): void {
  if (updatePlan.conflicts.length > 0)
    throw new Error(`refused: ${updatePlan.conflicts.length} applied migration(s) would change`);
  writeFiles(updatePlan, options.from, options.appDir);
  writeFileSync(
    join(options.appDir, APP_SOURCE),
    `${JSON.stringify({ repository: options.repository, commit: options.commit }, null, 2)}\n`,
  );
}

/** One readable line per kind of change, for the log and the pull request. */
export function describePlan(updatePlan: UpdatePlan): string {
  const lines = [
    `${updatePlan.version}: ${updatePlan.add.length} new, ${updatePlan.change.length} changed, ${updatePlan.remove.length} removed`,
  ];
  for (const path of updatePlan.conflicts)
    lines.push(`CONFLICT (applied migration changed): ${path}`);
  return lines.join('\n');
}
