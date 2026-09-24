// Traefik forward-auth for container apps: the same decision the Workers gate makes, answered as
// 200 + identity headers (allow), 302 to the portal (login/refresh) or 403.

import {
  decide,
  type GrantChecker,
  isNavigation,
  readSession,
  type Verifier,
} from '@mininode/gate';

export interface ForwardAuthOptions {
  platformDomain: string;
  portalUrl: string;
  verifier: Verifier;
  checkGrant: GrantChecker;
  appName?: (slug: string) => string;
}

/** Caches positive and negative grant answers briefly; revocations apply within `ttlMs`. */
export function cachedGrants(check: GrantChecker, ttlMs = 60_000, now = Date.now): GrantChecker {
  const cache = new Map<string, { allowed: boolean; until: number }>();
  return async (token, slug) => {
    const key = `${slug}\u0000${token}`;
    const hit = cache.get(key);
    if (hit && hit.until > now()) return hit.allowed;
    const allowed = await check(token, slug);
    if (cache.size > 5_000) cache.clear();
    cache.set(key, { allowed, until: now() + ttlMs });
    return allowed;
  };
}

/** `<slug>.mininode.app` → `slug`; anything else (apex, nested, foreign hosts) → null. */
export function slugFromHost(host: string | null, platformDomain: string): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  const suffix = `.${platformDomain}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  return /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(slug) ? slug : null;
}

export async function forwardAuth(
  request: Request,
  options: ForwardAuthOptions,
): Promise<Response> {
  const host = request.headers.get('X-Forwarded-Host');
  const slug = slugFromHost(host, options.platformDomain);
  if (!slug) return new Response('unknown host', { status: 400 });

  const proto = request.headers.get('X-Forwarded-Proto') ?? 'https';
  const uri = request.headers.get('X-Forwarded-Uri') ?? '/';
  const original = new URL(`${proto}://${host}${uri.startsWith('/') ? uri : `/${uri}`}`);
  // Traefik copies the original method and headers onto the auth request.
  const originalRequest = new Request(original, {
    method: request.headers.get('X-Forwarded-Method') ?? 'GET',
    headers: pick(request.headers, ['Accept', 'Sec-Fetch-Mode']),
  });
  const cookieHeader = request.headers.get('Cookie');

  const decision = await decide({
    url: original,
    cookieHeader,
    appSlug: slug,
    portalUrl: options.portalUrl,
    verifier: options.verifier,
    checkGrant: options.checkGrant,
  });

  switch (decision.action) {
    case 'allow': {
      const session = readSession(cookieHeader);
      const claims = decision.claims;
      return new Response(null, {
        status: 200,
        headers: {
          'X-Mininode-User': claims.sub,
          'X-Mininode-Email': claims.email ?? '',
          'X-Mininode-Role': claims.mn_role ?? 'user',
          // Lets the server call Supabase as the user, so RLS applies to server-side queries too.
          'X-Mininode-Token': session?.accessToken ?? '',
        },
      });
    }
    case 'redirect':
      if (!isNavigation(originalRequest)) {
        return Response.json(
          { error: 'unauthenticated', login: decision.location },
          { status: 401 },
        );
      }
      return new Response(null, {
        status: 302,
        headers: { Location: decision.location, 'Cache-Control': 'no-store' },
      });
    case 'forbidden':
      return forbiddenPage(options.appName?.(slug) ?? slug, options.portalUrl);
  }
}

function forbiddenPage(appName: string, portalUrl: string): Response {
  const portal = new URL(portalUrl).origin;
  const name = appName.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kein Zugriff</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f3f1ec;color:#17160f}
@media (prefers-color-scheme:dark){body{background:#121210;color:#edeae2}a{color:#ffa47c}}
main{max-width:28rem;padding:2rem}h1{font-size:1.75rem;margin:0 0 .75rem}a{color:#9a3512}</style></head>
<body><main><h1>Kein Zugriff auf ${name}</h1><p>Diese App wurde für deinen Account nicht freigegeben. Frag den Admin nach einer Freigabe.</p><p><a href="${portal}">Zur Startseite</a></p></main></body></html>`;
  return new Response(html, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function pick(headers: Headers, names: string[]): Headers {
  const picked = new Headers();
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) picked.set(name, value);
  }
  return picked;
}
