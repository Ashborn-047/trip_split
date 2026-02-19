import { useState, useEffect, useRef } from 'react';
import type { Expense, TripMember, ExpenseSplit, Summary, SettlementTransaction } from '../types';
import type { WorkerInput, WorkerOutput } from '../workers/calculationWorker';
import { calculateSummary } from '../utils/balanceCalculator';
import { calculateSettlements } from '../utils/settlement';

// Import worker (Vite special import for workers)
// Note: In Vite, we import the worker constructor
// @ts-ignore - Vite worker import syntax
import CalculationWorker from '../workers/calculationWorker?worker';

interface CalculationResult {
    summary: Summary | null;
    settlements: SettlementTransaction[];
    isCalculating: boolean;
}

/**
 * Custom hook to offload balance calculations to a Web Worker.
 * Falls back to main thread if worker is unavailable.
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
    const useWorkerRef = useRef(true); // Start with worker enabled

    // Initialize worker once
    useEffect(() => {
        try {
            workerRef.current = new CalculationWorker();

            workerRef.current.onmessage = (event: MessageEvent<WorkerOutput>) => {
                const { type, payload } = event.data;
                if (type === 'RESULT') {
                    setSummary(payload.summary);
                    setSettlements(payload.settlements);
                    setIsCalculating(false);
                }
            };

            workerRef.current.onerror = (error) => {
                console.error('Worker error, falling back to main thread:', error);
                useWorkerRef.current = false;
                setIsCalculating(false);
            };
        } catch (error) {
            console.warn('Failed to initialize worker, using main thread:', error);
            useWorkerRef.current = false;
            setIsCalculating(false);
        }

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    // Calculate when inputs change
    useEffect(() => {
        if (expenses.length === 0 && members.length === 0) {
            setSummary(null);
            setSettlements([]);
            setIsCalculating(false);
            return;
        }

        setIsCalculating(true);

        // Use worker if available and initialized
        if (useWorkerRef.current && workerRef.current) {
            try {
                const message: WorkerInput = {
                    type: 'CALCULATE',
                    payload: {
                        expenses,
                        members,
                        splits
                    }
                };

                workerRef.current.postMessage(message);
            } catch (error) {
                console.error('Worker postMessage failed, using main thread:', error);
                useWorkerRef.current = false;
                // Fall through to main thread calculation
            }
        }

        // Fallback to main thread (always runs if worker unavailable or failed)
        if (!useWorkerRef.current || !workerRef.current) {
            try {
                const calculatedSummary = calculateSummary(expenses, members, splits);
                const calculatedSettlements = calculateSettlements(calculatedSummary.globalBalance, members);
                
                setSummary(calculatedSummary);
                setSettlements(calculatedSettlements);
                setIsCalculating(false);
            } catch (error) {
                console.error('Calculation error:', error);
                setIsCalculating(false);
            }
        }
    }, [expenses, members, splits]);

    return { summary, settlements, isCalculating };
}
