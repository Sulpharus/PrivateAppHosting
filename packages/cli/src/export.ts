// `mininode export`: one hosted app as a shareable project folder (ADR 0012). Only files tracked
// by git are taken (no node_modules, builds, .env files or local data), user data never leaves
// Supabase, and the result is scanned for secrets and for identifiers of this instance
// (Supabase projects, Cloudflare account, the owner's email). Any finding stops the export.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseManifest } from '@mininode/manifest';

export interface Finding {
  file: string;
  line: number;
  rule: string;
}

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

/** Addresses that are fine in shared code: examples and no-reply senders. */
const PUBLIC_EMAIL = /@(example\.(com|org|net)|users\.noreply\.github\.com)$|^noreply@/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Files that are never exported even when tracked. */
const NEVER = /(^|\/)(\.env(\..*)?|\.dev\.vars|.*\.pem|.*\.key|.*\.p12|id_(rsa|ed25519)(\.pub)?)$/;

/** Identifiers of this instance: Cloudflare account, Supabase project refs, owner emails. */
export function instanceIdentifiers(root: string): string[] {
  const ids = new Set<string>();
  const deploy = join(root, '.github/workflows/deploy.yml');
  if (existsSync(deploy)) {
    const text = readFileSync(deploy, 'utf8');
    for (const m of text.matchAll(/CLOUDFLARE_ACCOUNT_ID:\s*([a-f0-9]{32})/g))
      if (m[1]) ids.add(m[1]);
    const refs = /SUPABASE_PROJECT_REF:([^\n]*)/.exec(text)?.[1] ?? '';
    for (const m of refs.matchAll(/'([a-z]{20})'/g)) if (m[1]) ids.add(m[1]);
  }
  const log = spawnSync('git', ['log', '--format=%ae%n%ce'], { cwd: root, encoding: 'utf8' });
  for (const email of (log.stdout ?? '').split('\n')) {
    const trimmed = email.trim();
    if (trimmed && !PUBLIC_EMAIL.test(trimmed)) ids.add(trimmed);
  }
  return [...ids];
}

/** Secrets, instance identifiers and personal email addresses in one text file. */
export function scanText(file: string, text: string, identifiers: string[]): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split('\n');
  lines.forEach((content, index) => {
    const line = index + 1;
    for (const [rule, pattern] of SECRET_RULES)
      if (pattern.test(content)) findings.push({ file, line, rule });
    for (const id of identifiers)
      if (content.includes(id)) findings.push({ file, line, rule: 'identifier of this instance' });
    for (const match of content.matchAll(EMAIL))
      if (!PUBLIC_EMAIL.test(match[0]) && !identifiers.includes(match[0]))
        findings.push({ file, line, rule: `email address ${match[0]}` });
  });
  return findings;
}

function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

/** Tracked files of an app directory, relative to it. */
export function trackedFiles(root: string, appDir: string): string[] {
  const result = spawnSync('git', ['ls-files', '-z', '--', relative(root, appDir)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((file) => relative(relative(root, appDir), file));
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

/** Copies one hosted app into `outDir` and scans the copy. Nothing is written when it finds anything. */
export function exportApp(root: string, appDir: string, outDir: string): ExportResult {
  const manifestFile = join(appDir, 'mininode.json');
  if (!existsSync(manifestFile)) throw new Error(`${appDir} has no mininode.json`);
  const parsed = parseManifest(JSON.parse(readFileSync(manifestFile, 'utf8')));
  if (!parsed.ok) throw new Error(`invalid manifest: ${parsed.errors.join('; ')}`);
  const { manifest } = parsed;
  if (manifest.library)
    throw new Error('library programs are not exported (they come from their own projects)');

  const identifiers = instanceIdentifiers(root);
  const files = trackedFiles(root, appDir).filter((file) => !NEVER.test(file));
  const findings: Finding[] = [];
  for (const file of files) {
    const buffer = readFileSync(join(appDir, file));
    if (isBinary(buffer)) continue;
    // Vendored third-party code carries its authors' addresses; secrets are still checked.
    const text = buffer.toString('utf8');
    const found = scanText(file, text, identifiers);
    findings.push(
      ...(file.startsWith('vendor/')
        ? found.filter((f) => !f.rule.startsWith('email address'))
        : found),
    );
  }
  if (findings.length > 0) return { slug: manifest.slug, files, findings };

  rmSync(outDir, { recursive: true, force: true });
  for (const file of files) {
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(appDir, file), target);
  }
  writeFileSync(
    join(outDir, 'MININODE.md'),
    guide(
      manifest.slug,
      manifest.name,
      manifest.description,
      files.some((f) => f.startsWith('db/')),
    ),
  );
  if (!files.includes('.gitignore'))
    writeFileSync(join(outDir, '.gitignore'), 'node_modules/\ndist/\n.env*\n.dev.vars\n');
  return { slug: manifest.slug, files, findings };
}
