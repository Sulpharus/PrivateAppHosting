import { balancesInCents, expenseShares, fromCents } from './splits';
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
  const groupExpenses = allExpenses.filter((e) => e.groupId === group.id);
  const groupSettlements = allSettlements.filter((s) => s.groupId === group.id);
  const cents = balancesInCents(groupExpenses, groupSettlements, group.memberIds);
  const memberBalances: { [memberId: string]: number } = {};
  for (const [id, value] of Object.entries(cents)) memberBalances[id] = fromCents(value);

  const totalSpent = groupExpenses.reduce((sum, e) => sum + e.amount, 0);
  // What the current person's own part of everything comes to.
  const userShare = fromCents(
    groupExpenses.reduce(
      (sum, e) => sum + (expenseShares(e, group.memberIds)[currentUserId] ?? 0),
      0,
    ),
  );

  return {
    totalSpent,
    userShare,
    userNetBalance: memberBalances[currentUserId] || 0,
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
