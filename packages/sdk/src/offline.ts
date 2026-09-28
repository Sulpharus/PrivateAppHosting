// Offline key-value data (ADR 0005). `mn.kv` keeps a local copy per user and app (IndexedDB) and
// a queue of changes made without a connection; the queue is sent in order when the device is
// online again. The last change that reaches the server wins.

import type { Json, KvScope } from './kv.ts';

/** The server-side kv (see kv.ts). */
export interface RemoteKv {
  get(key: string, scope?: KvScope): Promise<Json | null>;
  set(key: string, value: Json, scope?: KvScope): Promise<void>;
  delete(key: string, scope?: KvScope): Promise<void>;
  list(prefix?: string, scope?: KvScope): Promise<{ key: string; value: Json }[]>;
}

export interface LocalItem {
  id: string;
  scope: KvScope;
  key: string;
  value: Json;
}

export interface QueuedChange {
  seq?: number;
  op: 'set' | 'delete';
  scope: KvScope;
  key: string;
  value?: Json;
}

/** Where the local copy and the queue live. */
export interface LocalStore {
  get(id: string): Promise<LocalItem | undefined>;
  put(item: LocalItem): Promise<void>;
  remove(id: string): Promise<void>;
  all(): Promise<LocalItem[]>;
  enqueue(change: QueuedChange): Promise<void>;
  queue(): Promise<QueuedChange[]>;
  dequeue(seq: number): Promise<void>;
}

const itemId = (scope: KvScope, key: string) => `${scope}:${key}`;

export function memoryStore(): LocalStore {
  const items = new Map<string, LocalItem>();
  const changes: QueuedChange[] = [];
  let seq = 0;
  return {
    get: async (id) => items.get(id),
    put: async (item) => {
      items.set(item.id, item);
    },
    remove: async (id) => {
      items.delete(id);
    },
    all: async () => [...items.values()],
    enqueue: async (change) => {
      seq += 1;
      changes.push({ ...change, seq });
    },
    queue: async () => [...changes],
    dequeue: async (done) => {
      const index = changes.findIndex((change) => change.seq === done);
      if (index >= 0) changes.splice(index, 1);
    },
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB store; one database per app and user, so a shared device never mixes accounts. */
export function indexedDbStore(name: string): LocalStore {
  let db: Promise<IDBDatabase> | undefined;
  const open = () => {
    db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('items', { keyPath: 'id' });
        req.result.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return db;
  };
  const store = async (table: 'items' | 'queue', mode: IDBTransactionMode) =>
    (await open()).transaction(table, mode).objectStore(table);
  return {
    get: async (id) => request((await store('items', 'readonly')).get(id)),
    put: async (item) => {
      await request((await store('items', 'readwrite')).put(item));
    },
    remove: async (id) => {
      await request((await store('items', 'readwrite')).delete(id));
    },
    all: async () => request((await store('items', 'readonly')).getAll()),
    enqueue: async (change) => {
      const { seq: _unused, ...rest } = change;
      await request((await store('queue', 'readwrite')).add(rest));
    },
    queue: async () => request((await store('queue', 'readonly')).getAll()),
    dequeue: async (seq) => {
      await request((await store('queue', 'readwrite')).delete(seq));
    },
  };
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? error);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    message,
  );
}

type Listener = () => void;

export function createOfflineKv(remote: RemoteKv, localStore: () => Promise<LocalStore>) {
  const synced = new Set<Listener>();
  let syncing: Promise<number> | undefined;

  const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
  const pendingIds = async (store: LocalStore) =>
    new Set((await store.queue()).map((change) => itemId(change.scope, change.key)));

  const applyLocal = async (store: LocalStore, change: QueuedChange) => {
    const id = itemId(change.scope, change.key);
    if (change.op === 'delete') await store.remove(id);
    else await store.put({ id, scope: change.scope, key: change.key, value: change.value ?? null });
  };

  const send = (change: QueuedChange) =>
    change.op === 'delete'
      ? remote.delete(change.key, change.scope)
      : remote.set(change.key, change.value ?? null, change.scope);

  /** Sends queued changes in order; stops at the first network error. Returns how many were sent. */
  const sync = (): Promise<number> => {
    syncing ??= (async () => {
      const store = await localStore();
      let sent = 0;
      for (const change of await store.queue()) {
        try {
          await send(change);
        } catch (err) {
          if (isNetworkError(err)) break;
          // Refused by the server (e.g. access removed): drop it rather than block the queue.
          console.warn('mininode: dropped an offline change', change.key, err);
        }
        if (change.seq !== undefined) await store.dequeue(change.seq);
        sent += 1;
      }
      if (sent > 0) for (const listener of synced) listener();
      return sent;
    })().finally(() => {
      syncing = undefined;
    });
    return syncing;
  };

  /** Writes locally at once; sends now when possible, otherwise queues it. */
  const write = async (change: QueuedChange) => {
    const store = await localStore();
    await applyLocal(store, change);
    const queued = (await store.queue()).length > 0;
    if (online() && !queued) {
      try {
        await send(change);
        return;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    await store.enqueue(change);
    if (online()) void sync();
  };

  if (typeof window !== 'undefined') window.addEventListener('online', () => void sync());

  return {
    kv: {
      async get<T extends Json = Json>(key: string, scope: KvScope = 'user'): Promise<T | null> {
        const store = await localStore();
        const id = itemId(scope, key);
        if (online() && !(await pendingIds(store)).has(id)) {
          try {
            const value = await remote.get(key, scope);
            if (value === null) await store.remove(id);
            else await store.put({ id, scope, key, value });
            return value as T | null;
          } catch (err) {
            if (!isNetworkError(err)) throw err;
          }
        }
        return ((await store.get(id))?.value as T | undefined) ?? null;
      },

      set: (key: string, value: Json, scope: KvScope = 'user') =>
        write({ op: 'set', scope, key, value }),

      delete: (key: string, scope: KvScope = 'user') => write({ op: 'delete', scope, key }),

      async list(prefix = '', scope: KvScope = 'user'): Promise<{ key: string; value: Json }[]> {
        const store = await localStore();
        const local = () =>
          store.all().then((items) =>
            items
              .filter((item) => item.scope === scope && item.key.startsWith(prefix))
              .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
              .map((item) => ({ key: item.key, value: item.value })),
          );
        if (!online()) return local();
        try {
          const rows = await remote.list(prefix, scope);
          // Refresh the copy, keeping local changes that are not sent yet.
          const pending = await pendingIds(store);
          const fresh = new Set(rows.map((row) => itemId(scope, row.key)));
          for (const item of await store.all())
            if (
              item.scope === scope &&
              item.key.startsWith(prefix) &&
              !fresh.has(item.id) &&
              !pending.has(item.id)
            )
              await store.remove(item.id);
          for (const row of rows) {
            const id = itemId(scope, row.key);
            if (!pending.has(id)) await store.put({ id, scope, key: row.key, value: row.value });
          }
          return local();
        } catch (err) {
          if (!isNetworkError(err)) throw err;
          return local();
        }
      },
    },

    offline: {
      /** Whether the device is online right now. */
      online,
      /** Calls `listener(online)` whenever the connection changes; returns an unsubscribe. */
      onChange(listener: (isOnline: boolean) => void): () => void {
        const on = () => listener(true);
        const off = () => listener(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
          window.removeEventListener('online', on);
          window.removeEventListener('offline', off);
        };
      },
      /** Changes made offline that are not on the server yet. */
      pending: async () => (await (await localStore()).queue()).length,
      /** Called after queued changes were sent: reload the current view. */
      onSynced(listener: Listener): () => void {
        synced.add(listener);
        return () => synced.delete(listener);
      },
      /** Sends queued changes now (also happens automatically when the device goes online). */
      sync,
    },
  };
}
