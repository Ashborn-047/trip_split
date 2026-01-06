import Dexie, { type Table } from 'dexie';

export interface LocalTrip {
    id: string;
    name: string;
    code: string;
    currency: string;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface LocalMember {
    id: string;
    trip_id: string;
    display_name: string;
    user_id: string | null;
    role: 'admin' | 'member' | 'ghost';
    created_at: string;
    updated_at: string;
}

export interface LocalExpense {
    id: string;
    trip_id: string;
    description: string;
    amount: number;
    category: string;
    type: string;
    paid_by: string; // Member ID
    split_type: 'equal' | 'custom';
    expense_date: string;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface LocalSplit {
    id: string;
    expense_id: string;
    member_id: string;
    amount: number;
}

export class TripSplitDatabase extends Dexie {
    trips!: Table<LocalTrip>;
    members!: Table<LocalMember>;
    expenses!: Table<LocalExpense>;
    splits!: Table<LocalSplit>;

    constructor() {
        super('TripSplitLocal');
        this.version(1).stores({
            trips: 'id, code, created_by',
            members: 'id, trip_id, user_id, role',
            expenses: 'id, trip_id, paid_by, category, type',
            splits: 'id, expense_id, member_id'
        });
    }
}

export const localDb = new TripSplitDatabase();
