// Turns a brief from docs/ai/briefs into the full construction prompt (the same one Verwaltung →
// KI-Werkstatt builds): the brief, the platform spec, the design system, the app type, the chosen
// feature modules and the kit CSS. Usage: node scripts/compose-brief.ts docs/ai/briefs/<name>.brief.md
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Audience,
  type Brief,
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

const brief: Brief = {
  name: meta.name ?? '',
  idea: (match[2] ?? '').trim(),
  audience: (meta.audience ?? 'me') as Audience,
  builder: (meta.builder ?? 'ai-studio') as Builder,
  type: meta.type ?? 'sonstiges',
  modules: [...modules, ...(meta.ai === 'true' && !modules.includes('ai') ? ['ai'] : [])],
  accent: meta.accent ?? 'violet',
  extra: '',
  short: false,
  embedKit: true,
};
process.stdout.write(`${compose(brief, library)}\n`);
