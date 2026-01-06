import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { Trip, TripMember, Expense, ExpenseSplit } from '../types';
import { getTrip, subscribeToTrip } from '../services/tripService';
import { SYNC_AUTHORITY_ENABLED } from '../config/flags';
import { localDb } from '../config/localDb';
import { syncService } from '../services/syncService';
import { useLiveQuery } from 'dexie-react-hooks';
import { calculateSummary } from '../utils/balanceCalculator';
import Header from './Header';
import BottomNav from './BottomNav';
import ExpensesTab from './ExpensesTab';
import MembersTab from './MembersTab';
import SettleTab from './SettleTab';
import AddExpenseModal from './AddExpenseModal';

interface DashboardProps {
    user: User;
    tripId: string;
    onLeaveTrip: () => void;
}

export type TabType = 'expenses' | 'members' | 'settle';
export type ExpenseFilter = 'all' | 'major' | 'daily';

export default function Dashboard({ user, tripId, onLeaveTrip }: DashboardProps) {
    // -- LOCAL READ AUTHORITY (Section 3) --
    // These queries are reactive and update the UI instantly from Dexie
    const localExpenses = useLiveQuery(() => localDb.expenses.where('trip_id').equals(tripId).toArray(), [tripId]) || [];
    const localMembers = useLiveQuery(() => localDb.members.where('trip_id').equals(tripId).toArray(), [tripId]) || [];
    const localSplits = useLiveQuery(() => localDb.splits.toArray()) || []; // Simplified for v1

    const [trip, setTrip] = useState<Trip | null>(null);
    const [remoteMembers] = useState<TripMember[]>([]);
    const [remoteExpenses] = useState<Expense[]>([]);
    const [remoteSplits] = useState<ExpenseSplit[]>([]);

    // Auth-governed data (Cast to satisfy public component interfaces)
    const expenses = (SYNC_AUTHORITY_ENABLED ? (localExpenses as unknown as Expense[]) : remoteExpenses);
    const members = (SYNC_AUTHORITY_ENABLED ? (localMembers as unknown as TripMember[]) : remoteMembers);
    const splits = (SYNC_AUTHORITY_ENABLED ? (localSplits as unknown as ExpenseSplit[]) : remoteSplits);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('expenses');
    const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>('all');
    const [showAddExpense, setShowAddExpense] = useState(false);

    // Fetch initial data and subscribe to updates
    useEffect(() => {
        let unsubTrip: (() => void) | undefined;

        async function init() {
            try {
                // 1. Fetch Trip Metadata (Always required)
                const tripData = await getTrip(tripId);
                if (!tripData) {
                    onLeaveTrip();
                    return;
                }
                setTrip(tripData);

                // 2. Hydration & Sync (Fix 2)
                if (SYNC_AUTHORITY_ENABLED) {
                    await syncService.initHydration(tripId);
                    syncService.startSyncLoop(); // Start periodic background sync
                }

                setLoading(false);

                // 3. Keep Trip Metadata updated
                unsubTrip = subscribeToTrip(
                    tripId,
                    (updatedTrip) => setTrip(updatedTrip),
                    async () => {
                        // Trip/Member updates still flow through Legacy for metadata
                        // But if Sync is on, hydration will catch the data
                    }
                );

            } catch (err) {
                console.error('Failed to load trip:', err);
                setLoading(false);
            }
        }

        init();

        return () => {
            unsubTrip?.();
            if (SYNC_AUTHORITY_ENABLED) {
                syncService.stopSyncLoop();
                syncService.stopHydration(tripId);
            }
        };
    }, [tripId, onLeaveTrip]);

    // Calculate summary
    const summary = calculateSummary(expenses, members, splits);

    // Filter expenses by type
    const filteredExpenses = expenseFilter === 'all'
        ? expenses
        : expenses.filter(e => e.type === expenseFilter);

    // Get current user's member record
    const currentMember = members.find(m => m.user_id === user.uid);

    if (loading || !trip) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-500 text-sm">Loading trip...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-gray-50 flex flex-col">
            <Header
                trip={trip}
                totalSpent={summary.totalSpent}
                memberCount={members.length}
                onLeaveTrip={onLeaveTrip}
            />

            <main className="flex-1 pb-24 overflow-y-auto">
                {activeTab === 'expenses' && (
                    <ExpensesTab
                        expenses={filteredExpenses}
                        members={members}
                        filter={expenseFilter}
                        onFilterChange={setExpenseFilter}
                        onAddExpense={() => setShowAddExpense(true)}
                        currentUserId={user.uid}
                        tripId={tripId}
                    />
                )}

                {activeTab === 'members' && (
                    <MembersTab
                        members={members}
                        summary={summary}
                        tripCode={trip.code}
                        tripId={tripId}
                        isAdmin={currentMember?.role === 'admin'}
                    />
                )}

                {activeTab === 'settle' && (
                    <SettleTab
                        members={members}
                        summary={summary}
                        tripId={tripId}
                        userId={user.uid}
                    />
                )}
            </main>

            <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

            {showAddExpense && (
                <AddExpenseModal
                    tripId={tripId}
                    members={members}
                    currentUserId={user.uid}
                    onClose={() => setShowAddExpense(false)}
                />
            )}
        </div>
    );
}
