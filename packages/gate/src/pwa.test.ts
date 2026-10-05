import { describe, expect, it } from 'vitest';
import {
  appIcon,
  SPLASH_BACKGROUND,
  SPLASH_CSS,
  splashHtml,
  splashLanguage,
  tileColour,
  wantsSplash,
  webManifest,
  withPwaTags,
} from './pwa.ts';

describe('pwa', () => {
  it('builds an installable manifest for the app', () => {
    const manifest = webManifest({ slug: 'haushalt', name: 'Haushaltsbuch Familie' });
    expect(manifest).toMatchObject({
      name: 'Haushaltsbuch Familie',
      short_name: 'Haushaltsbuc',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      lang: 'de',
    });
    expect(manifest.icons.at(-1)).toMatchObject({
      src: '/_mininode/icon.svg',
      purpose: 'any maskable',
    });
  });

  it('prefers the app’s own PNG icons', () => {
    const manifest = webManifest({ slug: 'a', name: 'A' }, [
      { src: '/icon-192.png', sizes: '192x192' },
    ]);
    expect(manifest.icons[0]).toEqual({
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    });
  });

  it('draws the initial and escapes it', () => {
    expect(appIcon({ slug: 'x', name: 'Übersicht' })).toContain('>Ü</text>');
    expect(appIcon({ slug: 'x', name: '<b>' })).toContain('&#60;');
    expect(appIcon({ slug: 'x', name: 'x' })).toContain(tileColour('x'));
  });

  it('leaves non-HTML responses alone', () => {
    const css = new Response('a{}', { headers: { 'Content-Type': 'text/css' } });
    expect(withPwaTags(css)).toBe(css);
  });

  it('uses one background for the system launch screen and the start screen', () => {
    expect(webManifest({ slug: 'a', name: 'A' }).background_color).toBe(SPLASH_BACKGROUND);
    expect(SPLASH_CSS).toContain(SPLASH_BACKGROUND);
  });
});

describe('start screen', () => {
  it('is the same for every app: mark, name, progress, brand; the name is escaped', () => {
    const html = splashHtml({ slug: 'haushalt', name: '<b>Haushalt & Co</b>' });
    expect(html).toContain('id="mn-splash"');
    expect(html).toContain('class="mns-mark"');
    expect(html).toContain('&#60;b&#62;Haushalt &#38; Co&#60;/b&#62;');
    expect(html).not.toContain('<b>');
    expect(html).toContain('MiniNode');
    expect(html).toContain(`--mns-tile:${tileColour('haushalt')}`);
  });

  it('speaks the language the person chose in the portal', () => {
    expect(splashHtml({ slug: 'a', name: 'A' }, 'en')).toContain('loading');
    expect(splashHtml({ slug: 'a', name: 'A' })).toContain('wird geladen');
    expect(splashLanguage('a=b; mn-lang=en')).toBe('en');
    expect(splashLanguage('mn-lang=de')).toBe('de');
    expect(splashLanguage(null)).toBe('de');
  });

  it('animates only transform and opacity, supports dark mode and reduced motion', () => {
    expect(SPLASH_CSS).not.toMatch(/transition:\s*all/);
    const moving = [...SPLASH_CSS.matchAll(/@keyframes [\w-]+\{([^@]*?)\}\s*(?=@|$|#)/g)].join('');
    expect(moving).not.toMatch(/\b(width|height|left|top|margin)\s*:/);
    expect(SPLASH_CSS).toContain('prefers-color-scheme:dark');
    expect(SPLASH_CSS).toContain('prefers-reduced-motion:reduce');
    // Hides itself even when pwa.js never runs.
    expect(SPLASH_CSS).toContain('mns-giveup');
  });

  it('is for pages people open, not for frames inside an app', () => {
    expect(wantsSplash('document')).toBe(true);
    expect(wantsSplash('empty')).toBe(true);
    expect(wantsSplash(null)).toBe(true);
    expect(wantsSplash('iframe')).toBe(false);
  });
});
