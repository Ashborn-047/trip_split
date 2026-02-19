import { useState, useEffect, useRef } from 'react';
import type { Expense, TripMember, ExpenseSplit, Summary, SettlementTransaction } from '../types';
import type { WorkerInput, WorkerOutput } from '../workers/calculationWorker';

// Import worker (Vite special import for workers)
// Note: In Vite, we import the worker constructor
import CalculationWorker from '../workers/calculationWorker?worker';

interface CalculationResult {
    summary: Summary | null;
    settlements: SettlementTransaction[];
    isCalculating: boolean;
}

/**
 * Custom hook to offload balance calculations to a Web Worker.
 * Handles worker instantiation, message passing, and result caching.
 */
export function useCalculations(
    expenses: Expense[],
    members: TripMember[],
    splits: ExpenseSplit[] // Now required as explicit splits are the new standard
): CalculationResult {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [settlements, setSettlements] = useState<SettlementTransaction[]>([]);
    const [isCalculating, setIsCalculating] = useState(true);

    const workerRef = useRef<Worker | null>(null);

    // Initialize worker once
    useEffect(() => {
        workerRef.current = new CalculationWorker();

        workerRef.current.onmessage = (event: MessageEvent<WorkerOutput>) => {
            const { type, payload } = event.data;
            if (type === 'RESULT') {
                setSummary(payload.summary);
                setSettlements(payload.settlements);
                setIsCalculating(false);
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    // Send data to worker when inputs change
    useEffect(() => {
        if (!workerRef.current) return;
        if (expenses.length === 0 && members.length === 0) {
            setIsCalculating(false);
            return;
        }

        setIsCalculating(true);

        const message: WorkerInput = {
            type: 'CALCULATE',
            payload: {
                expenses,
                members,
                splits
            }
        };

        workerRef.current.postMessage(message);

    }, [expenses, members, splits]);

    return { summary, settlements, isCalculating };
}
