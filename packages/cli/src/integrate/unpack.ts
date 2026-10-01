import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

/** An export is a few MB of source; anything bigger is not an app. */
export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export const MAX_FILES = 20_000;

export class UnpackError extends Error {}

/** `unzip -Z` lines: `-rw-r--r--  3.0 unx  1234 tx  567 defN 26-Oct-01 12:00 path`. */
export function checkZipListing(listing: string): void {
  let files = 0;
  let bytes = 0;
  for (const line of listing.split('\n')) {
    const match = /^(\S{10})\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(line);
    if (!match) continue;
    const [, mode = '', size = '0', name = ''] = match;
    files += 1;
    bytes += Number(size);
    if (mode.startsWith('l')) throw new UnpackError(`Das ZIP enthält einen Link (${name}).`);
    const normalized = name.replaceAll('\\', '/');
    if (
      normalized.startsWith('/') ||
      /^[A-Za-z]:/.test(normalized) ||
      normalized.split('/').includes('..')
    )
      throw new UnpackError(`Das ZIP enthält einen unzulässigen Pfad (${name}).`);
  }
  if (files > MAX_FILES) throw new UnpackError('Das ZIP enthält zu viele Dateien.');
  if (bytes > MAX_UNPACKED_BYTES) throw new UnpackError('Das ZIP ist entpackt zu groß.');
}

/** Unpacks a ZIP into `dest` after checking its listing (no links, no paths outside `dest`). */
export function unpackZip(zip: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const run = (args: string[]) =>
    execFileSync('unzip', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try {
    checkZipListing(run(['-Z', zip]));
    run(['-q', '-o', zip, '-d', dest]);
  } catch (error) {
    if (error instanceof UnpackError) throw error;
    throw new UnpackError('Das ZIP lässt sich nicht entpacken.');
  }
  // Belt and braces: nothing may have landed outside dest.
  const root = resolve(dest) + sep;
  for (const file of walkAll(dest)) {
    if (!resolve(file).startsWith(root)) throw new UnpackError('Das ZIP schreibt außerhalb.');
  }
}

function* walkAll(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walkAll(path);
    else yield path;
  }
}

/** Copies a folder (an already unpacked export), without dependencies and VCS data. */
export function copyProject(source: string, dest: string): void {
  cpSync(source, dest, {
    recursive: true,
    filter: (path) => !['node_modules', '.git'].includes(basename(path)),
  });
}

/** Exports often wrap everything in one folder: descend while a single real folder is all there is. */
export function projectRoot(dir: string): string {
  let current = dir;
  for (let depth = 0; depth < 3; depth += 1) {
    const entries = readdirSync(current).filter((name) => name !== '__MACOSX');
    const only = entries.length === 1 ? entries[0] : undefined;
    if (!only || !statSync(join(current, only)).isDirectory()) break;
    current = join(current, only);
  }
  return existsSync(current) ? current : dir;
}
