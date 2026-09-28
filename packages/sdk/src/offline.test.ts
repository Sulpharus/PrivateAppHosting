import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Json } from './kv.ts';
import { createOfflineKv, memoryStore, type RemoteKv } from './offline.ts';

/** A server kv that can be switched offline (throws like a failed fetch). */
function fakeRemote() {
  const data = new Map<string, Json>();
  const calls: string[] = [];
  let down = false;
  const guard = (call: string) => {
    calls.push(call);
    if (down) throw new TypeError('Failed to fetch');
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
});
