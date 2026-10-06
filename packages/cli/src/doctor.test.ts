import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { doctor } from './doctor.ts';

function app(files: Record<string, string>, slug = 'rezepte'): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mn-doctor-')), slug);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const manifest = (extra: object = {}) =>
  JSON.stringify({
    specVersion: 1,
    slug: 'rezepte',
    name: 'Rezepte',
    description: 'Rezepte',
    kind: 'spa',
    target: 'cloudflare',
    data: { mode: 'private' },
    build: { command: 'pnpm build', output: 'dist' },
    ...extra,
  });

const rules = (dir: string) =>
  doctor(dir)
    .findings.filter((f) => f.severity === 'error')
    .map((f) => f.rule);

const I18N = { i18n: { languages: ['de', 'en'], default: 'de' } };
const healthy = {
  'mininode.json': manifest(I18N),
  'i18n/de.json': JSON.stringify({
    'app.title': 'Rezepte',
    'list.count': { one: '{n} Rezept', other: '{n} Rezepte' },
  }),
  'i18n/en.json': JSON.stringify({
    'app.title': 'Recipes',
    'list.count': { one: '{n} recipe', other: '{n} recipes' },
  }),
  'package.json': '{}',
  'README.md': '# Rezepte',
  'src/main.ts': "import { mininode } from '@mininode/sdk';\nconst mn = await mininode();",
  'db/001_init.sql':
    "select platform.create_app_schema('rezepte');\ncreate table app_rezepte.recipes (id uuid primary key, owner_id uuid);\nselect platform.secure_table('rezepte', 'recipes', 'private');",
};

describe('doctor language packages', () => {
  const warn = (dir: string) => doctor(dir).findings.map((f) => f.rule);

  it('warns when an app has no language package', () => {
    const { 'mininode.json': _m, 'i18n/de.json': _d, 'i18n/en.json': _e, ...rest } = healthy;
    expect(warn(app({ ...rest, 'mininode.json': manifest() }))).toEqual(['i18n-missing']);
  });

  it('requires the listed files', () => {
    const { 'i18n/en.json': _e, ...rest } = healthy;
    expect(rules(app(rest))).toEqual(['i18n-missing']);
  });

  it('finds different keys, changed placeholders and broken JSON', () => {
    expect(
      rules(app({ ...healthy, 'i18n/en.json': JSON.stringify({ 'app.title': 'Recipes' }) })),
    ).toContain('i18n-parity');
    expect(
      rules(
        app({
          ...healthy,
          'i18n/en.json': JSON.stringify({
            'app.title': 'Recipes',
            'list.count': { one: '{count} recipe', other: '{count} recipes' },
          }),
        }),
      ),
    ).toContain('i18n-placeholder');
    expect(rules(app({ ...healthy, 'i18n/en.json': '{' }))).toContain('i18n-format');
  });

  it('finds keys the source uses but the packages lack', () => {
    const dir = app({
      ...healthy,
      'src/main.ts':
        "import { mininode } from '@mininode/sdk';\nconst a = t('app.title'); const b = t('app.missing');",
    });
    expect(rules(dir)).toEqual(['i18n-key-missing', 'i18n-key-missing']);
  });

  it('reads the packages from public/ for built apps', () => {
    const { 'i18n/de.json': de, 'i18n/en.json': en, ...rest } = healthy;
    expect(
      doctor(app({ ...rest, 'public/i18n/de.json': de, 'public/i18n/en.json': en })).findings,
    ).toEqual([]);
  });
});

describe('doctor', () => {
  it('passes a correctly integrated app', () => {
    expect(doctor(app(healthy)).findings).toEqual([]);
  });

  it('requires a valid manifest whose slug matches the folder', () => {
    expect(rules(app({ 'package.json': '{}' }))).toEqual(['manifest']);
    expect(rules(app({ ...healthy }, 'andere'))).toContain('manifest');
  });

  it('finds leaked secrets and client-side AI keys', () => {
    const dir = app({
      ...healthy,
      'src/ai.ts': `const key = process.env.GEMINI_API_KEY; const k2 = "AIza${'x'.repeat(35)}";`,
    });
    expect(rules(dir)).toEqual(expect.arrayContaining(['no-secrets', 'no-client-ai-keys']));
  });

  it('flags leftover artifact runtime, provider SDKs and CDN scripts', () => {
    const dir = app({
      ...healthy,
      'src/store.ts': 'await window.claude.complete("hi");',
      'src/gen.ts': "import { GoogleGenAI } from '@google/genai';",
      'index.html': '<script src="https://cdn.tailwindcss.com"></script>',
    });
    expect(rules(dir)).toEqual(
      expect.arrayContaining(['no-artifact-runtime', 'no-client-ai-sdk', 'no-cdn-scripts']),
    );
  });

  it('requires the SDK when the app stores data', () => {
    expect(rules(app({ ...healthy, 'src/main.ts': 'console.log(1)' }))).toContain('sdk-required');
  });

  it('enforces secured, schema-qualified tables without anon grants', () => {
    const dir = app({
      ...healthy,
      'db/002_more.sql': [
        'create table app_rezepte.tags (id uuid primary key);',
        'create table public.leak (id int);',
        'create table plain (id int);',
        'grant select on app_rezepte.tags to anon;',
        'create policy p on app_rezepte.tags using (true);',
      ].join('\n'),
    });
    expect(rules(dir)).toEqual(
      expect.arrayContaining(['rls-required', 'own-schema', 'no-anon-grants', 'use-secure-table']),
    );
  });

  it('warns about localStorage in data apps', () => {
    const report = doctor(app({ ...healthy, 'src/cache.ts': "localStorage.setItem('x', '1')" }));
    expect(report.findings).toEqual([
      expect.objectContaining({ severity: 'warning', rule: 'prefer-kv' }),
    ]);
  });
});

describe('doctor: lists are tables', () => {
  const rulesOf = (dir: string) =>
    doctor(dir)
      .findings.filter((f) => f.severity === 'warning')
      .map((f) => f.rule);
  const warns = (code: string) =>
    rulesOf(app({ ...healthy, 'src/store.ts': code })).includes('entity-collection-in-kv');

  it('warns about one kv key per entry', () => {
    expect(warns('await mn.kv.set(`item:${item.id}`, item);')).toBe(true);
    expect(warns('await mn.kv.get(`${collection}:${id}`);')).toBe(true);
    expect(warns('await mn.kv.set(PREFIX + item.id, item);')).toBe(true);
    expect(warns("await mn.kv.delete('act:' + id);")).toBe(true);
    expect(warns("const rows = await mn.kv.list('tx:');")).toBe(true);
  });

  it('leaves settings alone', () => {
    expect(warns("await mn.kv.set('settings', { theme: 'dark' });")).toBe(false);
    expect(warns('await mn.kv.get(`prefs`);')).toBe(false);
    expect(warns("await mn.kv.set('group:main', group, 'shared');")).toBe(false);
  });

  it('accepts a conscious exception, and ignores apps without data', () => {
    expect(
      warns(
        '// kv-collection-ok: five bookmarks, nobody queries them\nawait mn.kv.set(`b:${id}`, x);',
      ),
    ).toBe(false);
    const none = app({
      ...healthy,
      'mininode.json': manifest({ ...I18N, data: { mode: 'none' } }),
      'src/store.ts': 'await mn.kv.set(`item:${id}`, x);',
    });
    expect(rulesOf(none)).not.toContain('entity-collection-in-kv');
  });
});

describe('doctor: what the export and the platform refuse', () => {
  it('finds personal email addresses in sample data, but not example.com', () => {
    const dir = app({
      ...healthy,
      'src/data.ts':
        "export const people = [{ email: 'max@beispiel.de' }, { email: 'a@example.com' }];",
    });
    const found = doctor(dir).findings.filter((f) => f.rule === 'export-scan');
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('max@beispiel.de');
    expect(found[0]?.file).toBe('src/data.ts:1');
  });

  it('refuses a stand-in /_mininode/ folder inside the app', () => {
    const dir = app({ ...healthy, 'public/_mininode/sdk.js': '// fake sdk' });
    expect(rules(dir)).toContain('reserved-path');
  });

  it('does not scan images, fonts or dependencies', () => {
    const dir = app({
      ...healthy,
      'node_modules/lib/index.js': "const a = 'someone@private.de';",
      'public/logo.png': 'someone@private.de',
    });
    expect(rules(dir)).toEqual([]);
  });
});

describe('stripComments', () => {
  it('drops line and block comments but keeps URLs and strings', async () => {
    const { stripComments } = await import('./doctor.ts');
    expect(stripComments('a(); // window.claude\n/* process.env.API_KEY */ b("https://x.y")')).toBe(
      'a(); \n b("https://x.y")',
    );
  });
});

describe('doctor: what exports bring along', () => {
  const rulesOf = (dir: string, severity: 'error' | 'warning') =>
    doctor(dir)
      .findings.filter((f) => f.severity === severity)
      .map((f) => f.rule);

  it('stops on window.mininode read by a page that never loads the SDK', () => {
    const dir = app({
      ...healthy,
      'src/main.ts': 'const mn = await window.mininode.mininode();',
    });
    expect(rules(dir)).toContain('sdk-not-loaded');
  });

  it('accepts window.mininode when the page loads /_mininode/sdk.js', () => {
    const dir = app({
      ...healthy,
      'index.html': '<html><body><script src="/_mininode/sdk.js"></script></body></html>',
      'src/main.ts': 'const mn = await window.mininode.mininode();',
    });
    expect(rules(dir)).not.toContain('sdk-not-loaded');
  });

  it('says what window.MiniNode is when it is the reason the SDK is missing', () => {
    const dir = app({ ...healthy, 'src/main.ts': 'const x = window.MiniNode?.db;' });
    const finding = doctor(dir).findings.find((f) => f.rule === 'sdk-required');
    expect(finding?.message).toContain('window.MiniNode is not a platform API');
  });

  it('warns about a stand-in client, but not about ordinary classes', () => {
    const standIn = app({
      ...healthy,
      'src/mininode.ts': 'class FallbackMiniNodeClient {}\nclass LocalMininodeShim {}',
    });
    expect(rulesOf(standIn, 'warning')).toContain('stand-in-sdk');
    const fine = app({
      ...healthy,
      'src/other.ts': 'class MiniNodeSync {}\nclass LocalCache {}\nconst mockData = [];',
    });
    expect(rulesOf(fine, 'warning')).not.toContain('stand-in-sdk');
  });

  it('warns about stylesheets and fonts from other sites', () => {
    const dir = app({
      ...healthy,
      'index.html':
        '<html><head><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head></html>',
    });
    expect(rulesOf(dir, 'warning')).toContain('external-assets');
    const own = app({
      ...healthy,
      'index.html': '<html><head><link rel="stylesheet" href="/_mininode/ui.css"></head></html>',
    });
    expect(rulesOf(own, 'warning')).not.toContain('external-assets');
  });
});
