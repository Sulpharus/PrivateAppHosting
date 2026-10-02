// The language helper (i18n.js): language from the cookie, packages, placeholders and plurals,
// markup translation, fallbacks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MnI18n {
  ready: Promise<void>;
  t(key: string, params?: Record<string, unknown>): string;
  apply(root?: ParentNode): void;
  lang: string;
  locale: string;
  onChange(cb: (lang: string) => void): () => void;
  setLang(code: string): Promise<void>;
}

const source = readFileSync(join(import.meta.dirname, 'i18n.js'), 'utf8');
const PACKAGES: Record<string, object | null> = {
  de: {
    'app.title': 'Haushalt',
    'only.de': 'Nur deutsch',
    hello: 'Hallo {name}',
    items: { zero: 'Keine Einträge', one: '{n} Eintrag', other: '{n} Einträge' },
  },
  en: {
    'app.title': 'Household',
    hello: 'Hello {name}',
    items: { one: '{n} entry', other: '{n} entries' },
  },
};

function boot(cookie: string, packages = PACKAGES): MnI18n {
  document.cookie = 'mn-lang=de; path=/'; // happy-dom cannot delete cookies; German is what no cookie means
  if (cookie) document.cookie = `${cookie}; path=/`;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const code = /\/i18n\/(\w+)\.json/.exec(url)?.[1] ?? '';
      const found = packages[code];
      return found ? { ok: true, json: async () => found } : { ok: false, json: async () => ({}) };
    }),
  );
  delete (window as { mnI18n?: unknown }).mnI18n;
  new Function(source)();
  return (window as unknown as { mnI18n: MnI18n }).mnI18n;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.className = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('language choice', () => {
  it('is German without a cookie and uses the German package', async () => {
    const i18n = boot('');
    await i18n.ready;
    expect(i18n.lang).toBe('de');
    expect(i18n.locale).toBe('de-DE');
    expect(i18n.t('app.title')).toBe('Haushalt');
    expect(document.documentElement.lang).toBe('de');
  });

  it('follows the mn-lang cookie when the app has that package', async () => {
    const i18n = boot('mn-lang=en');
    await i18n.ready;
    expect(i18n.lang).toBe('en');
    expect(i18n.locale).toBe('en-GB');
    expect(i18n.t('app.title')).toBe('Household');
    expect(document.documentElement.lang).toBe('en');
  });

  it('stays German when the app has no package for the chosen language', async () => {
    const i18n = boot('mn-lang=en', { de: PACKAGES.de ?? null, en: null });
    await i18n.ready;
    expect(i18n.lang).toBe('de');
    expect(i18n.t('app.title')).toBe('Haushalt');
  });

  it('ignores an unknown cookie value', async () => {
    const i18n = boot('mn-lang=fr');
    await i18n.ready;
    expect(i18n.lang).toBe('de');
  });

  it('hides the page only while another language loads', async () => {
    const i18n = boot('mn-lang=en');
    expect(document.documentElement.classList.contains('mn-i18n-loading')).toBe(true);
    await i18n.ready;
    expect(document.documentElement.classList.contains('mn-i18n-loading')).toBe(false);
    boot('');
    expect(document.documentElement.classList.contains('mn-i18n-loading')).toBe(false);
  });
});

describe('texts', () => {
  it('fills placeholders and formats numbers for the language', async () => {
    const i18n = boot('mn-lang=en');
    await i18n.ready;
    expect(i18n.t('hello', { name: 'Ada' })).toBe('Hello Ada');
    expect(i18n.t('hello')).toBe('Hello {name}');
  });

  it('picks the plural form', async () => {
    const i18n = boot('mn-lang=en');
    await i18n.ready;
    expect(i18n.t('items', { n: 1 })).toBe('1 entry');
    expect(i18n.t('items', { n: 0 })).toBe('0 entries');
    expect(i18n.t('items', { n: 2 })).toBe('2 entries');
    expect(i18n.t('items', { n: 1234 })).toBe('1,234 entries');
    const de = boot('');
    await de.ready;
    expect(de.t('items', { n: 1234 })).toBe('1.234 Einträge');
    expect(de.t('items', { n: 0 })).toBe('Keine Einträge');
  });

  it('falls back to German, then to the key', async () => {
    const i18n = boot('mn-lang=en');
    await i18n.ready;
    expect(i18n.t('only.de')).toBe('Nur deutsch');
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });
});

describe('markup', () => {
  it('translates data-i18n text and attributes, also for nodes added later', async () => {
    document.body.innerHTML =
      '<h1 data-i18n="app.title">Haushalt</h1><input data-i18n-attr="placeholder:hello;aria-label:app.title">';
    const i18n = boot('mn-lang=en');
    await i18n.ready;
    expect(document.querySelector('h1')?.textContent).toBe('Household');
    const input = document.querySelector('input');
    expect(input?.getAttribute('placeholder')).toBe('Hello {name}');
    expect(input?.getAttribute('aria-label')).toBe('Household');
    const late = document.createElement('p');
    late.setAttribute('data-i18n', 'app.title');
    document.body.append(late);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(late.textContent).toBe('Household');
  });

  it('passes params from data-i18n-params', async () => {
    document.body.innerHTML = `<p data-i18n="items" data-i18n-params='{"n":2}'>2 Einträge</p>`;
    const i18n = boot('mn-lang=en');
    await i18n.ready;
    expect(document.querySelector('p')?.textContent).toBe('2 entries');
  });
});

describe('switching', () => {
  it('switches when the cookie changes and tells the listeners', async () => {
    const i18n = boot('');
    await i18n.ready;
    const seen: string[] = [];
    i18n.onChange((l) => seen.push(l));
    await i18n.setLang('en');
    expect(i18n.lang).toBe('en');
    expect(i18n.t('app.title')).toBe('Household');
    expect(seen).toEqual(['en']);
    await i18n.setLang('de');
    expect(seen).toEqual(['en', 'de']);
  });
});
