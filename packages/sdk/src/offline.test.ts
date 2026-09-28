import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Json } from './kv.ts';
import { createKv } from './kv.ts';
import { createOfflineKv, isRefusal, memoryStore, type RemoteKv } from './offline.ts';

/** A server kv that can be switched offline (throws like a failed fetch). */
function fakeRemote() {
  const data = new Map<string, Json>();
  const calls: string[] = [];
  let down = false;
  let refuse = false;
  let flaky = false;
  const guard = (call: string) => {
    calls.push(call);
    if (down) throw new TypeError('Failed to fetch');
    if (flaky) throw new TypeError('Failed to fetch');
    if (refuse && !call.startsWith('get'))
      throw Object.assign(new Error('permission denied'), { code: '42501', status: 403 });
  };
  const remote: RemoteKv = {
    async get(key, scope = 'user') {
      guard(`get ${key}`);
      return data.get(`${scope}:${key}`) ?? null;
    },
    async set(key, value, scope = 'user') {
      guard(`set ${key}`);
      data.set(`${scope}:${key}`, value);
    },
    async delete(key, scope = 'user') {
      guard(`delete ${key}`);
      data.delete(`${scope}:${key}`);
    },
    async list(prefix = '', scope = 'user') {
      guard(`list ${prefix}`);
      return [...data.entries()]
        .filter(([id]) => id.startsWith(`${scope}:${prefix}`))
        .map(([id, value]) => ({ key: id.slice(scope.length + 1), value }))
        .sort((a, b) => a.key.localeCompare(b.key));
    },
  };
  return {
    remote,
    data,
    calls,
    setRefuse(value: boolean) {
      refuse = value;
    },
    /** Requests fail although the browser believes it is online (bad mobile connection). */
    setFlaky(value: boolean) {
      flaky = value;
    },
    setDown(value: boolean) {
      down = value;
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(!value);
    },
  };
}

function setup() {
  const server = fakeRemote();
  const store = memoryStore();
  const { kv, offline } = createOfflineKv(server.remote, async () => store);
  return { server, kv, offline };
}

afterEach(() => vi.restoreAllMocks());

describe('offline kv', () => {
  it('writes through to the server while online', async () => {
    const { server, kv, offline } = setup();
    await kv.set('task:1', { title: 'Müll' });
    expect(server.data.get('user:task:1')).toEqual({ title: 'Müll' });
    expect(await offline.pending()).toBe(0);
  });

  it('answers from the local copy offline and queues changes', async () => {
    const { server, kv, offline } = setup();
    await kv.set('task:1', { title: 'Müll' });
    await kv.list('task:');
    server.setDown(true);
    expect(await kv.get('task:1')).toEqual({ title: 'Müll' });
    await kv.set('task:2', { title: 'Einkaufen' });
    await kv.delete('task:1');
    expect(await kv.list('task:')).toEqual([{ key: 'task:2', value: { title: 'Einkaufen' } }]);
    expect(await offline.pending()).toBe(2);
    expect(server.data.has('user:task:2')).toBe(false);
  });

  it('sends the queue in order when back online and tells the app', async () => {
    const { server, kv, offline } = setup();
    server.setDown(true);
    await kv.set('n', 1);
    await kv.set('n', 2);
    await kv.delete('old');
    server.setDown(false);
    const synced = vi.fn();
    offline.onSynced(synced);
    expect(await offline.sync()).toBe(3);
    expect(server.data.get('user:n')).toBe(2);
    expect(server.calls.filter((c) => !c.startsWith('get'))).toEqual([
      'set n',
      'set n',
      'delete old',
    ]);
    expect(synced).toHaveBeenCalledOnce();
    expect(await offline.pending()).toBe(0);
  });

  it('keeps unsent local changes when the list is refreshed', async () => {
    const { server, kv } = setup();
    server.setDown(true);
    await kv.set('task:9', 'lokal');
    server.setDown(false);
    server.data.set('user:task:1', 'server');
    // The queue is not sent yet (sync runs in the background); the list shows both.
    const listed = await kv.list('task:');
    expect(listed).toEqual([
      { key: 'task:1', value: 'server' },
      { key: 'task:9', value: 'lokal' },
    ]);
  });

  it('stops at the first network error and retries later', async () => {
    const { server, kv, offline } = setup();
    server.setDown(true);
    await kv.set('a', 1);
    expect(await offline.sync()).toBe(0);
    expect(await offline.pending()).toBe(1);
    server.setDown(false);
    expect(await offline.sync()).toBe(1);
  });

  it('keeps sharing scopes apart', async () => {
    const { server, kv } = setup();
    await kv.set('motd', 'Hallo', 'shared');
    server.setDown(true);
    expect(await kv.get('motd', 'shared')).toBe('Hallo');
    expect(await kv.get('motd')).toBeNull();
  });

  it('keeps the queue when requests fail while the browser thinks it is online', async () => {
    const { server, kv, offline } = setup();
    server.setFlaky(true);
    await kv.set('a', 1);
    await kv.set('b', 2);
    expect(await offline.sync()).toBe(0);
    expect(await offline.pending()).toBe(2);
    expect(await kv.get('a')).toBe(1);
    server.setFlaky(false);
    expect(await offline.sync()).toBe(2);
    expect(server.data.get('user:b')).toBe(2);
  });

  it('restores the local copy when the server refuses a write', async () => {
    const { server, kv } = setup();
    await kv.set('a', 'alt');
    server.setRefuse(true);
    await expect(kv.set('a', 'neu')).rejects.toThrow('permission denied');
    server.setDown(true);
    expect(await kv.get('a')).toBe('alt');
  });

  it('drops a queued change the server refuses and takes its value again', async () => {
    const { server, kv, offline } = setup();
    await kv.set('a', 'server');
    server.setDown(true);
    await kv.set('a', 'offline');
    server.setDown(false);
    server.setRefuse(true);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await offline.sync()).toBe(1);
    expect(await offline.pending()).toBe(0);
    server.setDown(true);
    expect(await kv.get('a')).toBe('server');
  });

  it('also sends changes written while a sync is running', async () => {
    const { server, kv, offline } = setup();
    server.setDown(true);
    await kv.set('a', 1);
    server.setDown(false);
    const running = offline.sync();
    await kv.set('b', 2);
    await running;
    await offline.sync();
    expect(await offline.pending()).toBe(0);
    expect(server.data.get('user:b')).toBe(2);
  });
});

describe('on top of the real kv client', () => {
  it('queues instead of dropping when fetch fails with navigator.onLine still true', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = createClient('http://127.0.0.1:1', 'pk', {
      auth: { persistSession: false },
      global: { fetch: failing },
    });
    const store = memoryStore();
    const { kv, offline } = createOfflineKv(createKv(client, 'todo'), async () => store);
    await kv.set('task:1', { title: 'Müll' });
    expect(await offline.sync()).toBe(0);
    expect(await offline.pending()).toBe(1);
    expect(await kv.get('task:1')).toEqual({ title: 'Müll' });
    expect(await kv.list('task:')).toHaveLength(1);
  });

  it('classifies server answers', () => {
    expect(isRefusal(Object.assign(new Error('x'), { code: '42501' }))).toBe(true);
    expect(isRefusal(Object.assign(new Error('x'), { status: 422 }))).toBe(true);
    for (const status of [401, 408, 429, 500, 503])
      expect(isRefusal(Object.assign(new Error('x'), { status }))).toBe(false);
    expect(isRefusal(new TypeError('Failed to fetch'))).toBe(false);
  });
});
