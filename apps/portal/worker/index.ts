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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = securityHeaders({ supabaseUrl: env.SUPABASE_URL });

    if (url.pathname === '/config.json') {
      return Response.json(portalConfig(env), {
        headers: { 'Cache-Control': 'no-store', ...headers },
      });
    }
    const response = await env.ASSETS.fetch(request);
    const html = response.headers.get('Content-Type')?.includes('text/html');
    return withHeaders(response, html ? { ...headers, 'Cache-Control': 'no-cache' } : headers);
  },
} satisfies ExportedHandler<Env>;
