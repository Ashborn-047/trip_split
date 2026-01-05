import type { TripMember, Summary, SettlementFilterType } from '../types';
import { useState } from 'react';
import { calculateSettlements, SETTLEMENT_ALGORITHM_VERSION } from '../utils/settlement';
import { ArrowRight, Wallet, Filter } from 'lucide-react';

interface SettleTabProps {
    members: TripMember[];
    summary: Summary;
    tripId: string;
    userId: string;
}

export default function SettleTab({ members, summary }: SettleTabProps) {
    const [filter, setFilter] = useState<SettlementFilterType>('all');

    // Get the appropriate balance based on filter
    const balances = filter === 'all'
        ? summary.globalBalance
        : filter === 'major'
            ? summary.majorBalance
            : summary.dailyBalance;

    // Calculate settlements
    const transactions = calculateSettlements(balances, members);

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="px-4 py-4">
            {/* Filter */}
            <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as SettlementFilterType)}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                >
                    <option value="all">All Expenses</option>
                    <option value="major">Major Only (Flights, Hotels)</option>
                    <option value="daily">Daily Only (Food, Travel)</option>
                </select>
            </div>

            {/* Transactions */}
            <h2 className="font-semibold text-gray-900 mb-3">
                Payments to Settle ({transactions.length})
            </h2>

            {transactions.length === 0 ? (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Wallet className="w-8 h-8 text-emerald-600" />
                    </div>
                    <p className="text-gray-600 font-medium">All settled up!</p>
                    <p className="text-gray-400 text-sm mt-1">No payments needed</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {transactions.map((tx, i) => (
                        <div
                            key={i}
                            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                    {/* From */}
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-semibold">
                                            {tx.fromName.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="font-medium text-gray-900">{tx.fromName}</span>
                                    </div>

                                    {/* Arrow */}
                                    <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />

                                    {/* To */}
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-semibold">
                                            {tx.toName.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="font-medium text-gray-900">{tx.toName}</span>
                                    </div>
                                </div>

                                {/* Amount */}
                                <div className="text-right">
                                    <p className="font-bold text-lg text-gray-900">
                                        {formatAmount(tx.amount)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Algorithm Info */}
            <p className="text-center text-gray-400 text-xs mt-6">
                Optimized with Min-Cash-Flow v{SETTLEMENT_ALGORITHM_VERSION}
            </p>
        </div>
    );
}
