import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, ExternalApiError } from './api.ts';
import type { MininodeConfig } from './config.ts';

const config: MininodeConfig = {
  appSlug: 'wetter',
  appName: 'Wetter',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabasePublishableKey: 'pk',
  portalUrl: 'https://mininode.app',
  apiUrl: 'https://api.mininode.app',
  aiUrl: 'https://ai.mininode.app',
};

afterEach(() => vi.restoreAllMocks());

function stub(response: Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    calls.push({ url: String(input), init });
    return response;
  });
  return calls;
}

describe('mn.api', () => {
  const api = createApi(config, async () => 'session');

  it('calls the proxy with the session and returns the API answer', async () => {
    const calls = stub(Response.json({ temp: 21 }));
    const data = await api('openweather').json<{ temp: number }>('/weather?q=M%C3%BCnchen');
    expect(data.temp).toBe(21);
    expect(calls[0]?.url).toBe('https://api.mininode.app/proxy/openweather/weather?q=M%C3%BCnchen');
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer session');
    expect(calls[0]?.init?.credentials).toBe('omit');
  });

  it('passes on answers of the API, errors included', async () => {
    stub(new Response('not found', { status: 404 }));
    const response = await api('openweather').fetch('weather');
    expect(response.status).toBe(404);
  });

  it('throws MiniNode refusals with their code', async () => {
    stub(
      Response.json(
        { error: 'api_key_missing', message: 'Noch kein Schlüssel.' },
        { status: 503, headers: { 'X-MiniNode-Error': '1' } },
      ),
    );
    const error = await api('openweather')
      .fetch('/weather')
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).code).toBe('api_key_missing');
    expect((error as ExternalApiError).keyMissing).toBe(true);
  });

  it('refuses without a session or with an invalid id', async () => {
    await expect(createApi(config, async () => null)('x-api').fetch('/')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(api('../admin').fetch('/')).rejects.toMatchObject({ code: 'invalid_id' });
  });
});
