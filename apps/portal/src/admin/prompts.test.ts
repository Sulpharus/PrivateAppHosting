import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIENCES,
  approxTokens,
  type Brief,
  BUILDER_ALIASES,
  BUILDERS,
  type Builder,
  compose,
  groupModules,
  hardRules,
  impliedModules,
  type Library,
  MODULE_GROUPS,
  parsePart,
  retrofitLanguagePrompt,
  STARTER_MARK,
  slugify,
  sortParts,
  starterFiles,
} from './prompts.ts';

const root = join(import.meta.dirname, '../../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const parts = (dir: string) =>
  sortParts(readdirSync(join(root, dir)).map((f) => parsePart(read(join(dir, f)))));

const library: Library = {
  spec: read('docs/ai/NEW-APP-SPEC.md'),
  specShort: read('docs/ai/NEW-APP-SPEC.short.md'),
  design: read('docs/ai/DESIGN-SYSTEM.md'),
  language: read('docs/ai/LANGUAGE-PACKAGES.md'),
  kitCss: read('packages/ui/kit/ui.css'),
  kitJs: read('packages/ui/kit/ui.js'),
  i18nJs: read('packages/ui/kit/i18n.js'),
  previewSdk: read('packages/ui/kit/sdk-preview.js'),
  types: parts('docs/ai/prompts/types'),
  modules: parts('docs/ai/prompts/modules'),
};

const brief: Brief = {
  task: 'new',
  name: 'Bücherregal Plus',
  idea: 'Gelesene Bücher mit Bewertung.\nDazu eine Wunschliste.',
  audience: 'me',
  builder: 'ai-studio',
  type: 'archiv',
  modules: ['files', 'stats'],
  accent: 'violet',
  extra: '',
  findings: '',
  short: false,
};
const prompt = (b: Partial<Brief> = {}) => compose({ ...brief, ...b }, library).prompt;
const BUILDER_IDS = Object.keys(BUILDERS) as Builder[];

describe('prompt library', () => {
  it('has complete front matter in every part, with a plain-language tooltip', () => {
    for (const p of [...library.types, ...library.modules]) {
      expect(p.id, p.title).toMatch(/^[a-z-]+$/);
      expect(p.title.length).toBeGreaterThan(2);
      expect(p.summary.length).toBeGreaterThan(5);
      expect(p.when, `${p.id}: when`).toMatch(/^.{30,260}$/);
      expect(p.body).toMatch(/^## /);
    }
    for (const t of library.types) {
      expect(t.accent).toMatch(/^(green|blue|violet|amber|rose|teal)$/);
      expect(Object.keys(AUDIENCES), `${t.id}: audience`).toContain(t.audience);
      for (const id of t.modules ?? [])
        expect(
          library.modules.map((m) => m.id),
          `${t.id}: module ${id}`,
        ).toContain(id);
    }
    expect(new Set(library.modules.map((m) => m.id)).size).toBe(library.modules.length);
  });

  it('keeps lists in tables: no type or module stores one kv key per entry', () => {
    // ADR 0022 and the doctor rule entity-collection-in-kv: a list of entries is a table.
    const perEntry = /`(?:[a-z]+):<(?:id|[a-z]+Id|date|YYYY-MM-DD)>/;
    for (const p of [...library.types, ...library.modules])
      for (const line of p.body.split('\n').filter((l) => /\bkv\b/.test(l)))
        expect(line, `${p.id} stores entries as kv keys`).not.toMatch(perEntry);
    expect(read('docs/ai/prompts/modules/performance.md')).not.toMatch(/kv is fine/);
  });

  it('never hard-codes German formats: they follow the language', () => {
    for (const p of [...library.types, ...library.modules])
      expect(p.body, p.id).not.toMatch(
        /'de-DE'\)|Intl\.Collator\('de'\)|toLocaleLowerCase\('de'\)/,
      );
    expect(library.design).not.toMatch(/always in German format/);
  });

  it('promises only what the platform does', () => {
    const all = [...library.types, ...library.modules].map((p) => p.body).join('\n');
    expect(all).not.toContain('images_unsupported'); // only the forbidden window.MiniNode layer throws it
    expect(all).not.toMatch(/create indexes? `?concurrently/i); // app SQL runs in a transaction
    expect(read('docs/ai/prompts/modules/multiplayer.md')).not.toMatch(
      /invitations via `mn\.notify`/,
    );
    expect(read('docs/ai/prompts/modules/places.md')).toContain('tile.openstreetmap.org');
    // The portal's address comes from mn.config.portalUrl, never a domain written into the app.
    expect(`${library.spec}${library.design}`).not.toMatch(/class="mn-home" href="https:/);
  });
});
describe('app briefs', () => {
  const dir = 'docs/ai/briefs';
  const briefs = readdirSync(join(root, dir)).filter((f) => f.endsWith('.brief.md'));

  it('only use modules and types that exist', () => {
    expect(briefs.length).toBeGreaterThan(0);
    for (const file of briefs) {
      const meta = Object.fromEntries(
        (/^---\n([\s\S]*?)\n---/.exec(read(join(dir, file)))?.[1] ?? '')
          .split('\n')
          .map((line) => [
            line.slice(0, line.indexOf(':')).trim(),
            line.slice(line.indexOf(':') + 1).trim(),
          ]),
      );
      for (const id of (meta.modules ?? '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean))
        expect(
          library.modules.some((m) => m.id === id),
          `${file}: module ${id}`,
        ).toBe(true);
      expect(
        library.types.some((t) => t.id === meta.type),
        `${file}: type`,
      ).toBe(true);
    }
  });
});

describe('module groups', () => {
  it('puts every module into a known group', () => {
    const known = MODULE_GROUPS.map((g) => g.id);
    for (const m of library.modules) expect(known, m.id).toContain(m.group);
  });

  it('lists every module once, groups in their fixed order, none empty', () => {
    const groups = groupModules(library.modules);
    expect(groups.flatMap((g) => g.parts).length).toBe(library.modules.length);
    expect(groups.every((g) => g.parts.length > 0)).toBe(true);
    const order = groups.map((g) => MODULE_GROUPS.findIndex((x) => x.id === g.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('collects modules without a group under Weitere', () => {
    const odd = { id: 'odd', title: 'Odd', summary: 'x', order: 1, body: '## x' };
    expect(groupModules([odd]).map((g) => g.id)).toEqual(['weitere']);
  });
});

describe('compose', () => {
  it('puts the reference first in tags, and the task, rules and checklist last', () => {
    const text = prompt();
    expect(text).toContain('# Build the MiniNode app "Bücherregal Plus"');
    const order = [
      '<platform_spec>',
      '<design_system>',
      '<language_packages>',
      '<app_type id="archiv">',
      '<feature id="files">',
      '\n## Your task',
      '\n## How to build and deliver',
      '\n## Hard rules',
      '\n## Before you hand it over',
    ].map((marker) => text.indexOf(marker));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain('`buecherregal-plus`');
    expect(text).toContain('> Dazu eine Wunschliste.');
    expect(text).toContain('data-accent="violet"');
    expect(text).toContain('### The SDK');
    expect(text).not.toContain('short:start');
    expect(text).not.toContain('Do not edit.');
    expect(text).not.toContain('```css');
  });

  it('always adds the tables module, and teams or readonly content for those audiences', () => {
    expect(prompt()).toContain('<feature id="tables">');
    expect(prompt({ audience: 'team' })).toContain('<feature id="teams">');
    expect(prompt({ audience: 'readonly' })).toContain('<feature id="readonly-content">');
    expect(prompt({ audience: 'none', type: 'werkzeug' })).not.toContain('<feature id="tables">');
    expect(impliedModules('team')).toEqual(['tables', 'teams']);
  });

  it('numbers the hard rules and names the data mode', () => {
    const rules = hardRules(brief, library);
    expect(rules.length).toBeGreaterThanOrEqual(12);
    expect(rules.length).toBeLessThanOrEqual(20);
    expect(prompt()).toMatch(/^2\. Every list of entries is a table/m);
    expect(prompt({ audience: 'household' })).toContain('data mode `shared-account`');
  });

  it('asks for the AI block in the checklist for every AI feature', () => {
    for (const id of ['ai', 'ai-chat', 'ai-vision'])
      expect(prompt({ modules: [id] }), id).toContain('`ai.models`');
    expect(prompt()).not.toContain('`ai.models`');
  });

  it('gives every tool its own shape', () => {
    const agent = compose({ ...brief, builder: 'repo-agent' }, library);
    expect(agent.prompt.length).toBeLessThan(6000);
    expect(agent.prompt).toContain('docs/ai/prompts/modules/files.md');
    expect(agent.prompt).toContain('pnpm mininode doctor hosted/buecherregal-plus');
    expect(agent.reference).toBeNull();

    const chatgpt = compose({ ...brief, builder: 'chatgpt' }, library);
    expect(chatgpt.prompt).not.toContain('<design_system>');
    expect(chatgpt.prompt).toContain('MININODE-REFERENCE.md');
    expect(chatgpt.reference).toContain('<design_system>');

    const bolt = compose({ ...brief, builder: 'bolt' }, library);
    expect(bolt.knowledge?.length ?? 0).toBeGreaterThan(1000);
    expect(bolt.knowledge?.length ?? 99999).toBeLessThan(6000);
    expect(bolt.prompt).toContain('Bolt Database');

    const local = compose({ ...brief, builder: 'local' }, library);
    expect(local.prompt).toContain('<html_skeleton>');
    expect(local.prompt).not.toContain('<design_system>');
    expect(local.prompt.length).toBeLessThan(prompt().length / 2);

    expect(prompt({ builder: 'ai-studio' })).toContain('no Firebase');
    expect(prompt({ builder: 'claude' })).not.toContain('window.storage');
  });

  it('describes every tool for the owner in plain language', () => {
    for (const id of BUILDER_IDS) {
      expect(BUILDERS[id].when.length, id).toBeGreaterThan(30);
      expect(BUILDERS[id].steps.length, id).toBeGreaterThanOrEqual(2);
    }
    expect(BUILDER_ALIASES['claude-code']).toBe('repo-agent');
  });

  it('shortens the design system on request', () => {
    expect(prompt({ short: true }).length).toBeLessThan(prompt().length - 5000);
    expect(prompt({ short: true })).toContain('--mn-surface');
  });

  it('writes the tasks for extending an app and fixing check findings', () => {
    expect(prompt({ task: 'extend' })).toContain('# Extend the MiniNode app');
    expect(prompt({ task: 'extend' })).toContain('change nothing else');
    const fix = prompt({
      task: 'fix',
      findings: 'error manifest mininode.json: unknown key accent',
    });
    expect(fix).toContain('# Fix the check findings');
    expect(fix).toContain('unknown key accent');
  });

  it('asks for a description when none is given', () => {
    expect(prompt({ idea: ' ' })).toContain('ask before you start');
  });

  it('lets the AI choose a name instead of handing it the placeholder "Neue App"', () => {
    const text = prompt({ name: ' ' });
    expect(text).toContain('# Build a MiniNode app');
    expect(text).toContain('the brief gives none. Choose a short, distinctive name');
    expect(text).not.toContain('**Slug:**');
    expect(text).not.toMatch(/\*\*Name:\*\* Neue App|Build the MiniNode app "Neue App"/);
  });

  it('names the details that make an upload fail the check', () => {
    const text = prompt();
    expect(text).toContain('never a key there');
    expect(text).toContain('no `window.MiniNode`');
    expect(text).toContain('`@example.com`');
    expect(text).toContain('**`mininode.json` has only the documented keys.**');
  });

  it('estimates tokens per model family', () => {
    const t = approxTokens('x'.repeat(3600));
    expect(t.gpt).toBe(1000);
    expect(t.claude).toBeGreaterThan(t.gpt);
  });
});

describe('starter package', () => {
  it('holds the kit, the preview SDK, language files, manifest, rules and reference', () => {
    const composed = compose({ ...brief, builder: 'claude' }, library);
    const files = starterFiles({ ...brief, builder: 'claude' }, library, composed);
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '_mininode/ui.css',
        '_mininode/sdk.js',
        'i18n/de.json',
        'i18n/en.json',
        'mininode.json',
        'index.html',
        'AGENTS.md',
        'MININODE-REFERENCE.md',
      ]),
    );
    const manifest = JSON.parse(files.find((f) => f.path === 'mininode.json')?.content ?? '{}');
    expect(manifest).toMatchObject({
      slug: 'buecherregal-plus',
      kind: 'static',
      data: { mode: 'private' },
    });
    expect(files.find((f) => f.path === 'AGENTS.md')?.content).toContain(STARTER_MARK);
  });

  it('uses public/ for Vite tools', () => {
    const files = starterFiles(brief, library, compose(brief, library));
    expect(files.map((f) => f.path)).toContain('public/_mininode/sdk.js');
    expect(files.find((f) => f.path === 'index.html')?.content).toContain('/src/main.tsx');
  });
});

describe('slugify', () => {
  it('makes subdomain-safe slugs', () => {
    expect(slugify('Bücherregal Plus!')).toBe('buecherregal-plus');
    expect(slugify('  Größe & Maß ')).toBe('groesse-mass');
    expect(slugify('Café')).toBe('cafe');
  });
});

describe('language packages in the prompts', () => {
  it('are part of every composed prompt: section, rules and checklist', () => {
    for (const short of [false, true]) {
      const text = prompt({ short });
      expect(text).toContain('<language_packages>');
      expect(text).toContain('data-i18n');
      expect(text).toContain('i18n/de.json');
      expect(text).toContain('`i18n` block (de, en)');
      expect(text).toContain('### 3. Writing the texts (both languages)');
    }
  });

  it('come with a prompt to add them to an app that already exists', () => {
    const retrofit = retrofitLanguagePrompt(read('docs/ai/RETROFIT-LANGUAGE.md'), library.language);
    expect(retrofit).toContain('Task: add the German and English language packages');
    // The task, the guide (all four sections) and the checks travel together.
    for (const part of [
      '## What to do',
      '## Deliver',
      '### 1. Files and manifest',
      '### 3. Writing the texts',
      '### 4. Check before you hand over',
      'Platform glossary',
    ])
      expect(retrofit).toContain(part);
    expect(retrofit).not.toMatch(/^# MiniNode language packages/m);
  });
});
