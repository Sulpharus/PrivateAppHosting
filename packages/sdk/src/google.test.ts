import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MininodeConfig } from './config.ts';
import { createGoogle, GoogleError } from './google.ts';

const config: MininodeConfig = {
  appSlug: 'kalender',
  appName: 'Kalender',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabasePublishableKey: 'pk',
  portalUrl: 'https://mininode.app',
  apiUrl: 'https://api.mininode.app',
  aiUrl: 'https://ai.mininode.app',
};

afterEach(() => vi.restoreAllMocks());

function stubApi(responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next;
  });
  return calls;
}

describe('mn.google', () => {
  it('fetches one token for the app and caches it', async () => {
    const calls = stubApi([
      Response.json({ accessToken: 'at1', expiresAt: Date.now() + 3_600_000, scopes: [] }),
      Response.json({ items: [] }),
      Response.json({ items: [] }),
    ]);
    const google = createGoogle(config, async () => 'session');
    await google.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    await google.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(calls[0]?.url).toBe('https://api.mininode.app/google/token');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ app: 'kalender' });
    expect(calls.filter((call) => call.url.endsWith('/google/token'))).toHaveLength(1);
    expect(new Headers(calls[1]?.init?.headers).get('Authorization')).toBe('Bearer at1');
  });

  it('gets a fresh token once when Google answers 401', async () => {
    const calls = stubApi([
      Response.json({ accessToken: 'old', expiresAt: Date.now() + 3_600_000 }),
      new Response(null, { status: 401 }),
      Response.json({ accessToken: 'new', expiresAt: Date.now() + 3_600_000 }),
      Response.json({ ok: true }),
    ]);
    const google = createGoogle(config, async () => 'session');
    const response = await google.fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels');
    expect(response.status).toBe(200);
    expect(new Headers(calls[3]?.init?.headers).get('Authorization')).toBe('Bearer new');
  });

  it('reports a missing connection with the portal link', async () => {
    stubApi([
      Response.json(
        { error: 'google_not_connected', message: 'Verbinde zuerst dein Google-Konto' },
        { status: 409 },
      ),
      Response.json({ error: 'google_not_connected' }, { status: 409 }),
    ]);
    const google = createGoogle(config, async () => 'session');
    expect(await google.connected()).toBe(false);
    const error = await google.accessToken().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GoogleError);
    expect((error as GoogleError).connectUrl).toBe('https://mininode.app/account#google');
  });

  it('never sends the token to hosts other than Google APIs', async () => {
    const calls = stubApi([]);
    const google = createGoogle(config, async () => 'session');
    await expect(google.fetch('https://evil.example/collect')).rejects.toBeInstanceOf(GoogleError);
    await expect(google.fetch('http://www.googleapis.com/x')).rejects.toBeInstanceOf(GoogleError);
    expect(calls).toHaveLength(0);
  });
});

describe('mn.google.calendarSync', () => {
  it('reads, changes and runs the Kalender sync with the session', async () => {
    const calls = stubApi([
      Response.json({ enabled: false, pushSources: [] }),
      Response.json({ ok: true }),
      Response.json({ ran: true }),
    ]);
    const google = createGoogle(config, async () => 'session');
    expect(await google.calendarSync.get()).toMatchObject({ enabled: false });
    await google.calendarSync.set({ enabled: true, pushSources: ['app:sportplaner:activity'] });
    expect(await google.calendarSync.sync()).toEqual({ ran: true });
    expect(calls.map((c) => [c.init?.method, c.url])).toEqual([
      ['GET', 'https://api.mininode.app/google/calendar'],
      ['PUT', 'https://api.mininode.app/google/calendar'],
      ['POST', 'https://api.mininode.app/google/calendar/sync'],
    ]);
    expect(new Headers(calls[1]?.init?.headers).get('Authorization')).toBe('Bearer session');
  });

  it('turns refusals into GoogleError with the code', async () => {
    stubApi([
      Response.json({ error: 'forbidden', message: 'Nur aus dem Kalender.' }, { status: 403 }),
    ]);
    const google = createGoogle(config, async () => 'session');
    await expect(google.calendarSync.get()).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
    stubApi([]);
    const signedOut = createGoogle(config, async () => null);
    await expect(signedOut.calendarSync.sync()).rejects.toBeInstanceOf(GoogleError);
  });
});
