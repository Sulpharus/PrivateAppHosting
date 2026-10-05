// `mininode backup verify`: is the folder complete and unchanged?

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type BackupManifest, MANIFEST_FILE, manifestSchema, sha256File } from './manifest.ts';

export interface VerifyResult {
  manifest: BackupManifest | null;
  problems: string[];
}

function listFiles(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(root, join(dir, entry.name))
      : [relative(root, join(dir, entry.name)).split('\\').join('/')],
  );
}

export function readManifest(dir: string): BackupManifest {
  const path = join(dir, MANIFEST_FILE);
  if (!existsSync(path))
    throw new Error(`${dir} has no ${MANIFEST_FILE}: this is not a backup folder`);
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success)
    throw new Error(
      `${MANIFEST_FILE} is not readable (${parsed.error.issues[0]?.message ?? 'invalid'})`,
    );
  return parsed.data;
}

export async function verifyBackup(dir: string): Promise<VerifyResult> {
  let manifest: BackupManifest;
  try {
    manifest = readManifest(dir);
  } catch (error) {
    return { manifest: null, problems: [error instanceof Error ? error.message : String(error)] };
  }
  const problems: string[] = [];
  const known = new Set<string>([MANIFEST_FILE]);
  for (const file of manifest.files) {
    known.add(file.path);
    const path = join(dir, file.path);
    if (!existsSync(path)) {
      problems.push(`missing: ${file.path}`);
      continue;
    }
    if (statSync(path).size !== file.bytes) {
      problems.push(`size differs: ${file.path}`);
      continue;
    }
    if ((await sha256File(path)).sha256 !== file.sha256) problems.push(`changed: ${file.path}`);
  }
  for (const path of listFiles(dir))
    if (!known.has(path)) problems.push(`not in the manifest: ${path}`);
  return { manifest, problems };
}
