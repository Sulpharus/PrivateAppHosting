// Reads the user id from the shared session cookie without a network call (ADR 0005). Offline
// the SDK only trusts its remembered user while this cookie still names the same user: signing
// out anywhere on the platform removes the cookie, so the next person on a shared device does
// not open the previous user's offline data.

/** User id in the `mn-auth` cookie written by @supabase/ssr (possibly chunked), or null. */
export function cookieSessionUserId(cookie: string, name = 'mn-auth'): string | null {
  let whole: string | undefined;
  const chunks: string[] = [];
  for (const part of cookie.split(/;\s*/)) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at);
    const value = part.slice(at + 1);
    if (key === name) whole = value;
    const chunk = new RegExp(`^${name}\\.(\\d+)$`).exec(key);
    if (chunk?.[1]) chunks[Number(chunk[1])] = value;
  }
  const raw =
    whole ?? (chunks.length && !chunks.includes(undefined as never) ? chunks.join('') : '');
  if (!raw) return null;
  try {
    let text = decodeURIComponent(raw);
    if (text.startsWith('base64-')) {
      const base64 = text.slice(7).replaceAll('-', '+').replaceAll('_', '/');
      const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
      text = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    }
    const session = JSON.parse(text) as { user?: { id?: unknown } };
    return typeof session.user?.id === 'string' ? session.user.id : null;
  } catch {
    return null;
  }
}
