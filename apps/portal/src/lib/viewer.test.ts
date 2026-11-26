import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appViewerPath,
  linkTarget,
  rememberSettings,
  viewerRoute,
  webViewerPath,
} from './viewer.ts';

const portal = new URL('https://example.org/');

describe('linkTarget', () => {
  it('tells portal pages, apps and outside websites apart', () => {
    expect(linkTarget('/account?x=1#y', portal)).toEqual({
      kind: 'portal',
      path: '/account?x=1#y',
    });
    expect(linkTarget('https://typetrainer.example.org/lernpfad?l=de', portal)).toEqual({
      kind: 'app',
      slug: 'typetrainer',
      path: '/lernpfad?l=de',
    });
    expect(linkTarget('https://de.wikipedia.org/wiki/X', portal)).toEqual({
      kind: 'web',
      url: 'https://de.wikipedia.org/wiki/X',
    });
  });

  it('does not take look-alike hosts, deeper subdomains or other schemes for apps', () => {
    expect(linkTarget('https://example.org.evil.example/', portal)?.kind).toBe('web');
    expect(linkTarget('https://a.b.example.org/', portal)?.kind).toBe('web');
    expect(linkTarget('http://typetrainer.example.org/', portal)?.kind).toBe('web');
    expect(linkTarget('mailto:a@example.org', portal)).toBeNull();
    expect(linkTarget('javascript:alert(1)', portal)).toBeNull();
  });

  it('finds apps on a local stack by host and port', () => {
    const local = new URL('http://localhost:5173/');
    expect(linkTarget('http://kalender.localhost:5173/', local)).toEqual({
      kind: 'app',
      slug: 'kalender',
      path: '/',
    });
    expect(linkTarget('http://kalender.localhost:8787/', local)?.kind).toBe('web');
  });
});

describe('viewerRoute', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    rememberSettings({ external_viewer: false });
  });

  const installed = (value: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: value && query.includes('standalone'),
    }));

  it('leaves every link alone in a browser tab', () => {
    installed(false);
    expect(viewerRoute('http://kalender.localhost:5173/')).toBeNull();
  });

  it('opens apps in the viewer, outside sites only when switched on', () => {
    installed(true);
    expect(viewerRoute('http://kalender.localhost:5173/woche')).toBe(
      appViewerPath('kalender', '/woche'),
    );
    expect(viewerRoute('https://de.wikipedia.org/')).toBeNull();
    rememberSettings({ external_viewer: true });
    expect(viewerRoute('https://de.wikipedia.org/')).toBe(
      webViewerPath('https://de.wikipedia.org/'),
    );
    expect(viewerRoute('/account')).toBeNull();
  });
});
