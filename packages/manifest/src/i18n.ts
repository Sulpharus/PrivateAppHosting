// Checks for app language packages (ADR 0017): `i18n/de.json` and `i18n/en.json`. Pure, so the
// CLI doctor, the tests and the portal's prompt checks use the same rules.

export type PackageValue = string | Record<string, string>;
export type LanguagePackage = Record<string, PackageValue>;

export interface I18nIssue {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
}

/** Keys are dotted ids: `area.name` (at least one dot), so they are easy to find in the source. */
export const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/;
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

const forms = (value: PackageValue): [string, string][] =>
  typeof value === 'string' ? [['', value]] : Object.entries(value);

/** The text a person reads, for "was this translated" comparisons. */
const readable = (value: PackageValue): string =>
  forms(value)
    .map(([, text]) => text)
    .join(' ');

/** Structure of one package: keys, values, plural forms. */
export function checkPackage(code: string, pack: unknown): I18nIssue[] {
  const issues: I18nIssue[] = [];
  const fail = (rule: string, message: string) =>
    issues.push({ severity: 'error', rule, message: `${code}.json: ${message}` });
  if (typeof pack !== 'object' || pack === null || Array.isArray(pack)) {
    fail('i18n-format', 'must be a JSON object of keys and texts');
    return issues;
  }
  for (const [key, value] of Object.entries(pack)) {
    if (!KEY_PATTERN.test(key)) fail('i18n-key', `key "${key}" must look like area.name`);
    if (typeof value === 'string') {
      if (!value.trim()) fail('i18n-empty', `"${key}" is empty`);
      if (value !== value.trim()) fail('i18n-space', `"${key}" starts or ends with a space`);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.some(([form]) => form === 'other'))
        fail('i18n-plural', `"${key}" needs an "other" form`);
      for (const [form, text] of entries) {
        if (!PLURAL_FORMS.has(form)) fail('i18n-plural', `"${key}" has unknown form "${form}"`);
        if (typeof text !== 'string' || !text.trim())
          fail('i18n-empty', `"${key}.${form}" must be a non-empty text`);
      }
      // The singular may say "one entry" instead of "{n} entries": the count `n` is optional.
      const sets = new Set(
        entries.map(([, text]) =>
          typeof text === 'string'
            ? placeholders(text)
                .filter((p) => p !== 'n')
                .join(',')
            : '',
        ),
      );
      if (sets.size > 1) fail('i18n-placeholder', `"${key}" forms use different placeholders`);
    } else {
      fail('i18n-format', `"${key}" must be a text or an object of plural forms`);
    }
  }
  return issues;
}

/** The German and the English package must say the same things in the same shape. */
export function compareLanguagePackages(de: LanguagePackage, en: LanguagePackage): I18nIssue[] {
  const issues: I18nIssue[] = [];
  const add = (severity: 'error' | 'warning', rule: string, message: string) =>
    issues.push({ severity, rule, message });
  for (const key of Object.keys(de))
    if (!(key in en)) add('error', 'i18n-parity', `"${key}" is missing in en.json`);
  for (const key of Object.keys(en))
    if (!(key in de)) add('error', 'i18n-parity', `"${key}" is missing in de.json`);
  for (const [key, deValue] of Object.entries(de)) {
    const enValue = en[key];
    if (enValue === undefined) continue;
    if (typeof deValue !== typeof enValue) {
      add('error', 'i18n-plural', `"${key}" is a plural object in only one language`);
      continue;
    }
    const deHolders = [...new Set(forms(deValue).flatMap(([, t]) => placeholders(t)))].sort();
    const enHolders = [...new Set(forms(enValue).flatMap(([, t]) => placeholders(t)))].sort();
    if (deHolders.join(',') !== enHolders.join(','))
      add(
        'error',
        'i18n-placeholder',
        `"${key}" uses {${deHolders.join('}, {')}} in German but {${enHolders.join('}, {')}} in English`,
      );
    // A sentence that is word for word the same was most likely not translated.
    const text = readable(deValue);
    const words = text.replace(/\{\w+\}/g, '');
    if (text === readable(enValue) && /[\p{L}]{3,}\s+\p{L}/u.test(words) && words.length >= 14)
      add('warning', 'i18n-untranslated', `"${key}" is identical in German and English`);
  }
  return issues;
}

/** Keys an app's source refers to: `data-i18n`, `data-i18n-attr` and `t('area.key')` calls. */
export function usedKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const m of source.matchAll(/data-i18n="([^"]+)"/g)) if (m[1]) keys.add(m[1]);
  for (const m of source.matchAll(/data-i18n-attr="([^"]+)"/g))
    for (const pair of (m[1] ?? '').split(';')) {
      const key = pair.slice(pair.indexOf(':') + 1).trim();
      if (key) keys.add(key);
    }
  for (const m of source.matchAll(/\b(?:t|tr)\(\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]/g))
    if (m[1]) keys.add(m[1]);
  return [...keys].filter((key) => KEY_PATTERN.test(key));
}
