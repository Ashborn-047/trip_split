import type { Expense, TripMember } from '../types';
import type { ExpenseFilter } from './Dashboard';
import { Plus, Trash2, Plane, UtensilsCrossed, Home, Sparkles, MoreHorizontal } from 'lucide-react';
import { mutationService } from '../services/mutationService';
import { useState } from 'react';

interface ExpensesTabProps {
    expenses: Expense[];
    members: TripMember[];
    filter: ExpenseFilter;
    onFilterChange: (filter: ExpenseFilter) => void;
    onAddExpense: () => void;
    currentUserId: string;
    tripId: string;
}

const categoryIcons: Record<string, typeof Plane> = {
    travel: Plane,
    food: UtensilsCrossed,
    stay: Home,
    fun: Sparkles,
    other: MoreHorizontal,
};

const categoryColors: Record<string, string> = {
    travel: 'bg-blue-100 text-blue-600',
    food: 'bg-orange-100 text-orange-600',
    stay: 'bg-purple-100 text-purple-600',
    fun: 'bg-pink-100 text-pink-600',
    other: 'bg-gray-100 text-gray-600',
};

export default function ExpensesTab({
    expenses,
    members,
    filter,
    onFilterChange,
    onAddExpense,
    currentUserId,
    tripId,
}: ExpensesTabProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const getMemberName = (memberId: string) => {
        const member = members.find(m => m.id === memberId);
        return member?.display_name || 'Unknown';
    };

    const handleDelete = async (expenseId: string, createdBy: string) => {
        if (createdBy !== currentUserId) return;

        if (!confirm('Delete this expense?')) return;

        setDeletingId(expenseId);
        try {
            await mutationService.deleteExpense(tripId, expenseId);
        } catch (err) {
            console.error('Failed to delete:', err);
        } finally {
            setDeletingId(null);
        }
    };

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="px-4 py-4 pb-32">
            {/* Filter Pills */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                {(['all', 'major', 'daily'] as ExpenseFilter[]).map((f) => (
                    <button
                        key={f}
                        onClick={() => onFilterChange(f)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${filter === f
                            ? f === 'major'
                                ? 'bg-blue-600 text-white'
                                : f === 'daily'
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-violet-600 text-white'
                            : 'bg-white text-gray-600 border border-gray-200'
                            }`}
                    >
                        {f === 'major' && <Plane className="w-4 h-4" />}
                        {f === 'daily' && <UtensilsCrossed className="w-4 h-4" />}
                        {f === 'all' ? 'All' : f === 'major' ? 'Major' : 'Daily'}
                    </button>
                ))}
            </div>

            {/* Expense List */}
            <div className="space-y-3">
                {expenses.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Plus className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500 mb-2">No expenses yet</p>
                        <button
                            onClick={onAddExpense}
                            className="text-violet-600 font-medium"
                        >
                            Add your first expense
                        </button>
                    </div>
                ) : (
                    expenses.map((expense) => {
                        const Icon = categoryIcons[expense.category] || MoreHorizontal;
                        const colorClass = categoryColors[expense.category] || categoryColors.other;
                        const isOwner = expense.created_by === currentUserId;

                        return (
                            <div
                                key={expense.id}
                                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-slide-up"
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <h3 className="font-medium text-gray-900 truncate">
                                                    {expense.description}
                                                </h3>
                                                <p className="text-sm text-gray-500">
                                                    Paid by {getMemberName(expense.paid_by)}
                                                </p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="font-semibold text-gray-900">
                                                    {formatAmount(expense.amount)}
                                                </p>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${expense.type === 'major'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-orange-100 text-orange-700'
                                                    }`}>
                                                    {expense.type}
                                                </span>
                                            </div>
                                        </div>

                                        {isOwner && (
                                            <button
                                                onClick={() => handleDelete(expense.id, expense.created_by)}
                                                disabled={deletingId === expense.id}
                                                className="mt-2 text-red-500 text-sm flex items-center gap-1 hover:text-red-700"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                {deletingId === expense.id ? 'Deleting...' : 'Delete'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* FAB */}
            <button
                onClick={onAddExpense}
                className="fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-all active:scale-95"
            >
                <Plus className="w-6 h-6" />
            </button>
        </div>
    );
}
