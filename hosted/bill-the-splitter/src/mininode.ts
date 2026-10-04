import { ActivityLog, Expense, type Group, Member, Settlement } from './types';

// Declare global interface for window.MiniNode
declare global {
  interface Window {
    MiniNode?: any;
  }
}

export interface MiniNodeUser {
  id: string;
  username: string;
  isGuest: boolean;
}

export const getMiniNode = () => {
  return typeof window !== 'undefined' ? window.MiniNode : undefined;
};

export const hasMiniNodeCloud = (): boolean => {
  const MN = getMiniNode();
  return !!(MN && MN.db && MN.mp);
};

// Simple helper to generate random IDs
export const generateId = (prefix: string) => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
};

/**
 * Fallback local storage helper mimicking MiniNode db
 */
const localDb = {
  getItem: async (key: string): Promise<any> => {
    const val = localStorage.getItem(`ledger_fallback_${key}`);
    return val ? JSON.parse(val) : undefined;
  },
  setItem: async (key: string, value: any): Promise<void> => {
    localStorage.setItem(`ledger_fallback_${key}`, JSON.stringify(value));
  },
  removeItem: async (key: string): Promise<void> => {
    localStorage.removeItem(`ledger_fallback_${key}`);
  },
  list: async (collection: string): Promise<{ [key: string]: any }> => {
    const listRaw = localStorage.getItem(`ledger_fallback_coll_${collection}`);
    return listRaw ? JSON.parse(listRaw) : {};
  },
  get: async (collection: string, key: string): Promise<any> => {
    const listRaw = localStorage.getItem(`ledger_fallback_coll_${collection}`);
    const items = listRaw ? JSON.parse(listRaw) : {};
    return items[key];
  },
  set: async (collection: string, key: string, value: any): Promise<void> => {
    const listRaw = localStorage.getItem(`ledger_fallback_coll_${collection}`);
    const items = listRaw ? JSON.parse(listRaw) : {};
    items[key] = value;
    localStorage.setItem(`ledger_fallback_coll_${collection}`, JSON.stringify(items));
  },
  remove: async (collection: string, key: string): Promise<void> => {
    const listRaw = localStorage.getItem(`ledger_fallback_coll_${collection}`);
    const items = listRaw ? JSON.parse(listRaw) : {};
    delete items[key];
    localStorage.setItem(`ledger_fallback_coll_${collection}`, JSON.stringify(items));
  },
};

/**
 * Global MiniNode Interface providing unified access with offline fallback
 */
export const MiniNodeAPI = {
  isAvailable: (): boolean => {
    return !!getMiniNode();
  },

  // Auth Operations
  auth: {
    getCurrentUser: (): MiniNodeUser | null => {
      const MN = getMiniNode();
      if (MN && MN.auth) {
        return MN.auth.currentUser();
      }
      // Fallback local mock user
      return {
        id: 'u1',
        username: 'Alex Rivera',
        isGuest: false,
      };
    },

    requireLogin: async (): Promise<MiniNodeUser> => {
      const MN = getMiniNode();
      if (MN && MN.auth) {
        try {
          const user = await MN.auth.requireLogin();
          return user;
        } catch (err) {
          console.error('MiniNode requireLogin failed, using fallback:', err);
        }
      }
      return {
        id: 'u1',
        username: 'Alex Rivera',
        isGuest: false,
      };
    },

    logout: async (): Promise<void> => {
      const MN = getMiniNode();
      if (MN && MN.auth) {
        await MN.auth.logout();
      }
    },

    onChange: (callback: (user: MiniNodeUser | null) => void): (() => void) => {
      const MN = getMiniNode();
      if (MN && MN.auth) {
        return MN.auth.onChange(callback);
      }
      // Mock unsubscribe
      return () => {};
    },

    showLogin: async (): Promise<MiniNodeUser> => {
      const MN = getMiniNode();
      if (MN && MN.ui) {
        return await MN.ui.showLogin();
      }
      return {
        id: 'u1',
        username: 'Alex Rivera',
        isGuest: false,
      };
    },
  },

  // DB bookmark helper for remember user's joined groups
  db: {
    listGroups: async (): Promise<Group[]> => {
      if (hasMiniNodeCloud()) {
        const MN = getMiniNode();
        const records = await MN.db.list('groups');
        return Object.values(records) as Group[];
      } else {
        const records = await localDb.list('groups');
        return Object.values(records) as Group[];
      }
    },

    saveGroup: async (group: Group): Promise<void> => {
      if (hasMiniNodeCloud()) {
        const MN = getMiniNode();
        await MN.db.set('groups', group.id, group);
      } else {
        await localDb.set('groups', group.id, group);
      }
    },

    removeGroup: async (groupId: string): Promise<void> => {
      if (hasMiniNodeCloud()) {
        const MN = getMiniNode();
        await MN.db.remove('groups', groupId);
      } else {
        await localDb.remove('groups', groupId);
      }
    },

    getPrefs: async (): Promise<any> => {
      if (hasMiniNodeCloud()) {
        const MN = getMiniNode();
        return await MN.db.getItem('prefs');
      } else {
        return await localDb.getItem('prefs');
      }
    },

    setPrefs: async (prefs: any): Promise<void> => {
      if (hasMiniNodeCloud()) {
        const MN = getMiniNode();
        await MN.db.setItem('prefs', prefs);
      } else {
        await localDb.setItem('prefs', prefs);
      }
    },
  },

  // Notification sender
  notify: async (title: string, body: string, url: string = ''): Promise<void> => {
    const MN = getMiniNode();
    if (MN && MN.notify) {
      try {
        await MN.notify(title, body, url);
      } catch (err) {
        console.error('MiniNode notification failed:', err);
      }
    } else if (MN && MN.notifications && MN.notifications.notify) {
      try {
        await MN.notifications.notify(title, body, url);
      } catch (err) {
        console.error('MiniNode notifications.notify failed:', err);
      }
    } else {
      console.log(`[Notification Fallback] Title: ${title} | Body: ${body} | URL: ${url}`);
    }
  },

  // AI assistant parser helper (uses prompt to structured data)
  ai: {
    parseExpense: async (sentence: string, memberNames: string[]): Promise<any> => {
      const MN = getMiniNode();
      if (MN && MN.ai && MN.ai.generateOrConfigure) {
        try {
          const reply = await MN.ai.generateOrConfigure({
            system:
              'Extract one expense as strict JSON: {"desc":string,"amount":number,"paidBy":string,"with":string[]}. ' +
              'Names in "paidBy" and "with" MUST be chosen from this list: ' +
              memberNames.join(', ') +
              '. Reply with JSON only, no markdown blocks, no other text.',
            prompt: sentence,
          });

          let cleanReply = reply.trim();
          if (cleanReply.startsWith('```')) {
            cleanReply = cleanReply.replace(/^```json|```$/g, '').trim();
          }
          return JSON.parse(cleanReply);
        } catch (err) {
          console.error('MiniNode AI parsing failed:', err);
          throw err;
        }
      } else {
        // Simple offline client parser fallback
        return fallbackAiParser(sentence, memberNames);
      }
    },
  },
};

/**
 * Basic offline local parsing logic if MiniNode.ai isn't present
 */
function fallbackAiParser(sentence: string, memberNames: string[]): any {
  const lowercaseSentence = sentence.toLowerCase();

  // Extract amount
  const amountMatch = sentence.match(/\$?(\d+(\.\d{1,2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 10.0;

  // Extract payer
  let paidBy = memberNames[0]; // Default to first member
  for (const name of memberNames) {
    if (lowercaseSentence.includes(name.toLowerCase())) {
      paidBy = name;
      break;
    }
  }

  // Extract description
  let desc = 'Shared Expense';
  const descKeywords = ['for', 'bought', 'paid'];
  for (const keyword of descKeywords) {
    const index = lowercaseSentence.indexOf(keyword);
    if (index !== -1) {
      const afterKeyword = sentence.substring(index + keyword.length).trim();
      const firstCommaOrPeriod = afterKeyword.search(/[,.]/);
      desc =
        firstCommaOrPeriod !== -1
          ? afterKeyword.substring(0, firstCommaOrPeriod).trim()
          : afterKeyword;
      // Remove any names from description
      memberNames.forEach((n) => {
        desc = desc.replace(new RegExp(n, 'gi'), '').replace(/\s+/g, ' ').trim();
      });
      break;
    }
  }

  // Extract split participants
  const withMembers = memberNames.filter(
    (name) => lowercaseSentence.includes(name.toLowerCase()) && name !== paidBy,
  );

  return {
    desc: desc || 'Dining Out',
    amount,
    paidBy,
    with: withMembers.length > 0 ? withMembers : memberNames,
  };
}
