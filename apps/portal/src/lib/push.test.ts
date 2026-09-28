import { afterEach, describe, expect, it, vi } from 'vitest';

// The server answer for "is this endpoint mine?" (RLS returns own rows only).
let answer: { data: { id: string } | null; error: { message: string } | null } = {
  data: null,
  error: null,
};
vi.mock('./supabase.ts', () => ({
  platform: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => answer }) }),
    }),
  }),
}));
vi.mock('./api.ts', () => ({ api: vi.fn() }));

const { releaseForeignSubscription } = await import('./push.ts');

function browserWithSubscription() {
  const unsubscribe = vi.fn(async () => true);
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', unsubscribe };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => subscription },
      }),
    },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted' },
  });
  return unsubscribe;
}

afterEach(() => vi.restoreAllMocks());

describe('releaseForeignSubscription', () => {
  it('switches off a subscription that belongs to someone else', async () => {
    const unsubscribe = browserWithSubscription();
    answer = { data: null, error: null };
    await releaseForeignSubscription();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps the user’s own subscription', async () => {
    const unsubscribe = browserWithSubscription();
    answer = { data: { id: 's1' }, error: null };
    await releaseForeignSubscription();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('keeps it when the check fails or the device is offline', async () => {
    const unsubscribe = browserWithSubscription();
    answer = { data: null, error: { message: 'Failed to fetch' } };
    await releaseForeignSubscription();
    answer = { data: null, error: null };
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await releaseForeignSubscription();
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
