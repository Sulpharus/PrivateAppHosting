import { sessionPersisted } from './supabase.ts';

/**
 * Only allow redirects back to the portal itself or to an app on the platform domain.
 * Everything else (other hosts, javascript: URLs, protocol-relative tricks) falls back to `/`.
 */
export function safeNext(next: string | null, currentOrigin = location.origin): string {
  if (!next) return '/';
  try {
    const target = new URL(next, currentOrigin);
    const current = new URL(currentOrigin);
    if (target.protocol !== current.protocol) return '/';
    const base = current.hostname;
    const allowed = target.hostname === base || target.hostname.endsWith(`.${base}`);
    if (!allowed) return '/';
    return target.origin === current.origin
      ? `${target.pathname}${target.search}${target.hash}`
      : target.toString();
  } catch {
    return '/';
  }
}

/**
 * Navigates to `next` after the session cookie is written, using a full page load for other
 * subdomains (their gate reads the cookie).
 */
export async function goTo(next: string, navigate: (path: string) => void): Promise<void> {
  await sessionPersisted();
  if (next.startsWith('/')) navigate(next);
  else location.assign(next);
}
