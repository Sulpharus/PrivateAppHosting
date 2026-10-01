// `mininode export`: one hosted app as a shareable project folder (ADR 0012). The files are
// read from git (the committed tree, never the working directory), so untracked files, builds
// and local edits stay behind. Symlinks, submodules, data files and binaries other than images
// and fonts are refused. Every file is scanned for credentials, identifiers of this instance
// (Supabase projects, Cloudflare account, commit authors) and personal email addresses. Any
// finding stops the export before anything is written.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseManifest } from '@mininode/manifest';

export interface Finding {
  file: string;
  line: number;
  rule: string;
}

/** Marks a folder or repository as the export of one app (checked before overwriting it). */
export const MARKER = '.mininode-export';

/** Credentials that must never leave the repository, whatever file they are in. */
const SECRET_RULES: [string, RegExp][] = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9]{32,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
  ['webhook secret', /\bwhsec_[A-Za-z0-9+/=]{16,}/],
  ['Supabase publishable key', /sb_publishable_[A-Za-z0-9_-]{10,}/],
  ['Supabase project URL', /\b[a-z]{20}\.supabase\.co\b/],
];

/** Addresses that are fine in shared code: examples and impersonal no-reply senders. */
const PUBLIC_EMAIL =
  /@example\.(com|org|net)$|^noreply@|^41898282\+github-actions\[bot\]@users\.noreply\.github\.com$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Commit names that are services, not people. */
const SERVICE_NAMES = /^(GitHub|Claude|github-actions(\[bot\])?|dependabot(\[bot\])?|web-flow)$/i;

/** Tracked files that are skipped silently: local settings and keys never belong in an export. */
const NEVER = /(^|\/)(\.env(\..*)?|\.dev\.vars|.*\.pem|.*\.key|.*\.p12|id_(rsa|ed25519)(\.pub)?)$/;
/** Files that hold data, not code: refused, so the admin sees them. */
const DATA_FILE = /\.(db|sqlite3?|csv|tsv|xlsx?|ods|zip|tar|gz|tgz|7z|bak|dump|sql\.gz)$/i;
/** Binary files allowed in an export (still scanned for keys). */
const BINARY_OK = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);

function git(root: string, args: string[]): Buffer {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.toString()}`);
  return result.stdout;
}

/**
 * Identifiers of this instance: the Cloudflare account and Supabase project refs (from the
 * deploy workflow and the Worker configs) and every commit author's address and name. Throws
 * when the account or the projects cannot be found, so a moved setting cannot silently weaken
 * the check.
 */
export function instanceIdentifiers(root: string): string[] {
  const ids = new Set<string>();
  const config = [join(root, '.github/workflows/deploy.yml')];
  const apps = join(root, 'apps');
  if (existsSync(apps))
    for (const app of readdirSync(apps)) config.push(join(apps, app, 'wrangler.jsonc'));
  let accounts = 0;
  let projects = 0;
  for (const file of config.filter((f) => existsSync(f))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:CLOUDFLARE_ACCOUNT_ID:\s*|"account_id":\s*")([a-f0-9]{32})/g))
      if (m[1] && !ids.has(m[1])) {
        ids.add(m[1]);
        accounts++;
      }
    const refs = [
      ...(/SUPABASE_PROJECT_REF:([^\n]*)/.exec(text)?.[1] ?? '').matchAll(/'([a-z]{20})'/g),
      ...text.matchAll(/https:\/\/([a-z]{20})\.supabase\.co/g),
    ];
    for (const m of refs)
      if (m[1] && !ids.has(m[1])) {
        ids.add(m[1]);
        projects++;
      }
  }
  if (accounts === 0 || projects === 0)
    throw new Error(
      'could not find the Cloudflare account and the Supabase projects of this instance (deploy.yml, apps/*/wrangler.jsonc); refusing to export without them',
    );
  const log = git(root, ['log', '--format=%ae%n%ce%n%an%n%cn']).toString('utf8');
  for (const entry of log.split('\n')) {
    const value = entry.trim();
    if (!value || PUBLIC_EMAIL.test(value) || SERVICE_NAMES.test(value)) continue;
    // Short names would match ordinary words.
    if (!value.includes('@') && value.length < 4) continue;
    ids.add(value);
  }
  return [...ids];
}

/** Secrets, instance identifiers and personal email addresses in one text. */
export function scanText(
  file: string,
  text: string,
  identifiers: string[],
  options: { emails?: boolean } = {},
): Finding[] {
  const findings: Finding[] = [];
  text.split('\n').forEach((content, index) => {
    const line = index + 1;
    for (const [rule, pattern] of SECRET_RULES)
      if (pattern.test(content)) findings.push({ file, line, rule });
    for (const id of identifiers)
      if (content.includes(id)) findings.push({ file, line, rule: 'identifier of this instance' });
    if (options.emails === false) return;
    for (const match of content.matchAll(EMAIL))
      if (!PUBLIC_EMAIL.test(match[0]) && !identifiers.includes(match[0]))
        findings.push({ file, line, rule: `email address ${match[0]}` });
  });
  return findings;
}

interface Entry {
  mode: string;
  sha: string;
  /** Path inside the app folder. */
  path: string;
}

/** The committed files of an app folder at `ref`, read from git. */
function treeEntries(root: string, appPath: string, ref: string): Entry[] {
  const out = git(root, ['ls-tree', '-r', '-z', '--full-tree', ref, '--', appPath]).toString(
    'utf8',
  );
  return out
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta = '', path = ''] = line.split('\t');
      const [mode = '', , sha = ''] = meta.split(' ');
      return { mode, sha, path: path.slice(appPath.length + 1) };
    });
}

/** Checks one committed file; returns its content when it may be exported. */
function checkFile(
  entry: Entry,
  content: Buffer,
  identifiers: string[],
  findings: Finding[],
): boolean {
  const file = entry.path;
  if (DATA_FILE.test(file)) {
    findings.push({ file, line: 0, rule: 'data file (exports carry code, never data)' });
    return false;
  }
  const binary = content.subarray(0, 8000).includes(0);
  if (!binary) {
    // Vendored third-party code carries its authors' addresses; keys are still checked.
    const emails = !file.startsWith('vendor/') && !file.includes('/vendor/');
    findings.push(...scanText(file, content.toString('utf8'), identifiers, { emails }));
    return true;
  }
  const ext = extname(file).toLowerCase();
  if (!BINARY_OK.has(ext)) {
    findings.push({ file, line: 0, rule: 'binary file (only images and fonts are exported)' });
    return false;
  }
  if ((ext === '.jpg' || ext === '.jpeg') && content.includes('Exif\0\0'))
    findings.push({
      file,
      line: 0,
      rule: 'image metadata (EXIF, may hold place and camera); strip it',
    });
  findings.push(...scanText(file, content.toString('latin1'), identifiers, { emails: false }));
  return true;
}

/** Refuses output folders whose deletion would hurt: the repository, the app, unrelated folders. */
function checkOut(root: string, appDir: string, outDir: string): void {
  const inside = (child: string, parent: string) =>
    child === parent || child.startsWith(parent + sep);
  if (inside(root, outDir) || inside(outDir, appDir) || inside(appDir, outDir))
    throw new Error(`refusing to write the export to ${outDir}`);
  if (existsSync(outDir) && readdirSync(outDir).length > 0 && !existsSync(join(outDir, MARKER)))
    throw new Error(`${outDir} is not empty and not an earlier export`);
}

export interface ExportResult {
  slug: string;
  files: string[];
  findings: Finding[];
}

function guide(slug: string, name: string, description: string, hasDb: boolean): string {
  return `# ${name} — a MiniNode app

${description}

This folder is a MiniNode app package, exported without any user data or keys. It runs inside
a MiniNode instance, which provides the login, the SDK (\`/_mininode/sdk.js\`), the app kit and
the data storage.

## Install it in your MiniNode

1. Copy this folder to \`hosted/${slug}/\` in your MiniNode repository (or drop it as a ZIP into
   \`inbox/\` and run the \`integrate-app\` skill).
2. \`pnpm mininode doctor hosted/${slug}\` checks it.
3. \`pnpm mininode dev hosted/${slug}\` runs it locally; merging to \`main\` deploys it.
${hasDb ? '\n`db/` holds the table definitions (migrations) only, never rows.\n' : ''}
\`mininode.json\` lists what the app asks for: data mode, shared record types, external APIs
(the keys stay with each MiniNode admin) and Google access.

The original README follows in \`README.md\`, when the app has one.
`;
}

/**
 * Exports one hosted app as committed at `ref` into `outDir`. Nothing is written when the scan
 * finds anything.
 */
export function exportApp(
  root: string,
  appDir: string,
  outDir: string,
  ref = 'HEAD',
): ExportResult {
  const absRoot = resolve(root);
  const absApp = resolve(appDir);
  const absOut = resolve(outDir);
  const appPath = relative(absRoot, absApp).split(sep).join('/');
  if (!appPath || appPath.startsWith('..')) throw new Error(`${appDir} is outside the repository`);

  const entries = treeEntries(absRoot, appPath, ref);
  const manifestEntry = entries.find((e) => e.path === 'mininode.json');
  if (!manifestEntry) throw new Error(`${appPath} has no committed mininode.json`);
  const parsed = parseManifest(
    JSON.parse(git(absRoot, ['cat-file', 'blob', manifestEntry.sha]).toString('utf8')),
  );
  if (!parsed.ok) throw new Error(`invalid manifest: ${parsed.errors.join('; ')}`);
  const { manifest } = parsed;
  if (manifest.library)
    throw new Error('library programs are not exported (they come from their own projects)');
  checkOut(absRoot, absApp, absOut);

  const identifiers = instanceIdentifiers(absRoot);
  const findings: Finding[] = [];
  const files: { path: string; content: Buffer }[] = [];
  for (const entry of entries) {
    if (NEVER.test(entry.path)) continue;
    if (entry.mode === '120000' || entry.mode === '160000') {
      const kind = entry.mode === '120000' ? 'symbolic link' : 'submodule';
      findings.push({ file: entry.path, line: 0, rule: `${kind} (only plain files are exported)` });
      continue;
    }
    const content = git(absRoot, ['cat-file', 'blob', entry.sha]);
    if (checkFile(entry, content, identifiers, findings)) files.push({ path: entry.path, content });
  }
  const paths = files.map((f) => f.path);
  if (findings.length > 0) return { slug: manifest.slug, files: paths, findings };

  rmSync(absOut, { recursive: true, force: true });
  for (const file of files) {
    const target = join(absOut, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  writeFileSync(
    join(absOut, 'MININODE.md'),
    guide(
      manifest.slug,
      manifest.name,
      manifest.description,
      paths.some((p) => p.startsWith('db/')),
    ),
  );
  writeFileSync(join(absOut, MARKER), `slug=${manifest.slug}\n`);
  if (!paths.includes('.gitignore'))
    writeFileSync(join(absOut, '.gitignore'), 'node_modules/\ndist/\n.env*\n.dev.vars\n');
  return { slug: manifest.slug, files: paths, findings };
}
