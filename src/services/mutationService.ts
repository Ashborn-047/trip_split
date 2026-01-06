/**
 * TripSplit - Centralized Mutation Service (Condition 3)
 * 
 * DESIGN DECISIONS:
 * 1. Single entry point for all data changes (intent-based).
 * 2. Write-through shadowing to Local DB (Condition 2).
 * 3. Atomic operations for multi-document updates.
 * 4. Payer normalization (Condition 1).
 */

import {
    doc,
    setDoc,
    collection,
    writeBatch,
    updateDoc,
    serverTimestamp,
    getDocs,
    query,
    where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { localDb } from '../config/localDb';
import type {
    CreateTripInput,
    JoinTripInput,
    CreateExpenseInput,
    AddGhostMemberInput,
    ExpenseCategory
} from '../types';

// ============================================
// HELPERS
// ============================================

const getISOString = () => new Date().toISOString();

/**
 * Maps categorical AI output to valid ExpenseCategory.
 */
function mapCategory(raw: string | null): ExpenseCategory {
    const valid: ExpenseCategory[] = ['travel', 'food', 'stay', 'fun', 'other'];
    const lower = (raw || 'other').toLowerCase() as any;
    return valid.includes(lower) ? lower : 'other';
}

// ============================================
// MUTATION DISPATCHER
// ============================================

export const mutationService = {
    /**
     * Creates a new trip and creator membership.
     */
    async createTrip(input: CreateTripInput, userId: string) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const tripId = `TRIP-${code}`;
        const tripRef = doc(db, 'trips', tripId);
        const memberRef = doc(collection(tripRef, 'members'));

        const now = serverTimestamp();
        const isoNow = getISOString();

        const tripData = {
            id: tripId,
            code,
            name: input.name,
            currency: 'INR',
            status: 'active' as const,
            created_at: now,
            updated_at: now,
            created_by: userId,
        };

        const memberData = {
            id: memberRef.id,
            trip_id: tripId,
            user_id: userId,
            display_name: input.creatorDisplayName,
            role: 'admin' as const,
            is_ghost: false,
            joined_at: now,
            updated_at: now,
        };

        // Atomic write to Firestore
        const batch = writeBatch(db);
        batch.set(tripRef, tripData);
        batch.set(memberRef, memberData);
        await batch.commit();

        // Write-through to Local DB
        await localDb.trips.add({
            ...tripData,
            created_at: isoNow,
            updated_at: isoNow
        });
        await localDb.members.add({
            ...memberData,
            created_at: isoNow,
            updated_at: isoNow
        });

        return { tripId, memberId: memberRef.id };
    },

    /**
     * Joins an existing trip.
     */
    async joinTrip(input: JoinTripInput, userId: string) {
        const tripsRef = collection(db, 'trips');
        const q = query(tripsRef, where('code', '==', input.code.toUpperCase()));
        const snap = await getDocs(q);

        if (snap.empty) throw new Error('Trip not found');
        const tripDoc = snap.docs[0];
        const tripId = tripDoc.id;

        const memberRef = doc(collection(db, 'trips', tripId, 'members'));
        const now = serverTimestamp();
        const isoNow = getISOString();

        const memberData = {
            id: memberRef.id,
            trip_id: tripId,
            user_id: userId,
            display_name: input.displayName,
            role: 'member' as const,
            is_ghost: false,
            joined_at: now,
            updated_at: now,
        };

        await setDoc(memberRef, memberData);

        // Local shadow
        await localDb.members.add({
            ...memberData,
            created_at: isoNow,
            updated_at: isoNow
        });

        return { tripId, memberId: memberRef.id };
    },

    /**
     * Adds a ghost member.
     */
    async addGhostMember(input: AddGhostMemberInput) {
        const memberRef = doc(collection(db, 'trips', input.trip_id, 'members'));
        const now = serverTimestamp();
        const isoNow = getISOString();

        const memberData = {
            id: memberRef.id,
            trip_id: input.trip_id,
            user_id: null,
            display_name: input.display_name,
            role: 'ghost' as const,
            is_ghost: true,
            joined_at: now,
            updated_at: now,
        };

        await setDoc(memberRef, memberData);
        await localDb.members.add({
            ...memberData,
            created_at: isoNow,
            updated_at: isoNow
        });

        return memberRef.id;
    },

    /**
     * Creates an expense with itemized splits.
     * Enforces that split total matches expense amount (Condition 1).
     */
    async createExpense(input: CreateExpenseInput, userId: string) {
        const amount = Number(input.amount);

        // 1. Validation (Money Integrity)
        if (input.split_type === 'custom') {
            const splitTotal = (input.custom_splits || []).reduce((sum, s) => sum + s.amount, 0);
            if (Math.abs(splitTotal - amount) > 0.01) {
                throw new Error(`Split total (₹${splitTotal.toFixed(2)}) must equal ₹${amount.toFixed(2)}`);
            }
        }

        const tripRef = doc(db, 'trips', input.trip_id);
        const expenseRef = doc(collection(tripRef, 'expenses'));
        const now = serverTimestamp();
        const isoNow = getISOString();

        const expenseData = {
            id: expenseRef.id,
            trip_id: input.trip_id,
            description: input.description,
            amount: amount,
            category: mapCategory(input.category), // Strict mapping
            type: input.type,
            paid_by: input.paid_by, // Already standardized to member.id in component
            split_type: input.split_type,
            expense_date: input.expense_date || getISOString().split('T')[0],
            created_by: userId,
            ai_confirmed: input.ai_confirmed ?? true,
            created_at: now,
            updated_at: now,
        };

        const batch = writeBatch(db);
        batch.set(expenseRef, expenseData);

        // Handle splits
        const localSplits: any[] = [];
        if (input.split_type === 'custom' && input.custom_splits) {
            for (const split of input.custom_splits) {
                const splitRef = doc(collection(expenseRef, 'splits'));
                const splitData = {
                    id: splitRef.id,
                    expense_id: expenseRef.id,
                    member_id: split.member_id,
                    amount: split.amount,
                };
                batch.set(splitRef, splitData);
                localSplits.push(splitData);
            }
        }

        await batch.commit();

        // Local shadow
        await localDb.expenses.add({
            ...expenseData,
            created_at: isoNow,
            updated_at: isoNow
        });
        if (localSplits.length > 0) {
            await localDb.splits.bulkAdd(localSplits);
        }

        return expenseRef.id;
    },

    /**
     * Updates an expense.
     */
    async updateExpense(tripId: string, expenseId: string, updates: any) {
        const expenseRef = doc(db, 'trips', tripId, 'expenses', expenseId);
        const now = serverTimestamp();

        await updateDoc(expenseRef, {
            ...updates,
            updated_at: now
        });

        // Local shadow update
        await localDb.expenses.update(expenseId, {
            ...updates,
            updated_at: getISOString()
        });
    },

    /**
     * Deletes an expense.
     */
    async deleteExpense(tripId: string, expenseId: string) {
        const expenseRef = doc(db, 'trips', tripId, 'expenses', expenseId);
        const splitsRef = collection(expenseRef, 'splits');
        const splitsSnap = await getDocs(splitsRef);

        const batch = writeBatch(db);
        splitsSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(expenseRef);
        await batch.commit();

        // Local shadow cleanup
        await localDb.expenses.delete(expenseId);
        await localDb.splits.where('expense_id').equals(expenseId).delete();
    },

    /**
     * Updates member info.
     */
    async updateMember(tripId: string, memberId: string, updates: any) {
        const memberRef = doc(db, 'trips', tripId, 'members', memberId);
        const now = serverTimestamp();

        await updateDoc(memberRef, {
            ...updates,
            updated_at: now
        });

        await localDb.members.update(memberId, {
            ...updates,
            updated_at: getISOString()
        });
    }
};
