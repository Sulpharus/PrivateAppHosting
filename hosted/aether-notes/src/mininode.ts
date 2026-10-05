import { type Mininode, mininode } from '@mininode/sdk';

/**
 * The bridge between the app and the platform (@mininode/sdk). Every record lives in `mn.kv`
 * (private to the person, synced across devices, usable offline) under "<collection>:<id>".
 */

export interface MiniNodeUser {
  id: string;
  username: string;
  email?: string;
}

let client: Promise<Mininode> | null = null;
const platform = (): Promise<Mininode> => {
  client ??= mininode();
  return client;
};

function displayName(user: { email?: string | null; user_metadata?: unknown }): string {
  const meta = (user.user_metadata ?? {}) as { display_name?: unknown; name?: unknown };
  for (const value of [meta.display_name, meta.name]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return user.email?.split('@')[0] ?? '';
}

/** The name to greet: the person's MiniNode account name (display name, else the part of the e-mail before @). */
export function accountName(user: MiniNodeUser | null): string {
  return user?.username.trim() || 'Nutzer';
}

declare global {
  interface Window {
    /** The App Kit (/_mininode/ui.js). */
    mnui?: { toast: (message: string) => void };
  }
}

type Json = Parameters<Mininode['kv']['set']>[1];

export const MiniNode = {
  auth: {
    /** Resolves with the signed-in person, or sends them to the central login. */
    requireLogin: async (): Promise<MiniNodeUser> => {
      const user = await (await platform()).auth.requireLogin();
      return { id: user.id, username: displayName(user), email: user.email ?? undefined };
    },
    logout: async (): Promise<void> => {
      await (await platform()).auth.signOut();
    },
  },

  db: {
    /** All records of a collection, by id. */
    list: async (collection: string): Promise<Record<string, any>> => {
      const mn = await platform();
      const prefix = `${collection}:`;
      const map: Record<string, any> = {};
      for (const { key, value } of await mn.kv.list(prefix)) map[key.slice(prefix.length)] = value;
      return map;
    },
    set: async (collection: string, id: string, value: unknown): Promise<void> => {
      await (await platform()).kv.set(`${collection}:${id}`, value as Json);
    },
    remove: async (collection: string, id: string): Promise<void> => {
      await (await platform()).kv.delete(`${collection}:${id}`);
    },
    getItem: async (key: string): Promise<any | undefined> => {
      return (await (await platform()).kv.get(key)) ?? undefined;
    },
    setItem: async (key: string, value: unknown): Promise<void> => {
      await (await platform()).kv.set(key, value as Json);
    },
  },

  /** The address of the app menu (the portal). */
  portalUrl: async (): Promise<string> => (await platform()).config.portalUrl,

  notify: async (title: string, body?: string, path?: string): Promise<void> => {
    await (await platform()).notify(title, body, path);
  },

  push: {
    schedule: async (options: {
      key: string;
      at: string;
      title: string;
      body?: string;
      path?: string;
    }): Promise<void> => {
      await (await platform()).push.schedule(options);
    },
    cancel: async (key: string): Promise<void> => {
      await (await platform()).push.cancel(key);
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
