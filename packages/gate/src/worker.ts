// Worker entry for every hosted app on Cloudflare. The deploy step points `main` here and
// sets `run_worker_first: ["/*", "!/assets/*"]`, so hashed assets are served directly while
// every page load passes the gate.

import { decide, isNavigation, supabaseGrantChecker } from './decide.ts';
import { securityHeaders, withHeaders } from './headers.ts';
import { createVerifier, type Verifier } from './session.ts';

export interface AppEnv {
  ASSETS: Fetcher;
  APP_SLUG: string;
  APP_NAME: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  PORTAL_URL: string;
  /** Comma-separated extra connect-src origins from the manifest. */
  CONNECT_SRC?: string;
}

let cached: { url: string; verifier: Verifier } | undefined;

function verifierFor(env: AppEnv): Verifier {
  if (cached?.url !== env.SUPABASE_URL) {
    cached = { url: env.SUPABASE_URL, verifier: createVerifier(env.SUPABASE_URL) };
  }
  return cached.verifier;
}

export function publicConfig(env: AppEnv) {
  const portal = new URL(env.PORTAL_URL);
  const domain = portal.hostname;
  return {
    appSlug: env.APP_SLUG,
    appName: env.APP_NAME,
    supabaseUrl: env.SUPABASE_URL,
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    portalUrl: portal.origin,
    apiUrl: domain === 'localhost' ? `${portal.origin}/api` : `https://api.${domain}`,
    aiUrl: domain === 'localhost' ? `${portal.origin}/ai` : `https://ai.${domain}`,
    cookieDomain: domain === 'localhost' ? undefined : `.${domain}`,
  };
}

function forbiddenPage(env: AppEnv): Response {
  const portal = new URL(env.PORTAL_URL).origin;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kein Zugriff</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f3f1ec;color:#17160f}
@media (prefers-color-scheme:dark){body{background:#121210;color:#edeae2}a{color:#ffa47c}}
main{max-width:28rem;padding:2rem}h1{font-size:1.75rem;margin:0 0 .75rem}a{color:#9a3512}</style></head>
<body><main><h1>Kein Zugriff auf ${escapeHtml(env.APP_NAME)}</h1><p>Diese App wurde für deinen Account nicht freigegeben. Frag den Admin nach einer Freigabe.</p><p><a href="${portal}">Zur Startseite</a></p></main></body></html>`;
  return new Response(html, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export async function handleAppRequest(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const headers = securityHeaders({
    supabaseUrl: env.SUPABASE_URL,
    platformDomain: new URL(env.PORTAL_URL).hostname,
    connectSrc: env.CONNECT_SRC ? env.CONNECT_SRC.split(',').filter(Boolean) : [],
  });

  if (url.pathname === '/_mininode/config.json') {
    return Response.json(publicConfig(env), {
      headers: { 'Cache-Control': 'no-store', ...headers },
    });
  }

  if (!isNavigation(request)) {
    return withHeaders(await env.ASSETS.fetch(request), headers);
  }

  const decision = await decide({
    url,
    cookieHeader: request.headers.get('Cookie'),
    appSlug: env.APP_SLUG,
    portalUrl: env.PORTAL_URL,
    verifier: verifierFor(env),
    checkGrant: supabaseGrantChecker(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY),
  });

  switch (decision.action) {
    case 'allow': {
      const response = await env.ASSETS.fetch(request);
      return withHeaders(response, { ...headers, 'Cache-Control': 'private, no-cache' });
    }
    case 'redirect':
      return new Response(null, {
        status: 302,
        headers: { Location: decision.location, 'Cache-Control': 'no-store' },
      });
    case 'forbidden':
      return withHeaders(forbiddenPage(env), headers);
  }
}

export default {
  fetch: (request, env) => handleAppRequest(request, env),
} satisfies ExportedHandler<AppEnv>;
