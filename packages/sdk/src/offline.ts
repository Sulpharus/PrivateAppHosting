// Offline key-value data (ADR 0005). `mn.kv` keeps a local copy per user and app (IndexedDB) and
// a queue of changes made without a connection; the queue is sent in order when the device is
// online again. The last change that reaches the server wins.

import type { Json, KvScope } from './kv.ts';

/**
 * `user` and `shared` are the kv scopes; `table` holds the rows of the app's own tables (`mn.table`,
 * key `<table>/<id>`), which share the local copy and the queue of changes with kv.
 */
export type OfflineScope = KvScope | 'table';

/** The server side: kv (kv.ts) and, for the scope `table`, rows of the app's tables (tables.ts). */
export interface RemoteKv {
  get(key: string, scope?: OfflineScope): Promise<Json | null>;
  set(key: string, value: Json, scope?: OfflineScope): Promise<void>;
  delete(key: string, scope?: OfflineScope): Promise<void>;
  list(prefix?: string, scope?: OfflineScope): Promise<{ key: string; value: Json }[]>;
}

export interface LocalItem {
  id: string;
  scope: OfflineScope;
  key: string;
  value: Json;
}

export interface QueuedChange {
  seq?: number;
  op: 'set' | 'delete';
  scope: OfflineScope;
  key: string;
  value?: Json;
}

/** Where the local copy and the queue live. */
export interface LocalStore {
  /** Identifies the store across tabs (one sync at a time per store). */
  readonly name: string;
  get(id: string): Promise<LocalItem | undefined>;
  put(item: LocalItem): Promise<void>;
  remove(id: string): Promise<void>;
  all(): Promise<LocalItem[]>;
  enqueue(change: QueuedChange): Promise<void>;
  queue(): Promise<QueuedChange[]>;
  dequeue(seq: number): Promise<void>;
}

const itemId = (scope: OfflineScope, key: string) => `${scope}:${key}`;

export function memoryStore(): LocalStore {
  const items = new Map<string, LocalItem>();
  const changes: QueuedChange[] = [];
  let seq = 0;
  return {
    name: 'memory',
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
    name,
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

/** The request never reached the server (or no answer came back). */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const record = error as { name?: unknown; message?: unknown } | null;
  if (record?.name === 'AuthRetryableFetchError') return true;
  const message = error instanceof Error ? error.message : String(record?.message ?? error);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(
    message,
  );
}

/**
 * The server looked at the change and said no (no access, invalid data). Such a change is never
 * going to succeed, so it is dropped. Everything else (network, 5xx, 401, 408, 429) is retried.
 */
export function isRefusal(error: unknown): boolean {
  if (isNetworkError(error)) return false;
  const record = error as { status?: unknown; code?: unknown } | null;
  const status = typeof record?.status === 'number' ? record.status : 0;
  const code = typeof record?.code === 'string' ? record.code : '';
  if (/^(42501|23\d{3}|22\d{3}|PGRST1\d\d)$/.test(code)) return true;
  return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

type Listener = () => void;

/** Runs `task` exclusively across tabs when the browser supports Web Locks. */
async function exclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return task();
  return locks.request(`mininode-sync:${name}`, task) as Promise<T>;
}

export function createOfflineKv(remote: RemoteKv, localStore: () => Promise<LocalStore>) {
  const synced = new Set<Listener>();
  let syncing: Promise<number> | undefined;
  let again = false;

  const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
  const pendingIds = async (store: LocalStore) =>
    new Set((await store.queue()).map((change) => itemId(change.scope, change.key)));

  const applyLocal = async (store: LocalStore, change: QueuedChange) => {
    const id = itemId(change.scope, change.key);
    if (change.op === 'delete') await store.remove(id);
    else await store.put({ id, scope: change.scope, key: change.key, value: change.value ?? null });
  };

  /** Puts the local copy back to what it was (after the server refused a change). */
  const restore = async (store: LocalStore, id: string, previous: LocalItem | undefined) => {
    if (previous) await store.put(previous);
    else await store.remove(id);
  };

  const send = (change: QueuedChange) =>
    change.op === 'delete'
      ? remote.delete(change.key, change.scope)
      : remote.set(change.key, change.value ?? null, change.scope);

  /** One pass over the queue, in order. Returns [sent, stopped by a transient error]. */
  const pass = async (store: LocalStore): Promise<[number, boolean]> => {
    let sent = 0;
    for (const change of await store.queue()) {
      try {
        await send(change);
      } catch (err) {
        if (!isRefusal(err)) return [sent, true];
        // The server refused it for good: drop it and take the server's value again.
        console.warn('mininode: the server refused an offline change', change.key, err);
        const id = itemId(change.scope, change.key);
        const current = await remote.get(change.key, change.scope).catch(() => undefined);
        if (current === null) await store.remove(id);
        else if (current !== undefined)
          await store.put({ id, scope: change.scope, key: change.key, value: current });
      }
      if (change.seq !== undefined) await store.dequeue(change.seq);
      sent += 1;
    }
    return [sent, false];
  };

  /**
   * Sends queued changes in order until the queue is empty or a transient error stops it; one
   * tab at a time. Returns how many were sent (or dropped as refused).
   */
  const sync = (): Promise<number> => {
    if (syncing) {
      again = true;
      return syncing;
    }
    syncing = (async () => {
      const store = await localStore();
      let total = 0;
      await exclusive(store.name, async () => {
        for (;;) {
          again = false;
          const [sent, stopped] = await pass(store);
          total += sent;
          // Changes written during this pass are in the queue now: take them too.
          if (stopped || (!again && (await store.queue()).length === 0)) break;
          if (sent === 0 && !again) break;
        }
      });
      if (total > 0) for (const listener of synced) listener();
      return total;
    })().finally(() => {
      syncing = undefined;
    });
    return syncing;
  };

  /** Writes locally at once; sends now when possible, otherwise queues it. */
  const write = async (change: QueuedChange) => {
    const store = await localStore();
    const id = itemId(change.scope, change.key);
    const previous = await store.get(id);
    await applyLocal(store, change);
    const queued = (await store.queue()).length > 0;
    if (online() && !queued) {
      try {
        await send(change);
        return;
      } catch (err) {
        if (isRefusal(err)) {
          await restore(store, id, previous);
          throw err;
        }
      }
    }
    await store.enqueue(change);
    if (online()) void sync();
  };

  if (typeof window !== 'undefined') window.addEventListener('online', () => void sync());

  const read = async (key: string, scope: OfflineScope): Promise<Json | null> => {
    const store = await localStore();
    const id = itemId(scope, key);
    if (online() && !(await pendingIds(store)).has(id)) {
      try {
        const value = await remote.get(key, scope);
        if (value === null) await store.remove(id);
        else await store.put({ id, scope, key, value });
        return value;
      } catch (err) {
        if (isRefusal(err)) throw err;
      }
    }
    return (await store.get(id))?.value ?? null;
  };

  const readList = async (
    prefix: string,
    scope: OfflineScope,
  ): Promise<{ key: string; value: Json }[]> => {
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
      if (isRefusal(err)) throw err;
      return local();
    }
  };
  const readOne = (key: string) => read(key, 'table');
  const readAll = (prefix: string) => readList(prefix, 'table');

  return {
    kv: {
      async get<T extends Json = Json>(key: string, scope: KvScope = 'user'): Promise<T | null> {
        return (await read(key, scope)) as T | null;
      },

      set: (key: string, value: Json, scope: KvScope = 'user') =>
        write({ op: 'set', scope, key, value }),

      delete: (key: string, scope: KvScope = 'user') => write({ op: 'delete', scope, key }),

      list: (prefix = '', scope: KvScope = 'user') => readList(prefix, scope),
    },

    /** Rows of the app's own tables, offline like kv (see tables.ts for the public shape). */
    rows: {
      get: (key: string) => readOne(key),
      list: (prefix: string) => readAll(prefix),
      set: (key: string, value: Json) => write({ op: 'set', scope: 'table', key, value }),
      delete: (key: string) => write({ op: 'delete', scope: 'table', key }),
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
