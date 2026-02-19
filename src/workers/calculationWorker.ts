/**
 * TripSplit - Calculation Worker
 *
 * Handles heavy expense calculation logic off the main thread.
 * Prevents UI jank when processing thousands of expenses.
 */

import { calculateSummary } from '../utils/balanceCalculator';
import { calculateSettlements } from '../utils/settlement';
import type { Expense, TripMember, ExpenseSplit, Summary, SettlementTransaction } from '../types';

// Message Input Type
export interface WorkerInput {
    type: 'CALCULATE';
    payload: {
        expenses: Expense[];
        members: TripMember[];
        splits: ExpenseSplit[]; // Explicit splits from subcollection
    };
}

// Message Output Type
export interface WorkerOutput {
    type: 'RESULT';
    payload: {
        summary: Summary;
        settlements: SettlementTransaction[];
    };
}

// Listen for messages from the main thread
self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const { type, payload } = e.data;

    if (type === 'CALCULATE') {
        const { expenses, members, splits } = payload;

        try {
            // 1. Calculate Balances (Heavy)
            const summary = calculateSummary(expenses, members, splits);

            // 2. Calculate Settlements (Sorting + Matching)
            const settlements = calculateSettlements(summary.globalBalance, members);

            // 3. Send back results
            const response: WorkerOutput = {
                type: 'RESULT',
                payload: {
                    summary,
                    settlements
                }
            };

            self.postMessage(response);

        } catch (error) {
            console.error('Worker Calculation Error:', error);
            // Optionally handle error state messaging
        }
    }
};
