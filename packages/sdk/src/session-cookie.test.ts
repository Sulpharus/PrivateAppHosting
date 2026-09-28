import { describe, expect, it } from 'vitest';
import { cookieSessionUserId } from './session-cookie.ts';

const session = { access_token: 'a', user: { id: 'u-1', email: 'x@example.com' } };
const base64 = (text: string) =>
  `base64-${btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;

describe('cookieSessionUserId', () => {
  it('reads a base64 session cookie', () => {
    expect(cookieSessionUserId(`other=1; mn-auth=${base64(JSON.stringify(session))}`)).toBe('u-1');
  });

  it('joins chunked cookies in order', () => {
    const value = base64(JSON.stringify(session));
    const half = Math.floor(value.length / 2);
    expect(
      cookieSessionUserId(`mn-auth.1=${value.slice(half)}; mn-auth.0=${value.slice(0, half)}`),
    ).toBe('u-1');
  });

  it('reads a plain JSON cookie', () => {
    expect(cookieSessionUserId(`mn-auth=${encodeURIComponent(JSON.stringify(session))}`)).toBe(
      'u-1',
    );
  });

  it('is null without a cookie (signed out) or with garbage', () => {
    expect(cookieSessionUserId('other=1')).toBeNull();
    expect(cookieSessionUserId('mn-auth=base64-%%%')).toBeNull();
    expect(cookieSessionUserId('mn-auth.1=abc')).toBeNull();
  });
});
