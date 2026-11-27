// Portal Worker: serves the SPA with security headers and exposes the public runtime config.
// All authentication happens client-side against Supabase; this Worker holds no secrets.

import { securityHeaders, withHeaders } from '@mininode/gate';

export function portalConfig(env: Env) {
  return {
    supabaseUrl: env.SUPABASE_URL,
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    apiUrl: env.API_URL,
    aiUrl: env.AI_URL,
    cookieDomain: env.COOKIE_DOMAIN || undefined,
    emailEnabled: env.EMAIL_ENABLED === 'true',
  };
}

/**
 * What the portal's viewers may show in a frame (ADR 0032): apps and outside sites (https:), and
 * whatever an app in the viewer opens in its own frame, such as a PDF or a picture it made in the
 * browser (blob:, data:). Without blob: and data:, Chrome blocks those pages in the viewer.
 * Locally apps run on http://<slug>.localhost.
 */
export function portalFrameSources(hostname: string): string[] {
  const local = hostname === 'localhost' ? ['http://*.localhost:*'] : [];
  return ['https:', 'blob:', 'data:', ...local];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = securityHeaders({
      supabaseUrl: env.SUPABASE_URL,
      apiOrigin: new URL(env.API_URL).origin,
      aiOrigin: new URL(env.AI_URL).origin,
      frameSrc: portalFrameSources(url.hostname),
    });

    if (url.pathname === '/config.json') {
      return Response.json(portalConfig(env), {
        headers: { 'Cache-Control': 'no-store', ...headers },
      });
    }
    const response = await env.ASSETS.fetch(request);
    // The service worker must update as soon as it changes.
    if (url.pathname === '/sw.js')
      return withHeaders(response, { ...headers, 'Cache-Control': 'no-cache' });
    const html = response.headers.get('Content-Type')?.includes('text/html');
    return withHeaders(response, html ? { ...headers, 'Cache-Control': 'no-cache' } : headers);
  },
} satisfies ExportedHandler<Env>;
