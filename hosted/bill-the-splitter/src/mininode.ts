import { type Mininode, mininode } from '@mininode/sdk';
import type { ActivityLog, Expense, Group, Member, Settlement } from './types';

/**
 * The bridge between the app and the platform (@mininode/sdk). Everything the group works on lives
 * in mn.kv with the shared scope: one record per group, expense, settlement, activity and member,
 * so two people editing at the same time never overwrite each other's list. A change is announced
 * on a realtime channel, and the other open apps reload.
 */

export interface MiniNodeUser {
  id: string;
  username: string;
  isGuest: boolean;
  email?: string;
  avatarUrl?: string;
}

// Unique ID generator
export const generateId = (prefix: string) => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
};

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
  return user.email?.split('@')[0] ?? 'User';
}

type Json = Parameters<Mininode['kv']['set']>[1];

/** What was last read or written per record, so a list that is saved whole only writes changes. */
const known = new Map<string, Map<string, string>>();

async function loadAll<T extends { id: string }>(prefix: string): Promise<T[]> {
  const mn = await platform();
  const rows = await mn.kv.list(`${prefix}:`, 'shared');
  const seen = new Map<string, string>();
  const items: T[] = [];
  for (const row of rows) {
    const id = row.key.slice(prefix.length + 1);
    seen.set(id, JSON.stringify(row.value));
    items.push(row.value as unknown as T);
  }
  known.set(prefix, seen);
  return items;
}

async function saveOne<T extends { id: string }>(prefix: string, item: T): Promise<void> {
  const mn = await platform();
  const text = JSON.stringify(item);
  const seen = known.get(prefix) ?? new Map<string, string>();
  known.set(prefix, seen);
  if (seen.get(item.id) === text) return;
  await mn.kv.set(`${prefix}:${item.id}`, item as unknown as Json, 'shared');
  seen.set(item.id, text);
  announce();
}

/**
 * Writes what changed in a whole list. It never deletes: a list that is a little behind (another
 * person added something meanwhile) must not remove their records; deleting is `removeOne`.
 */
async function saveList<T extends { id: string }>(prefix: string, items: T[]): Promise<void> {
  const mn = await platform();
  const seen = known.get(prefix) ?? new Map<string, string>();
  known.set(prefix, seen);
  let changed = false;
  for (const item of items) {
    const text = JSON.stringify(item);
    if (seen.get(item.id) === text) continue;
    await mn.kv.set(`${prefix}:${item.id}`, item as unknown as Json, 'shared');
    seen.set(item.id, text);
    changed = true;
  }
  if (changed) announce();
}

async function removeOne(prefix: string, id: string): Promise<void> {
  const mn = await platform();
  await mn.kv.delete(`${prefix}:${id}`, 'shared');
  known.get(prefix)?.delete(id);
  announce();
}

// ---- live updates between the people of a group ----
const CHANNEL = 'bill-the-splitter';
const listeners = new Set<() => void>();
let channel: Promise<ReturnType<Mininode['realtime']>> | null = null;

const sharedChannel = () => {
  channel ??= platform().then((mn) => {
    const next = mn.realtime(CHANNEL);
    next.on('broadcast', { event: 'changed' }, () => listeners.forEach((listener) => listener()));
    next.subscribe();
    // Changes made while the device was offline arrive when it is back online.
    mn.offline.onSynced(() => listeners.forEach((listener) => listener()));
    return next;
  });
  return channel;
};

function announce(): void {
  void sharedChannel().then((c) =>
    c.send({ type: 'broadcast', event: 'changed', payload: { at: Date.now() } }).catch(() => undefined),
  );
}

async function listen(): Promise<void> {
  await sharedChannel();
}

// A save that fails does not throw into the screen (they run inside state updates): it is
// reported, and the screen says so.
const errorListeners = new Set<() => void>();
const reported =
  <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
  (...args: A): Promise<void> =>
    fn(...args).catch((error) => {
      console.warn('Saving failed:', error);
      errorListeners.forEach((listener) => listener());
    });

/** A round picture with the initial, drawn here: no name leaves the device for a picture service. */
export function avatarFor(name: string): string {
  const initial = (name.trim().charAt(0) || '?').toUpperCase().replace(/[<>&"']/g, '?');
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 38%)"/><text x="32" y="32" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="#fff">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

let current: MiniNodeUser | null = null;
const authListeners = new Set<(user: MiniNodeUser | null) => void>();

/** The address of the app menu (the portal). */
export const portalUrl = async (): Promise<string> => (await platform()).config.portalUrl;

export const MiniNodeAPI = {
  auth: {
    requireLogin: async (): Promise<MiniNodeUser> => {
      const mn = await platform();
      await mn.auth.requireLogin();
      const user = await mn.auth.user();
      if (!user) throw new Error('Not signed in');
      current = {
        id: user.id,
        username: displayName(user),
        isGuest: false,
        email: user.email ?? undefined,
      };
      authListeners.forEach((listener) => listener(current));
      return current;
    },

    logout: async (): Promise<void> => {
      const mn = await platform();
      await mn.auth.signOut();
    },

    onChange: (callback: (user: MiniNodeUser | null) => void): (() => void) => {
      authListeners.add(callback);
      callback(current);
      return () => void authListeners.delete(callback);
    },
  },

  /** Called when a save did not go through. */
  onSaveError: (callback: () => void): (() => void) => {
    errorListeners.add(callback);
    return () => void errorListeners.delete(callback);
  },

  /** Called when another person (or this device after being offline) changed shared data. */
  onRemoteChange: (callback: () => void): (() => void) => {
    listeners.add(callback);
    void listen();
    return () => void listeners.delete(callback);
  },

  db: {
    listGroups: (): Promise<Group[]> => loadAll<Group>('group'),
    getGroup: async (id: string): Promise<Group | null> => {
      const mn = await platform();
      return ((await mn.kv.get(`group:${id}`, 'shared')) as unknown as Group | null) ?? null;
    },
    saveGroup: reported((group: Group) => saveOne('group', group)),
    removeGroup: async (groupId: string): Promise<void> => {
      await removeOne('group', groupId);
      // The group's expenses go with it.
      const expenses = await loadAll<Expense>('expense');
      for (const expense of expenses)
        if (expense.groupId === groupId) await removeOne('expense', expense.id);
    },

    listExpenses: async (groupId?: string): Promise<Expense[]> => {
      const all = await loadAll<Expense>('expense');
      return groupId ? all.filter((expense) => expense.groupId === groupId) : all;
    },
    saveExpense: reported((expense: Expense) => saveOne('expense', expense)),
    saveExpenses: reported((expenses: Expense[]) => saveList('expense', expenses)),
    removeExpense: reported((id: string) => removeOne('expense', id)),

    listSettlements: (): Promise<Settlement[]> => loadAll<Settlement>('settlement'),
    saveSettlements: reported((settlements: Settlement[]) => saveList('settlement', settlements)),

    listActivities: (): Promise<ActivityLog[]> => loadAll<ActivityLog>('activity'),
    saveActivities: reported((activities: ActivityLog[]) => saveList('activity', activities)),

    listMembers: (): Promise<Member[]> => loadAll<Member>('member'),
    saveMembers: reported((members: Member[]) => saveList('member', members)),

    // Preferences (payment details, language) belong to the person, not to the group.
    getPrefs: async (): Promise<any> => {
      const mn = await platform();
      return (await mn.kv.get('prefs')) ?? {};
    },
    setPrefs: async (prefs: any): Promise<void> => {
      const mn = await platform();
      await mn.kv.set('prefs', prefs as Json);
    },
  },

  // Notification in the portal's bell (and on the devices of the person)
  notify: async (title: string, body: string, url: string = ''): Promise<void> => {
    const mn = await platform();
    await mn.notify(title, body, url || undefined).catch(() => undefined);
  },

  // Natural language expense parser: the AI through the platform, a local reading as the fallback
  ai: {
    parseExpense: async (sentence: string, memberNames: string[]): Promise<any> => {
      try {
        const mn = await platform();
        return await mn.ai.json(
          sentence,
          {
            type: 'object',
            properties: {
              desc: { type: 'string' },
              amount: { type: 'number' },
              paidBy: { type: 'string', enum: memberNames },
              with: { type: 'array', items: { type: 'string', enum: memberNames } },
            },
            required: ['desc', 'amount', 'paidBy', 'with'],
          },
          {
            system:
              'Extract one expense from the sentence. Names in "paidBy" and "with" must come from the given list.',
          },
        );
      } catch (err) {
        console.warn('AI parsing failed, using the local reader:', err);
        return parseExpenseSentenceLocally(sentence, memberNames);
      }
    },
  },
};

/**
 * Intelligent local parsing without hardcoded mocks
 */
function parseExpenseSentenceLocally(sentence: string, memberNames: string[]): any {
  const lowercase = sentence.toLowerCase();

  // Extract amount (€ or $ or plain numbers)
  const amountMatch = sentence.match(
    /(?:€|\$|EUR|eur)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|\$|EUR|eur)?/,
  );
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;

  // Extract payer from actual group member names
  let paidBy = memberNames[0] || 'You';
  for (const name of memberNames) {
    if (name && lowercase.includes(name.toLowerCase())) {
      paidBy = name;
      break;
    }
  }

  // Extract description by removing numbers, currency symbols, and member names
  let desc = sentence;
  // Remove numbers
  desc = desc.replace(/(?:€|\$|EUR|eur)?\s*\d+(?:[.,]\d{1,2})?\s*(?:€|\$|EUR|eur)?/gi, '');
  // Remove keywords like "paid", "für", "for", "bought", "bezahlt", "mit", "with"
  desc = desc.replace(/\b(paid|bought|für|for|bezahlt|mit|with|by|von)\b/gi, ' ');
  // Remove member names from description
  memberNames.forEach((n) => {
    if (n) desc = desc.replace(new RegExp(n, 'gi'), ' ');
  });
  desc = desc.replace(/\s+/g, ' ').trim();

  // Extract participants
  const withMembers = memberNames.filter(
    (name) =>
      name && lowercase.includes(name.toLowerCase()) && name.toLowerCase() !== paidBy.toLowerCase(),
  );

  return {
    desc: desc || 'Expense',
    amount: amount > 0 ? amount : 0,
    paidBy,
    with: withMembers.length > 0 ? withMembers : memberNames,
  };
}
