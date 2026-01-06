/**
 * SyncMaster Background Engine (Fix 2 & Fix 3)
 */
import {
    onSnapshot,
    collection,
    doc,
    writeBatch,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { localDb } from '../config/localDb';
import { SYNC_AUTHORITY_ENABLED } from '../config/flags';

class SyncService {
    private unsubscribes: Map<string, () => void> = new Map();
    private syncInterval: any = null;

    /**
     * Starts the periodic background sync engine.
     */
    startSyncLoop() {
        if (!SYNC_AUTHORITY_ENABLED) return;
        if (this.syncInterval) return;

        // Process every 30 seconds or when triggered
        this.syncInterval = setInterval(() => {
            this.processQueue();
        }, 30000);

        // Initial process
        this.processQueue();
    }

    stopSyncLoop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Initializes hydration listeners for a trip.
     * Implements Fix 2: Local-Wins Hydration.
     */
    async initHydration(tripId: string) {
        if (!SYNC_AUTHORITY_ENABLED) return;

        // Cleanup existing
        this.stopHydration(tripId);

        // 1. Listen to Expenses
        const expensesRef = collection(db, 'trips', tripId, 'expenses');
        const unsubExpenses = onSnapshot(expensesRef, async (snapshot) => {
            for (const change of snapshot.docChanges()) {
                const data = change.doc.data();
                const expenseId = change.doc.id;

                if (change.type === 'removed') {
                    const pending = await localDb.mutations.where('entity_id').equals(expenseId).first();
                    if (!pending) {
                        await localDb.expenses.delete(expenseId);
                        await localDb.splits.where('expense_id').equals(expenseId).delete();
                    }
                } else {
                    const pending = await localDb.mutations.where('entity_id').equals(expenseId).first();
                    if (!pending) {
                        await localDb.expenses.put({
                            id: expenseId,
                            trip_id: tripId,
                            description: data.description || '',
                            amount: data.amount || 0,
                            category: data.category || 'other',
                            type: data.type || 'daily',
                            paid_by: data.paid_by || '',
                            split_type: data.split_type || 'equal',
                            expense_date: data.expense_date || '',
                            receipt_url: data.receipt_url || null,
                            ai_confirmed: data.ai_confirmed ?? true,
                            created_by: data.created_by || '',
                            created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at || new Date().toISOString(),
                            updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at || new Date().toISOString(),
                            sync_status: 'synced'
                        } as any);
                    }
                }
            }
        });

        // 2. Listen to Splits (simplified)
        // In a full implementation, we'd handle splits specifically, 
        // but for v1, createExpense pushes splits in a batch.

        this.unsubscribes.set(tripId, unsubExpenses);
    }

    stopHydration(tripId: string) {
        const unsub = this.unsubscribes.get(tripId);
        if (unsub) {
            unsub();
            this.unsubscribes.delete(tripId);
        }
    }

    /**
     * Background Sync Engine (Fix 3)
     * Processes the mutation queue.
     */
    async processQueue() {
        if (!SYNC_AUTHORITY_ENABLED) return;

        const mutations = await localDb.mutations.orderBy('client_sequence_number').toArray();
        if (mutations.length === 0) return;

        console.log(`[SyncMaster] Processing ${mutations.length} mutations...`);

        for (const mut of mutations) {
            try {
                // Support Partial Success (Fix 3)
                await this.applyMutation(mut);

                // ACK (Success)
                await localDb.mutations.delete(mut.mutation_id);
                // Mark entity as synced
                await localDb.expenses.update(mut.entity_id, { sync_status: 'synced' });

                console.log(`[SyncMaster] ACKed mutation: ${mut.mutation_id}`);
            } catch (err: any) {
                console.error(`[SyncMaster] Failed mutation ${mut.mutation_id}:`, err);

                if (err.code === 'permission-denied' || err.status === 409) {
                    // CONFLICT (Fix 3)
                    await localDb.mutations.update(mut.mutation_id, {
                        sync_status: 'conflicted',
                        error: err.message
                    });
                    await localDb.expenses.update(mut.entity_id, { sync_status: 'conflicted' });
                } else {
                    // TRANSIENT FAILURE (Fix 3) - Stay in queue
                    break; // stop processing for now (backoff)
                }
            }
        }
    }

    private async applyMutation(mut: any) {
        const { action, entity_type, entity_id, payload } = mut;

        if (entity_type === 'expense') {
            const expenseRef = doc(db, 'trips', payload.expense.trip_id, 'expenses', entity_id);

            if (action === 'create') {
                const batch = writeBatch(db);
                // Idempotency: Use mut.entity_id (which is mutation_id) as doc ID
                batch.set(expenseRef, {
                    ...payload.expense,
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                });

                // Add splits
                if (payload.splits) {
                    payload.splits.forEach((s: any) => {
                        const sRef = doc(collection(expenseRef, 'splits'), s.id);
                        batch.set(sRef, s);
                    });
                }
                await batch.commit();
            } else if (action === 'update') {
                await writeBatch(db).update(expenseRef, {
                    ...payload,
                    updated_at: serverTimestamp()
                }).commit();
            } else if (action === 'delete') {
                // Delete logic: In v1 we do a basic delete as per addendum.
                await writeBatch(db).delete(expenseRef).commit();
            }
        }
    }
}

export const syncService = new SyncService();
