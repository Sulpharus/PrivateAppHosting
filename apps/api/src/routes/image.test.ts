import type { SessionClaims, Verifier } from '@mininode/gate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.ts';
import { app } from '../index.ts';
import { setVerifierForTests } from '../lib/auth.ts';
import { cappedPicture, isPublicImageUrl, sniffImage } from './image.ts';

describe('isPublicImageUrl', () => {
  const ok = (u: string) => isPublicImageUrl(u, 'mininode.app') !== null;

  it('accepts public https pictures with a query', () => {
    expect(ok('https://m.media-amazon.com/images/I/71abc.jpg')).toBe(true);
    expect(ok('https://cdn.shop.de/p/1.webp?w=800&h=800')).toBe(true);
  });

  it('refuses http, private hosts, ports, credentials and the platform itself', () => {
    for (const u of [
      'http://cdn.shop.de/a.jpg',
      'https://localhost/a.jpg',
      'https://127.0.0.1/a.jpg',
      'https://2130706433/a.jpg',
      'https://[::1]/a.jpg',
      'https://intranet/a.jpg',
      'https://cdn.shop.de:8443/a.jpg',
      'https://user:pw@cdn.shop.de/a.jpg',
      'https://api.mininode.app/x',
      'https://x.supabase.co/a.jpg',
      'file:///etc/passwd',
      'not a url',
    ])
      expect(ok(u), u).toBe(false);
  });
});

describe('sniffImage', () => {
  it('names raster formats by their first bytes and refuses the rest', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe(
      null,
    );
    expect(sniffImage(new TextEncoder().encode('<!doctype html>'))).toBe(null);
  });
});

describe('cappedPicture', () => {
  const chunks = (...parts: Uint8Array[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    });
  const jpegHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]);

  it('passes a picture through whole, even when its first bytes arrive in pieces', async () => {
    const picture = await cappedPicture(
      chunks(jpegHead.slice(0, 2), jpegHead.slice(2), new Uint8Array(100)),
      1000,
    );
    if (typeof picture === 'string') throw new Error(picture);
    expect(picture.type).toBe('image/jpeg');
    expect((await new Response(picture.stream).arrayBuffer()).byteLength).toBe(116);
  });

  it('fails the stream once more than the limit went through', async () => {
    const picture = await cappedPicture(chunks(jpegHead, new Uint8Array(2000)), 1000);
    if (typeof picture === 'string') throw new Error(picture);
    await expect(new Response(picture.stream).arrayBuffer()).rejects.toThrow();
  });
});

describe('GET /image', () => {
  const SUPABASE_URL = 'http://supabase.test';
  const env = { SUPABASE_URL, PORTAL_URL: 'https://mininode.app' } as unknown as ApiEnv;
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  let routes: Record<string, () => Response>;
  let fetched: string[];

  beforeEach(() => {
    // A new user per test, so the per-minute limit of one never reaches the next.
    const claims: SessionClaims = { sub: crypto.randomUUID(), mn_role: 'user', amr: [] };
    setVerifierForTests(SUPABASE_URL, {
      verify: async () => ({ status: 'valid', claims }),
    } as Verifier);
    fetched = [];
    routes = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      fetched.push(url);
      return (routes[url] ?? (() => new Response('nope', { status: 404 })))();
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const get = (target: string, auth = true) =>
    app.request(
      `/image?url=${encodeURIComponent(target)}`,
      auth ? { headers: { Authorization: 'Bearer t' } } : {},
      env,
    );

  it('needs a signed-in user', async () => {
    expect((await get('https://cdn.shop.de/a.jpg', false)).status).toBe(401);
    expect(fetched).toEqual([]);
  });

  it('returns the picture with a locked-down type, following a public redirect', async () => {
    routes['https://cdn.shop.de/a.jpg'] = () =>
      new Response(null, { status: 302, headers: { Location: '/b.jpg' } });
    routes['https://cdn.shop.de/b.jpg'] = () => new Response(JPEG);
    const response = await get('https://cdn.shop.de/a.jpg');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it('never follows a redirect into a private or platform address', async () => {
    for (const location of [
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://api.mininode.app/me',
    ]) {
      routes['https://cdn.shop.de/a.jpg'] = () =>
        new Response(null, { status: 302, headers: { Location: location } });
      fetched = [];
      expect((await get('https://cdn.shop.de/a.jpg')).status, location).toBe(502);
      expect(fetched).toEqual(['https://cdn.shop.de/a.jpg']);
    }
  });

  it('stops after three redirects and on a redirect without a target', async () => {
    for (let i = 0; i < 6; i++)
      routes[`https://cdn.shop.de/${i}`] = () =>
        new Response(null, { status: 301, headers: { Location: `/${i + 1}` } });
    expect((await get('https://cdn.shop.de/0')).status).toBe(502);
    expect(fetched).toHaveLength(4);
    routes['https://cdn.shop.de/x'] = () => new Response(null, { status: 302 });
    fetched = [];
    expect((await get('https://cdn.shop.de/x')).status).toBe(502);
    expect(fetched).toHaveLength(1);
  });

  it('refuses SVG, HTML and pictures that are too large', async () => {
    routes['https://cdn.shop.de/a.svg'] = () =>
      new Response('<svg xmlns="http://www.w3.org/2000/svg"/>');
    routes['https://cdn.shop.de/a.html'] = () => new Response('<!doctype html><p>hi</p>');
    routes['https://cdn.shop.de/big.jpg'] = () =>
      new Response(JPEG, { headers: { 'Content-Length': String(9_000_000) } });
    expect((await get('https://cdn.shop.de/a.svg')).status).toBe(415);
    expect((await get('https://cdn.shop.de/a.html')).status).toBe(415);
    expect((await get('https://cdn.shop.de/big.jpg')).status).toBe(413);
  });

  it('refuses addresses that are not public https before fetching anything', async () => {
    expect((await get('http://cdn.shop.de/a.jpg')).status).toBe(400);
    expect((await get('https://10.0.0.1/a.jpg')).status).toBe(400);
    expect(fetched).toEqual([]);
  });
});
