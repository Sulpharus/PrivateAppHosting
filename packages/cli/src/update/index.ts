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
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { parseManifest, slugSchema } from '@mininode/manifest';

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
  // The owner's own news log and first steps.
  'docs/wiki/neuigkeiten.md',
  'docs/wiki/startup-guide.md',
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

/** True for a path that stays inside its folder: relative, normalised, no `..` segment. */
export function isSafePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    posix.normalize(path) === path &&
    !path.split('/').includes('..')
  );
}

/**
 * All regular files below `root` as posix paths relative to it, with their hashes. A symbolic
 * link (or anything else that is not a plain file or folder) stops the update: a package or a
 * repository from outside must not make this code read files elsewhere on the machine.
 */
function snapshot(root: string, skip: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join('/');
      const info = lstatSync(full);
      if (!info.isDirectory() && !info.isFile()) {
        if (startsWithAny(rel, skip)) continue;
        throw new Error(`refused: ${rel} is a link or special file, not a plain file`);
      }
      if (startsWithAny(info.isDirectory() ? `${rel}/` : rel, skip)) continue;
      if (info.isDirectory()) walk(full);
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

function inside(root: string, path: string): string {
  const full = resolve(root, path);
  if (!isSafePath(path) || !full.startsWith(`${resolve(root)}${sep}`))
    throw new Error(`refused: ${path} is outside the folder`);
  return full;
}

function writeFiles(plan: UpdatePlan, from: string, to: string): void {
  for (const path of [...plan.add, ...plan.change]) {
    const source = inside(from, path);
    if (!lstatSync(source).isFile()) throw new Error(`refused: ${path} is not a plain file`);
    const target = inside(to, path);
    // Never write through a link that is already there.
    if (existsSync(target) && !lstatSync(target).isFile())
      throw new Error(`refused: ${path} is not a plain file here`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }
  for (const path of plan.remove) rmSync(inside(to, path), { force: true });
}

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/**
 * Writes the list of platform files of a directory (a starter package being built, or a
 * repository after an update), so the next update knows which files the platform owns.
 */
export function writePlatformList(dir: string, source: string, edition = 'starter'): void {
  const versionFile = join(dir, 'VERSION');
  const version = existsSync(versionFile)
    ? (readFileSync(versionFile, 'utf8').split('\n')[0]?.trim() ?? 'unknown')
    : 'unknown';
  const files = snapshot(dir, PLATFORM_KEEP);
  mkdirSync(join(dir, '.mininode'), { recursive: true });
  writeFileSync(
    join(dir, PLATFORM_FILES),
    `${JSON.stringify({ version, source, edition, files: Object.fromEntries(files) }, null, 2)}\n`,
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
  // The list is a file of this repository: a path that is not plainly inside it is ignored.
  const removable = previous?.files
    ? new Set(Object.keys(previous.files).filter(isSafePath))
    : null;
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
  const files = Object.fromEntries(updatePlan.incoming);
  // Which package this installation came from stays the same: an update never switches editions.
  const oldEdition = (readJson(list) as { edition?: string } | null)?.edition ?? 'starter';
  if (options.skipWorkflows) {
    // Workflow files were left alone: remember them as they were, so a later update with a token
    // that may change workflows still updates and removes them.
    const previous = readJson(list) as { files?: Record<string, string> } | null;
    for (const [path, hash] of Object.entries(previous?.files ?? {}))
      if (path.startsWith(WORKFLOWS) && isSafePath(path)) files[path] = hash;
  }
  mkdirSync(dirname(list), { recursive: true });
  writeFileSync(
    list,
    `${JSON.stringify({ version: updatePlan.version, source, edition: oldEdition, files }, null, 2)}\n`,
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
  if (!slugSchema.safeParse(options.slug).success)
    throw new Error(`invalid app address: ${options.slug}`);
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
