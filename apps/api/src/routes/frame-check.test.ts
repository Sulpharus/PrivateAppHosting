import { describe, expect, it } from 'vitest';
import { frameable, sourceMatches } from './frame-check.ts';

const portal = new URL('https://example.org');
const html = (extra: Record<string, string> = {}) =>
  new Headers({ 'Content-Type': 'text/html; charset=utf-8', ...extra });

describe('sourceMatches', () => {
  it('matches wildcards, schemes and hosts like the browser', () => {
    expect(sourceMatches('*', portal)).toBe(true);
    expect(sourceMatches('https:', portal)).toBe(true);
    expect(sourceMatches('http:', portal)).toBe(false);
    expect(sourceMatches('https://example.org', portal)).toBe(true);
    expect(sourceMatches('example.org', portal)).toBe(true);
    expect(sourceMatches('https://example.org:443', portal)).toBe(true);
    expect(sourceMatches('https://example.org:8443', portal)).toBe(false);
    expect(sourceMatches('*.example.org', portal)).toBe(false);
    expect(sourceMatches('*.example.org', new URL('https://a.example.org'))).toBe(true);
    expect(sourceMatches("'self'", portal)).toBe(false);
    expect(sourceMatches("'none'", portal)).toBe(false);
    expect(sourceMatches('https://other.org', portal)).toBe(false);
  });
});

describe('frameable', () => {
  it('allows a plain HTML page', () => {
    expect(frameable(html(), portal)).toBe(true);
  });

  it('refuses X-Frame-Options DENY and SAMEORIGIN', () => {
    expect(frameable(html({ 'X-Frame-Options': 'DENY' }), portal)).toBe(false);
    expect(frameable(html({ 'X-Frame-Options': 'sameorigin' }), portal)).toBe(false);
  });

  it('follows frame-ancestors, which replaces X-Frame-Options', () => {
    expect(frameable(html({ 'Content-Security-Policy': "frame-ancestors 'self'" }), portal)).toBe(
      false,
    );
    expect(frameable(html({ 'Content-Security-Policy': "frame-ancestors 'none'" }), portal)).toBe(
      false,
    );
    expect(
      frameable(
        html({
          'Content-Security-Policy': "default-src 'self'; frame-ancestors https://example.org",
          'X-Frame-Options': 'DENY',
        }),
        portal,
      ),
    ).toBe(true);
  });

  it('needs every policy to allow it', () => {
    expect(
      frameable(
        html({ 'Content-Security-Policy': "frame-ancestors *, frame-ancestors 'self'" }),
        portal,
      ),
    ).toBe(false);
  });

  it('refuses anything that is not a page', () => {
    expect(frameable(new Headers({ 'Content-Type': 'application/pdf' }), portal)).toBe(false);
    expect(frameable(new Headers(), portal)).toBe(false);
  });
});
