// Installs the German language package the way the App Kit does (window.mnI18n), so code that
// makes texts runs in the tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Pack = Record<string, string | Record<string, string>>;
const pack = JSON.parse(
  readFileSync(join(import.meta.dirname, '../public/i18n/de.json'), 'utf8'),
) as Pack;

function text(key: string, params: Record<string, string | number> = {}): string {
  let value = pack[key];
  if (value === undefined) return key;
  if (typeof value === 'object') value = (params.n === 1 ? value.one : value.other) ?? key;
  return String(value).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}

(globalThis as { mnI18n?: unknown }).mnI18n = {
  lang: 'de',
  locale: 'de-DE',
  ready: Promise.resolve(),
  t: text,
  onChange: () => () => undefined,
};
