// Whether an outside website may be shown inside the portal's viewer (Verwaltung → Einstellungen,
// "Externe Seiten im eigenen Viewer"). A browser cannot tell a page that refused to load in a
// frame from one that loaded, so the portal asks first:
//   GET /frame-check?url=<https address>   { frameable, url } for any signed-in user
//
// The page is fetched once (same rules as /image: public https only, at most 3 redirects, each one
// checked again, 8 s in all) and only its headers are read: X-Frame-Options and the CSP's
// frame-ancestors. The answer is cached for six hours per address. The check can only say "no"
// for the first page; the viewer always offers "Im Browser öffnen" for pages further on.

import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { isPublicImageUrl } from './image.ts';

const MAX_REDIRECTS = 3;
const CACHE_SECONDS = 6 * 60 * 60;
/** Checks per user per minute (per isolate; a guard against runaway loops). */
const RATE = 60;
let rateWindow = { minute: 0, calls: new Map<string, number>() };
function allowed(key: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  if (rateWindow.minute !== minute) rateWindow = { minute, calls: new Map() };
  const count = (rateWindow.calls.get(key) ?? 0) + 1;
  rateWindow.calls.set(key, count);
  return count <= RATE;
}

/** Does one CSP source expression (`*`, `https:`, `*.example.org`, `https://a.example.org`) match? */
export function sourceMatches(source: string, origin: URL): boolean {
  const value = source.toLowerCase();
  if (value === '*') return true;
  if (/^[a-z][a-z0-9+.-]*:$/.test(value)) return value === origin.protocol;
  if (value.startsWith("'")) return false; // 'self' is the site itself, 'none' nobody
  const match = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(\d+|\*))?(?:\/.*)?$/.exec(
    value,
  );
  if (!match) return false;
  const [, scheme, wildcard, host, port] = match;
  if (scheme && `${scheme}:` !== origin.protocol) return false;
  if (!scheme && origin.protocol !== 'https:' && origin.protocol !== 'http:') return false;
  if (wildcard ? !origin.hostname.endsWith(`.${host}`) : origin.hostname !== host) return false;
  if (port === '*') return true;
  const effective = origin.port || (origin.protocol === 'https:' ? '443' : '80');
  return port === undefined ? origin.port === '' : effective === port;
}

/**
 * May a page with these response headers be shown in a frame on `embedder` (the portal's origin)?
 * Follows the browser: a CSP frame-ancestors directive (every enforced policy must allow it)
 * replaces X-Frame-Options; without one, any DENY or SAMEORIGIN refuses (the embedder is never the
 * site's own origin). Only HTML pages count: a PDF or a download would not show in a frame.
 */
export function frameable(headers: Headers, embedder: URL): boolean {
  const type = headers.get('Content-Type') ?? '';
  if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(type.trim())) return false;

  const policies = (headers.get('Content-Security-Policy') ?? '').split(',');
  let sawFrameAncestors = false;
  for (const policy of policies) {
    for (const directive of policy.split(';')) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      if (name?.toLowerCase() !== 'frame-ancestors') continue;
      sawFrameAncestors = true;
      if (!sources.some((source) => sourceMatches(source, embedder))) return false;
    }
  }
  if (sawFrameAncestors) return true;

  const xfo = (headers.get('X-Frame-Options') ?? '').toLowerCase();
  return !xfo.split(',').some((value) => ['deny', 'sameorigin'].includes(value.trim()));
}

const log = (event: string, detail: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...detail }));

export const frameCheck = new Hono<AppContext>();

frameCheck.get('/frame-check', requireUser(), async (c) => {
  const portal = new URL(c.env.PORTAL_URL);
  const query = z.object({ url: z.string().max(4096) }).safeParse({ url: c.req.query('url') });
  const asked = query.success ? isPublicImageUrl(query.data.url, portal.hostname) : null;
  if (!asked) return problem(400, 'invalid_url', 'Keine öffentliche https-Adresse.');
  let url: URL = asked;

  const cacheKey = new Request(
    `https://frame-check.mininode.invalid/?url=${encodeURIComponent(url.href)}`,
  );
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const hit = await cache?.match(cacheKey);
  if (hit) return c.json(await hit.json(), 200, { 'Cache-Control': 'private, max-age=600' });

  if (!allowed(c.get('claims').sub))
    return problem(429, 'rate_limited', 'Zu viele Prüfungen in kurzer Zeit.');

  const signal = AbortSignal.timeout(8_000);
  let result: { frameable: boolean; url: string };
  try {
    let upstream: Response;
    for (let hop = 0; ; hop += 1) {
      upstream = await fetch(url, {
        headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
        redirect: 'manual',
        signal,
      });
      await upstream.body?.cancel();
      if (upstream.status < 300 || upstream.status >= 400) break;
      const location = upstream.headers.get('Location');
      const next = location ? isPublicImageUrl(new URL(location, url).href, portal.hostname) : null;
      if (!next || hop >= MAX_REDIRECTS) {
        upstream = new Response(null, { status: 502 });
        break;
      }
      url = next;
    }
    result = { frameable: upstream.ok && frameable(upstream.headers, portal), url: url.href };
  } catch (err) {
    log('frame_check_failed', { host: url.hostname, error: String(err) });
    // Unknown: the browser shows it as before.
    return c.json({ frameable: false, url: url.href });
  }

  log('frame_check', { host: url.hostname, frameable: result.frameable });
  const response = c.json(result, 200, { 'Cache-Control': `private, max-age=${CACHE_SECONDS}` });
  if (cache) {
    const stored = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, stored));
  }
  return response;
});
