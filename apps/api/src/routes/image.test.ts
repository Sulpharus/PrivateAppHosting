import { describe, expect, it } from 'vitest';
import { isPublicImageUrl, sniffImage } from './image.ts';

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
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(sniffImage(webp)).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe(
      null,
    );
    expect(sniffImage(new TextEncoder().encode('<!doctype html>'))).toBe(null);
  });
});
