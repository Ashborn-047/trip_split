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
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
            <div className="flex items-center justify-around py-2">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all ${isActive
                                ? 'text-violet-600'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5]' : ''}`} />
                            <span className={`text-xs ${isActive ? 'font-semibold' : ''}`}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
