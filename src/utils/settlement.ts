/**
 * TripSplit - Min-Cash-Flow Settlement Algorithm (Hardened)
 * 
 * ALGORITHM VERSION: 1.0
 * 
 * DESIGN DECISIONS:
 * 1. All member IDs are trip_members.id (not auth.users.id)
 * 2. Rounding only happens at OUTPUT layer (display), not storage
 * 3. Tolerance of 0.01 for floating point comparison
 * 4. Algorithm is deterministic for same input
 */

import type { Balance, SettlementTransaction, TripMember } from '../types';
import { SETTLEMENT_ALGORITHM_VERSION } from '../types';

// Re-export version for external use
export { SETTLEMENT_ALGORITHM_VERSION };

// Tolerance for floating point comparison (1 paisa)
const EPSILON = 0.01;

/**
 * Checks if a balance is effectively zero.
 */
function isZero(value: number): boolean {
    return Math.abs(value) < EPSILON;
}

/**
 * Calculates the minimum transactions needed to settle all debts.
 * Uses a greedy algorithm that pairs largest debtor with largest creditor.
 * 
 * Time Complexity: O(N log N) for sorting + O(N) for matching
 * Space Complexity: O(N)
 * 
 * @param balances - Map of member_id → net balance (positive = gets back, negative = owes)
 * @param members - List of trip members for name resolution
 * @returns Array of settlement transactions, sorted by amount descending
 */
export function calculateSettlements(
    balances: Balance,
    members: TripMember[]
): SettlementTransaction[] {
    // Build name lookup map
    const nameMap = new Map<string, string>();
    members.forEach(m => nameMap.set(m.id, m.display_name));

    // Separate into debtors (negative) and creditors (positive)
    const debtors: { id: string; amount: number }[] = [];
    const creditors: { id: string; amount: number }[] = [];

    Object.entries(balances).forEach(([id, balance]) => {
        if (balance < -EPSILON) {
            debtors.push({ id, amount: balance }); // negative value
        } else if (balance > EPSILON) {
            creditors.push({ id, amount: balance }); // positive value
        }
        // Skip zero balances
    });

    // Sort for greedy matching
    // Debtors: ascending (most negative first, i.e., largest debt)
    debtors.sort((a, b) => a.amount - b.amount);
    // Creditors: descending (largest credit first)
    creditors.sort((a, b) => b.amount - a.amount);

    const transactions: SettlementTransaction[] = [];
    let i = 0; // debtor pointer
    let j = 0; // creditor pointer

    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];

        // Amount to transfer: min(|debt|, credit)
        const transferAmount = Math.min(
            Math.abs(debtor.amount),
            creditor.amount
        );

        // Only create transaction if amount is significant
        if (transferAmount > EPSILON) {
            transactions.push({
                from: debtor.id,
                fromName: nameMap.get(debtor.id) || 'Unknown',
                to: creditor.id,
                toName: nameMap.get(creditor.id) || 'Unknown',
                // Round to 2 decimal places for display
                amount: Math.round(transferAmount * 100) / 100,
            });
        }

        // Update remaining balances
        debtor.amount += transferAmount;  // Move toward zero (less negative)
        creditor.amount -= transferAmount; // Move toward zero (less positive)

        // Move pointers when balance is settled
        if (isZero(debtor.amount)) i++;
        if (isZero(creditor.amount)) j++;
    }

    // Sort transactions by amount descending for display
    transactions.sort((a, b) => b.amount - a.amount);

    return transactions;
}

/**
 * Creates a settlement snapshot for optional persistence.
 * Useful for audit/history purposes.
 */
export function createSettlementSnapshot(
    tripId: string,
    filterType: 'all' | 'major' | 'daily',
    transactions: SettlementTransaction[],
    generatedBy: string
): {
    trip_id: string;
    filter_type: string;
    generated_by: string;
    transactions: SettlementTransaction[];
    algorithm_version: string;
} {
    return {
        trip_id: tripId,
        filter_type: filterType,
        generated_by: generatedBy,
        transactions,
        algorithm_version: SETTLEMENT_ALGORITHM_VERSION,
    };
}
