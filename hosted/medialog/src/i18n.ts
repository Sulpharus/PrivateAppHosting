/**
 * Language packages (ADR 0017): the texts live in public/i18n/de.json and en.json and come
 * through the App Kit's window.mnI18n (loaded by index.html). `t` is a plain function, so
 * services and components share it; a language change remounts the app (see main.tsx).
 */
import { useSyncExternalStore } from 'react';

type Params = Record<string, string | number>;
interface MnI18n {
  ready: Promise<void>;
  lang: string;
  locale: string;
  t(key: string, params?: Params): string;
  onChange(listener: (lang: string) => void): () => void;
}

const kit = (): MnI18n | undefined => (globalThis as { mnI18n?: MnI18n }).mnI18n;

/** The text for a key in the active language (German as fallback, then the key itself). */
export const t = (key: string, params?: Params): string => kit()?.t(key, params) ?? key;
/** 'de-DE' or 'en-GB': for dates, numbers and sorting. */
export const locale = (): string => kit()?.locale ?? 'de-DE';
/** 'de' or 'en'. */
export const language = (): string => kit()?.lang ?? 'de';
/** Resolves when the packages of the active language are loaded. */
export const i18nReady = (): Promise<void> => kit()?.ready ?? Promise.resolve();

/** The active language as React state: components using it redraw when it changes. */
export function useLanguage(): string {
  return useSyncExternalStore(
    (listener) => kit()?.onChange(listener) ?? (() => undefined),
    language,
  );
}
