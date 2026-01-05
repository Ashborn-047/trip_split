import type { Trip } from '../types';
import { Share2, LogOut, Check } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
    trip: Trip;
    totalSpent: number;
    memberCount: number;
    onLeaveTrip: () => void;
}

export default function Header({ trip, totalSpent, memberCount, onLeaveTrip }: HeaderProps) {
    const [copied, setCopied] = useState(false);

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(trip.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: trip.currency || 'INR',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <header className="bg-gradient-primary text-white header-safe pb-6 px-4">
            {/* Top Row */}
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold truncate flex-1 mr-2">{trip.name}</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs sm:text-sm transition-all truncate max-w-[120px] sm:max-w-none"
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4 text-white/80" />}
                        <span className="font-mono font-medium">{trip.code}</span>
                    </button>
                    <button
                        onClick={onLeaveTrip}
                        className="p-2 hover:bg-white/20 rounded-full transition-all flex-shrink-0"
                        title="Leave trip"
                    >
                        <LogOut className="w-5 h-5 text-white/80" />
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-4 sm:gap-6">
                <div>
                    <p className="text-white/70 text-[10px] sm:text-xs uppercase tracking-wider font-medium">Total Spent</p>
                    <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totalSpent)}</p>
                </div>
                <div className="h-8 w-px bg-white/20"></div>
                <div>
                    <p className="text-white/70 text-[10px] sm:text-xs uppercase tracking-wider font-medium">Members</p>
                    <p className="text-xl sm:text-2xl font-bold">{memberCount}</p>
                </div>
            </div>
        </header>
    );
}
