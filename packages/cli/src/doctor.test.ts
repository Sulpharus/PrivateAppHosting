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

const healthy = {
  'mininode.json': manifest(),
  'package.json': '{}',
  'README.md': '# Rezepte',
  'src/main.ts': "import { mininode } from '@mininode/sdk';\nconst mn = await mininode();",
  'db/001_init.sql':
    "select platform.create_app_schema('rezepte');\ncreate table app_rezepte.recipes (id uuid primary key, owner_id uuid);\nselect platform.secure_table('rezepte', 'recipes', 'private');",
};

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

describe('stripComments', () => {
  it('drops line and block comments but keeps URLs and strings', async () => {
    const { stripComments } = await import('./doctor.ts');
    expect(stripComments('a(); // window.claude\n/* process.env.API_KEY */ b("https://x.y")')).toBe(
      'a(); \n b("https://x.y")',
    );
  });
});
