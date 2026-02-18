/**
 * SyncMaster Background Engine (Fix 2 & Fix 3)
 */
import {
    onSnapshot,
    collection,
    doc,
    writeBatch,
    serverTimestamp,
    query,
    orderBy,
    limit
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { localDb } from '../config/localDb';
import { SYNC_AUTHORITY_ENABLED } from '../config/flags';

class SyncService {
    private unsubscribes: Map<string, () => void> = new Map();
    private syncTimeout: ReturnType<typeof setTimeout> | null = null;
    private backoffDelay = 0;
    private isSyncing = false;

    /**
     * Starts the periodic background sync engine.
     */
    startSyncLoop() {
        if (!SYNC_AUTHORITY_ENABLED) return;
        if (this.syncTimeout) return;

        console.log('[SyncMaster] Starting sync loop...');
        this.scheduleNextSync(0);
    }

    stopSyncLoop() {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
            this.syncTimeout = null;
        }
    }

    private scheduleNextSync(delay: number) {
        if (this.syncTimeout) clearTimeout(this.syncTimeout);

        this.syncTimeout = setTimeout(() => {
            this.processQueue();
        }, delay);
    }

    /**
     * Initializes hydration listeners for a trip.
     * Implements Fix 2: Local-Wins Hydration.
     */
    async initHydration(tripId: string, limitCount?: number) {
        if (!SYNC_AUTHORITY_ENABLED) return;

        // Cleanup existing
        this.stopHydration(tripId);

        // 1. Listen to Expenses
        const expensesRef = collection(db, 'trips', tripId, 'expenses');
        let q = query(expensesRef, orderBy('created_at', 'desc'));

        if (limitCount) {
            q = query(expensesRef, orderBy('created_at', 'desc'), limit(limitCount));
        }

        const unsubExpenses = onSnapshot(q, async (snapshot) => {
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
        if (this.isSyncing) return;

        this.isSyncing = true;

        try {
            const mutations = await localDb.mutations.orderBy('client_sequence_number').toArray();

            if (mutations.length === 0) {
                // Nothing to sync, sleep for standard interval
                this.backoffDelay = 0;
                this.isSyncing = false;
                this.scheduleNextSync(30000);
                return;
            }

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

                    // Reset backoff on success
                    this.backoffDelay = 0;

                } catch (err: any) {
                    console.error(`[SyncMaster] Failed mutation ${mut.mutation_id}:`, err);

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const e = err as any;

                    if (e.code === 'permission-denied' || e.status === 409) {
                        // CONFLICT (Fix 3)
                        await localDb.mutations.update(mut.mutation_id, {
                            sync_status: 'conflicted',
                            error: e.message
                        });
                        await localDb.expenses.update(mut.entity_id, { sync_status: 'conflicted' });
                        // Continue to next mutation
                        continue;
                    } else {
                        // TRANSIENT FAILURE (Fix 3) - Backoff
                        // Calculate next backoff: 2s -> 4s -> 8s -> ... -> 60s
                        this.backoffDelay = Math.min(60000, Math.max(2000, this.backoffDelay * 2));
                        console.log(`[SyncMaster] Transient failure. Backing off for ${this.backoffDelay}ms`);

                        this.isSyncing = false;
                        this.scheduleNextSync(this.backoffDelay);
                        return; // Stop processing queue for now
                    }
                }
            }

            // Queue drained successfully
            this.isSyncing = false;
            this.scheduleNextSync(30000); // Standard poll

        } catch (err) {
            console.error('[SyncMaster] Fatal sync error:', err);
            this.isSyncing = false;
            this.scheduleNextSync(30000); // Retry later
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
