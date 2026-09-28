import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMininode } from './index.ts';

// Offline start (ADR 0005): the app keeps working as the last confirmed user while the shared
// session cookie still names them, e.g. after the access token expired without a connection,
// and stops as soon as that cookie is gone (signed out anywhere on the platform).

const config = {
  appSlug: 'offline-test',
  appName: 'Offline',
  supabaseUrl: 'http://127.0.0.1:1',
  supabasePublishableKey: 'pk',
  portalUrl: 'http://localhost:5173',
  apiUrl: 'http://localhost:8787',
  aiUrl: 'http://localhost:8788',
};
const user = { id: 'u-offline', email: 'ole@example.com' };
const cookieFor = (id: string) =>
  `mn-auth=base64-${btoa(
    JSON.stringify({
      access_token: 'expired',
      refresh_token: 'r',
      token_type: 'bearer',
      expires_in: 3600,
      // Expired an hour ago: supabase-js tries a refresh, which fails without a connection.
      expires_at: Math.floor(Date.now() / 1000) - 3600,
      user: { id },
    }),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')}; path=/`;

function offline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  localStorage.setItem('mininode:user:offline-test', JSON.stringify(user));
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.cookie = 'mn-auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('offline start', () => {
  it('keeps the last user and their queue while the session cookie is theirs', async () => {
    offline();
    document.cookie = cookieFor(user.id);
    const mn = createMininode(config);
    expect((await mn.auth.user())?.id).toBe(user.id);
    await mn.kv.set('task:1', { title: 'Offline notiert' });
    expect(await mn.kv.get('task:1')).toEqual({ title: 'Offline notiert' });
    expect(await mn.offline.pending()).toBe(1);
  });

  it('has no user once the session cookie is gone (signed out elsewhere)', async () => {
    offline();
    const mn = createMininode(config);
    expect(await mn.auth.user()).toBeNull();
    await expect(mn.kv.get('task:1')).rejects.toThrow('not signed in');
  });

  it('does not open another user’s data when the cookie names someone else', async () => {
    offline();
    document.cookie = cookieFor('someone-else');
    const mn = createMininode(config);
    expect(await mn.auth.user()).toBeNull();
  });
});
