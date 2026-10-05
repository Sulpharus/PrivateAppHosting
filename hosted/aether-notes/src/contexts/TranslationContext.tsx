import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'de';

interface TranslationContextType {
  language: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * The texts live in the language packages (public/i18n/de.json and en.json). The language is the
 * person's choice in the portal (/_mininode/i18n.js reads it); the app only follows it.
 */
declare global {
  interface Window {
    mnI18n: {
      ready: Promise<unknown>;
      lang: Language;
      locale: string;
      t: (key: string, params?: Record<string, string | number>) => string;
      onChange: (callback: () => void) => () => void;
    };
  }
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    window.mnI18n.ready.then(() => live && setReady(true));
    const off = window.mnI18n.onChange(() => setVersion((v) => v + 1));
    return () => {
      live = false;
      off();
    };
  }, []);

  if (!ready) return null;

  return (
    <TranslationContext.Provider
      value={{ language: window.mnI18n.lang, t: (key, params) => window.mnI18n.t(key, params) }}
    >
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};
