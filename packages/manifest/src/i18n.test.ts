import { describe, expect, it } from 'vitest';
import { checkPackage, compareLanguagePackages, usedKeys } from './index.ts';

const rules = (issues: { rule: string }[]) => issues.map((i) => i.rule);

describe('checkPackage', () => {
  it('accepts texts and plural objects', () => {
    expect(
      checkPackage('de', {
        'app.title': 'Haushalt',
        'list.count': { one: '{n} Eintrag', other: '{n} Einträge' },
      }),
    ).toEqual([]);
  });

  it('refuses keys without a dot, empty or padded texts and bad plural forms', () => {
    const issues = checkPackage('en', {
      title: 'x',
      'a.empty': ' ',
      'a.pad': ' x',
      'a.plural': { one: 'x' },
      'a.form': { other: 'x', many2: 'y' },
      'a.num': 3,
    });
    expect(rules(issues)).toEqual(
      expect.arrayContaining([
        'i18n-key',
        'i18n-empty',
        'i18n-space',
        'i18n-plural',
        'i18n-format',
      ]),
    );
  });

  it('refuses a plural whose forms use different placeholders', () => {
    expect(
      rules(checkPackage('de', { 'a.n': { one: '{name}: ein Eintrag', other: '{n} Einträge' } })),
    ).toContain('i18n-placeholder');
  });

  it('lets the singular leave out the count', () => {
    expect(
      checkPackage('de', {
        'a.n': { one: 'Ein Eintrag von {name}', other: '{n} Einträge von {name}' },
      }),
    ).toEqual([]);
  });
});

describe('compareLanguagePackages', () => {
  const de = { 'a.hello': 'Hallo {name}', 'a.count': { one: '{n} Tag', other: '{n} Tage' } };

  it('is happy with matching keys and placeholders', () => {
    expect(
      compareLanguagePackages(de, {
        'a.hello': 'Hello {name}',
        'a.count': { one: '{n} day', other: '{n} days' },
      }),
    ).toEqual([]);
  });

  it('finds missing keys on either side', () => {
    const issues = compareLanguagePackages(de, { 'a.hello': 'Hello {name}', 'a.extra': 'x' });
    expect(issues.filter((i) => i.rule === 'i18n-parity')).toHaveLength(2);
  });

  it('finds changed placeholders and a plural in only one language', () => {
    const issues = compareLanguagePackages(de, {
      'a.hello': 'Hello {user}',
      'a.count': '{n} days',
    });
    expect(rules(issues)).toEqual(['i18n-placeholder', 'i18n-plural']);
  });

  it('warns about a sentence that was not translated', () => {
    const issues = compareLanguagePackages(
      { 'a.note': 'Das ist ein langer Satz' },
      { 'a.note': 'Das ist ein langer Satz' },
    );
    expect(issues).toEqual([expect.objectContaining({ severity: 'warning' })]);
    expect(compareLanguagePackages({ 'a.brand': 'Kalender' }, { 'a.brand': 'Kalender' })).toEqual(
      [],
    );
  });
});

describe('usedKeys', () => {
  it('finds the keys in markup and in t() calls', () => {
    const source = `<h1 data-i18n="app.title">x</h1>
      <input data-i18n-attr="placeholder:search.hint;aria-label:search.label">
      el.textContent = t('list.count', { n }); i18n.t("a.b-c"); other('nodots'); t('Hallo Welt');`;
    expect(usedKeys(source).sort()).toEqual([
      'a.b-c',
      'app.title',
      'list.count',
      'search.hint',
      'search.label',
    ]);
  });
});
