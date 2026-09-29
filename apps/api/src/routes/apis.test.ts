import { describe, expect, it } from 'vitest';
import { targetUrl, withKey } from './apis.ts';

describe('targetUrl', () => {
  const base = 'https://api.example.com/v2/';

  it('appends the path and query below the base', () => {
    expect(targetUrl(base, '/weather/today', '?q=1')?.toString()).toBe(
      'https://api.example.com/v2/weather/today?q=1',
    );
    expect(targetUrl('https://api.example.com', '', '')?.toString()).toBe(
      'https://api.example.com/',
    );
  });

  it('refuses paths that would leave the base', () => {
    for (const path of ['/../admin', '/..%2Fadmin', '/%2e%2e/x', '/a\\b'])
      expect(targetUrl(base, path, ''), path).toBeNull();
    // A doubled slash stays a path on the same host.
    expect(targetUrl(base, '//evil.com/x', '')?.host).toBe('api.example.com');
  });
});

describe('withKey', () => {
  const url = () => new URL('https://api.example.com/x?key=app');

  it('puts the key where the API expects it, overriding what the app sent', () => {
    const query = url();
    withKey(query, new Headers(), { type: 'query', param: 'key' }, 'secret');
    expect(query.searchParams.getAll('key')).toEqual(['secret']);

    const bearer = new Headers({ Authorization: 'Bearer app' });
    withKey(url(), bearer, { type: 'bearer' }, 'secret');
    expect(bearer.get('Authorization')).toBe('Bearer secret');

    const header = new Headers();
    withKey(url(), header, { type: 'header', name: 'X-Api-Key', prefix: 'Token ' }, 'secret');
    expect(header.get('X-Api-Key')).toBe('Token secret');
  });
});
