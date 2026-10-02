import { AiError, type AiModel } from './ai.ts';
import type { Mininode } from './index.ts';
import type { Json } from './kv.ts';

// Compatibility layer for apps built against other hosting shims. The integrator
// (`mininode integrate`) installs it when an export talks to `window.MiniNode` (AI Studio apps
// built from the MiniNode assistant brief) or keeps its data in `localStorage`, so these apps run
// without being rewritten. New apps use `mn.*` directly.

export interface CompatUser {
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

export type MiniNodeCompat = ReturnType<typeof createMiniNodeCompat>;

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
const OWNER_KEY = 'mn-ls-owner';
/** Keys of the platform itself; never wiped or synced. */
const isPlatformKey = (key: string) =>
  key === OWNER_KEY || key.startsWith('mininode:') || key.startsWith('sb-') || key === 'mn-auth';

/**
 * Keeps `localStorage` working for apps that store their data there, and makes it follow the
 * account: values are loaded from `mn.kv` before the app starts and every change is written
 * back. Access stays synchronous because the app reads from the browser's own storage.
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

  // Another person used this browser before: their data must not show up here.
  if (storage.getItem(OWNER_KEY) !== user.id) {
    for (const key of Object.keys(storage)) {
      if (!isPlatformKey(key)) original.removeItem.call(storage, key);
    }
    original.setItem.call(storage, OWNER_KEY, user.id);
  }

  const remote = await mn.kv.list(KEY_PREFIX);
  const remoteKeys = new Set<string>();
  for (const row of remote) {
    const key = row.key.slice(KEY_PREFIX.length);
    remoteKeys.add(key);
    if (typeof row.value === 'string') original.setItem.call(storage, key, row.value);
  }
  // Seen locally but gone from the account (removed on another device).
  for (const key of Object.keys(storage)) {
    if (!isPlatformKey(key) && !remoteKeys.has(key) && storage.getItem(`mn-ls-seen:${key}`)) {
      original.removeItem.call(storage, key);
      original.removeItem.call(storage, `mn-ls-seen:${key}`);
    }
  }

  // Methods live on the shared prototype; sessionStorage must stay untouched.
  const isLocal = (target: Storage) => target !== window.sessionStorage;

  const write = (key: string, value: string | null) => {
    if (isPlatformKey(key) || key.startsWith('mn-ls-seen:')) return;
    const done =
      value === null ? mn.kv.delete(KEY_PREFIX + key) : mn.kv.set(KEY_PREFIX + key, value);
    void Promise.resolve(done).catch((error: unknown) => {
      console.warn('mininode: could not save', key, error);
    });
    if (value === null) original.removeItem.call(storage, `mn-ls-seen:${key}`);
    else original.setItem.call(storage, `mn-ls-seen:${key}`, '1');
  };

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
