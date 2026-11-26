import { describe, expect, it, vi } from 'vitest';
import { leavePage } from './leave.ts';

describe('leavePage', () => {
  it('goes to the page itself when the app is not framed', () => {
    const assign = vi.fn();
    const win = { location: { assign } } as unknown as Window;
    Object.assign(win, { parent: win, top: win });
    leavePage('https://example.org/login', 'https://example.org', win);
    expect(assign).toHaveBeenCalledWith('https://example.org/login');
  });

  it('asks the portal, and only the portal, when the app is in its viewer', () => {
    const postMessage = vi.fn();
    const assign = vi.fn();
    const parent = { postMessage } as unknown as Window;
    const win = { parent, top: parent, location: { assign } } as unknown as Window;
    leavePage('https://example.org/logout', 'https://example.org/', win);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'mn:open', url: 'https://example.org/logout' },
      'https://example.org',
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
