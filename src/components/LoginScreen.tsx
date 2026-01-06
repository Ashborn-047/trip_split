import { useState } from 'react';
import type { User } from 'firebase/auth';
import { mutationService } from '../services/mutationService';
import { Plane, Users, Plus, ArrowRight, Loader2 } from 'lucide-react';

interface LoginScreenProps {
    user: User;
    onTripSelect: (tripId: string) => void;
}

export default function LoginScreen({ user, onTripSelect }: LoginScreenProps) {
    const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
    const [name, setName] = useState('');
    const [tripCode, setTripCode] = useState('');
    const [tripName, setTripName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { tripId } = await mutationService.createTrip(
                { name: tripName || `${name}'s Trip`, creatorDisplayName: name },
                user.uid
            );
            onTripSelect(tripId);
        } catch (err: any) {
            setError(err.message || 'Failed to create trip');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }
        if (!tripCode.trim()) {
            setError('Please enter the trip code');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { tripId } = await mutationService.joinTrip(
                { code: tripCode, displayName: name },
                user.uid
            );
            onTripSelect(tripId);
        } catch (err: any) {
            setError(err.message || 'Failed to join trip');
        } finally {
            setLoading(false);
        }
    };

    if (mode === 'home') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 flex flex-col">
                {/* Hero Section */}
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center mb-6 shadow-lg">
                        <Plane className="w-10 h-10 text-white" />
                    </div>

                    <h1 className="text-4xl font-bold text-white mb-3">TripSplit</h1>
                    <p className="text-white/80 text-lg max-w-xs">
                        Split expenses with friends. Settle up smart.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="px-6 pb-10 space-y-4">
                    <button
                        onClick={() => setMode('create')}
                        className="w-full bg-white text-violet-700 py-4 px-6 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                    >
                        <Plus className="w-5 h-5" />
                        Create New Trip
                    </button>

                    <button
                        onClick={() => setMode('join')}
                        className="w-full bg-white/20 backdrop-blur-sm text-white py-4 px-6 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3 border border-white/30 hover:bg-white/30 transition-all active:scale-[0.98]"
                    >
                        <Users className="w-5 h-5" />
                        Join a Trip
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 pt-12 pb-20 px-6">
                <button
                    onClick={() => { setMode('home'); setError(''); }}
                    className="text-white/80 hover:text-white mb-4 text-sm"
                >
                    ← Back
                </button>
                <h1 className="text-2xl font-bold text-white">
                    {mode === 'create' ? 'Create a Trip' : 'Join a Trip'}
                </h1>
                <p className="text-white/70 mt-1">
                    {mode === 'create'
                        ? 'Start a new expense group with friends'
                        : 'Enter the code shared by your trip admin'}
                </p>
            </div>

            {/* Form Card */}
            <div className="px-6 -mt-12">
                <form
                    onSubmit={mode === 'create' ? handleCreate : handleJoin}
                    className="bg-white rounded-3xl shadow-xl p-6 space-y-5"
                >
                    {/* Name Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Your Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Rahul"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all outline-none"
                            autoFocus
                        />
                    </div>

                    {/* Trip Code (Join mode) */}
                    {mode === 'join' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Trip Code
                            </label>
                            <input
                                type="text"
                                value={tripCode}
                                onChange={(e) => setTripCode(e.target.value.toUpperCase())}
                                placeholder="e.g. ABC123"
                                maxLength={6}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all outline-none text-center text-2xl font-mono tracking-widest uppercase"
                            />
                        </div>
                    )}

                    {/* Trip Name (Create mode) */}
                    {mode === 'create' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Trip Name <span className="text-gray-400">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={tripName}
                                onChange={(e) => setTripName(e.target.value)}
                                placeholder="e.g. Goa Trip 2024"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all outline-none"
                            />
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {mode === 'create' ? 'Create Trip' : 'Join Trip'}
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
