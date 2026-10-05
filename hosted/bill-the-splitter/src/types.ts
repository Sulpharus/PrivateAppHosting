export interface PaymentInfo {
  paypalHandle?: string;
  iban?: string;
  bic?: string;
  accountHolder?: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  isCurrentUser?: boolean;
  paymentInfo?: PaymentInfo;
}

export interface Group {
  id: string;
  name: string;
  location: string;
  memberIds: string[];
  category: string;
  description?: string;
  createdAt: string;
  creatorId?: string;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  paidById: string;
  date: string; // e.g. "2026-10-24" or "Oct 24"
  dueDate?: string; // Payment deadline e.g. "2026-10-30"
  category: string;
  splitType: 'equal' | 'percentage' | 'exact';
  splitDetails: { [memberId: string]: number }; // percentage or exact amount owed by each member
  receiptUrl?: string; // Data URL or image link
  receiptName?: string;
  remindedAt?: string; // ISO string when reminder was sent
  paymentInfo?: PaymentInfo;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  date: string;
  verified: boolean;
  dueDate?: string;
  receiptUrl?: string;
  receiptName?: string;
}

export interface ActivityLog {
  id: string;
  groupId: string;
  memberId: string;
  type: 'expense_added' | 'settlement_made' | 'reminder_sent' | 'group_updated';
  title: string;
  amount?: number;
  date: string; // e.g. "2 hours ago", "Yesterday"
}
