import type { Expense, Group, Settlement } from './types';

export interface GroupBalances {
  totalSpent: number;
  userShare: number;
  userNetBalance: number; // positive = user is owed, negative = user owes
  memberBalances: { [memberId: string]: number }; // positive = gets back, negative = owes
}

/**
 * Calculates the live group stats and individual balances dynamically.
 */
export function calculateGroupBalances(
  group: Group,
  allExpenses: Expense[],
  allSettlements: Settlement[],
  currentUserId: string = 'u1',
): GroupBalances {
  const groupId = group.id;

  let totalSpent = 0;
  const memberBalances: { [memberId: string]: number } = {};

  // Initialize all current group members to 0 balance
  group.memberIds.forEach((mId) => {
    memberBalances[mId] = 0;
  });

  // 1. Process expenses for this group
  const groupExpenses = allExpenses.filter((e) => e.groupId === groupId);
  groupExpenses.forEach((exp) => {
    const amount = exp.amount;
    totalSpent += amount;

    // Credit the person who paid
    memberBalances[exp.paidById] = (memberBalances[exp.paidById] || 0) + amount;

    // Debit everyone who shared (including payer)
    if (exp.splitType === 'equal') {
      const share = amount / (group.memberIds.length || 1);
      group.memberIds.forEach((mId) => {
        memberBalances[mId] = (memberBalances[mId] || 0) - share;
      });
    } else if (exp.splitType === 'percentage') {
      group.memberIds.forEach((mId) => {
        const percent = exp.splitDetails[mId] || 0;
        const share = amount * (percent / 100);
        memberBalances[mId] = (memberBalances[mId] || 0) - share;
      });
    } else if (exp.splitType === 'exact') {
      group.memberIds.forEach((mId) => {
        const share = exp.splitDetails[mId] || 0;
        memberBalances[mId] = (memberBalances[mId] || 0) - share;
      });
    }
  });

  // 2. Process settlements for this group
  const groupSettlements = allSettlements.filter((s) => s.groupId === groupId);
  groupSettlements.forEach((set) => {
    const amount = set.amount;
    memberBalances[set.fromMemberId] = (memberBalances[set.fromMemberId] || 0) + amount;
    memberBalances[set.toMemberId] = (memberBalances[set.toMemberId] || 0) - amount;
  });

  const userShare = totalSpent / (group.memberIds.length || 1);
  const userNetBalance = memberBalances[currentUserId] || 0;

  return {
    totalSpent,
    userShare,
    userNetBalance,
    memberBalances,
  };
}

/**
 * Calculates the global balance overview for the user across ALL groups
 */
export function calculateGlobalOverview(
  groups: Group[],
  expenses: Expense[],
  settlements: Settlement[],
  currentUserId: string = 'u1',
): { totalBalance: number; owedToYou: number; youOwe: number } {
  let totalBalance = 0;
  let owedToYou = 0;
  let youOwe = 0;

  groups.forEach((group) => {
    const { userNetBalance } = calculateGroupBalances(group, expenses, settlements, currentUserId);
    totalBalance += userNetBalance;
    if (userNetBalance > 0) {
      owedToYou += userNetBalance;
    } else if (userNetBalance < 0) {
      youOwe += Math.abs(userNetBalance);
    }
  });

  return {
    totalBalance,
    owedToYou,
    youOwe,
  };
}
