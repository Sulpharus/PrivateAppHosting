import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi, ExternalApiError } from './api.ts';
import type { MininodeConfig } from './config.ts';
import { keySetupUrl, resetKeyPrompts } from './key-prompt.ts';

const config: MininodeConfig = {
  appSlug: 'wetter',
  appName: 'Wetter',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabasePublishableKey: 'pk',
  portalUrl: 'https://mininode.app',
  apiUrl: 'https://api.mininode.app',
  aiUrl: 'https://ai.mininode.app',
};

const personalRefusal = () =>
  Response.json(
    {
      error: 'api_key_missing',
      message: 'Für OpenWeather fehlt dein persönlicher Schlüssel.',
      personal: true,
      service: 'openweather',
      serviceName: 'OpenWeather',
    },
    { status: 503, headers: { 'X-MiniNode-Error': '1' } },
  );

beforeEach(() => {
  // happy-dom has no <dialog> behaviour; a tiny stand-in is enough for the open/close flow.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  resetKeyPrompts();
  document.body.replaceChildren();
});

describe('personal key popup', () => {
  it('builds the setup link with the API and a way back', () => {
    const url = new URL(
      keySetupUrl('https://mininode.app', 'openweather', 'https://wetter.mininode.app/x'),
    );
    expect(url.pathname).toBe('/account/keys');
    expect(url.searchParams.get('service')).toBe('openweather');
    expect(url.searchParams.get('next')).toBe('https://wetter.mininode.app/x');
  });

  it('asks once when a personal key is missing and still throws for the app', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => personalRefusal());
    const api = createApi(config, async () => 'session')('openweather');
    const error = await api.fetch('/weather').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).needsPersonalKey).toBe(true);
    expect((error as ExternalApiError).keyMissing).toBe(true);
    const popup = document.querySelector('dialog');
    expect(popup?.textContent).toContain('OpenWeather');
    expect(popup?.querySelector('a')?.getAttribute('href')).toContain(
      '/account/keys?service=openweather',
    );
    // A second refused call does not stack a second popup.
    await api.fetch('/weather').catch(() => undefined);
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
  });

  it('stays quiet after "Später" and for the admin-managed missing key', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => personalRefusal());
    const api = createApi(config, async () => 'session')('openweather');
    await api.fetch('/weather').catch(() => undefined);
    document.querySelector<HTMLButtonElement>('dialog button')?.click();
    expect(document.querySelectorAll('dialog')).toHaveLength(0);
    await api.fetch('/weather').catch(() => undefined);
    expect(document.querySelectorAll('dialog')).toHaveLength(0);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(
        { error: 'api_key_missing', message: 'Admin fehlt' },
        { status: 503, headers: { 'X-MiniNode-Error': '1' } },
      ),
    );
    const sitewide = await createApi(
      config,
      async () => 'session',
    )('other')
      .fetch('/x')
      .catch((e: unknown) => e);
    expect((sitewide as ExternalApiError).needsPersonalKey).toBe(false);
    expect(document.querySelectorAll('dialog')).toHaveLength(0);
  });
});
