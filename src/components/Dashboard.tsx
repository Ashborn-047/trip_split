import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { Trip, TripMember, Expense, ExpenseSplit } from '../types';
import { getTrip, subscribeToTrip } from '../services/tripService';
import { SYNC_AUTHORITY_ENABLED } from '../config/flags';
import { localDb } from '../config/localDb';
import { syncService } from '../services/syncService';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCalculations } from '../hooks/useCalculations'; // Hook that uses Worker
import Header from './Header';
import BottomNav from './BottomNav';
import ExpensesTab from './ExpensesTab';
import MembersTab from './MembersTab';
import SettleTab from './SettleTab';
import AddExpenseModal from './AddExpenseModal';
import { Loader2 } from 'lucide-react';

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
    const localSplits = useLiveQuery(() => localDb.splits.where('trip_id').equals(tripId).toArray(), [tripId]) || []; // Simplified for v1

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
    const [limitCount, setLimitCount] = useState(20);

    // -- WORKER CALCULATION --
    // Offloads heavy balance math to a web worker
    const { summary, isCalculating } = useCalculations(expenses, members, splits);

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
                    await syncService.initHydration(tripId, limitCount);
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
    }, [tripId, onLeaveTrip, limitCount]);

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
                totalSpent={summary?.totalSpent || 0}
                memberCount={members.length}
                onLeaveTrip={onLeaveTrip}
            />

            {/* Calculation Indicator (Optional Polish) */}
            {isCalculating && (
                 <div className="bg-violet-100 text-violet-800 text-xs py-1 text-center font-bold animate-pulse">
                     Updating balances...
                 </div>
            )}

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
                        onLoadMore={() => setLimitCount(Math.max(limitCount, expenses.length) + 20)}
                        hasMore={expenses.length >= limitCount}
                    />
                )}

                {activeTab === 'members' && summary && (
                    <MembersTab
                        members={members}
                        summary={summary}
                        tripCode={trip.code}
                        tripId={tripId}
                        isAdmin={currentMember?.role === 'admin'}
                    />
                )}

                {activeTab === 'settle' && summary && (
                    <SettleTab
                        members={members}
                        summary={summary}
                        tripId={tripId}
                        userId={user.uid}
                    />
                )}

                {/* Loading State for Tabs if Summary Not Ready */}
                {(activeTab !== 'expenses' && !summary) && (
                     <div className="flex justify-center items-center h-40">
                         <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                     </div>
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
