import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Brief,
  compose,
  groupModules,
  type Library,
  MODULE_GROUPS,
  parsePart,
  retrofitLanguagePrompt,
  slugify,
  sortParts,
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
  types: parts('docs/ai/prompts/types'),
  modules: parts('docs/ai/prompts/modules'),
};

const brief: Brief = {
  name: 'Bücherregal Plus',
  idea: 'Gelesene Bücher mit Bewertung.\nDazu eine Wunschliste.',
  audience: 'me',
  builder: 'ai-studio',
  type: 'archiv',
  modules: ['files', 'stats'],
  accent: 'violet',
  extra: '',
  short: false,
  embedKit: false,
};

describe('prompt library', () => {
  it('has complete front matter in every part', () => {
    for (const p of [...library.types, ...library.modules]) {
      expect(p.id, p.title).toMatch(/^[a-z-]+$/);
      expect(p.title.length).toBeGreaterThan(2);
      expect(p.summary.length).toBeGreaterThan(5);
      expect(p.body).toMatch(/^## /);
    }
    for (const t of library.types)
      expect(t.accent).toMatch(/^(green|blue|violet|amber|rose|teal)$/);
    expect(new Set(library.modules.map((m) => m.id)).size).toBe(library.modules.length);
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

  it('composes a prompt with the new server modules', () => {
    const text = compose(
      { ...brief, type: 'dienst', modules: ['container', 'game-generator'] },
      library,
    );
    expect(text).toContain('## App type: server process');
    expect(text).toContain('## Feature: a server process as a container app');
    expect(text).toContain('## Feature: generating puzzles');
  });
});

describe('compose', () => {
  it('puts the brief, spec, design system, type and chosen modules together', () => {
    const text = compose(brief, library);
    expect(text).toContain('# Build the MiniNode app "Bücherregal Plus"');
    expect(text).toContain('`buecherregal-plus`');
    expect(text).toContain('> Dazu eine Wunschliste.');
    expect(text).toContain('data-accent="violet"');
    expect(text).toContain('## App type: archive and collection');
    expect(text).toContain('## Feature: photos and files');
    expect(text).toContain('## Feature: statistics and charts');
    expect(text).not.toContain('## Feature: AI');
    expect(text).toContain('### The SDK');
    expect(text).toContain('## 5. Language packages (German and English)');
    expect(text).toContain('### 3. Writing the texts (both languages)');
    expect(text).toContain('`i18n/de.json` and `i18n/en.json`');
    expect(text).toContain('Platform glossary');
    expect(text).toContain('# MiniNode App Kit');
    expect(text).not.toContain('short:start');
    expect(text).not.toContain('Do not edit.');
    expect(text).not.toContain('```css');
  });

  it('embeds the kit CSS for Claude artifacts and uses the short spec on request', () => {
    const text = compose({ ...brief, builder: 'claude-artifact', short: true }, library);
    expect(text).toContain('```css');
    expect(text).toContain('--mn-accent');
    expect(text).toContain('window.storage');
    expect(text.length).toBeLessThan(
      compose({ ...brief, builder: 'claude-artifact' }, library).length,
    );
  });

  it('asks for a description when none is given', () => {
    expect(compose({ ...brief, idea: ' ' }, library)).toContain('ask before you start');
  });

  it('lets the AI choose a name instead of handing it the placeholder "Neue App"', () => {
    const text = compose({ ...brief, name: ' ' }, library);
    expect(text).toContain('# Build a MiniNode app');
    expect(text).toContain('the brief gives none. Choose a short, distinctive name');
    expect(text).not.toContain('**Slug:**');
    expect(text).not.toMatch(/\*\*Name:\*\* Neue App|Build the MiniNode app "Neue App"/);
  });

  it('names the details that make an upload fail the check', () => {
    const text = compose(brief, library);
    expect(text).toContain('never a key there');
    expect(text).toContain('no `window.MiniNode`');
    expect(text).toContain('`@example.com`');
    expect(text).toContain('**`mininode.json` has only the documented keys.**');
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
      const prompt = compose({ ...brief, short }, library);
      expect(prompt).toContain('## 5. Language packages (German and English)');
      expect(prompt).toContain('data-i18n');
      expect(prompt).toContain('i18n/de.json');
      expect(prompt).toContain('`i18n` block (de, en)');
      expect(prompt).toContain('no `i18n-*` finding');
    }
  });

  it('come with a prompt to add them to an app that already exists', () => {
    const prompt = retrofitLanguagePrompt(read('docs/ai/RETROFIT-LANGUAGE.md'), library.language);
    expect(prompt).toContain('Task: add the German and English language packages');
    // The task, the guide (all four sections) and the checks travel together.
    for (const part of [
      '## What to do',
      '## Deliver',
      '### 1. Files and manifest',
      '### 3. Writing the texts',
      '### 4. Check before you hand over',
      'Platform glossary',
    ])
      expect(prompt).toContain(part);
    expect(prompt).not.toMatch(/^# MiniNode language packages/m);
  });
});
