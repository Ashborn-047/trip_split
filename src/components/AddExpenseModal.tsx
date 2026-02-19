import { useState, useMemo } from 'react';
import type { TripMember, ExpenseCategory, ExpenseType } from '../types';
import { mutationService } from '../services/mutationService';
import {
    X, Camera, Loader2, Plane, UtensilsCrossed, Home,
    Sparkles, MoreHorizontal, Users, PencilLine, PieChart,
    Check
} from 'lucide-react';
import { scanReceipt, fileToBase64 } from '../services/geminiService';
import { canScanReceipt, incrementUsage, getRemainingScans, FREE_LIMIT } from '../services/usageService';

interface AddExpenseModalProps {
    tripId: string;
    members: TripMember[];
    currentUserId: string;
    onClose: () => void;
}

const categories: { id: ExpenseCategory; label: string; icon: typeof Plane; color: string }[] = [
    { id: 'travel', label: 'Travel', icon: Plane, color: 'bg-blue-200 border-blue-900 text-blue-900' },
    { id: 'food', label: 'Food', icon: UtensilsCrossed, color: 'bg-orange-200 border-orange-900 text-orange-900' },
    { id: 'stay', label: 'Stay', icon: Home, color: 'bg-emerald-200 border-emerald-900 text-emerald-900' },
    { id: 'fun', label: 'Fun', icon: Sparkles, color: 'bg-purple-200 border-purple-900 text-purple-900' },
    { id: 'other', label: 'Other', icon: MoreHorizontal, color: 'bg-gray-200 border-gray-900 text-gray-900' },
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
    const [involvedMembers, setInvolvedMembers] = useState<Set<string>>(new Set(members.map(m => m.id)));

    // Custom/Shares Inputs
    const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
    const [shares, setShares] = useState<Record<string, number>>({});

    const [saving, setSaving] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');

    const remainingScans = getRemainingScans();
    const amountNum = parseFloat(amount) || 0;

    // Derived involved members list (sorted for consistency)
    const activeMembers = useMemo(() =>
        members.filter(m => involvedMembers.has(m.id)),
    [members, involvedMembers]);

    // Calculate remaining amount for custom splits
    const splitTotal = Object.values(customSplits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const remaining = amountNum - splitTotal;

    const toggleMemberInvolvement = (memberId: string) => {
        setInvolvedMembers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(memberId)) {
                if (newSet.size > 1) newSet.delete(memberId); // Prevent removing last member
            } else {
                newSet.add(memberId);
            }
            return newSet;
        });
    };

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
        setError('');

        if (!description.trim()) { setError('Please enter a description'); return; }
        if (amountNum <= 0) { setError('Please enter a valid amount'); return; }
        if (!paidBy) { setError('Please select who paid'); return; }
        if (activeMembers.length === 0) { setError('At least one person must be involved'); return; }

        let custom_splits_payload: { member_id: string; amount: number; shares?: number }[] | undefined;

        // Validation for Custom/Shares
        if (splitType === 'custom') {
            if (Math.abs(remaining) > 0.01) {
                setError(`Custom split total must match amount. Remaining: ₹${remaining.toFixed(2)}`);
                return;
            }
            custom_splits_payload = activeMembers.map(m => ({
                member_id: m.id,
                amount: parseFloat(customSplits[m.id]) || 0
            }));
        } else if (splitType === 'shares') {
            const activeShares = activeMembers.map(m => ({ id: m.id, shares: shares[m.id] || 0 }));
            const totalShares = activeShares.reduce((sum, s) => sum + s.shares, 0);

            if (totalShares === 0) {
                setError('Total shares must be greater than zero');
                return;
            }

            // Distribute locally to validate (backend will recalculate, but good for UX)
            // Or just send shares and let backend handle it?
            // The service expects `custom_splits` with amounts even for shares.
            // Let's use our new integer math logic here or trust the service?
            // Service calls `SplitEngine`. We need to pass shares data.

            custom_splits_payload = activeMembers.map(m => ({
                member_id: m.id,
                amount: 0, // Placeholder, will be calc by SplitEngine
                shares: shares[m.id] || 0
            }));
        }

        setSaving(true);

        try {
            await mutationService.createExpense({
                trip_id: tripId,
                description: description.trim(),
                amount: amountNum,
                category,
                type,
                paid_by: paidBy,
                split_type: splitType,
                involved_member_ids: Array.from(involvedMembers), // NEW: Explicit Subset
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
        <div className="fixed inset-0 z-50 flex items-end justify-center px-safe sm:items-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bottom-sheet-backdrop animate-fade-in"
                onClick={onClose}
            />

            {/* Neo-Brutalist Sheet/Card */}
            <div className="relative w-full max-w-lg bg-white sm:rounded-2xl border-t-2 sm:border-2 border-black shadow-[0_-8px_0_0_rgba(0,0,0,1)] sm:shadow-[8px_8px_0_0_rgba(0,0,0,1)] flex flex-col max-h-[92dvh] z-10 transition-transform">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b-2 border-black bg-yellow-300">
                    <div>
                        <h2 className="text-2xl font-black text-black uppercase tracking-tight transform -skew-x-6">
                            Add Expense
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all rounded-lg active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                    >
                        <X className="w-6 h-6 text-black" />
                    </button>
                </div>

                {/* Scrollable Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 pb-12">

                    {/* 1. Amount & Description (The Core) */}
                    <div className="space-y-4">
                        <div className="relative group">
                            <label className="block text-xs font-bold text-black uppercase mb-1 ml-1 bg-white inline-block px-1 border-2 border-black -mb-3 z-10 relative w-max transform -rotate-2">
                                Amount
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-black">₹</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0"
                                    className="w-full pl-12 pr-4 py-4 text-4xl font-black text-black bg-white border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] focus:shadow-[6px_6px_0_0_rgba(139,92,246,1)] focus:border-violet-600 outline-none transition-all rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="relative">
                            <label className="block text-xs font-bold text-black uppercase mb-1 ml-1 bg-white inline-block px-1 border-2 border-black -mb-3 z-10 relative w-max transform rotate-1">
                                Description
                            </label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What did you buy?"
                                className="w-full px-4 py-4 text-lg font-bold text-black bg-white border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] focus:shadow-[6px_6px_0_0_rgba(139,92,246,1)] focus:border-violet-600 outline-none transition-all rounded-xl"
                            />
                        </div>
                    </div>

                    {/* 2. Category Chips */}
                    <div>
                        <label className="block text-xs font-bold text-black uppercase mb-3 ml-1">
                            Category
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {categories.map((cat) => {
                                const Icon = cat.icon;
                                const isSelected = category === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setCategory(cat.id)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-black font-bold text-sm transition-all
                                            ${isSelected
                                                ? `${cat.color} shadow-[4px_4px_0_0_rgba(0,0,0,1)] -translate-y-1`
                                                : 'bg-white text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 3. Who Paid? */}
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-black uppercase mb-2 ml-1">
                                Paid By
                            </label>
                            <select
                                value={paidBy}
                                onChange={(e) => setPaidBy(e.target.value)}
                                className="w-full px-4 py-3 bg-white border-2 border-black rounded-xl font-bold shadow-[4px_4px_0_0_rgba(0,0,0,1)] focus:shadow-[6px_6px_0_0_rgba(139,92,246,1)] outline-none appearance-none"
                            >
                                {members.map((member) => (
                                    <option key={member.id} value={member.id}>
                                        {member.display_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 4. Split Logic Section (The Complex Part) */}
                    <div className="border-t-2 border-black pt-6 space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black uppercase text-black">Split Details</h3>
                            <div className="flex bg-white border-2 border-black rounded-lg p-1 gap-1">
                                <button
                                    type="button"
                                    onClick={() => setType('daily')}
                                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${type === 'daily' ? 'bg-orange-300 text-black border border-black' : 'text-gray-400'}`}
                                >
                                    Daily
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('major')}
                                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${type === 'major' ? 'bg-blue-300 text-black border border-black' : 'text-gray-400'}`}
                                >
                                    Major
                                </button>
                            </div>
                        </div>

                        {/* Who was involved? (Subset Selection) */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-black uppercase">
                                    Involved Members ({activeMembers.length})
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setInvolvedMembers(new Set(members.map(m => m.id)))}
                                    className="text-[10px] font-bold underline decoration-2 decoration-violet-500 hover:text-violet-600"
                                >
                                    Select All
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {members.map(member => {
                                    const isSelected = involvedMembers.has(member.id);
                                    return (
                                        <button
                                            key={member.id}
                                            type="button"
                                            onClick={() => toggleMemberInvolvement(member.id)}
                                            className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-bold transition-all flex items-center gap-1
                                                ${isSelected
                                                    ? 'bg-violet-300 text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]'
                                                    : 'bg-gray-100 text-gray-400 opacity-60'
                                                }`}
                                        >
                                            {isSelected && <Check className="w-3 h-3" />}
                                            {member.display_name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Split Method Tabs */}
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setSplitType('equal')}
                                className={`py-3 rounded-xl border-2 border-black font-bold text-sm transition-all flex flex-col items-center gap-1
                                    ${splitType === 'equal'
                                        ? 'bg-mint-300 bg-emerald-300 shadow-[4px_4px_0_0_rgba(0,0,0,1)] -translate-y-1'
                                        : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <Users className="w-4 h-4" />
                                Equal
                            </button>
                            <button
                                type="button"
                                onClick={() => setSplitType('custom')}
                                className={`py-3 rounded-xl border-2 border-black font-bold text-sm transition-all flex flex-col items-center gap-1
                                    ${splitType === 'custom'
                                        ? 'bg-yellow-300 shadow-[4px_4px_0_0_rgba(0,0,0,1)] -translate-y-1'
                                        : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <PencilLine className="w-4 h-4" />
                                Custom
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSplitType('shares');
                                    // Reset shares for active members
                                    const newShares: Record<string, number> = {};
                                    activeMembers.forEach(m => newShares[m.id] = 1);
                                    setShares(newShares);
                                }}
                                className={`py-3 rounded-xl border-2 border-black font-bold text-sm transition-all flex flex-col items-center gap-1
                                    ${splitType === 'shares'
                                        ? 'bg-pink-300 shadow-[4px_4px_0_0_rgba(0,0,0,1)] -translate-y-1'
                                        : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <PieChart className="w-4 h-4" />
                                Shares
                            </button>
                        </div>

                        {/* Dynamic Inputs based on Split Type */}
                        {splitType === 'custom' && (
                            <div className="space-y-3 bg-yellow-50 border-2 border-black p-4 rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-black uppercase">Amounts</span>
                                    <span className={`text-xs font-black ${remaining === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {remaining === 0 ? 'PERFECT' : `REMAINING: ₹${remaining.toFixed(2)}`}
                                    </span>
                                </div>
                                {activeMembers.map((member) => (
                                    <div key={member.id} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white border-2 border-black flex items-center justify-center text-xs font-black">
                                            {member.display_name.charAt(0)}
                                        </div>
                                        <span className="flex-1 text-sm font-bold truncate">{member.display_name}</span>
                                        <div className="relative w-28">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black font-bold text-sm">₹</span>
                                            <input
                                                type="number"
                                                value={customSplits[member.id] || ''}
                                                onChange={(e) => handleCustomSplitChange(member.id, e.target.value)}
                                                placeholder="0"
                                                className="w-full pl-7 pr-3 py-2 rounded-lg border-2 border-black focus:bg-yellow-100 outline-none text-sm font-bold text-right"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {splitType === 'shares' && (
                            <div className="space-y-3 bg-pink-50 border-2 border-black p-4 rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-black uppercase">Shares</span>
                                    <span className="text-xs font-black text-pink-600">
                                        TOTAL: {Object.values(shares).reduce((a, b) => a + b, 0)}
                                    </span>
                                </div>
                                {activeMembers.map((member) => (
                                    <div key={member.id} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white border-2 border-black flex items-center justify-center text-xs font-black">
                                            {member.display_name.charAt(0)}
                                        </div>
                                        <span className="flex-1 text-sm font-bold truncate">{member.display_name}</span>
                                        <div className="flex items-center border-2 border-black rounded-lg bg-white overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => handleShareChange(member.id, String((shares[member.id] || 0) - 1))}
                                                className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 font-bold border-r-2 border-black"
                                            >
                                                -
                                            </button>
                                            <input
                                                type="number"
                                                value={shares[member.id] || 0}
                                                onChange={(e) => handleShareChange(member.id, e.target.value)}
                                                className="w-10 text-center py-1 bg-transparent font-black text-sm outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleShareChange(member.id, String((shares[member.id] || 0) + 1))}
                                                className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 font-bold border-l-2 border-black"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Scan Button (Floating or integrated?) - Let's integrate for Neo look */}
                    <div className="border-t-2 border-black pt-4">
                        <label className="relative flex items-center justify-center gap-3 border-2 border-dashed border-black bg-gray-50 rounded-xl py-4 hover:bg-violet-50 hover:border-violet-600 transition-all cursor-pointer group">
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
                                <Camera className="w-5 h-5 text-black group-hover:text-violet-600" />
                            )}
                            <span className="font-bold text-sm group-hover:text-violet-600">
                                {scanning ? 'Scanning...' : 'Scan Receipt with AI'}
                            </span>
                        </label>
                         {remainingScans <= 2 && (
                             <p className="text-[10px] font-bold text-center mt-1 text-red-500 uppercase">
                                 {remainingScans} free scans left
                             </p>
                         )}
                    </div>

                    {/* Error & Submit */}
                    {error && (
                        <div className="bg-red-100 text-red-900 border-2 border-red-900 px-4 py-3 rounded-xl text-sm font-bold">
                            🚨 {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-violet-600 text-white border-2 border-black py-4 rounded-xl font-black text-xl uppercase tracking-wider shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>SAVE EXPENSE</>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
