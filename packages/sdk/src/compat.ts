import { AiError, type AiModel } from './ai.ts';
import type { Mininode } from './index.ts';
import type { Json } from './kv.ts';

// Compatibility layer for apps built against other hosting shims. The integrator
// (`mininode integrate`) installs it when an export talks to `window.MiniNode` (AI Studio apps
// built from the MiniNode assistant brief) or keeps its data in `localStorage`, so these apps run
// without being rewritten. New apps use `mn.*` directly.

interface CompatUser {
  id: string;
  username: string;
  email: string | null;
  isGuest: false;
}

interface GenerateOptions {
  provider?: 'gemini' | 'claude';
  model?: string;
  system?: string;
  prompt?: string;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  images?: { mime: string; data: string }[];
}

const GEMINI_MODELS: Record<string, AiModel> = { pro: 'gemini-pro' };

/** `gemini-*-pro*` → gemini-pro, other Gemini names → gemini-flash, Claude by name or provider. */
export function compatModel(options: Pick<GenerateOptions, 'provider' | 'model'>): AiModel {
  const name = (options.model ?? '').toLowerCase();
  if (options.provider === 'claude' || name.includes('claude')) {
    return name.includes('opus') || name.includes('sonnet') ? 'claude-sonnet' : 'claude-haiku';
  }
  for (const [needle, model] of Object.entries(GEMINI_MODELS)) {
    if (name.includes(needle)) return model;
  }
  return 'gemini-flash';
}

function displayName(user: { email?: string | null; user_metadata?: unknown }): string {
  const meta = (user.user_metadata ?? {}) as { display_name?: unknown; name?: unknown };
  for (const value of [meta.display_name, meta.name]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return user.email?.split('@')[0] ?? 'Nutzer';
}

/** `window.MiniNode` on top of the SDK: login, `db` (→ kv) and `ai` (→ the AI proxy). */
export function createMiniNodeCompat(mn: Mininode) {
  let current: CompatUser | null = null;
  const listeners = new Set<(user: CompatUser | null) => void>();

  const me = async (): Promise<CompatUser | null> => {
    const user = await mn.auth.user();
    current = user
      ? { id: user.id, username: displayName(user), email: user.email ?? null, isGuest: false }
      : null;
    return current;
  };

  const login = async (): Promise<CompatUser> => {
    await mn.auth.requireLogin();
    const user = await me();
    if (!user) throw new Error('Nicht angemeldet');
    return user;
  };

  const collectionKey = (collection: string, key: string) => `${collection}:${key}`;

  const generate = async (options: GenerateOptions): Promise<string> => {
    if (options.images?.length) {
      // The AI proxy forwards text only. Answering without the image would invent its content.
      throw new AiError(
        'Bilder und Scans kann die KI auf dieser Plattform noch nicht auswerten.',
        'images_unsupported',
        400,
      );
    }
    const messages = options.messages?.length
      ? options.messages
      : [{ role: 'user' as const, content: options.prompt ?? '' }];
    return mn.ai.chat(messages, {
      model: compatModel(options),
      ...(options.system ? { system: options.system } : {}),
    });
  };

  return {
    auth: {
      currentUser: () => current,
      me,
      login,
      signup: login,
      guest: login,
      requireLogin: login,
      logout: () => mn.auth.signOut(),
      onChange(callback: (user: CompatUser | null) => void) {
        listeners.add(callback);
        callback(current);
        return () => void listeners.delete(callback);
      },
    },
    ui: {
      showLogin: login,
      logout: () => mn.auth.signOut(),
    },
    ai: {
      generate,
      ask: (prompt: string, options: GenerateOptions = {}) => generate({ ...options, prompt }),
      generateOrConfigure: generate,
      // Keys live on the platform; there is nothing for the app or the user to configure.
      keys: async () => ({ gemini: true, claude: true }),
      setKeys: async () => undefined,
      configure: async () => undefined,
    },
    db: {
      async getItem(key: string): Promise<Json | null> {
        return mn.kv.get(key);
      },
      setItem: (key: string, value: Json) => mn.kv.set(key, value),
      removeItem: (key: string) => mn.kv.delete(key),
      get: (collection: string, key: string) => mn.kv.get(collectionKey(collection, key)),
      set: (collection: string, key: string, value: Json) =>
        mn.kv.set(collectionKey(collection, key), value),
      remove: (collection: string, key: string) => mn.kv.delete(collectionKey(collection, key)),
      async list(collection: string): Promise<{ key: string; value: Json }[]> {
        const prefix = `${collection}:`;
        const rows = await mn.kv.list(prefix);
        return rows.map((row) => ({ key: row.key.slice(prefix.length), value: row.value }));
      },
    },
    /** Notifies `onChange` listeners; used after sign-in changes. */
    emit() {
      for (const listener of listeners) listener(current);
    },
  };
}

type MiniNodeCompat = ReturnType<typeof createMiniNodeCompat>;

declare global {
  interface Window {
    MiniNode?: MiniNodeCompat;
  }
}

/** Defines `window.MiniNode` and resolves the signed-in user first, so `me()` is ready at start. */
export async function installMiniNodeCompat(mn: Mininode): Promise<MiniNodeCompat> {
  const compat = createMiniNodeCompat(mn);
  await compat.auth.me();
  window.MiniNode = compat;
  return compat;
}

interface StorageMethods {
  setItem: Storage['setItem'];
  removeItem: Storage['removeItem'];
  clear: Storage['clear'];
}
const patched = new WeakMap<object, StorageMethods>();

const KEY_PREFIX = 'ls:';
const SYNC_QUIET_MS = 2000;
const SYNC_MAX_MS = 10000;
const OWNER_KEY = 'mn-ls-owner';
/** Keys changed here but not yet confirmed by the account (a platform key: never synced). */
const PENDING_KEY = 'mininode:ls-pending';
/** The page-hide handler of the last install, so a second install replaces it. */
let flushOnHide: ((event: Event) => void) | undefined;
/** Keys of the platform itself; never wiped or synced. */
const isPlatformKey = (key: string) =>
  key === OWNER_KEY || key.startsWith('mininode:') || key.startsWith('sb-') || key === 'mn-auth';

/**
 * Keeps `localStorage` working for apps that store their data there, and makes it follow the
 * account: values are loaded from `mn.kv` before the app starts, and changes go back as the latest
 * value per key, 2 s after the last change (at least every 10 s, and when the page hides). Keys
 * not yet confirmed by the account are journaled here, win at the next start and are sent again,
 * so closing the page right after a change loses nothing. Access stays synchronous because the
 * app reads from the browser's own storage.
 */
export async function installLocalStorageSync(mn: Mininode): Promise<void> {
  const user = await mn.auth.user();
  if (!user) return;
  const storage = window.localStorage;
  const proto = Object.getPrototypeOf(storage) as Storage;
  // Installing twice must not wrap the patched methods again.
  const original = (patched.get(proto) ?? {
    setItem: proto.setItem,
    removeItem: proto.removeItem,
    clear: proto.clear,
  }) as StorageMethods;
  patched.set(proto, original);

  // Another person used this browser before: their data must not show up here. Without an owner
  // the app ran before the sync was installed; what it kept here is this person's, and is adopted.
  const owner = storage.getItem(OWNER_KEY);
  if (owner !== null && owner !== user.id) {
    for (const key of Object.keys(storage)) {
      if (!isPlatformKey(key)) original.removeItem.call(storage, key);
    }
    original.removeItem.call(storage, PENDING_KEY);
  }
  original.setItem.call(storage, OWNER_KEY, user.id);

  const journal = new Set<string>();
  try {
    const keys: unknown = JSON.parse(storage.getItem(PENDING_KEY) ?? '[]');
    if (Array.isArray(keys)) for (const key of keys) if (typeof key === 'string') journal.add(key);
  } catch {
    // An unreadable journal: nothing to send again.
  }
  const saveJournal = () => {
    if (journal.size) original.setItem.call(storage, PENDING_KEY, JSON.stringify([...journal]));
    else original.removeItem.call(storage, PENDING_KEY);
  };

  const remote = await mn.kv.list(KEY_PREFIX);
  const remoteKeys = new Set<string>();
  for (const row of remote) {
    const key = row.key.slice(KEY_PREFIX.length);
    remoteKeys.add(key);
    // A change this device has not delivered yet is newer than the account's value.
    if (typeof row.value === 'string' && !journal.has(key))
      original.setItem.call(storage, key, row.value);
  }
  // Seen locally but gone from the account (removed on another device).
  for (const key of Object.keys(storage)) {
    if (
      !isPlatformKey(key) &&
      !journal.has(key) &&
      !remoteKeys.has(key) &&
      storage.getItem(`mn-ls-seen:${key}`)
    ) {
      original.removeItem.call(storage, key);
      original.removeItem.call(storage, `mn-ls-seen:${key}`);
    }
  }

  // Methods live on the shared prototype; sessionStorage must stay untouched.
  const isLocal = (target: Storage) => target !== window.sessionStorage;

  // Apps save their settings often (some every second while one works): the account gets the
  // latest value per key, 2 s after the last change, at least every 10 s, and when the page hides.
  const pending = new Map<string, string | null>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstPending = 0;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const [key, value] of pending) {
      const done =
        value === null ? mn.kv.delete(KEY_PREFIX + key) : mn.kv.set(KEY_PREFIX + key, value);
      void Promise.resolve(done)
        .then(() => {
          // A newer change of the key is still waiting: it stays in the journal.
          if (pending.has(key)) return;
          journal.delete(key);
          saveJournal();
          if (value === null) original.removeItem.call(storage, `mn-ls-seen:${key}`);
          else original.setItem.call(storage, `mn-ls-seen:${key}`, '1');
        })
        .catch((error: unknown) => {
          console.warn('mininode: could not save', key, error);
        });
    }
    pending.clear();
  };
  const schedule = () => {
    const now = Date.now();
    if (!timer) firstPending = now;
    clearTimeout(timer);
    timer = setTimeout(
      flush,
      Math.max(0, Math.min(SYNC_QUIET_MS, firstPending + SYNC_MAX_MS - now)),
    );
  };
  if (flushOnHide) {
    removeEventListener('pagehide', flushOnHide);
    removeEventListener('visibilitychange', flushOnHide);
  }
  flushOnHide = (event: Event) => {
    if (event.type === 'pagehide' || document.visibilityState === 'hidden') flush();
  };
  addEventListener('pagehide', flushOnHide);
  addEventListener('visibilitychange', flushOnHide);

  const write = (key: string, value: string | null) => {
    if (isPlatformKey(key) || key.startsWith('mn-ls-seen:')) return;
    pending.set(key, value);
    journal.add(key);
    saveJournal();
    schedule();
  };

  // What an earlier page changed but could not deliver goes again.
  for (const key of journal) {
    pending.set(key, storage.getItem(key));
    schedule();
  }

  // Adopted values the account does not have yet go up once (the account's own values won above).
  if (owner === null) {
    for (const key of Object.keys(storage)) {
      const value = storage.getItem(key);
      if (
        !isPlatformKey(key) &&
        !key.startsWith('mn-ls-seen:') &&
        !remoteKeys.has(key) &&
        value !== null
      )
        write(key, value);
    }
  }

  proto.setItem = function (this: Storage, key: string, value: string) {
    original.setItem.call(this, key, value);
    if (isLocal(this)) write(String(key), String(value));
  };
  proto.removeItem = function (this: Storage, key: string) {
    original.removeItem.call(this, key);
    if (isLocal(this)) write(String(key), null);
  };
  proto.clear = function (this: Storage) {
    if (!isLocal(this)) return original.clear.call(this);
    const entries = Object.keys(storage).map((key) => [key, storage.getItem(key)] as const);
    original.clear.call(this);
    // The platform's own keys (offline user, session cookie mirror) survive an app's clear().
    for (const [key, value] of entries) {
      if (isPlatformKey(key) && value !== null) original.setItem.call(storage, key, value);
      else if (!key.startsWith('mn-ls-seen:')) write(key, null);
    }
  };
}
