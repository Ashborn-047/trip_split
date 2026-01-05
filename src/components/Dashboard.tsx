import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { Trip, TripMember, Expense, ExpenseSplit } from '../types';
import { getTrip, getTripMembers, subscribeToTrip } from '../services/tripService';
import { getExpenses, subscribeToExpenses, getExpenseSplits } from '../services/expenseService';
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
    const [trip, setTrip] = useState<Trip | null>(null);
    const [members, setMembers] = useState<TripMember[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [splits, setSplits] = useState<ExpenseSplit[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('expenses');
    const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>('all');
    const [showAddExpense, setShowAddExpense] = useState(false);

    // Fetch initial data and subscribe to updates
    useEffect(() => {
        let unsubTrip: (() => void) | undefined;
        let unsubExpenses: (() => void) | undefined;

        async function init() {
            try {
                // Fetch initial data
                const [tripData, membersData, expensesData] = await Promise.all([
                    getTrip(tripId),
                    getTripMembers(tripId),
                    getExpenses(tripId),
                ]);

                if (!tripData) {
                    onLeaveTrip();
                    return;
                }

                setTrip(tripData);
                setMembers(membersData);
                setExpenses(expensesData);

                // Fetch splits for custom expenses
                const customExpenseIds = expensesData
                    .filter(e => e.split_type === 'custom')
                    .map(e => e.id);
                if (customExpenseIds.length > 0) {
                    const splitsData = await getExpenseSplits(tripId, customExpenseIds);
                    setSplits(splitsData);
                }

                setLoading(false);

                // Subscribe to real-time updates
                unsubTrip = subscribeToTrip(
                    tripId,
                    (updatedTrip) => setTrip(updatedTrip),
                    async () => {
                        const newMembers = await getTripMembers(tripId);
                        setMembers(newMembers);
                    }
                );

                unsubExpenses = subscribeToExpenses(tripId, (newExpenses) => {
                    setExpenses(newExpenses);
                });

            } catch (err) {
                console.error('Failed to load trip:', err);
                setLoading(false);
            }
        }

        init();

        return () => {
            unsubTrip?.();
            unsubExpenses?.();
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
