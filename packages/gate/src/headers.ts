// Security headers applied to every document a hosted app serves.

export interface CspOptions {
  supabaseUrl: string;
  /** Extra origins the app may fetch from (declared in the manifest, reviewed by doctor). */
  connectSrc?: readonly string[];
  platformDomain?: string;
}

export function contentSecurityPolicy(options: CspOptions): string {
  const domain = options.platformDomain ?? 'mininode.app';
  const supabase = new URL(options.supabaseUrl);
  const realtime = `${supabase.protocol === 'https:' ? 'wss:' : 'ws:'}//${supabase.host}`;
  const connect = [
    "'self'",
    supabase.origin,
    realtime,
    `https://api.${domain}`,
    `https://ai.${domain}`,
    ...(options.connectSrc ?? []),
  ];
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Inline styles are common in AI-generated UIs and low risk without inline scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    `connect-src ${connect.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function securityHeaders(options: CspOptions): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const next = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) next.headers.set(name, value);
  return next;
}
