import type { ActivityLog, Expense, Group, Member, Settlement } from './types';

export const INITIAL_MEMBERS: Member[] = [
  {
    id: 'u1',
    name: 'Alex Rivera',
    email: 'alex.rivera@billthesplitter.io',
    avatarUrl:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80',
    isCurrentUser: true,
    paymentInfo: {
      paypalHandle: 'alexrivera',
      iban: 'DE89 3704 0044 0532 0130 00',
      bic: 'COBADEFFXXX',
      accountHolder: 'Alex Rivera',
    },
  },
  {
    id: 'u2',
    name: 'Sarah Chen',
    email: 'sarah.chen@billthesplitter.io',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80',
    paymentInfo: {
      paypalHandle: 'sarahchen',
      iban: 'DE44 5001 0517 5407 3249 11',
      bic: 'INGDDEFFXXX',
      accountHolder: 'Sarah Chen',
    },
  },
  {
    id: 'u3',
    name: 'Mike Johnson',
    email: 'mike.j@billthesplitter.io',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&h=120&q=80',
    paymentInfo: {
      paypalHandle: 'mikej',
      iban: 'DE21 1007 0000 0332 9491 50',
      bic: 'DEUTDEDDXXX',
      accountHolder: 'Mike Johnson',
    },
  },
  {
    id: 'u4',
    name: 'Elena Rodriguez',
    email: 'elena.r@billthesplitter.io',
    avatarUrl:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=120&h=120&q=80',
    paymentInfo: {
      paypalHandle: 'elenarodriguez',
      iban: 'DE08 7002 0270 0019 8234 11',
      bic: 'HYVEDEMMXXX',
      accountHolder: 'Elena Rodriguez',
    },
  },
  {
    id: 'u5',
    name: 'Marcus Thorne',
    email: 'marcus.t@billthesplitter.io',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&h=120&q=80',
    paymentInfo: {
      paypalHandle: 'marcusthorne',
      iban: 'DE75 5121 0800 1245 8739 00',
      bic: 'SPKADED1XXX',
      accountHolder: 'Marcus Thorne',
    },
  },
  {
    id: 'u6',
    name: 'Jordan Lee',
    email: 'jordan.lee@billthesplitter.io',
    avatarUrl:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&h=120&q=80',
    paymentInfo: {
      paypalHandle: 'jordanlee',
      iban: 'DE33 2004 1155 0783 2911 22',
      bic: 'COMMDEDDXXX',
      accountHolder: 'Jordan Lee',
    },
  },
];

export const INITIAL_GROUPS: Group[] = [];
export const INITIAL_EXPENSES: Expense[] = [];
export const INITIAL_SETTLEMENTS: Settlement[] = [];
export const INITIAL_ACTIVITIES: ActivityLog[] = [];
