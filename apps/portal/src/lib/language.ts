// The language preference (ADR 0017). The profile holds it (platform.profiles.language, so it
// follows the person to every device); the `mn-lang` cookie on the shared domain mirrors it, so
// apps with a language package read it without a network call (packages/ui/kit/i18n.js).

export type Language = 'de' | 'en';
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

const COOKIE = 'mn-lang';

export function isLanguage(value: unknown): value is Language {
  return value === 'de' || value === 'en';
}

export function readLanguageCookie(cookie = document.cookie): Language | null {
  const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-z]{2})`).exec(cookie);
  const value = match?.[1];
  return isLanguage(value) ? value : null;
}

/** Writes the cookie for all subdomains (a plain host-only cookie on localhost in development). */
export function writeLanguageCookie(
  language: Language,
  domain?: string,
  secure = location.protocol === 'https:',
): void {
  document.cookie = [
    `${COOKIE}=${language}`,
    'path=/',
    `max-age=${60 * 60 * 24 * 365}`,
    'samesite=lax',
    ...(domain ? [`domain=${domain}`] : []),
    ...(secure ? ['secure'] : []),
  ].join('; ');
}
