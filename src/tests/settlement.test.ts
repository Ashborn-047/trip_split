import { describe, it, expect } from 'vitest';
import { calculateSettlements } from '../utils/settlement';
import { calculateBalances } from '../utils/balanceCalculator';
import type { TripMember, Expense, ExpenseSplit } from '../types';

// Helper to create mock members
const createMember = (id: string, name: string): TripMember => ({
  id,
  trip_id: 'trip-1',
  user_id: `user-${id}`,
  display_name: name,
  role: 'member',
  is_ghost: false,
  joined_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Helper to create mock expense
const createExpense = (
  id: string,
  amount: number,
  paidBy: string,
  splitType: 'equal' | 'custom' = 'equal'
): Expense => ({
  id,
  trip_id: 'trip-1',
  description: 'Test Expense',
  amount,
  category: 'food',
  type: 'daily',
  expense_date: new Date().toISOString(),
  created_by: 'user-1',
  paid_by: paidBy,
  split_type: splitType,
  receipt_url: null,
  ai_confirmed: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('Settlement Logic', () => {
  const alice = createMember('alice', 'Alice');
  const bob = createMember('bob', 'Bob');
  const charlie = createMember('charlie', 'Charlie');
  const members = [alice, bob, charlie];

  it('should handle simple settlement (A pays for A & B)', () => {
    // Alice pays 100. Split equally between Alice and Bob.
    // Alice net: +100 - 50 = +50
    // Bob net: -50
    const expenses = [createExpense('e1', 100, alice.id)];
    const twoMembers = [alice, bob];

    const balances = calculateBalances(expenses, twoMembers, []);
    const settlements = calculateSettlements(balances, twoMembers);

    expect(balances[alice.id]).toBe(50);
    expect(balances[bob.id]).toBe(-50);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].from).toBe(bob.id);
    expect(settlements[0].to).toBe(alice.id);
    expect(settlements[0].amount).toBe(50);
  });

  it('should handle circular debt (resolves to zero)', () => {
    // Alice pays 100 for Bob (Bob owes Alice 100)
    // Bob pays 100 for Charlie (Charlie owes Bob 100)
    // Charlie pays 100 for Alice (Alice owes Charlie 100)

    // Expenses logic needs to be constructed carefully to reflect "X pays for Y"
    // E1: Alice pays 100. Custom split: Bob uses 100.
    // E2: Bob pays 100. Custom split: Charlie uses 100.
    // E3: Charlie pays 100. Custom split: Alice uses 100.

    const splits: ExpenseSplit[] = [
      { id: 's1', expense_id: 'e1', member_id: bob.id, amount: 100 },
      { id: 's2', expense_id: 'e2', member_id: charlie.id, amount: 100 },
      { id: 's3', expense_id: 'e3', member_id: alice.id, amount: 100 },
    ];

    const expenses: Expense[] = [
      createExpense('e1', 100, alice.id, 'custom'),
      createExpense('e2', 100, bob.id, 'custom'),
      createExpense('e3', 100, charlie.id, 'custom'),
    ];

    const balances = calculateBalances(expenses, members, splits);

    // Alice: Paid 100. Consumed 100 (from E3). Net 0.
    // Bob: Paid 100. Consumed 100 (from E1). Net 0.
    // Charlie: Paid 100. Consumed 100 (from E2). Net 0.

    expect(balances[alice.id]).toBe(0);
    expect(balances[bob.id]).toBe(0);
    expect(balances[charlie.id]).toBe(0);

    const settlements = calculateSettlements(balances, members);
    expect(settlements).toHaveLength(0);
  });

  it('should handle complex unequal splits', () => {
    // Alice pays 90. Equal split (30 each).
    // Bob pays 60. Equal split (20 each).

    // Alice: Paid 90. Consumed 30 (E1) + 20 (E2) = 50. Net: +40.
    // Bob: Paid 60. Consumed 30 (E1) + 20 (E2) = 50. Net: +10.
    // Charlie: Paid 0. Consumed 30 (E1) + 20 (E2) = 50. Net: -50.

    const expenses = [
      createExpense('e1', 90, alice.id),
      createExpense('e2', 60, bob.id),
    ];

    const balances = calculateBalances(expenses, members, []);

    expect(balances[alice.id]).toBe(40);
    expect(balances[bob.id]).toBe(10);
    expect(balances[charlie.id]).toBe(-50);

    const settlements = calculateSettlements(balances, members);

    // Expected: Charlie owes Alice 40, Charlie owes Bob 10.
    // Or optimized: Charlie -> Alice (40), Charlie -> Bob (10).
    // The algorithm is greedy: largest debtor to largest creditor.

    // Debtors: Charlie (-50)
    // Creditors: Alice (+40), Bob (+10)

    // 1. Charlie (-50) pays Alice (+40). Amount 40.
    //    Charlie rem: -10. Alice: 0.
    // 2. Charlie (-10) pays Bob (+10). Amount 10.
    //    Charlie rem: 0. Bob: 0.

    expect(settlements).toHaveLength(2);

    // Sort logic in code puts largest amount first
    expect(settlements[0].from).toBe(charlie.id);
    expect(settlements[0].to).toBe(alice.id);
    expect(settlements[0].amount).toBe(40);

    expect(settlements[1].from).toBe(charlie.id);
    expect(settlements[1].to).toBe(bob.id);
    expect(settlements[1].amount).toBe(10);
  });

  it('should handle floating point precision', () => {
    // 3 people, 100 total. Alice pays.
    // Split: 33.3333 each.
    // Alice: +100 - 33.3333 = +66.6667
    // Bob: -33.3333
    // Charlie: -33.3333

    const expenses = [createExpense('e1', 100, alice.id)];
    const balances = calculateBalances(expenses, members, []);

    const settlements = calculateSettlements(balances, members);

    // B -> A (33.33)
    // C -> A (33.33)

    expect(settlements).toHaveLength(2);
    expect(settlements[0].amount).toBeCloseTo(33.33, 2);
    expect(settlements[1].amount).toBeCloseTo(33.33, 2);
  });
});
