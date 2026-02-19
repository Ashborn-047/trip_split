/**
 * TripSplit - Split Engine (Hardened)
 *
 * Centralized logic for calculating expense splits.
 * Uses integer math (via currency.ts) to ensure zero drift.
 *
 * Supports:
 * - Equal: Divide among N members (subset or all)
 * - Shares: Divide based on relative weights
 * - Custom: Validate explicit amounts
 */

import { toCents, fromCents, distributeAmount, validateTotal } from './currency';
import type { ExpenseSplit } from '../types';

export interface SplitResult {
    splits: Omit<ExpenseSplit, 'id' | 'expense_id'>[];
    remainder: number; // Should be 0 for valid splits
}

export type SplitType = 'equal' | 'shares' | 'custom';

export interface SplitEngineInput {
    totalAmount: number;
    payerId: string;
    splitType: SplitType;
    involvedMemberIds: string[]; // List of members participating in the split
    customSplits?: { memberId: string; amount?: number; shares?: number }[];
}

/**
 * Calculates normalized splits for an expense.
 *
 * @param input - Configuration for the split calculation
 * @returns List of member splits with exact amounts
 * @throws Error if inputs are invalid or totals mismatch
 */
export function calculateSplits(input: SplitEngineInput): SplitResult {
    const { totalAmount, splitType, involvedMemberIds, customSplits } = input;

    if (totalAmount <= 0) {
        throw new Error('Total amount must be greater than zero');
    }

    if (involvedMemberIds.length === 0) {
        throw new Error('At least one member must be involved in the split');
    }

    switch (splitType) {
        case 'equal':
            return calculateEqualSplits(totalAmount, involvedMemberIds);

        case 'shares':
            if (!customSplits || customSplits.length === 0) {
                throw new Error('Shares data required for split_type "shares"');
            }
            return calculateShareSplits(totalAmount, customSplits);

        case 'custom':
            if (!customSplits || customSplits.length === 0) {
                throw new Error('Custom amounts required for split_type "custom"');
            }
            return calculateCustomSplits(totalAmount, customSplits);

        default:
            throw new Error(`Unsupported split type: ${splitType}`);
    }
}

/**
 * Handles Equal Splits.
 * Distributes total amount equally among involved members.
 * Handles remainders by giving extra cents to the first few members in the list.
 */
function calculateEqualSplits(totalAmount: number, memberIds: string[]): SplitResult {
    const count = memberIds.length;
    const amounts = distributeAmount(totalAmount, count);

    const splits = memberIds.map((memberId, index) => ({
        member_id: memberId,
        amount: amounts[index],
        shares: undefined
    }));

    return { splits, remainder: 0 };
}

/**
 * Handles Share-based Splits.
 * Calculates value per share and distributes accordingly.
 */
function calculateShareSplits(
    totalAmount: number,
    shareData: { memberId: string; shares?: number }[]
): SplitResult {
    const validShares = shareData.filter(s => (s.shares || 0) > 0);
    const totalShares = validShares.reduce((sum, s) => sum + (s.shares || 0), 0);

    if (totalShares <= 0) {
        throw new Error('Total shares must be greater than zero');
    }

    const totalCents = toCents(totalAmount);

    // Calculate raw share value (float)
    // We do integer math for distribution to ensure sum matches total
    let distributedCents = 0;
    const splits = validShares.map(s => {
        const shareCount = s.shares || 0;
        // Calculate proportional amount: (share / totalShares) * totalCents
        const rawAmount = Math.floor((shareCount * totalCents) / totalShares);
        distributedCents += rawAmount;

        return {
            member_id: s.memberId,
            amount: rawAmount, // Store temporarily as cents
            shares: shareCount
        };
    });

    // Distribute remainder cents to members with largest shares first (or just first in list)
    // Simple approach: distribute to first N members
    let remainder = totalCents - distributedCents;

    // Sort by shares descending to give remainder to heavy users?
    // Or just iterate. Standard practice is iterate to avoid bias if sorted.
    // Let's just iterate through the list.
    for (let i = 0; i < remainder; i++) {
        splits[i % splits.length].amount += 1;
    }

    // Convert back to float
    const finalSplits = splits.map(s => ({
        ...s,
        amount: fromCents(s.amount)
    }));

    return { splits: finalSplits, remainder: 0 };
}

/**
 * Handles Custom Splits.
 * Validates that the sum of custom amounts equals the total amount.
 */
function calculateCustomSplits(
    totalAmount: number,
    customData: { memberId: string; amount?: number }[]
): SplitResult {
    const splits = customData.map(c => ({
        member_id: c.memberId,
        amount: c.amount || 0,
        shares: undefined
    }));

    const sumAmounts = splits.reduce((sum, s) => sum + s.amount, 0);

    // Check if sum matches total (using small epsilon for float safety via currency util)
    if (!validateTotal(totalAmount, splits.map(s => s.amount))) {
        throw new Error(`Custom split amounts (${sumAmounts}) do not equal total amount (${totalAmount})`);
    }

    return { splits, remainder: 0 };
}
