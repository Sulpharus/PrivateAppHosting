import { afterEach, describe, expect, it, vi } from 'vitest';
import { compatModel, createMiniNodeCompat, installLocalStorageSync } from './compat.ts';
import type { Mininode } from './index.ts';
import type { Json } from './kv.ts';

function fakeMn(userId = 'u1', initial: Record<string, Json> = {}) {
  const kv = new Map<string, Json>(Object.entries(initial));
  const chat = vi.fn(async () => 'antwort');
  const mn = {
    auth: {
      user: async () => ({ id: userId, email: 'anna@example.org', user_metadata: {} }),
      requireLogin: async () => ({ id: userId, email: 'anna@example.org', user_metadata: {} }),
      signOut: vi.fn(async () => undefined),
    },
    kv: {
      get: async (key: string) => kv.get(key) ?? null,
      set: async (key: string, value: Json) => void kv.set(key, value),
      delete: async (key: string) => void kv.delete(key),
      list: async (prefix = '') =>
        [...kv].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })),
    },
    ai: { chat },
  } as unknown as Mininode;
  return { mn, kv, chat };
}

// The patch lives on the shared Storage prototype: every test starts from the browser's methods.
const proto = Object.getPrototypeOf(localStorage) as Storage;
const browser = { setItem: proto.setItem, removeItem: proto.removeItem, clear: proto.clear };
// happy-dom remembers a method after its first use on the object, so anything done before the
// patch goes through the prototype's own functions instead.
const seed = (key: string, value: string) => browser.setItem.call(localStorage, key, value);
// Looked up on the prototype at call time, as a browser does.
const lsSet = (k: string, v: string) => proto.setItem.call(localStorage, k, v);
const lsRemove = (k: string) => proto.removeItem.call(localStorage, k);
const lsClear = () => proto.clear.call(localStorage);
afterEach(() => {
  Object.assign(proto, browser);
  browser.clear.call(localStorage);
});

describe('window.MiniNode compat', () => {
  it('maps the signed-in user', async () => {
    const compat = createMiniNodeCompat(fakeMn().mn);
    const user = await compat.auth.me();
    expect(user).toMatchObject({ id: 'u1', username: 'anna', isGuest: false });
    expect(compat.auth.currentUser()).toEqual(user);
  });

  it('stores db items in kv, collections under a prefix', async () => {
    const { mn, kv } = fakeMn();
    const { db } = createMiniNodeCompat(mn);
    await db.setItem('policies', [1, 2]);
    await db.set('notes', 'a', 'x');
    expect(kv.get('policies')).toEqual([1, 2]);
    expect(await db.get('notes', 'a')).toBe('x');
    expect(await db.list('notes')).toEqual([{ key: 'a', value: 'x' }]);
    await db.remove('notes', 'a');
    expect(kv.has('notes:a')).toBe(false);
  });

  it('sends prompts through mn.ai and refuses images instead of guessing', async () => {
    const { mn, chat } = fakeMn();
    const { ai } = createMiniNodeCompat(mn);
    expect(
      await ai.generateOrConfigure({ system: 's', prompt: 'p', model: 'gemini-2.5-pro' }),
    ).toBe('antwort');
    expect(chat).toHaveBeenCalledWith([{ role: 'user', content: 'p' }], {
      model: 'gemini-pro',
      system: 's',
    });
    await expect(
      ai.generate({ prompt: 'p', images: [{ mime: 'image/png', data: 'x' }] }),
    ).rejects.toMatchObject({ code: 'images_unsupported' });
  });

  it('picks models by name and provider', () => {
    expect(compatModel({})).toBe('gemini-flash');
    expect(compatModel({ model: 'gemini-2.5-flash' })).toBe('gemini-flash');
    expect(compatModel({ provider: 'claude' })).toBe('claude-haiku');
    expect(compatModel({ model: 'claude-sonnet-4' })).toBe('claude-sonnet');
  });
});

describe('localStorage sync', () => {
  it('keeps the platform keys when the app clears its storage', async () => {
    const { mn, kv } = fakeMn('u3');
    seed('mininode:user:demo', '{}');
    await installLocalStorageSync(mn);
    expect(localStorage.getItem('mininode:user:demo')).toBe('{}');
    lsSet('a', '1');
    lsClear();
    expect(localStorage.getItem('mininode:user:demo')).toBe('{}');
    expect(localStorage.getItem('a')).toBeNull();
    await Promise.resolve();
    expect(kv.has('ls:a')).toBe(false);
  });

  it('loads the account values and writes changes back', async () => {
    const { mn, kv } = fakeMn('u1', { 'ls:claims': '[1]' });
    await installLocalStorageSync(mn);
    expect(localStorage.getItem('claims')).toBe('[1]');
    lsSet('policies', '[2]');
    lsRemove('claims');
    await Promise.resolve();
    expect(kv.get('ls:policies')).toBe('[2]');
    expect(kv.has('ls:claims')).toBe(false);
  });

  it('drops what another account left in this browser', async () => {
    seed('mn-ls-owner', 'someone-else');
    seed('secret', 'x');
    seed('mininode:user:demo', '{}');
    await installLocalStorageSync(fakeMn('u2').mn);
    expect(localStorage.getItem('secret')).toBeNull();
    expect(localStorage.getItem('mininode:user:demo')).toBe('{}');
  });
});
