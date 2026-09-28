import { afterEach, describe, expect, it } from 'vitest';
import { googleErrorFromUrl, returnUrl } from './google.ts';

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
