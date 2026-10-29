import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createApp, isPlatformOrigin, originMatchesApp, type ProxyEnv } from './index.ts';
import { catalog, costMicro, SEARCH_INPUT_ALLOWANCE, SEARCH_SURCHARGE_MICRO } from './models.ts';
import type { Provider } from './providers.ts';

type Call = { fn: string; args: Record<string, unknown> };

function harness(
  options: { reserveError?: string; providerText?: string; grant?: boolean; search?: boolean } = {},
) {
  const calls: Call[] = [];
  const db = {
    schema: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === 'ai_reserve' && options.reserveError) {
          return { data: null, error: { message: options.reserveError } };
        }
        return { data: fn === 'ai_reserve' ? 'usage-1' : null, error: null };
      },
    }),
  } as unknown as SupabaseClient;

  const searches: (boolean | undefined)[] = [];
  const provider: Provider = {
    async complete(request) {
      searches.push(request.search);
      return {
        text: options.providerText ?? 'Hallo!',
        usage: { input: 100, output: 20 },
        ...(request.search
          ? { sources: [{ title: 'Handbuch', url: 'https://example.com/a' }] }
          : {}),
      };
    },
    async stream() {
      const body = new Response('Hal' + 'lo').body;
      if (!body) throw new Error('no body');
      return { body, usage: Promise.resolve({ input: 10, output: 2 }) };
    },
  };

  const app = createApp(() => ({
    verifier: {
      async verify(token: string) {
        return token === 'good'
          ? { status: 'valid' as const, claims: { sub: 'user-1', mn_role: 'user' as const } }
          : { status: 'invalid' as const, reason: 'bad' };
      },
    },
    db,
    checkGrant: async () => options.grant ?? true,
    appAi: async (slug: string) =>
      slug === 'rezepte'
        ? {
            models: ['gemini-flash', 'claude-haiku'],
            maxOutputTokens: 1000,
            search: options.search === true,
          }
        : null,
    provider: () => provider,
  }));

  const env = { PORTAL_URL: 'https://example.org', MODEL_CATALOG: '' } as ProxyEnv;
  const waits: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => waits.push(p),
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;

  const post = (path: string, body: object, headers: Record<string, string> = {}) =>
    app.fetch(
      new Request(`https://ai.example.org${path}`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer good',
          Origin: 'https://rezepte.example.org',
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      env,
      ctx,
    );

  return { post, calls, waits, searches };
}

const chat = { app: 'rezepte', messages: [{ role: 'user', content: 'Hi' }] };

describe('ai proxy', () => {
  it('answers, reserves before and settles after the call', async () => {
    const { post, calls } = harness();
    const res = await post('/v1/chat', { ...chat, maxOutputTokens: 50_00 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      text: 'Hallo!',
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    expect(calls.map((c) => c.fn)).toEqual(['ai_reserve', 'ai_settle']);
    const flash = catalog(undefined)['gemini-flash'];
    expect(calls[1]?.args.p_cost_micro).toBe(costMicro(flash, 100, 20));
  });

  it('caps output tokens at the app limit', async () => {
    const { post, calls } = harness();
    await post('/v1/chat', { ...chat, maxOutputTokens: 16_000 });
    const flash = catalog(undefined)['gemini-flash'];
    expect(calls[0]?.args.p_max_micro).toBeLessThanOrEqual(costMicro(flash, 1000, 1000));
  });

  it('rejects requests from another origin', async () => {
    const { post } = harness();
    const res = await post('/v1/chat', chat, { Origin: 'https://budget.example.org' });
    expect(res.status).toBe(403);
  });

  it('rejects models the app did not declare', async () => {
    const { post, calls } = harness();
    const res = await post('/v1/chat', { ...chat, model: 'claude-sonnet' });
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('maps an exhausted budget to 402', async () => {
    const { post } = harness({ reserveError: 'budget_exceeded:user' });
    const res = await post('/v1/chat', chat);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'budget_exceeded' });
  });

  it('searches the web only for apps that may, charges extra and returns the sources', async () => {
    const plain = harness();
    const first = await plain.post('/v1/chat', chat);
    const base = plain.calls.find((c) => c.fn === 'ai_reserve')?.args.p_max_micro as number;
    expect(first.status).toBe(200);
    expect((await plain.post('/v1/chat', { ...chat, search: true })).status).toBe(403);

    const allowed = harness({ search: true });
    const res = await allowed.post('/v1/chat', { ...chat, search: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sources: [{ url: 'https://example.com/a' }] });
    expect(allowed.searches).toEqual([true]);
    const reserved = allowed.calls.find((c) => c.fn === 'ai_reserve')?.args.p_max_micro as number;
    const settled = allowed.calls.find((c) => c.fn === 'ai_settle')?.args.p_cost_micro as number;
    expect(reserved - base).toBe(
      SEARCH_SURCHARGE_MICRO +
        costMicro(catalog(undefined)['gemini-flash'], SEARCH_INPUT_ALLOWANCE, 0),
    );
    expect(settled).toBe(
      costMicro(catalog(undefined)['gemini-flash'], 100, 20) + SEARCH_SURCHARGE_MICRO,
    );
    const json = await allowed.post('/v1/json', {
      ...chat,
      search: true,
      schema: { type: 'object' },
    });
    expect(json.status).toBe(400);
  });

  it('requires a session and a grant', async () => {
    expect((await harness().post('/v1/chat', chat, { Authorization: 'Bearer bad' })).status).toBe(
      401,
    );
    expect((await harness({ grant: false }).post('/v1/chat', chat)).status).toBe(403);
  });

  it('parses structured output and reports invalid JSON', async () => {
    const schema = { type: 'object', properties: { n: { type: 'number' } } };
    const ok = await harness({ providerText: '{"n":3}' }).post('/v1/json', { ...chat, schema });
    expect(await ok.json()).toMatchObject({ json: { n: 3 } });
    const bad = await harness({ providerText: 'nope' }).post('/v1/json', { ...chat, schema });
    expect(bad.status).toBe(502);
  });

  it('streams text and settles once the stream finished', async () => {
    const { post, calls, waits } = harness();
    const res = await post('/v1/chat', { ...chat, stream: true });
    expect(await res.text()).toBe('Hallo');
    await Promise.all(waits);
    expect(calls.map((c) => c.fn)).toEqual(['ai_reserve', 'ai_settle']);
  });
});

describe('originMatchesApp', () => {
  it('only accepts the app subdomain over https', () => {
    expect(originMatchesApp('https://rezepte.example.org', 'rezepte', 'https://example.org')).toBe(
      true,
    );
    expect(originMatchesApp('http://rezepte.example.org', 'rezepte', 'https://example.org')).toBe(
      false,
    );
    expect(
      originMatchesApp('https://rezepte.example.org.evil.io', 'rezepte', 'https://example.org'),
    ).toBe(false);
    expect(originMatchesApp(null, 'rezepte', 'https://example.org')).toBe(false);
  });
});

describe('CORS', () => {
  const env = { PORTAL_URL: 'https://example.org' } as ProxyEnv;
  const preflight = (origin: string) =>
    createApp().request('/v1/chat', { method: 'OPTIONS', headers: { Origin: origin } }, env);

  it('answers the portal and its apps, and nobody else', async () => {
    expect(
      (await preflight('https://rezepte.example.org')).headers.get('Access-Control-Allow-Origin'),
    ).toBe('https://rezepte.example.org');
    const foreign = await preflight('https://evil.example');
    expect(foreign.status).toBe(204);
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('knows the platform origins', () => {
    const portal = 'https://example.org';
    expect(isPlatformOrigin('https://example.org', portal)).toBe(true);
    expect(isPlatformOrigin('https://x.example.org', portal)).toBe(true);
    expect(isPlatformOrigin('http://x.example.org', portal)).toBe(false);
    expect(isPlatformOrigin('https://example.org.evil.io', portal)).toBe(false);
    expect(isPlatformOrigin('https://evilexample.org', portal)).toBe(false);
    expect(isPlatformOrigin(null, portal)).toBe(false);
    expect(isPlatformOrigin('http://rezepte.mininode.localhost', 'http://mininode.localhost')).toBe(
      true,
    );
  });
});
