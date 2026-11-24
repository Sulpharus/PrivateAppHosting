// Turns a brief from docs/ai/briefs into the construction prompt (the same one Verwaltung →
// KI-Werkstatt builds for the brief's tool): reference (spec, design system, language packages, app
// type, feature modules), task, delivery, hard rules and checklist. A tool that takes a reference
// file (ChatGPT, Bolt) gets it appended after a separator.
// Usage: node scripts/compose-brief.ts docs/ai/briefs/<name>.brief.md
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Audience,
  type Brief,
  BUILDER_ALIASES,
  BUILDERS,
  type Builder,
  compose,
  type Library,
  parsePart,
  sortParts,
} from '../apps/portal/src/admin/prompts.ts';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const parts = (dir: string) =>
  sortParts(readdirSync(join(root, dir)).map((file) => parsePart(read(join(dir, file)))));

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/compose-brief.ts docs/ai/briefs/<name>.brief.md');
  process.exit(1);
}

const source = readFileSync(file, 'utf8');
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
if (!match) throw new Error(`${file}: front matter missing`);
const meta = Object.fromEntries(
  (match[1] ?? '').split('\n').map((line) => {
    const at = line.indexOf(':');
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }),
);

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

const modules = (meta.modules ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const unknown = modules.filter((id) => !library.modules.some((m) => m.id === id));
if (unknown.length) throw new Error(`${file}: unknown modules ${unknown.join(', ')}`);
if (!library.types.some((t) => t.id === meta.type)) throw new Error(`${file}: unknown type`);

const wanted = meta.builder ?? 'ai-studio';
const builder = BUILDER_ALIASES[wanted] ?? wanted;
if (!(builder in BUILDERS)) throw new Error(`${file}: unknown builder ${wanted}`);

const brief: Brief = {
  task: 'new',
  name: meta.name ?? '',
  idea: (match[2] ?? '').trim(),
  audience: (meta.audience ?? 'me') as Audience,
  builder: builder as Builder,
  type: meta.type ?? 'sonstiges',
  modules: [...modules, ...(meta.ai === 'true' && !modules.includes('ai') ? ['ai'] : [])],
  accent: meta.accent ?? 'violet',
  extra: '',
  findings: '',
  short: false,
};
const composed = compose(brief, library);
const reference =
  BUILDERS[brief.builder].output === 'split' && composed.reference
    ? `\n---\n\n${composed.reference}`
    : '';
process.stdout.write(`${composed.prompt}${reference}\n`);
