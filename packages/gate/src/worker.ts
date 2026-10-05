// Worker entry for every hosted app on Cloudflare. The deploy step points `main` here and
// sets `run_worker_first: ["/*", "!/assets/*"]`, so hashed assets are served directly while
// every page load passes the gate.

import { decide, isNavigation, supabaseGrantChecker } from './decide.ts';
import { securityHeaders, withHeaders } from './headers.ts';
import { appIcon, splashLanguage, webManifest, withPwaTags } from './pwa.ts';
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

/** PNG icons the app ships itself (`/icon-192.png`, `/icon-512.png`), cached per isolate. */
let iconCache: { slug: string; icons: { src: string; sizes: string }[] } | undefined;
async function appIcons(env: AppEnv, url: URL): Promise<{ src: string; sizes: string }[]> {
  if (iconCache?.slug === env.APP_SLUG) return iconCache.icons;
  const icons: { src: string; sizes: string }[] = [];
  for (const size of [192, 512]) {
    const src = `/icon-${size}.png`;
    const found = await env.ASSETS.fetch(new Request(new URL(src, url), { method: 'HEAD' }));
    if (found.ok && found.headers.get('Content-Type')?.startsWith('image/png'))
      icons.push({ src, sizes: `${size}x${size}` });
  }
  iconCache = { slug: env.APP_SLUG, icons };
  return icons;
}

function forbiddenPage(env: AppEnv): Response {
  const portal = new URL(env.PORTAL_URL).origin;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kein Zugriff</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f3f1ec;color:#17160f}
@media (prefers-color-scheme:dark){body{background:#121210;color:#edeae2}a{color:#ffa47c}}
main{max-width:28rem;padding:2rem}h1{font-size:1.75rem;margin:0 0 .75rem}a{color:#9a3512}</style></head>
<body><main><h1>Kein Zugriff auf ${escapeHtml(env.APP_NAME)}</h1><p>Diese App wurde für deinen Account nicht freigegeben. Frag den Admin nach einer Freigabe.</p><p><a href="${portal}">Zur Startseite</a></p></main></body></html>`;
  return new Response(html, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Extra connect-src origins: the manifest's, plus the portal when running locally. */
export function connectSources(env: Pick<AppEnv, 'PORTAL_URL' | 'CONNECT_SRC'>): string[] {
  const portal = new URL(env.PORTAL_URL);
  return [
    ...(env.CONNECT_SRC ? env.CONNECT_SRC.split(',').filter(Boolean) : []),
    // Locally the API and AI proxy live under the portal (see publicConfig).
    ...(portal.hostname === 'localhost' ? [portal.origin] : []),
  ];
}

export async function handleAppRequest(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const headers = securityHeaders({
    supabaseUrl: env.SUPABASE_URL,
    platformDomain: new URL(env.PORTAL_URL).hostname,
    connectSrc: connectSources(env),
  });

  if (url.pathname === '/_mininode/config.json') {
    return Response.json(publicConfig(env), {
      headers: { 'Cache-Control': 'no-store', ...headers },
    });
  }

  // PWA (ADR 0005): public metadata, like config.json.
  const app = { slug: env.APP_SLUG, name: env.APP_NAME };
  if (url.pathname === '/_mininode/manifest.webmanifest') {
    return Response.json(webManifest(app, await appIcons(env, url)), {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'no-cache',
        ...headers,
      },
    });
  }
  if (url.pathname === '/_mininode/icon.svg') {
    return new Response(appIcon(app), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
        ...headers,
      },
    });
  }
  if (url.pathname === '/_mininode/sw.js') {
    // Served from /_mininode/ but controls the whole app; must update as soon as it changes.
    return withHeaders(await env.ASSETS.fetch(request), {
      ...headers,
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache',
    });
  }

  if (!isNavigation(request)) {
    // HTML fetched by the service worker (its offline copy of "/") gets the PWA tags too.
    return withHeaders(withPwaTags(await env.ASSETS.fetch(request), app), headers);
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
      const response = withPwaTags(
        await env.ASSETS.fetch(request),
        app,
        splashLanguage(request.headers.get('Cookie')),
      );
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
