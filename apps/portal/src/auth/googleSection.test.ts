import { afterEach, describe, expect, it, vi } from 'vitest';

// The provider state is cached per page load: fresh modules (and config) per test.
const load = async () => {
  vi.resetModules();
  (await import('../config.ts')).setRuntimeConfig({
    supabaseUrl: 'http://supabase.test',
    supabasePublishableKey: 'pk',
    apiUrl: 'http://api.test',
    aiUrl: 'http://ai.test',
  });
  return import('./google.ts');
};

afterEach(() => vi.unstubAllGlobals());

describe('googleProvider', () => {
  it('tells "off" apart from a failed read', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ external: { google: false } }));
    expect(await (await load()).googleProvider()).toBe('off');
    vi.stubGlobal('fetch', async () => Response.json({ external: { google: true } }));
    expect(await (await load()).googleProvider()).toBe('on');
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
    expect(await (await load()).googleProvider()).toBe('unknown');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await (await load()).googleProvider()).toBe('unknown');
  });

  it('asks again after a failed read', async () => {
    const google = await load();
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
    expect(await google.googleProvider()).toBe('unknown');
    await Promise.resolve();
    vi.stubGlobal('fetch', async () => Response.json({ external: { google: true } }));
    expect(await google.googleProvider()).toBe('on');
  });
});

describe('googleSection', () => {
  it('shows the setup steps only to the admin, and only when Google is certainly off', async () => {
    const { googleSection } = await load();
    expect(googleSection('off', false, true)).toBe('setup');
    expect(googleSection('off', false, false)).toBe('none');
    // still loading or unreadable: no false "not set up"
    expect(googleSection(null, false, true)).toBe('none');
    expect(googleSection('unknown', false, true)).toBe('none');
    expect(googleSection('on', false, false)).toBe('card');
    // an old connection stays removable while Google is off
    expect(googleSection('off', true, false)).toBe('card');
  });
});
