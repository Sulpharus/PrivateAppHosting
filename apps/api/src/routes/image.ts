// Pictures from public web addresses, for apps that need the bytes (e.g. a PDF export) while the
// page's CSP and the shops' missing CORS headers keep the browser from reading them.
//   GET /image?url=<https address>   the picture, for any signed-in user
//
// Only public https addresses (the same rules as API base URLs), at most 3 redirects, each one
// checked again; only raster images (no SVG), at most 8 MB, 10 s.

import { isAllowedApiBase } from '@mininode/manifest';
import { Hono } from 'hono';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { readCapped } from '../lib/body.ts';

const MAX_BYTES = 8_000_000;
const MAX_REDIRECTS = 3;
/** Pictures per user per minute (per isolate; a guard against runaway loops). */
const RATE = 120;
let rateWindow = { minute: 0, calls: new Map<string, number>() };
function allowed(key: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  if (rateWindow.minute !== minute) rateWindow = { minute, calls: new Map() };
  const count = (rateWindow.calls.get(key) ?? 0) + 1;
  rateWindow.calls.set(key, count);
  return count <= RATE;
}

/** A public https address that is not the platform itself (query strings are fine here). */
export function isPublicImageUrl(value: string, platformDomain: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.port && url.port !== '443') return null;
  const base = `${url.protocol}//${url.host}${url.pathname}`;
  return isAllowedApiBase(base, platformDomain) && !url.username && !url.password ? url : null;
}

/** The picture's type from its first bytes: JPEG, PNG, GIF, WebP or AVIF; null for anything else. */
export function sniffImage(bytes: Uint8Array): string | null {
  const at = (offset: number, ...values: number[]) =>
    values.every((v, i) => bytes[offset + i] === v);
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (
    at(4, 0x66, 0x74, 0x79, 0x70) &&
    (at(8, 0x61, 0x76, 0x69, 0x66) || at(8, 0x61, 0x76, 0x69, 0x73))
  )
    return 'image/avif';
  return null;
}

const log = (event: string, detail: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...detail }));

export const image = new Hono<AppContext>();

image.get('/image', requireUser(), async (c) => {
  const domain = new URL(c.env.PORTAL_URL).hostname;
  let url = isPublicImageUrl(c.req.query('url') ?? '', domain);
  if (!url) return problem(400, 'invalid_url', 'Keine öffentliche https-Adresse.');
  if (!allowed(c.get('claims').sub))
    return problem(429, 'rate_limited', 'Zu viele Bilder in kurzer Zeit.');

  let upstream: Response | undefined;
  try {
    for (let hop = 0; ; hop += 1) {
      upstream = await fetch(url, {
        headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (upstream.status < 300 || upstream.status >= 400) break;
      await upstream.body?.cancel();
      const next = isPublicImageUrl(
        new URL(upstream.headers.get('Location') ?? '', url).href,
        domain,
      );
      if (!next || hop >= MAX_REDIRECTS)
        return problem(502, 'image_redirect', 'Das Bild leitet auf eine unzulässige Adresse um.');
      url = next;
    }
  } catch (err) {
    log('image_failed', { host: url.hostname, error: String(err) });
    return problem(502, 'image_unavailable', 'Das Bild ist gerade nicht erreichbar.');
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return problem(502, 'image_unavailable', `Die Seite antwortet mit ${upstream.status}.`);
  }
  if (Number(upstream.headers.get('Content-Length') ?? 0) > MAX_BYTES) {
    await upstream.body?.cancel();
    return problem(413, 'too_large', 'Das Bild ist zu groß.');
  }
  const bytes = await readCapped(upstream.body, MAX_BYTES);
  if (!bytes) return problem(413, 'too_large', 'Das Bild ist zu groß.');
  const type = sniffImage(bytes);
  if (!type) return problem(415, 'not_an_image', 'Unter der Adresse liegt kein Bild.');
  log('image', { host: url.hostname, bytes: bytes.byteLength });
  return new Response(bytes, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});
