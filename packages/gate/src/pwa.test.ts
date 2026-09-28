import { describe, expect, it } from 'vitest';
import { appIcon, tileColour, webManifest, withPwaTags } from './pwa.ts';

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
});
