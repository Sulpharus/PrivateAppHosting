// Generates docs/ai/NEW-APP-SPEC.short.md from the marked section of NEW-APP-SPEC.md, so the two
// never drift. CI fails when the committed short spec is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../docs/ai/NEW-APP-SPEC.md', import.meta.url));
const target = fileURLToPath(new URL('../docs/ai/NEW-APP-SPEC.short.md', import.meta.url));

const text = readFileSync(source, 'utf8');
const match = /<!-- short:start -->\n([\s\S]*?)<!-- short:end -->/.exec(text);
if (!match?.[1]) throw new Error('short:start/short:end markers missing in NEW-APP-SPEC.md');

const body = match[1].trim();

writeFileSync(
  target,
  `<!-- Generated from NEW-APP-SPEC.md by scripts/generate-short-spec.ts. Do not edit. -->\n# MiniNode app spec (short, specVersion 1)\n\n${body}\n`,
);
console.log(`wrote ${target}`);
