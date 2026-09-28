import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Brief, compose, type Library, parsePart, slugify, sortParts } from './prompts.ts';

const root = join(import.meta.dirname, '../../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const parts = (dir: string) =>
  sortParts(readdirSync(join(root, dir)).map((f) => parsePart(read(join(dir, f)))));

const library: Library = {
  spec: read('docs/ai/NEW-APP-SPEC.md'),
  specShort: read('docs/ai/NEW-APP-SPEC.short.md'),
  design: read('docs/ai/DESIGN-SYSTEM.md'),
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
});

describe('slugify', () => {
  it('makes subdomain-safe slugs', () => {
    expect(slugify('Bücherregal Plus!')).toBe('buecherregal-plus');
    expect(slugify('  Größe & Maß ')).toBe('groesse-mass');
    expect(slugify('Café')).toBe('cafe');
  });
});
