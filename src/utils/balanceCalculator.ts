/**
 * TripSplit - Balance Calculator (Hardened)
 * 
 * DESIGN DECISIONS:
 * 1. All member IDs are trip_members.id (not auth.users.id)
 * 2. No rounding during calculation - only at display layer
 * 3. Equal splits use exact division, drift handled by settlement rounding
 * 4. Custom splits are validated at DB level via trigger
 * 5. NEW: Prioritizes explicit 'splits' (ExpenseSplit[]) over legacy implicit calculation.
 */

import type { Expense, ExpenseSplit, Balance, Summary, TripMember } from '../types';

/**
 * Calculates net balances for a list of expenses.
 * 
 * Balance formula per member:
 *   Net = (Total Paid) - (Total Consumed)
 *   Positive = Gets money back
 *   Negative = Owes money
 * 
 * @param expenses - List of expenses to calculate
 * @param members - All trip members (for equal split calculation fallback)
 * @param splits - All expense splits (explicit shares for equal/custom/shares)
 * @returns Balance map: member_id → net balance
 */
export function calculateBalances(
    expenses: Expense[],
    members: TripMember[],
    splits: ExpenseSplit[]
): Balance {
    const memberIds = members.map(m => m.id);

    // Initialize all balances to zero
    const balances: Balance = {};
    memberIds.forEach(id => {
        balances[id] = 0;
    });

    // Build splits lookup: expense_id → member_id → amount
    const splitsMap = new Map<string, Map<string, number>>();
    splits.forEach(split => {
        if (!splitsMap.has(split.expense_id)) {
            splitsMap.set(split.expense_id, new Map());
        }
        splitsMap.get(split.expense_id)!.set(split.member_id, split.amount);
    });

    // Process each expense
    expenses.forEach(expense => {
        const payerId = expense.paid_by; // This is trip_members.id
        const amount = expense.amount;

        // Credit the payer
        if (balances[payerId] !== undefined) {
            balances[payerId] += amount;
        } else {
            // Payer not in current member list (edge case: removed member)
            balances[payerId] = amount;
        }

        // Debit the consumers
        const expenseSplits = splitsMap.get(expense.id);

        // NEW LOGIC: If explicit splits exist, use them (Single Source of Truth)
        if (expenseSplits && expenseSplits.size > 0) {
            expenseSplits.forEach((splitAmount, memberId) => {
                if (balances[memberId] !== undefined) {
                    balances[memberId] -= splitAmount;
                } else {
                    // Member involved in split but not in current member list
                    balances[memberId] = -splitAmount;
                }
            });
        }
        // OLD LOGIC (Fallback): If no splits found and type is 'equal', assume legacy implicit split
        else if (expense.split_type === 'equal') {
            // Equal split among all current members (Legacy behavior)
            // Note: This causes the "history rewriting" bug if members change,
            // but is necessary for backward compatibility with old data.
            if (memberIds.length > 0) {
                const splitAmount = amount / memberIds.length;
                memberIds.forEach(memberId => {
                    balances[memberId] -= splitAmount;
                });
            }
        }
        // If custom/shares but no splits found -> Data inconsistency or fetch lag.
        // We skip processing to avoid incorrect assumptions.
    });

    return balances;
}

/**
 * Calculates full summary with segregated balances.
 * 
 * @param expenses - All expenses for the trip
 * @param members - All trip members
 * @param splits - All custom splits
 * @returns Summary with global, major, and daily balances
 */
export function calculateSummary(
    expenses: Expense[],
    members: TripMember[],
    splits: ExpenseSplit[]
): Summary {
    const majorExpenses = expenses.filter(e => e.type === 'major');
    const dailyExpenses = expenses.filter(e => e.type === 'daily');

    // Get splits for each subset
    const majorExpenseIds = new Set(majorExpenses.map(e => e.id));
    const dailyExpenseIds = new Set(dailyExpenses.map(e => e.id));

    const majorSplits = splits.filter(s => majorExpenseIds.has(s.expense_id));
    const dailySplits = splits.filter(s => dailyExpenseIds.has(s.expense_id));

    return {
        globalBalance: calculateBalances(expenses, members, splits),
        majorBalance: calculateBalances(majorExpenses, members, majorSplits),
        dailyBalance: calculateBalances(dailyExpenses, members, dailySplits),
        totalSpent: expenses.reduce((sum, e) => sum + e.amount, 0),
    };
}

/**
 * Formats a balance for display.
 * Rounds to 2 decimal places and adds sign prefix.
 */
export function formatBalance(balance: number): string {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 0) return `+${rounded.toLocaleString()}`;
    if (rounded < 0) return rounded.toLocaleString();
    return '0';
}

/**
 * Checks if settlements are needed (any non-zero balances).
 */
export function needsSettlement(balances: Balance): boolean {
    return Object.values(balances).some(b => Math.abs(b) > 0.01);
}
