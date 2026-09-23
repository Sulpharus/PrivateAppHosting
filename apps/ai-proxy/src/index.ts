// ai.mininode.app — lets hosted apps use AI models without ever holding a provider key.
// Per request: session → origin ↔ app → grant → model allow-list → budget reservation →
// provider call through AI Gateway → settle the real cost.

import { createVerifier, type Verifier } from '@mininode/gate';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import { catalog, costMicro, estimateTokens, type ModelAlias } from './models.ts';
import {
  anthropicProvider,
  type ChatRequest,
  geminiProvider,
  type Provider,
  ProviderError,
  type Usage,
} from './providers.ts';

export interface ProxyEnv extends Env {
  SUPABASE_SECRET_KEY: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  AI_GATEWAY_TOKEN?: string;
}

const requestSchema = z.object({
  app: z.string().regex(/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/),
  model: z.enum(['gemini-flash', 'gemini-pro', 'claude-haiku', 'claude-sonnet']).optional(),
  system: z.string().max(20_000).optional(),
  messages: z
    .array(
      z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(200_000) }),
    )
    .min(1)
    .max(100),
  maxOutputTokens: z.number().int().positive().max(16_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
});

type AppAi = { models: ModelAlias[]; maxOutputTokens: number };

interface Deps {
  verifier: Verifier;
  db: SupabaseClient;
  checkGrant(token: string, slug: string): Promise<boolean>;
  appAi(slug: string): Promise<AppAi | null>;
  provider(kind: 'anthropic' | 'google'): Provider;
}

const problem = (status: number, error: string, message: string, headers?: HeadersInit) =>
  Response.json({ error, message }, { status, ...(headers ? { headers } : {}) });

/** The calling app is identified by its origin, which must match the requested slug. */
export function originMatchesApp(origin: string | null, slug: string, portalUrl: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const portal = new URL(portalUrl);
    if (portal.hostname === 'localhost') return url.hostname === 'localhost';
    return url.protocol === 'https:' && url.hostname === `${slug}.${portal.hostname}`;
  } catch {
    return false;
  }
}

const appCache = new Map<string, { value: AppAi | null; expires: number }>();
let cachedDeps: { url: string; deps: Deps } | undefined;

function defaultDeps(env: ProxyEnv): Deps {
  if (cachedDeps?.url === env.SUPABASE_URL) return cachedDeps.deps;
  const deps = buildDeps(env);
  cachedDeps = { url: env.SUPABASE_URL, deps };
  return deps;
}

function buildDeps(env: ProxyEnv): Deps {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const keys = {
    gatewayBase: env.AI_GATEWAY_BASE,
    gatewayToken: env.AI_GATEWAY_TOKEN,
    anthropicKey: env.ANTHROPIC_API_KEY,
    geminiKey: env.GEMINI_API_KEY,
  };
  return {
    verifier: createVerifier(env.SUPABASE_URL),
    db,
    async checkGrant(token, slug) {
      const asUser = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await asUser.schema('platform').rpc('has_grant', { p_slug: slug });
      return data === true;
    },
    async appAi(slug) {
      const hit = appCache.get(slug);
      if (hit && hit.expires > Date.now()) return hit.value;
      const { data } = await db
        .schema('platform')
        .from('apps')
        .select('manifest')
        .eq('slug', slug)
        .maybeSingle();
      const ai = (
        data?.manifest as { ai?: { models?: ModelAlias[]; maxOutputTokens?: number } } | undefined
      )?.ai;
      const value = ai?.models?.length
        ? { models: ai.models, maxOutputTokens: ai.maxOutputTokens ?? 2000 }
        : null;
      appCache.set(slug, { value, expires: Date.now() + 60_000 });
      return value;
    },
    provider: (kind) => (kind === 'anthropic' ? anthropicProvider(keys) : geminiProvider(keys)),
  };
}

export function createApp(depsFor: (env: ProxyEnv) => Deps = defaultDeps) {
  const app = new Hono<{ Bindings: ProxyEnv }>();

  app.options('*', (c) => {
    const origin = c.req.header('Origin') ?? '';
    return c.body(null, 204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  });

  app.get('/health', (c) => c.json({ ok: true }));

  const handle = (mode: 'chat' | 'json') =>
    app.post(`/v1/${mode}`, async (c) => {
      const deps = depsFor(c.env);
      const origin = c.req.header('Origin') ?? null;
      const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : undefined;

      const token = (c.req.header('Authorization') ?? '').replace(/^Bearer /, '');
      if (!token) return problem(401, 'unauthenticated', 'Anmeldung erforderlich.', cors);
      const verified = await deps.verifier.verify(token);
      if (verified.status !== 'valid')
        return problem(401, 'unauthenticated', 'Sitzung abgelaufen.', cors);

      const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success)
        return problem(
          400,
          'invalid_request',
          parsed.error.issues[0]?.message ?? 'Ungültige Anfrage.',
          cors,
        );
      const input = parsed.data;
      if (mode === 'json' && !input.schema)
        return problem(400, 'invalid_request', 'schema fehlt.', cors);

      if (!originMatchesApp(origin, input.app, c.env.PORTAL_URL)) {
        return problem(403, 'origin_mismatch', 'Die Anfrage kommt nicht von dieser App.', cors);
      }
      const [allowed, ai] = await Promise.all([
        deps.checkGrant(token, input.app),
        deps.appAi(input.app),
      ]);
      if (!allowed) return problem(403, 'forbidden', 'App nicht freigegeben.', cors);
      if (!ai) return problem(403, 'ai_disabled', 'KI ist für diese App nicht aktiviert.', cors);

      const alias = input.model ?? ai.models[0];
      if (!alias || !ai.models.includes(alias)) {
        return problem(
          403,
          'model_not_allowed',
          `Modell ${alias ?? '?'} ist für diese App nicht freigegeben.`,
          cors,
        );
      }
      const model = catalog(c.env.MODEL_CATALOG || undefined)[alias];
      const maxOutputTokens = Math.min(
        input.maxOutputTokens ?? ai.maxOutputTokens,
        ai.maxOutputTokens,
      );
      const promptText = [
        input.system ?? '',
        ...input.messages.map((m) => m.content),
        JSON.stringify(input.schema ?? ''),
      ].join('\n');
      const reserve = costMicro(model, estimateTokens(promptText), maxOutputTokens);

      const reservation = await deps.db.schema('platform').rpc('ai_reserve', {
        p_user_id: verified.claims.sub,
        p_app_slug: input.app,
        p_model: alias,
        p_max_micro: reserve,
      });
      if (reservation.error) {
        const scope = /budget_exceeded:(\w+)/.exec(reservation.error.message)?.[1];
        if (scope)
          return problem(
            402,
            'budget_exceeded',
            `Das KI-Budget (${scope}) ist für diesen Monat aufgebraucht.`,
            cors,
          );
        return problem(500, 'db_error', reservation.error.message, cors);
      }
      const usageId = reservation.data as string;
      const settle = (usage: Usage | null) =>
        deps.db.schema('platform').rpc('ai_settle', {
          p_usage_id: usageId,
          p_cost_micro: usage ? costMicro(model, usage.input, usage.output) : null,
          p_input_tokens: usage?.input ?? null,
          p_output_tokens: usage?.output ?? null,
        });

      const request: ChatRequest = {
        model,
        system: input.system,
        messages: input.messages,
        maxOutputTokens,
        temperature: input.temperature,
        schema: mode === 'json' ? input.schema : undefined,
      };
      const provider = deps.provider(model.provider);

      try {
        if (mode === 'chat' && input.stream) {
          const result = await provider.stream(request);
          c.executionCtx.waitUntil(
            result.usage.then(
              (usage) => settle(usage),
              () => settle(null),
            ),
          );
          return new Response(result.body, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
              ...cors,
            },
          });
        }

        const result = await provider.complete(request);
        await settle(result.usage);
        const usage = { inputTokens: result.usage.input, outputTokens: result.usage.output };
        if (mode === 'json') {
          try {
            return c.json({ json: JSON.parse(result.text) as unknown, usage }, 200, cors);
          } catch {
            return problem(
              502,
              'invalid_json',
              'Das Modell hat kein gültiges JSON geliefert.',
              cors,
            );
          }
        }
        return c.json({ text: result.text, usage }, 200, cors);
      } catch (error) {
        await settle(null);
        const status = error instanceof ProviderError ? error.status : 502;
        console.error(
          JSON.stringify({
            event: 'provider_error',
            app: input.app,
            model: alias,
            status,
            error: String(error),
          }),
        );
        return problem(
          status === 422 ? 422 : 502,
          'provider_error',
          'Der KI-Anbieter hat die Anfrage nicht beantwortet.',
          cors,
        );
      }
    });

  handle('chat');
  handle('json');
  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<ProxyEnv>;
