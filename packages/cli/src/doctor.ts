// `mininode doctor`: the deterministic definition of done for a hosted app. The integrate-app
// skill and CI run exactly the same checks.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  appSchemaName,
  checkPackage,
  compareLanguagePackages,
  type I18nIssue,
  type LanguagePackage,
  MANIFEST_FILENAME,
  type Manifest,
  parseManifest,
  usedKeys,
} from '@mininode/manifest';
import { NON_TEXT, scanText } from './export.ts';

export type Severity = 'error' | 'warning';

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  file?: string;
}

export interface DoctorReport {
  app: string;
  manifest: Manifest | null;
  findings: Finding[];
}

const SOURCE_EXTENSIONS = /\.(m?[jt]sx?|vue|svelte|html|astro|py)$/;
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.wrangler',
  '.turbo',
  '.venv',
  '__pycache__',
]);

const SECRET_PATTERNS: [string, RegExp][] = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Anthropic API key', /sk-ant-[0-9A-Za-z_-]{20,}/],
  ['OpenAI-style secret key', /\bsk-(proj-)?[0-9A-Za-z]{32,}/],
  ['Supabase secret key', /sb_secret_[0-9A-Za-z_-]{20,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

/** Removes JS comments so explanatory notes do not trip code rules (secrets are still checked raw). */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) yield* walk(path);
    else if (stats.size < 2_000_000) yield path;
  }
}

/** `class FallbackMiniNodeClient`, `LocalMiniNodeShim`, `const mockMininode = …`. */
const STAND_IN =
  /\b(?:class|function|const|let)\s+(?:\w*(?:Fallback|Shim|Mock|Fake|Stub|Local)\w*(?:MiniNode|Mininode)\w*|\w*(?:MiniNode|Mininode)\w*(?:Fallback|Shim|Mock|Fake|Stub)\w*)\b/;

function checkSources(
  dir: string,
  manifest: Manifest,
  findings: Finding[],
  keysUsed: Set<string>,
): void {
  const clientSide = manifest.target === 'cloudflare' || manifest.target === 'vercel';
  let usesSdk = false;
  // `window.mininode` only exists where /_mininode/sdk.js is loaded: an app that reads it without
  // loading the script (a Vite app has to import the package) runs on whatever fallback it has.
  let readsWindowSdk = false;
  let usesMiniNodeGlobal = false;

  for (const file of walk(dir)) {
    if (!SOURCE_EXTENSIONS.test(file) && !file.endsWith('.json') && !file.endsWith('.env'))
      continue;
    const rel = relative(dir, file);
    const text = readFileSync(file, 'utf8');

    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({
          severity: 'error',
          rule: 'no-secrets',
          file: rel,
          message: `contains a ${label}`,
        });
      }
    }
    if (!SOURCE_EXTENSIONS.test(file)) continue;
    const code = file.endsWith('.html') ? text : stripComments(text);

    if (/@mininode\/sdk|\/_mininode\/sdk\.js/.test(code)) usesSdk = true;
    if (/window\.mininode/.test(code)) readsWindowSdk = true;
    if (clientSide && STAND_IN.test(code)) {
      findings.push({
        severity: 'warning',
        rule: 'stand-in-sdk',
        file: rel,
        message:
          'defines its own stand-in for the platform client (a fallback or shim): where it takes over, data stays in this browser and never reaches the account; use the SDK directly',
      });
    }
    if (/\bwindow\.MiniNode\b|\)\.MiniNode\b/.test(code)) usesMiniNodeGlobal = true;
    for (const key of usedKeys(code)) keysUsed.add(key);

    if (clientSide) {
      if (/process\.env\.(API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)/.test(code)) {
        findings.push({
          severity: 'error',
          rule: 'no-client-ai-keys',
          file: rel,
          message:
            'reads an AI key in client code; call mn.ai instead (keys stay on ai.mininode.app)',
        });
      }
      if (
        /from ['"](@google\/genai|@google\/generative-ai|@anthropic-ai\/sdk|openai)['"]/.test(code)
      ) {
        findings.push({
          severity: 'error',
          rule: 'no-client-ai-sdk',
          file: rel,
          message: 'imports a provider SDK in client code; use mn.ai.chat / mn.ai.json',
        });
      }
      if (/window\.claude\b/.test(code)) {
        findings.push({
          severity: 'error',
          rule: 'no-artifact-runtime',
          file: rel,
          message: 'uses the Claude artifact runtime (window.claude); replace with mn.ai / mn.kv',
        });
      }
      if (rel.endsWith('.html') && /<script[^>]+src=["']https?:\/\//i.test(code)) {
        findings.push({
          severity: 'error',
          rule: 'no-cdn-scripts',
          file: rel,
          message:
            'loads scripts from a CDN; bundle them (the CSP only allows same-origin scripts)',
        });
      }
      if (
        /<link\b[^>]*\bhref=["']https?:\/\/[^"']+["'][^>]*>/i.test(code) &&
        /rel=["']stylesheet["']/i.test(code) &&
        rel.endsWith('.html')
      ) {
        findings.push({
          severity: 'warning',
          rule: 'external-assets',
          file: rel,
          message:
            'loads a stylesheet or font from another site; the CSP blocks it (icon names then show as plain text). Self-host it: npm package @fontsource-variable/<font>, icons with scripts/subset-icons.py',
        });
      }
      if (/\blocalStorage\.(setItem|getItem)/.test(code) && manifest.data.mode !== 'none') {
        findings.push({
          severity: 'warning',
          rule: 'prefer-kv',
          file: rel,
          message: 'stores data in localStorage; use mn.kv so it syncs across devices',
        });
      }
    }
  }

  if (clientSide && readsWindowSdk && !usesSdk) {
    findings.push({
      severity: 'error',
      rule: 'sdk-not-loaded',
      message:
        'reads window.mininode but never loads it: add <script src="/_mininode/sdk.js"></script> to the page, or import { mininode } from "@mininode/sdk" (Vite apps); without it the app silently runs on its own fallback',
    });
  }
  if (manifest.data.mode !== 'none' && clientSide && !usesSdk && !readsWindowSdk) {
    findings.push({
      severity: 'error',
      rule: 'sdk-required',
      message: `data mode "${manifest.data.mode}" needs @mininode/sdk (import it or load /_mininode/sdk.js)${
        usesMiniNodeGlobal
          ? '; window.MiniNode is not a platform API for apps with their own mininode.json: import { mininode } from "@mininode/sdk" and use mn.auth and mn.kv'
          : ''
      }`,
    });
  }
  if (manifest.ai && clientSide && !usesSdk && !readsWindowSdk) {
    findings.push({
      severity: 'error',
      rule: 'sdk-required',
      message: 'ai is configured but the SDK is not used',
    });
  }
}

/**
 * What would stop `mininode export` (and the CI test that exports every hosted app): secrets,
 * identifiers of this instance and personal email addresses, such as the sample people an AI
 * tool puts into demo data. Finding them here keeps them out of main.
 */
function checkExportable(dir: string, findings: Finding[]): void {
  for (const file of walk(dir)) {
    if (NON_TEXT.test(file)) continue;
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    const rel = relative(dir, file).split('\\').join('/');
    const seen = new Set<string>();
    // Vendored third-party code carries its authors' addresses (as in the export); keys still count.
    const emails = !rel.startsWith('vendor/') && !rel.includes('/vendor/');
    for (const found of scanText(rel, buffer.toString('utf8'), [], { emails })) {
      const key = `${found.rule}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        severity: 'error',
        rule: 'export-scan',
        file: `${rel}:${found.line}`,
        message: `contains ${found.rule}; remove it or use an @example.com address, otherwise the app cannot be exported`,
      });
    }
  }
}

/** The gate serves /_mininode/*; a copy in the app (a stand-in SDK or kit) would shadow it. */
function checkReservedPaths(dir: string, findings: Finding[]): void {
  for (const reserved of ['public/_mininode', '_mininode']) {
    if (existsSync(join(dir, reserved))) {
      findings.push({
        severity: 'error',
        rule: 'reserved-path',
        file: reserved,
        message:
          'the platform serves /_mininode/ (SDK, App Kit, language helper) itself; delete this folder, a copy here is a stand-in that fakes the login and the data',
      });
    }
  }
}

function checkMigrations(dir: string, manifest: Manifest, findings: Finding[]): void {
  const dbDir = join(dir, 'db');
  if (!existsSync(dbDir)) return;
  const schema = appSchemaName(manifest.slug);
  const sql = readdirSync(dbDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ file: `db/${file}`, text: readFileSync(join(dbDir, file), 'utf8') }));

  for (const { file, text } of sql) {
    const lower = text.toLowerCase();
    if (/\bto\s+anon\b/.test(lower) || /\bto\s+public\b/.test(lower)) {
      findings.push({
        severity: 'error',
        rule: 'no-anon-grants',
        file,
        message: 'grants privileges to anon/public',
      });
    }
    if (/disable\s+row\s+level\s+security/.test(lower)) {
      findings.push({
        severity: 'error',
        rule: 'rls-required',
        file,
        message: 'disables row level security',
      });
    }
    if (/create\s+policy/.test(lower)) {
      findings.push({
        severity: 'error',
        rule: 'use-secure-table',
        file,
        message: 'writes policies by hand; use platform.secure_table(slug, table, mode)',
      });
    }
    const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w]+"?)\.("?[\w]+"?)/g;
    for (const match of lower.matchAll(tableRe)) {
      const tableSchema = (match[1] ?? '').replaceAll('"', '');
      const table = (match[2] ?? '').replaceAll('"', '');
      if (tableSchema !== schema) {
        findings.push({
          severity: 'error',
          rule: 'own-schema',
          file,
          message: `table ${tableSchema}.${table} is outside ${schema}`,
        });
        continue;
      }
      const secured = new RegExp(`secure_table\\(\\s*'${manifest.slug}'\\s*,\\s*'${table}'`).test(
        sql.map((entry) => entry.text.toLowerCase()).join('\n'),
      );
      if (!secured) {
        findings.push({
          severity: 'error',
          rule: 'rls-required',
          file,
          message: `${schema}.${table} is never passed to platform.secure_table`,
        });
      }
    }
    const unqualified = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?\w+"?\s*\(/.test(lower);
    if (unqualified) {
      findings.push({
        severity: 'error',
        rule: 'own-schema',
        file,
        message: `tables must be schema-qualified (${schema}.<table>)`,
      });
    }
  }
}

/** Language packages (ADR 0017): present, well-formed, the same keys in both, all used keys exist. */
function checkI18n(dir: string, manifest: Manifest, keysUsed: Set<string>, findings: Finding[]) {
  const add = (issue: I18nIssue, file?: string) =>
    findings.push({
      severity: issue.severity,
      rule: issue.rule,
      message: issue.message,
      ...(file ? { file } : {}),
    });
  if (!manifest.i18n) {
    findings.push({
      severity: 'warning',
      rule: 'i18n-missing',
      message:
        'no language package: the language switch in the portal has no effect on this app. Add i18n/de.json and i18n/en.json and an "i18n" block to mininode.json',
    });
    return;
  }
  const folder = ['i18n', 'public/i18n'].find((candidate) => existsSync(join(dir, candidate)));
  const packs = new Map<string, LanguagePackage>();
  for (const code of manifest.i18n.languages) {
    const file = `${folder ?? 'i18n'}/${code}.json`;
    if (!folder || !existsSync(join(dir, file))) {
      findings.push({
        severity: 'error',
        rule: 'i18n-missing',
        file,
        message: `listed under "i18n" but ${file} does not exist`,
      });
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      findings.push({ severity: 'error', rule: 'i18n-format', file, message: String(error) });
      continue;
    }
    const structural = checkPackage(code, data);
    for (const issue of structural) add(issue, file);
    if (!structural.some((i) => i.severity === 'error')) packs.set(code, data as LanguagePackage);
  }
  const de = packs.get('de');
  const en = packs.get('en');
  if (de && en) for (const issue of compareLanguagePackages(de, en)) add(issue, folder);
  for (const [code, pack] of packs) {
    for (const key of keysUsed)
      if (!(key in pack))
        findings.push({
          severity: 'error',
          rule: 'i18n-key-missing',
          file: `${folder}/${code}.json`,
          message: `the app uses "${key}" but ${code}.json has no such key`,
        });
  }
}

function checkLayout(dir: string, manifest: Manifest, findings: Finding[]): void {
  const hasPackageJson = existsSync(join(dir, 'package.json'));
  if (manifest.build?.command && !hasPackageJson && manifest.kind !== 'container') {
    findings.push({
      severity: 'error',
      rule: 'build',
      message: 'build.command is set but there is no package.json',
    });
  }
  if (manifest.kind === 'container' && !existsSync(join(dir, 'Dockerfile'))) {
    findings.push({
      severity: 'error',
      rule: 'container',
      message: 'container apps need a Dockerfile',
    });
  }
  if (manifest.kind === 'static' && !manifest.build && !existsSync(join(dir, 'index.html'))) {
    findings.push({
      severity: 'error',
      rule: 'static',
      message: 'static apps without a build need an index.html',
    });
  }
  if (!existsSync(join(dir, 'README.md'))) {
    findings.push({
      severity: 'warning',
      rule: 'readme',
      message: 'add a short README.md (what the app does, where it came from)',
    });
  }
}

export function doctor(dir: string): DoctorReport {
  const findings: Finding[] = [];
  const manifestPath = join(dir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    return {
      app: dir,
      manifest: null,
      findings: [
        { severity: 'error', rule: 'manifest', message: `${MANIFEST_FILENAME} is missing` },
      ],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return {
      app: dir,
      manifest: null,
      findings: [
        { severity: 'error', rule: 'manifest', message: `invalid JSON: ${String(error)}` },
      ],
    };
  }
  const parsed = parseManifest(raw);
  if (!parsed.ok) {
    return {
      app: dir,
      manifest: null,
      findings: parsed.errors.map((message) => ({
        severity: 'error' as const,
        rule: 'manifest',
        message,
      })),
    };
  }

  const manifest = parsed.manifest;
  const folder = dir.split(/[\\/]/).filter(Boolean).pop();
  if (folder !== manifest.slug) {
    findings.push({
      severity: 'error',
      rule: 'manifest',
      message: `folder name "${folder}" must equal slug "${manifest.slug}"`,
    });
  }
  checkLayout(dir, manifest, findings);
  checkReservedPaths(dir, findings);
  checkExportable(dir, findings);
  const keysUsed = new Set<string>();
  checkSources(dir, manifest, findings, keysUsed);
  checkI18n(dir, manifest, keysUsed, findings);
  checkMigrations(dir, manifest, findings);
  return { app: manifest.slug, manifest, findings };
}

export function hostedApps(root: string): string[] {
  const hosted = join(root, 'hosted');
  if (!existsSync(hosted)) return [];
  return readdirSync(hosted)
    .filter((entry) => !entry.startsWith('.') && statSync(join(hosted, entry)).isDirectory())
    .map((entry) => join(hosted, entry));
}
