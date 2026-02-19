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
    is_ghost: boolean;
    joined_at: string;
    created_at: string;
    updated_at: string;
    sync_status?: 'synced' | 'pending' | 'conflicted';
}

export interface LocalExpense {
    id: string;
    trip_id: string;
    description: string;
    amount: number;
    category: 'travel' | 'food' | 'stay' | 'fun' | 'other';
    type: 'major' | 'daily';
    paid_by: string; // Member ID
    split_type: 'equal' | 'custom' | 'shares';
    expense_date: string;
    receipt_url: string | null;
    ai_confirmed: boolean;
    created_by: string;
    created_at: string;
    updated_at: string;
    sync_status?: 'synced' | 'pending' | 'conflicted';
}

export interface LocalSplit {
    id: string;
    expense_id: string;
    member_id: string;
    amount: number;
    shares?: number;
}

export interface LocalMutation {
    mutation_id: string;      // UUID
    entity_type: 'expense' | 'split' | 'trip' | 'member';
    entity_id: string;
    action: 'create' | 'update' | 'delete';
    payload: any;
    client_timestamp: string;
    client_sequence_number: number;
    sync_status: 'pending' | 'conflicted' | 'blocked';
    error?: string;
}

export class TripSplitDatabase extends Dexie {
    trips!: Table<LocalTrip>;
    members!: Table<LocalMember>;
    expenses!: Table<LocalExpense>;
    splits!: Table<LocalSplit>;
    mutations!: Table<LocalMutation>;

    constructor() {
        super('TripSplitLocal');
        this.version(2).stores({
            trips: 'id, code, created_by',
            members: 'id, trip_id, user_id, role',
            expenses: 'id, trip_id, paid_by, category, type',
            splits: 'id, expense_id, member_id',
            mutations: 'mutation_id, entity_id, entity_type, action, client_sequence_number'
        });
    }
}

export const localDb = new TripSplitDatabase();
