import { useState } from 'react';
import type { TripMember, ExpenseCategory, ExpenseType } from '../types';
import { createExpense } from '../services/expenseService';
import { X, Camera, Loader2, Plane, UtensilsCrossed, Home, Sparkles, MoreHorizontal } from 'lucide-react';
import { scanReceipt, fileToBase64 } from '../services/geminiService';

interface AddExpenseModalProps {
    tripId: string;
    members: TripMember[];
    currentUserId: string;
    onClose: () => void;
}

const categories: { id: ExpenseCategory; label: string; icon: typeof Plane }[] = [
    { id: 'travel', label: 'Travel', icon: Plane },
    { id: 'food', label: 'Food', icon: UtensilsCrossed },
    { id: 'stay', label: 'Stay', icon: Home },
    { id: 'fun', label: 'Fun', icon: Sparkles },
    { id: 'other', label: 'Other', icon: MoreHorizontal },
];

export default function AddExpenseModal({ tripId, members, currentUserId, onClose }: AddExpenseModalProps) {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<ExpenseCategory>('other');
    const [type, setType] = useState<ExpenseType>('daily');
    const [paidBy, setPaidBy] = useState(() => {
        // Default to current user's member ID
        const currentMember = members.find(m => m.user_id === currentUserId);
        return currentMember?.id || '';
    });
    const [saving, setSaving] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');

    const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanning(true);
        setError('');

        try {
            const { data, mimeType } = await fileToBase64(file);
            const result = await scanReceipt(data, mimeType);

            if (result) {
                // AI output is a DRAFT - user must confirm
                setAmount(result.amount.toString());
                setDescription(result.description);
                setCategory(result.category);
            } else {
                setError('Could not read receipt. Please enter manually.');
            }
        } catch (err) {
            console.error('Scan failed:', err);
            setError('Scan failed. Please enter manually.');
        } finally {
            setScanning(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!description.trim()) {
            setError('Please enter a description');
            return;
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        if (!paidBy) {
            setError('Please select who paid');
            return;
        }

        setSaving(true);
        setError('');

        try {
            await createExpense({
                trip_id: tripId,
                description: description.trim(),
                amount: amountNum,
                category,
                type,
                paid_by: paidBy,
                split_type: 'equal', // Default to equal split
                ai_confirmed: true,
            }, currentUserId);

            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to add expense');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
                    <h2 className="text-lg font-semibold">Add Expense</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Scan Receipt */}
                    <div>
                        <label className="relative flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 hover:border-violet-400 transition-colors cursor-pointer">
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleScan}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                disabled={scanning}
                            />
                            {scanning ? (
                                <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
                            ) : (
                                <Camera className="w-5 h-5 text-gray-400" />
                            )}
                            <span className="text-gray-600 text-sm">
                                {scanning ? 'Scanning receipt...' : 'Scan receipt (optional)'}
                            </span>
                        </label>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Lunch at cafe"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none"
                        />
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Amount (₹)
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none text-2xl font-semibold"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Category
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {categories.map((cat) => {
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setCategory(cat.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${category === cat.id
                                            ? 'bg-violet-600 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Type
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setType('major')}
                                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${type === 'major'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600'
                                    }`}
                            >
                                <Plane className="w-4 h-4" />
                                Major
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('daily')}
                                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${type === 'daily'
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-gray-100 text-gray-600'
                                    }`}
                            >
                                <UtensilsCrossed className="w-4 h-4" />
                                Daily
                            </button>
                        </div>
                    </div>

                    {/* Paid By */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Paid By
                        </label>
                        <select
                            value={paidBy}
                            onChange={(e) => setPaidBy(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none"
                        >
                            <option value="">Select member</option>
                            {members.map((member) => (
                                <option key={member.id} value={member.id}>
                                    {member.display_name}
                                    {member.user_id === currentUserId ? ' (You)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-70"
                    >
                        {saving ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            'Add Expense'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
