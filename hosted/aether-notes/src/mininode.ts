/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MiniNode App SDK Bridge for Aether Notes (specVersion 1)
 * Integrates with window.mininode.mininode() on the platform
 * and provides full offline fallback for local development.
 */

export interface MiniNodeUser {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  isGuest?: boolean;
}

export interface MiniNodePushSchedule {
  key: string;
  at: string | Date;
  title: string;
  body?: string;
  path?: string;
  createdAt?: string;
}

export interface MiniNodeClient {
  auth: {
    requireLogin: () => Promise<MiniNodeUser>;
    role: () => Promise<'admin' | 'trusted' | 'user'>;
    currentUser: () => MiniNodeUser | null;
    logout: () => Promise<void>;
    onChange?: (cb: (user: MiniNodeUser | null) => void) => () => void;
  };
  kv: {
    get: <T = any>(key: string) => Promise<T | null>;
    set: <T = any>(key: string, value: T, scope?: 'private' | 'shared') => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: <T = any>(prefix?: string) => Promise<{ key: string; value: T }[]>;
  };
  notify: (title: string, body?: string, path?: string) => Promise<void>;
  push: {
    schedule: (schedule: MiniNodePushSchedule) => Promise<void>;
    cancel: (key: string) => Promise<void>;
    list: () => Promise<MiniNodePushSchedule[]>;
    status: () => Promise<'on' | 'off' | 'unsupported'>;
    settingsUrl: () => string;
  };
  files: {
    upload: (
      path: string,
      blob: Blob | File,
      options?: { contentType?: string },
    ) => Promise<{ path: string }>;
    url: (path: string) => Promise<string>;
    list: (prefix?: string) => Promise<string[]>;
  };
  offline: {
    online: () => boolean;
    onChange: (cb: (online: boolean) => void) => () => void;
    onSynced: (cb: () => void) => () => void;
    pending: () => Promise<number>;
  };
  google: {
    connected: () => Promise<boolean>;
    connectUrl: () => string;
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
  };
}

declare global {
  interface Window {
    mininode?: {
      mininode: () => Promise<MiniNodeClient>;
    };
    mnui?: {
      toast: (msg: string) => void;
      theme: {
        set: (theme: string) => void;
        get: () => string;
      };
      select: (el: HTMLElement) => void;
    };
  }
}

// Fallback client implementation for offline / standalone environment
class FallbackMiniNodeClient implements MiniNodeClient {
  private _user: MiniNodeUser | null = null;
  private _authListeners = new Set<(user: MiniNodeUser | null) => void>();
  private _offlineListeners = new Set<(online: boolean) => void>();
  private _syncedListeners = new Set<() => void>();

  constructor() {
    try {
      const stored = localStorage.getItem('mn_user');
      if (stored) {
        this._user = JSON.parse(stored);
      } else {
        this._user = {
          id: 'user-aether',
          email: 'alex@example.com',
          name: 'Alex',
          isGuest: false,
        };
        localStorage.setItem('mn_user', JSON.stringify(this._user));
      }
    } catch (e) {
      this._user = {
        id: 'user-aether',
        email: 'alex@example.com',
        name: 'Alex',
        isGuest: false,
      };
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._offlineListeners.forEach((cb) => cb(true)));
      window.addEventListener('offline', () => this._offlineListeners.forEach((cb) => cb(false)));
    }
  }

  auth = {
    requireLogin: async (): Promise<MiniNodeUser> => {
      if (!this._user) {
        this._user = { id: 'user-aether', email: 'alex@example.com', name: 'Alex' };
        localStorage.setItem('mn_user', JSON.stringify(this._user));
        this._notifyAuth();
      }
      return this._user;
    },
    role: async (): Promise<'admin' | 'trusted' | 'user'> => 'user',
    currentUser: (): MiniNodeUser | null => this._user,
    logout: async () => {
      this._user = null;
      localStorage.removeItem('mn_user');
      this._notifyAuth();
    },
    onChange: (cb: (user: MiniNodeUser | null) => void) => {
      this._authListeners.add(cb);
      cb(this._user);
      return () => {
        this._authListeners.delete(cb);
      };
    },
  };

  private _notifyAuth() {
    this._authListeners.forEach((cb) => cb(this._user));
  }

  kv = {
    get: async <T = any>(key: string): Promise<T | null> => {
      try {
        const raw = localStorage.getItem('mn_kv_' + key);
        return raw !== null ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    set: async <T = any>(key: string, value: T, _scope?: 'private' | 'shared'): Promise<void> => {
      try {
        localStorage.setItem('mn_kv_' + key, JSON.stringify(value));
      } catch (e) {
        console.warn('Storage quota error on kv.set:', e);
      }
    },
    delete: async (key: string): Promise<void> => {
      localStorage.removeItem('mn_kv_' + key);
    },
    list: async <T = any>(prefix: string = ''): Promise<{ key: string; value: T }[]> => {
      const results: { key: string; value: T }[] = [];
      const target = 'mn_kv_' + prefix;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(target)) {
            const raw = localStorage.getItem(k);
            if (raw) {
              results.push({
                key: k.replace('mn_kv_', ''),
                value: JSON.parse(raw),
              });
            }
          }
        }
      } catch (e) {}
      return results;
    },
  };

  notify = async (title: string, body?: string, _path?: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.mnui?.toast) {
      window.mnui.toast(title + (body ? ': ' + body : ''));
    }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body: body || '' });
      }
    } catch (e) {}
  };

  push = {
    schedule: async ({ key, at, title, body, path }: MiniNodePushSchedule): Promise<void> => {
      try {
        const raw = localStorage.getItem('mn_push_schedules') || '{}';
        const pending = JSON.parse(raw);
        pending[key] = { key, at, title, body, path, createdAt: new Date().toISOString() };
        localStorage.setItem('mn_push_schedules', JSON.stringify(pending));
      } catch (e) {}
    },
    cancel: async (key: string): Promise<void> => {
      try {
        const raw = localStorage.getItem('mn_push_schedules') || '{}';
        const pending = JSON.parse(raw);
        delete pending[key];
        localStorage.setItem('mn_push_schedules', JSON.stringify(pending));
      } catch (e) {}
    },
    list: async (): Promise<MiniNodePushSchedule[]> => {
      try {
        const raw = localStorage.getItem('mn_push_schedules') || '{}';
        const pending = JSON.parse(raw);
        return Object.values(pending);
      } catch (e) {
        return [];
      }
    },
    status: async (): Promise<'on' | 'off' | 'unsupported'> => 'on',
    settingsUrl: () => 'https://mininode.app/account/notifications',
  };

  files = {
    upload: async (path: string, blob: Blob | File): Promise<{ path: string }> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            localStorage.setItem('mn_file_' + path, reader.result as string);
          } catch (e) {}
          resolve({ path });
        };
        reader.onerror = () => resolve({ path });
        reader.readAsDataURL(blob);
      });
    },
    url: async (path: string): Promise<string> => {
      return localStorage.getItem('mn_file_' + path) || '';
    },
    list: async (prefix: string = ''): Promise<string[]> => {
      const paths: string[] = [];
      const target = 'mn_file_' + prefix;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(target)) {
          paths.push(k.replace('mn_file_', ''));
        }
      }
      return paths;
    },
  };

  offline = {
    online: (): boolean => (typeof navigator !== 'undefined' ? navigator.onLine : true),
    onChange: (cb: (online: boolean) => void) => {
      this._offlineListeners.add(cb);
      return () => {
        this._offlineListeners.delete(cb);
      };
    },
    onSynced: (cb: () => void) => {
      this._syncedListeners.add(cb);
      return () => {
        this._syncedListeners.delete(cb);
      };
    },
    pending: async (): Promise<number> => 0,
  };

  google = {
    connected: async (): Promise<boolean> => false,
    connectUrl: () => 'https://mininode.app/account/google',
    fetch: async (_url: string, _init?: RequestInit): Promise<Response> => {
      throw new Error('Google is not connected on MiniNode');
    },
  };
}

// Singleton reference
let clientInstance: MiniNodeClient | null = null;

export async function getMiniNode(): Promise<MiniNodeClient> {
  if (clientInstance) return clientInstance;

  if (typeof window !== 'undefined' && window.mininode?.mininode) {
    try {
      clientInstance = await window.mininode.mininode();
      return clientInstance;
    } catch (e) {
      console.warn('Could not initialize window.mininode, falling back to local storage', e);
    }
  }

  clientInstance = new FallbackMiniNodeClient();
  return clientInstance;
}

export const mininode = getMiniNode;

const fallbackSingleton = new FallbackMiniNodeClient();

/**
 * Backward-compatible MiniNode object used throughout the application,
 * routing all persistent data seamlessly through `mn.kv`.
 */
export const MiniNode = {
  auth: {
    requireLogin: async (): Promise<MiniNodeUser> => {
      const mn = await getMiniNode();
      return await mn.auth.requireLogin();
    },
    currentUser: (): MiniNodeUser | null => {
      return clientInstance
        ? clientInstance.auth.currentUser()
        : fallbackSingleton.auth.currentUser();
    },
    role: async (): Promise<string> => {
      const mn = await getMiniNode();
      return await mn.auth.role();
    },
    logout: async () => {
      const mn = await getMiniNode();
      await mn.auth.logout();
    },
    onChange: (cb: (user: MiniNodeUser | null) => void) => {
      if (clientInstance && clientInstance.auth.onChange) {
        return clientInstance.auth.onChange(cb);
      }
      return fallbackSingleton.auth.onChange(cb);
    },
  },

  kv: {
    get: async <T = any>(key: string): Promise<T | null> => {
      const mn = await getMiniNode();
      return await mn.kv.get<T>(key);
    },
    set: async <T = any>(key: string, value: T, scope?: 'private' | 'shared'): Promise<void> => {
      const mn = await getMiniNode();
      await mn.kv.set(key, value, scope);
    },
    delete: async (key: string): Promise<void> => {
      const mn = await getMiniNode();
      await mn.kv.delete(key);
    },
    list: async <T = any>(prefix?: string): Promise<{ key: string; value: T }[]> => {
      const mn = await getMiniNode();
      return await mn.kv.list<T>(prefix);
    },
  },

  db: {
    list: async (collection: string): Promise<{ [key: string]: any }> => {
      const mn = await getMiniNode();
      const prefix = `${collection}:`;
      const items = await mn.kv.list(prefix);
      const map: { [key: string]: any } = {};
      items.forEach(({ key, value }) => {
        const id = key.startsWith(prefix) ? key.slice(prefix.length) : key;
        map[id] = value;
      });
      // Fallback check: if nothing was in itemized format, check if old collection array/dict existed
      if (Object.keys(map).length === 0) {
        const legacy = await mn.kv.get(`col_${collection}`);
        if (legacy && typeof legacy === 'object') {
          return legacy;
        }
      }
      return map;
    },
    get: async (collection: string, key: string): Promise<any | undefined> => {
      const mn = await getMiniNode();
      const val = await mn.kv.get(`${collection}:${key}`);
      return val !== null ? val : undefined;
    },
    set: async (collection: string, key: string, value: any): Promise<void> => {
      const mn = await getMiniNode();
      await mn.kv.set(`${collection}:${key}`, value);
    },
    remove: async (collection: string, key: string): Promise<void> => {
      const mn = await getMiniNode();
      await mn.kv.delete(`${collection}:${key}`);
    },
    getItem: async (key: string): Promise<any | undefined> => {
      const mn = await getMiniNode();
      const val = await mn.kv.get(key);
      return val !== null ? val : undefined;
    },
    setItem: async (key: string, value: any): Promise<void> => {
      const mn = await getMiniNode();
      await mn.kv.set(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
      const mn = await getMiniNode();
      await mn.kv.delete(key);
    },
  },

  notify: async (title: string, body?: string, path?: string): Promise<void> => {
    const mn = await getMiniNode();
    await mn.notify(title, body, path);
  },

  push: {
    schedule: async (opts: MiniNodePushSchedule) => {
      const mn = await getMiniNode();
      await mn.push.schedule(opts);
    },
    cancel: async (key: string) => {
      const mn = await getMiniNode();
      await mn.push.cancel(key);
    },
    list: async () => {
      const mn = await getMiniNode();
      return await mn.push.list();
    },
    status: async () => {
      const mn = await getMiniNode();
      return await mn.push.status();
    },
  },

  files: {
    upload: async (path: string, blob: Blob | File) => {
      const mn = await getMiniNode();
      return await mn.files.upload(path, blob);
    },
    url: async (path: string) => {
      const mn = await getMiniNode();
      return await mn.files.url(path);
    },
  },

  offline: {
    online: (): boolean => {
      return clientInstance ? clientInstance.offline.online() : fallbackSingleton.offline.online();
    },
    onSynced: (cb: () => void) => {
      if (clientInstance) return clientInstance.offline.onSynced(cb);
      return fallbackSingleton.offline.onSynced(cb);
    },
    pending: async () => {
      const mn = await getMiniNode();
      return await mn.offline.pending();
    },
  },

  google: {
    connected: async () => {
      const mn = await getMiniNode();
      return await mn.google.connected();
    },
    connectUrl: () => {
      return clientInstance
        ? clientInstance.google.connectUrl()
        : fallbackSingleton.google.connectUrl();
    },
    fetch: async (url: string, init?: RequestInit) => {
      const mn = await getMiniNode();
      return await mn.google.fetch(url, init);
    },
  },
};

/**
 * Schedule a reminder for a contact, task or meetup using MiniNode Push & Notifications
 */
export async function scheduleMiniNodeReminder({
  key,
  at,
  title,
  body,
  path,
}: {
  key: string;
  at: string;
  title: string;
  body?: string;
  path: string;
}) {
  try {
    await MiniNode.push.schedule({ key, at, title, body, path });
    // Also notify if it's due today
    const today = new Date().toISOString().slice(0, 10);
    if (at.slice(0, 10) <= today) {
      await MiniNode.notify(title, body, path);
    }
  } catch (e) {
    console.error('Error scheduling reminder on MiniNode:', e);
  }
}

/**
 * Cancel a reminder on MiniNode
 */
export async function cancelMiniNodeReminder(key: string) {
  try {
    await MiniNode.push.cancel(key);
  } catch (e) {
    console.error('Error cancelling reminder on MiniNode:', e);
  }
}

/**
 * Export full workspace backup in MiniNode standard JSON schema
 */
export function exportMiniNodeBackup(data: {
  notes: any[];
  routines: any[];
  people: any[];
  contacts: any[];
  interactions: any[];
  meetups: any[];
  kanbanTasks: any[];
  journalEntries: any[];
  settings: any;
}) {
  const payload = {
    app: 'aether-notes',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aether-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export contacts list as German CSV (; separated with UTF-8 BOM)
 */
export function exportContactsCsv(contacts: any[]) {
  const header = [
    'Name',
    'Firma',
    'Rolle',
    'E-Mail',
    'Telefon',
    'Adresse',
    'Tags',
    'Wiedervorlage',
    'Notiz',
  ];
  const rows = contacts.map((c) => [
    (c.name || '').replace(/;/g, ','),
    (c.company || '').replace(/;/g, ','),
    (c.role || '').replace(/;/g, ','),
    (c.email || '').replace(/;/g, ','),
    (c.phone || '').replace(/;/g, ','),
    (c.address || '').replace(/;/g, ','),
    (c.tags || []).join(', '),
    c.followUpDate || '',
    (c.notes || '').replace(/[\r\n]+/g, ' ').replace(/;/g, ','),
  ]);

  const csvContent =
    '\uFEFF' +
    [header.join(';'), ...rows.map((r) => r.map((f) => `"${f}"`).join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kontakte-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
