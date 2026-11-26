import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appViewerPath,
  linkTarget,
  openRequest,
  rememberApps,
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

  it('opens apps the gate serves in the viewer, outside sites only when switched on', () => {
    installed(true);
    rememberApps([
      { slug: 'kalender', kind: 'spa' },
      { slug: 'remote', kind: 'remote' },
      { slug: 'jellyfin', kind: 'container' },
    ]);
    expect(viewerRoute('http://kalender.localhost:5173/woche')?.to).toBe(
      appViewerPath('kalender', '/woche'),
    );
    expect(viewerRoute('http://remote.localhost:5173/?token=x')).toBeNull();
    expect(viewerRoute('http://jellyfin.localhost:5173/')).toBeNull();
    expect(viewerRoute('http://api.localhost:5173/')).toBeNull();
    expect(viewerRoute('https://de.wikipedia.org/')).toBeNull();
    rememberSettings({ external_viewer: true });
    const web = viewerRoute('https://de.wikipedia.org/');
    expect(web?.to).toBe(webViewerPath('https://de.wikipedia.org/'));
    expect(web?.state.fromPortal).toBe(true);
    expect(viewerRoute('https://github.com/', { newWindow: true })).toBeNull();
    expect(viewerRoute('http://kalender.localhost:5173/', { newWindow: true })?.to).toBe(
      appViewerPath('kalender', '/'),
    );
    expect(viewerRoute('/account')).toBeNull();
  });
});

describe('openRequest', () => {
  const frame = {} as MessageEventSource;
  const message = (data: unknown, origin = 'https://kalender.example.org', source = frame) => ({
    data,
    origin,
    source,
  });
  const ok = { type: 'mn:open', url: 'https://example.org/logout' };

  it('accepts a link handed over by the app in the frame', () => {
    expect(openRequest(message(ok), frame, portal)).toBe(ok.url);
  });

  it('ignores other windows, other origins and other messages', () => {
    expect(openRequest(message(ok, undefined, {} as MessageEventSource), frame, portal)).toBeNull();
    expect(openRequest(message(ok), null, portal)).toBeNull();
    expect(openRequest(message(ok, 'https://evil.example'), frame, portal)).toBeNull();
    expect(openRequest(message(ok, 'https://example.org'), frame, portal)).toBeNull();
    expect(openRequest(message({ type: 'other', url: ok.url }), frame, portal)).toBeNull();
    expect(openRequest(message({ type: 'mn:open', url: 5 }), frame, portal)).toBeNull();
    expect(openRequest(message('mn:open'), frame, portal)).toBeNull();
    expect(
      openRequest(message({ type: 'mn:open', url: 'x'.repeat(5000) }), frame, portal),
    ).toBeNull();
  });
});
