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

/** Writes what changed in a whole list and removes what is no longer in it. */
async function saveList<T extends { id: string }>(prefix: string, items: T[]): Promise<void> {
  const mn = await platform();
  const seen = known.get(prefix) ?? new Map<string, string>();
  known.set(prefix, seen);
  const ids = new Set(items.map((item) => item.id));
  let changed = false;
  for (const item of items) {
    const text = JSON.stringify(item);
    if (seen.get(item.id) === text) continue;
    await mn.kv.set(`${prefix}:${item.id}`, item as unknown as Json, 'shared');
    seen.set(item.id, text);
    changed = true;
  }
  for (const id of [...seen.keys()]) {
    if (ids.has(id)) continue;
    await mn.kv.delete(`${prefix}:${id}`, 'shared');
    seen.delete(id);
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
let channelReady = false;

function announce(): void {
  void platform().then((mn) =>
    mn
      .realtime(CHANNEL)
      .broadcast('changed', { at: Date.now() })
      .catch(() => undefined),
  );
}

async function listen(): Promise<void> {
  if (channelReady) return;
  channelReady = true;
  const mn = await platform();
  const refresh = () => listeners.forEach((listener) => listener());
  mn.realtime(CHANNEL).on('broadcast', { event: 'changed' }, refresh).subscribe();
  // Changes made while the device was offline arrive when it is back online.
  mn.offline.onSynced(refresh);
}

let current: MiniNodeUser | null = null;
const authListeners = new Set<(user: MiniNodeUser | null) => void>();

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

  /** Called when another person (or this device after being offline) changed shared data. */
  onRemoteChange: (callback: () => void): (() => void) => {
    listeners.add(callback);
    void listen();
    return () => void listeners.delete(callback);
  },

  db: {
    listGroups: (): Promise<Group[]> => loadAll<Group>('group'),
    saveGroup: (group: Group): Promise<void> => saveOne('group', group),
    removeGroup: async (groupId: string): Promise<void> => {
      await removeOne('group', groupId);
      // The group's expenses go with it.
      const expenses = await loadAll<Expense>('expense');
      await saveList(
        'expense',
        expenses.filter((expense) => expense.groupId !== groupId),
      );
    },

    listExpenses: async (groupId?: string): Promise<Expense[]> => {
      const all = await loadAll<Expense>('expense');
      return groupId ? all.filter((expense) => expense.groupId === groupId) : all;
    },
    saveExpense: (expense: Expense): Promise<void> => saveOne('expense', expense),
    saveExpenses: (expenses: Expense[]): Promise<void> => saveList('expense', expenses),

    listSettlements: (): Promise<Settlement[]> => loadAll<Settlement>('settlement'),
    saveSettlements: (settlements: Settlement[]): Promise<void> =>
      saveList('settlement', settlements),

    listActivities: (): Promise<ActivityLog[]> => loadAll<ActivityLog>('activity'),
    saveActivities: (activities: ActivityLog[]): Promise<void> => saveList('activity', activities),

    listMembers: (): Promise<Member[]> => loadAll<Member>('member'),
    saveMembers: (members: Member[]): Promise<void> => saveList('member', members),

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
