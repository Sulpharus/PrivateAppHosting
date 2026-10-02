import { afterEach, describe, expect, it } from 'vitest';
import { isLanguage, readLanguageCookie, writeLanguageCookie } from './language.ts';

afterEach(() => {
  document.cookie = 'mn-lang=de; path=/';
});

describe('language cookie', () => {
  it('reads a valid value and ignores everything else', () => {
    expect(readLanguageCookie('a=1; mn-lang=en; b=2')).toBe('en');
    expect(readLanguageCookie('mn-lang=fr')).toBeNull();
    expect(readLanguageCookie('other=en')).toBeNull();
    expect(readLanguageCookie('')).toBeNull();
  });

  it('knows the offered languages', () => {
    expect(isLanguage('de') && isLanguage('en')).toBe(true);
    expect(isLanguage('fr') || isLanguage(null)).toBe(false);
  });

  it('writes the cookie', () => {
    writeLanguageCookie('en', undefined, false);
    expect(readLanguageCookie()).toBe('en');
  });
});
