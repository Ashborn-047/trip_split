import type { TripMember, Summary } from '../types';
import { UserPlus, Copy, Check, Crown, Ghost, User } from 'lucide-react';
import { useState } from 'react';
import { addGhostMember } from '../services/tripService';
import { formatBalance } from '../utils/balanceCalculator';

interface MembersTabProps {
    members: TripMember[];
    summary: Summary;
    tripCode: string;
    tripId: string;
    isAdmin: boolean;
}

export default function MembersTab({ members, summary, tripCode, tripId, isAdmin }: MembersTabProps) {
    const [copied, setCopied] = useState(false);
    const [showAddGhost, setShowAddGhost] = useState(false);
    const [ghostName, setGhostName] = useState('');
    const [adding, setAdding] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(tripCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleAddGhost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ghostName.trim()) return;

        setAdding(true);
        try {
            await addGhostMember({ trip_id: tripId, display_name: ghostName.trim() });
            setGhostName('');
            setShowAddGhost(false);
        } catch (err) {
            console.error('Failed to add member:', err);
        } finally {
            setAdding(false);
        }
    };

    const getRoleIcon = (role: string) => {
        if (role === 'admin') return <Crown className="w-4 h-4 text-amber-500" />;
        if (role === 'ghost') return <Ghost className="w-4 h-4 text-gray-400" />;
        return <User className="w-4 h-4 text-gray-400" />;
    };

    return (
        <div className="px-4 py-4">
            {/* Share Card */}
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 text-white mb-6">
                <p className="text-white/80 text-sm mb-2">Invite friends with this code</p>
                <div className="flex items-center justify-between">
                    <span className="text-3xl font-bold font-mono tracking-wider">{tripCode}</span>
                    <button
                        onClick={handleCopy}
                        className="bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-all"
                    >
                        {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Members List */}
            <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">Members ({members.length})</h2>
                {isAdmin && (
                    <button
                        onClick={() => setShowAddGhost(!showAddGhost)}
                        className="text-violet-600 text-sm font-medium flex items-center gap-1"
                    >
                        <UserPlus className="w-4 h-4" />
                        Add Offline
                    </button>
                )}
            </div>

            {/* Add Ghost Form */}
            {showAddGhost && (
                <form onSubmit={handleAddGhost} className="bg-gray-100 rounded-xl p-3 mb-4 flex gap-2">
                    <input
                        type="text"
                        value={ghostName}
                        onChange={(e) => setGhostName(e.target.value)}
                        placeholder="Name (e.g. Amit)"
                        className="flex-1 px-3 py-2 rounded-lg border-0 focus:ring-2 focus:ring-violet-500 text-sm"
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={adding || !ghostName.trim()}
                        className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                        {adding ? '...' : 'Add'}
                    </button>
                </form>
            )}

            <div className="space-y-2">
                {members.map((member) => {
                    const balance = summary.globalBalance[member.id] || 0;

                    return (
                        <div
                            key={member.id}
                            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-semibold">
                                    {member.display_name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900">{member.display_name}</span>
                                        {getRoleIcon(member.role)}
                                    </div>
                                    <span className="text-xs text-gray-500 capitalize">{member.role}</span>
                                </div>
                            </div>

                            <div className={`text-right font-semibold ${balance > 0 ? 'text-emerald-600' : balance < 0 ? 'text-red-500' : 'text-gray-500'
                                }`}>
                                {formatBalance(balance)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
