import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  googleErrorFromUrl,
  googleHandOverDone,
  handOverGoogleGrant,
  returnUrl,
} from './google.ts';

const errorFor = (query: string, hash = '') => {
  history.replaceState(null, '', `/login${hash ? `#${hash}` : ''}`);
  return googleErrorFromUrl(new URLSearchParams(query));
};

afterEach(() => history.replaceState(null, '', '/'));

describe('googleErrorFromUrl', () => {
  it('is null without an error', () => {
    expect(errorFor('next=%2F&via=google')).toBeNull();
  });

  it('explains that sign-ups are closed', () => {
    expect(
      errorFor(
        'error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed',
      ),
    ).toMatch(/keinen Zugang/);
  });

  it('reads errors from the hash too', () => {
    expect(errorFor('', 'error_code=identity_already_exists')).toMatch(/schon mit einem anderen/);
  });

  it('reports a cancelled consent screen', () => {
    expect(errorFor('error=access_denied&error_description=access_denied')).toMatch(/abgebrochen/);
  });
});

describe('returnUrl', () => {
  it('comes back to the login page with next and the marker', () => {
    const url = new URL(returnUrl('https://rezepte.mininode.app/woche'));
    expect(url.origin).toBe(location.origin);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe('https://rezepte.mininode.app/woche');
    expect(url.searchParams.get('via')).toBe('google');
  });
});

const calls: string[] = [];
let refreshError: Error | null = null;
let connectFails = false;
vi.mock('../lib/supabase.ts', () => ({
  supabase: () => ({
    auth: {
      refreshSession: async () => {
        calls.push('refresh');
        return { error: refreshError };
      },
      setSession: async () => {
        calls.push('setSession');
        return { error: null };
      },
      signOut: async () => {
        calls.push('signOut');
        return { error: null };
      },
    },
  }),
}));
vi.mock('../lib/api.ts', () => ({
  api: async (path: string) => {
    calls.push(`api ${path}`);
    if (connectFails) throw new Error('offline');
  },
}));

const googleSession = (refreshToken: string) =>
  ({
    access_token: 'a',
    refresh_token: 'r',
    provider_refresh_token: refreshToken,
  }) as unknown as Session;

describe('handOverGoogleGrant', () => {
  afterEach(() => {
    calls.length = 0;
    refreshError = null;
    connectFails = false;
  });

  it('scrubs the session before the token leaves the page', async () => {
    await handOverGoogleGrant(googleSession('g1'));
    expect(calls).toEqual(['refresh', 'api /google/connect']);
  });

  it('scrubs even when the API is unreachable, and waits for it', async () => {
    connectFails = true;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    void handOverGoogleGrant(googleSession('g2'));
    await googleHandOverDone();
    expect(calls).toEqual(['refresh', 'api /google/connect']);
  });

  it('falls back to a session without provider tokens when refreshing fails', async () => {
    refreshError = new Error('network');
    await handOverGoogleGrant(googleSession('g3'));
    expect(calls).toEqual(['refresh', 'setSession', 'api /google/connect']);
  });

  it('does nothing for sessions without a Google token', async () => {
    await handOverGoogleGrant({ access_token: 'a' } as unknown as Session);
    expect(calls).toEqual([]);
  });
});
