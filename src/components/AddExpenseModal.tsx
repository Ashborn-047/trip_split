import { useState } from 'react';
import type { TripMember, ExpenseCategory, ExpenseType } from '../types';
import { mutationService } from '../services/mutationService';
import { X, Camera, Loader2, Plane, UtensilsCrossed, Home, Sparkles, MoreHorizontal, Users, PencilLine, PieChart } from 'lucide-react';
import { scanReceipt, fileToBase64 } from '../services/geminiService';
import { canScanReceipt, incrementUsage, getRemainingScans, FREE_LIMIT } from '../services/usageService';

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
        const currentMember = members.find(m => m.user_id === currentUserId);
        return currentMember?.id || '';
    });

    // Splitting Logic
    const [splitType, setSplitType] = useState<'equal' | 'custom' | 'shares'>('equal');
    const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
    const [shares, setShares] = useState<Record<string, number>>({});

    const [saving, setSaving] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');

    const remainingScans = getRemainingScans();

    const amountNum = parseFloat(amount) || 0;
    const splitTotal = Object.values(customSplits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const remaining = amountNum - splitTotal;

    const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!canScanReceipt()) {
            setError(`Free limit of ${FREE_LIMIT} scans reached this month.`);
            return;
        }

        setScanning(true);
        setError('');

        try {
            const { data, mimeType } = await fileToBase64(file);
            const result = await scanReceipt(data, mimeType);

            if (result) {
                incrementUsage();
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

    const handleCustomSplitChange = (memberId: string, value: string) => {
        setCustomSplits(prev => ({
            ...prev,
            [memberId]: value
        }));
    };

    const handleShareChange = (memberId: string, value: string) => {
        const num = parseInt(value) || 0;
        setShares(prev => ({
            ...prev,
            [memberId]: Math.max(0, num)
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!description.trim()) {
            setError('Please enter a description');
            return;
        }

        if (amountNum <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        if (!paidBy) {
            setError('Please select who paid');
            return;
        }

        let custom_splits_payload: { member_id: string; amount: number; shares?: number }[] | undefined;

        if (splitType === 'custom') {
            if (Math.abs(remaining) > 0.01) {
                setError(`Custom split total must match the expense amount. Remaining: ₹${remaining.toFixed(2)}`);
                return;
            }
            custom_splits_payload = members.map(m => ({
                member_id: m.id,
                amount: parseFloat(customSplits[m.id]) || 0
            }));
        } else if (splitType === 'shares') {
            const totalShares = Object.values(shares).reduce((sum, s) => sum + s, 0);
            if (totalShares === 0) {
                setError('Total shares must be greater than zero');
                return;
            }

            // Distribute amount based on shares
            let currentSum = 0;
            // Filter members with > 0 shares
            const shareMembers = members.filter(m => (shares[m.id] || 0) > 0);

            if (shareMembers.length === 0) {
                 setError('At least one member must have shares');
                 return;
            }

            custom_splits_payload = shareMembers.map((m, index) => {
                const share = shares[m.id] || 0;
                let shareAmount = 0;

                if (index === shareMembers.length - 1) {
                    // Last person gets the remainder to ensure exact match
                    shareAmount = amountNum - currentSum;
                } else {
                    shareAmount = parseFloat(((amountNum * share) / totalShares).toFixed(2));
                    currentSum += shareAmount;
                }

                return {
                    member_id: m.id,
                    amount: Math.round(shareAmount * 100) / 100,
                    shares: share
                };
            });
        }

        setSaving(true);
        setError('');

        try {
            await mutationService.createExpense({
                trip_id: tripId,
                description: description.trim(),
                amount: amountNum,
                category,
                type,
                paid_by: paidBy,
                split_type: splitType,
                custom_splits: custom_splits_payload,
                ai_confirmed: true,
            }, currentUserId);

            onClose();
        } catch (err) {
            setError((err as Error).message || 'Failed to add expense');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-safe">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bottom-sheet-backdrop animate-fade-in"
                onClick={onClose}
            />

            {/* Sheet */}
            <div className="bottom-sheet w-full max-w-lg max-h-[92dvh] flex flex-col z-10 relative">
                <div className="bottom-sheet-handle flex-shrink-0" />

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Add Expense</h2>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Capture Every Spent</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-gray-400" />
                    </button>
                </div>

                {/* Scrollable Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-12">
                    {/* Scan Section */}
                    <div className="grid grid-cols-1 gap-4">
                        <label className="relative flex items-center justify-center gap-3 border-2 border-dashed border-gray-100 rounded-2xl py-6 hover:border-violet-300 hover:bg-violet-50/30 transition-all cursor-pointer group">
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleScan}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                disabled={scanning}
                            />
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${scanning ? 'bg-violet-100' : 'bg-gray-50 group-hover:bg-violet-100'}`}>
                                {scanning ? (
                                    <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
                                ) : (
                                    <Camera className={`w-6 h-6 ${scanning ? 'text-violet-600' : 'text-gray-400 group-hover:text-violet-600'}`} />
                                )}
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-gray-900 text-sm">
                                    {scanning ? 'Analyzing Receipt...' : 'Scan with Gemini AI'}
                                </p>
                                <p className={`text-xs ${remainingScans === 0 ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                    {remainingScans > 0 ? `${remainingScans} free scans left` : 'Limit reached'}
                                </p>
                            </div>
                        </label>
                    </div>

                    <div className="space-y-4">
                        {/* Description */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                                What was it for?
                            </label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="e.g. Sushi Dinner 🍱"
                                className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-transparent focus:bg-white focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all text-lg font-medium outline-none"
                            />
                        </div>

                        {/* Amount */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                                How much?
                            </label>
                            <div className="relative group">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400 group-focus-within:text-violet-600 transition-colors">₹</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0"
                                    className="w-full pl-12 pr-5 py-5 rounded-2xl bg-gray-50 border-transparent focus:bg-white focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all text-3xl font-bold outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Category Selection */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 ml-1">
                            Category
                        </label>
                        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
                            {categories.map((cat) => {
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setCategory(cat.id)}
                                        className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all' ${category === cat.id
                                            ? 'bg-violet-600 text-white shadow-lg shadow-violet-200 -translate-y-0.5'
                                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Who Paid & Type Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                                Paid By
                            </label>
                            <select
                                value={paidBy}
                                onChange={(e) => setPaidBy(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border-transparent focus:bg-white focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none text-sm font-semibold"
                            >
                                {members.map((member) => (
                                    <option key={member.id} value={member.id}>
                                        {member.display_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                                Weight
                            </label>
                            <div className="flex p-1 bg-gray-50 rounded-2xl">
                                <button
                                    type="button"
                                    onClick={() => setType('daily')}
                                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${type === 'daily' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}
                                >
                                    Daily
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('major')}
                                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${type === 'major' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                                >
                                    Major
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Splitting Section */}
                    <div className="pt-2 border-t border-gray-50">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1">
                            Splitting Method
                        </label>
                        <div className="flex gap-2 mb-6">
                            <button
                                type="button"
                                onClick={() => setSplitType('equal')}
                                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${splitType === 'equal'
                                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                                    : 'border-gray-50 bg-gray-50 text-gray-500'}`}
                            >
                                <Users className="w-4 h-4" />
                                Equally
                            </button>
                            <button
                                type="button"
                                onClick={() => setSplitType('custom')}
                                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${splitType === 'custom'
                                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                                    : 'border-gray-50 bg-gray-50 text-gray-500'}`}
                            >
                                <PencilLine className="w-4 h-4" />
                                Itemized
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSplitType('shares');
                                    // Default 1 share each
                                    const initialShares: Record<string, number> = {};
                                    members.forEach(m => initialShares[m.id] = 1);
                                    setShares(initialShares);
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${splitType === 'shares'
                                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                                    : 'border-gray-50 bg-gray-50 text-gray-500'}`}
                            >
                                <PieChart className="w-4 h-4" />
                                Shares
                            </button>
                        </div>

                        {splitType === 'custom' && (
                            <div className="space-y-3 bg-gray-50 p-4 rounded-2xl animate-fade-in">
                                <div className="flex justify-between items-center mb-2 px-1">
                                    <span className="text-xs font-bold text-gray-500">Member Share</span>
                                    <span className={`text-xs font-bold ${Math.abs(remaining) < 0.01 ? 'text-success' : 'text-danger'}`}>
                                        {remaining === 0 ? 'Perfectly split!' : `Left: ₹${remaining.toFixed(2)}`}
                                    </span>
                                </div>
                                {members.map((member) => (
                                    <div key={member.id} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-violet-600 border border-gray-100 flex-shrink-0">
                                            {member.display_name.charAt(0)}
                                        </div>
                                        <span className="flex-1 text-sm font-medium text-gray-700">{member.display_name}</span>
                                        <div className="relative w-28">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                            <input
                                                type="number"
                                                value={customSplits[member.id] || ''}
                                                onChange={(e) => handleCustomSplitChange(member.id, e.target.value)}
                                                placeholder="0"
                                                className="w-full pl-7 pr-3 py-2.5 rounded-xl border-transparent focus:border-violet-500 outline-none text-sm font-bold"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {splitType === 'shares' && (
                            <div className="space-y-3 bg-gray-50 p-4 rounded-2xl animate-fade-in">
                                <div className="flex justify-between items-center mb-2 px-1">
                                    <span className="text-xs font-bold text-gray-500">Member Shares</span>
                                    <span className="text-xs font-bold text-violet-600">
                                        Total: {Object.values(shares).reduce((a, b) => a + b, 0)}
                                    </span>
                                </div>
                                {members.map((member) => (
                                    <div key={member.id} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-violet-600 border border-gray-100 flex-shrink-0">
                                            {member.display_name.charAt(0)}
                                        </div>
                                        <span className="flex-1 text-sm font-medium text-gray-700">{member.display_name}</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleShareChange(member.id, String((shares[member.id] || 0) - 1))}
                                                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 font-bold"
                                            >
                                                -
                                            </button>
                                            <input
                                                type="number"
                                                value={shares[member.id] || 0}
                                                onChange={(e) => handleShareChange(member.id, e.target.value)}
                                                className="w-12 text-center py-1 rounded-lg border-transparent bg-transparent font-bold text-lg"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleShareChange(member.id, String((shares[member.id] || 0) + 1))}
                                                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 font-bold"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Error & Submit */}
                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-gradient-primary text-white py-5 rounded-2xl font-bold text-lg shadow-xl shadow-violet-200 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>Save Expense</>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
