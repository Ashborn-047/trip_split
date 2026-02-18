/**
 * TripSplit - Expense Service (Firebase/Firestore)
 * 
 * DESIGN DECISIONS:
 * 1. paid_by references member document ID (from members subcollection)
 * 2. Custom splits validated client-side (Firestore doesn't have triggers)
 * 3. ai_confirmed flag tracks AI-extracted data confirmation
 * 
 * MIGRATION NOTE: Service interface matches Supabase version.
 */

import {
    collection,
    doc,
    addDoc,
    getDocs,
    updateDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    writeBatch,
    limit,
    startAfter,
    type Unsubscribe,
    type QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Expense, ExpenseSplit, CreateExpenseInput } from '../types';

/**
 * Converts Firestore timestamp to ISO string.
 */
function toISOString(timestamp: any): string {
    if (!timestamp) return new Date().toISOString();
    if (timestamp.toDate) return timestamp.toDate().toISOString();
    return new Date(timestamp).toISOString();
}

function mapExpenseDoc(doc: QueryDocumentSnapshot, tripId: string): Expense {
    const data = doc.data();
    return {
        id: doc.id,
        trip_id: tripId,
        description: data.description,
        amount: data.amount,
        category: data.category || 'other',
        type: data.type || 'daily',
        expense_date: data.expense_date || toISOString(data.created_at).split('T')[0],
        created_at: toISOString(data.created_at),
        updated_at: toISOString(data.updated_at),
        created_by: data.created_by,
        paid_by: data.paid_by, // References member document ID
        split_type: data.split_type || 'equal',
        receipt_url: data.receipt_url || null,
        ai_confirmed: data.ai_confirmed ?? true,
    };
}

/**
 * Fetches all expenses for a trip.
 */
export async function getExpenses(tripId: string): Promise<Expense[]> {
    const expensesRef = collection(db, 'trips', tripId, 'expenses');
    const expenseQuery = query(expensesRef, orderBy('created_at', 'desc'));
    const snapshot = await getDocs(expenseQuery);

    return snapshot.docs.map(doc => mapExpenseDoc(doc, tripId));
}

/**
 * Fetches expenses with pagination.
 */
export async function getExpensesPaginated(
    tripId: string,
    limitCount: number = 20,
    lastVisible: QueryDocumentSnapshot | null = null
): Promise<{ expenses: Expense[], lastVisible: QueryDocumentSnapshot | null }> {
    const expensesRef = collection(db, 'trips', tripId, 'expenses');
    let expenseQuery = query(expensesRef, orderBy('created_at', 'desc'), limit(limitCount));

    if (lastVisible) {
        expenseQuery = query(expensesRef, orderBy('created_at', 'desc'), startAfter(lastVisible), limit(limitCount));
    }

    const snapshot = await getDocs(expenseQuery);
    const last = snapshot.docs[snapshot.docs.length - 1] || null;
    const expenses = snapshot.docs.map(doc => mapExpenseDoc(doc, tripId));

    return { expenses, lastVisible: last };
}

/**
 * Fetches expense splits for given expense IDs.
 */
export async function getExpenseSplits(
    tripId: string,
    expenseIds: string[]
): Promise<ExpenseSplit[]> {
    if (expenseIds.length === 0) return [];

    const allSplits: ExpenseSplit[] = [];

    // Fetch splits for each expense (Firestore doesn't support IN queries across subcollections)
    for (const expenseId of expenseIds) {
        const splitsRef = collection(db, 'trips', tripId, 'expenses', expenseId, 'splits');
        const snapshot = await getDocs(splitsRef);

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            allSplits.push({
                id: doc.id,
                expense_id: expenseId,
                member_id: data.member_id,
                amount: data.amount,
                shares: data.shares,
            });
        });
    }

    return allSplits;
}

/**
 * Creates a new expense with optional custom splits.
 * 
 * Client-side validation ensures splits sum to expense amount.
 * (Firestore doesn't have triggers like Supabase)
 */
export async function createExpense(
    input: CreateExpenseInput,
    userId: string
): Promise<Expense> {
    // Validate paid_by is provided
    if (!input.paid_by) {
        throw new Error('paid_by is required and must reference a trip member');
    }

    // Validate custom/shares splits if provided
    if (input.split_type === 'custom' || input.split_type === 'shares') {
        if (!input.custom_splits || input.custom_splits.length === 0) {
            throw new Error(`Splits required when split_type is "${input.split_type}"`);
        }

        const splitTotal = input.custom_splits.reduce((sum, s) => sum + s.amount, 0);
        if (Math.abs(splitTotal - input.amount) > 0.01) {
            throw new Error(
                `Split total (${splitTotal}) does not match expense amount (${input.amount})`
            );
        }
    }

    const expensesRef = collection(db, 'trips', input.trip_id, 'expenses');

    const expenseData = {
        description: input.description,
        amount: input.amount,
        category: input.category,
        type: input.type,
        expense_date: input.expense_date || new Date().toISOString().split('T')[0],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        created_by: userId,
        paid_by: input.paid_by,
        split_type: input.split_type,
        receipt_url: input.receipt_url || null,
        ai_confirmed: input.ai_confirmed ?? true,
    };

    const expenseRef = await addDoc(expensesRef, expenseData);

    // Add custom/shares splits if applicable
    if ((input.split_type === 'custom' || input.split_type === 'shares') && input.custom_splits) {
        const batch = writeBatch(db);
        const splitsRef = collection(expenseRef, 'splits');

        for (const split of input.custom_splits) {
            const splitDocRef = doc(splitsRef);
            const data: any = {
                member_id: split.member_id,
                amount: split.amount,
            };
            if (split.shares !== undefined) {
                data.shares = split.shares;
            }
            batch.set(splitDocRef, data);
        }

        await batch.commit();
    }

    return {
        id: expenseRef.id,
        trip_id: input.trip_id,
        description: input.description,
        amount: input.amount,
        category: input.category,
        type: input.type,
        expense_date: input.expense_date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: userId,
        paid_by: input.paid_by,
        split_type: input.split_type,
        receipt_url: input.receipt_url || null,
        ai_confirmed: input.ai_confirmed ?? true,
    };
}

/**
 * Updates an expense.
 */
export async function updateExpense(
    tripId: string,
    expenseId: string,
    updates: Partial<Pick<Expense, 'description' | 'amount' | 'category' | 'type' | 'expense_date' | 'ai_confirmed'>>
): Promise<void> {
    const expenseRef = doc(db, 'trips', tripId, 'expenses', expenseId);
    await updateDoc(expenseRef, {
        ...updates,
        updated_at: serverTimestamp(),
    });
}

/**
 * Deletes an expense and its splits.
 */
export async function deleteExpense(tripId: string, expenseId: string): Promise<void> {
    // Delete splits first
    const splitsRef = collection(db, 'trips', tripId, 'expenses', expenseId, 'splits');
    const splitsSnapshot = await getDocs(splitsRef);

    const batch = writeBatch(db);
    splitsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // Delete expense
    const expenseRef = doc(db, 'trips', tripId, 'expenses', expenseId);
    batch.delete(expenseRef);

    await batch.commit();
}

/**
 * Subscribes to real-time expense changes for a trip.
 */
export function subscribeToExpenses(
    tripId: string,
    onExpensesUpdate: (expenses: Expense[]) => void,
    limitCount?: number
): Unsubscribe {
    const expensesRef = collection(db, 'trips', tripId, 'expenses');
    let expenseQuery = query(expensesRef, orderBy('created_at', 'desc'));

    if (limitCount) {
        expenseQuery = query(expensesRef, orderBy('created_at', 'desc'), limit(limitCount));
    }

    return onSnapshot(expenseQuery, (snapshot) => {
        const expenses = snapshot.docs.map(doc => mapExpenseDoc(doc, tripId));
        onExpensesUpdate(expenses);
    });
}
