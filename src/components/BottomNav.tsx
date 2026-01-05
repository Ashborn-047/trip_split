import { Receipt, Users, Wallet } from 'lucide-react';
import type { TabType } from './Dashboard';

interface BottomNavProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: typeof Receipt }[] = [
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'settle', label: 'Settle Up', icon: Wallet },
];

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-100 pb-safe z-40">
            <div className="flex items-center justify-around py-1 sm:py-2 px-2">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`flex flex-col items-center gap-1 flex-1 py-2 rounded-xl transition-all ${isActive
                                ? 'text-violet-600'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${isActive ? 'stroke-[2.5]' : ''}`} />
                            <span className={`text-[10px] sm:text-xs ${isActive ? 'font-semibold' : 'font-medium'}`}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
