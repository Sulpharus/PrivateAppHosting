import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createApp, originMatchesApp, type ProxyEnv } from './index.ts';
import { catalog, costMicro } from './models.ts';
import type { Provider } from './providers.ts';

type Call = { fn: string; args: Record<string, unknown> };

function harness(options: { reserveError?: string; providerText?: string; grant?: boolean } = {}) {
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

  const provider: Provider = {
    async complete() {
      return { text: options.providerText ?? 'Hallo!', usage: { input: 100, output: 20 } };
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
        ? { models: ['gemini-flash', 'claude-haiku'], maxOutputTokens: 1000 }
        : null,
    provider: () => provider,
  }));

  const env = { PORTAL_URL: 'https://mininode.app', MODEL_CATALOG: '' } as ProxyEnv;
  const waits: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => waits.push(p),
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;

  const post = (path: string, body: object, headers: Record<string, string> = {}) =>
    app.fetch(
      new Request(`https://ai.mininode.app${path}`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer good',
          Origin: 'https://rezepte.mininode.app',
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      env,
      ctx,
    );

  return { post, calls, waits };
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
    const res = await post('/v1/chat', chat, { Origin: 'https://budget.mininode.app' });
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
    expect(
      originMatchesApp('https://rezepte.mininode.app', 'rezepte', 'https://mininode.app'),
    ).toBe(true);
    expect(originMatchesApp('http://rezepte.mininode.app', 'rezepte', 'https://mininode.app')).toBe(
      false,
    );
    expect(
      originMatchesApp('https://rezepte.mininode.app.evil.io', 'rezepte', 'https://mininode.app'),
    ).toBe(false);
    expect(originMatchesApp(null, 'rezepte', 'https://mininode.app')).toBe(false);
  });
});
