/**
 * TripSplit - TypeScript Type Definitions (Hardened)
 * 
 * IMPORTANT DESIGN DECISIONS:
 * 
 * 1. `paid_by` ALWAYS references `trip_members.id`, not `auth.users.id`.
 *    This normalizes both real users and ghost members to a single reference.
 * 
 * 2. All money fields use `number` in TypeScript but are stored as DECIMAL(12,2)
 *    in PostgreSQL. Rounding only happens at display layer.
 * 
 * 3. AI-extracted data requires user confirmation before persistence.
 *    The `ai_confirmed` flag tracks this.
 */

// ============================================
// DATABASE TYPES (match Supabase schema)
// ============================================

export interface Trip {
    id: string;
    code: string;          // 6-char unique join code
    name: string;
    currency: string;      // Default: 'INR'
    status: 'active' | 'archived';
    created_at: string;    // ISO timestamp
    updated_at: string;    // ISO timestamp, auto-updated
    archived_at: string | null;
    created_by: string;    // References auth.users.id
}

export interface TripMember {
    id: string;            // Primary key, used by paid_by and member_id
    trip_id: string;       // References trips.id
    user_id: string | null; // NULL for ghost members, else auth.users.id
    display_name: string;
    role: MemberRole;
    is_ghost: boolean;     // True if member has no associated auth user
    joined_at: string;     // ISO timestamp
    updated_at: string;    // ISO timestamp
}

export interface Expense {
    id: string;
    trip_id: string;       // References trips.id
    description: string;
    amount: number;        // Stored as DECIMAL(12,2), always > 0
    category: ExpenseCategory;
    type: ExpenseType;
    expense_date: string;  // ISO date (YYYY-MM-DD)
    created_by: string;    // References auth.users.id (who added it)
    /**
     * IMPORTANT: References trip_members.id, NOT auth.users.id
     * This allows both real users and ghost members to be payers.
     */
    paid_by: string;
    split_type: 'equal' | 'custom';
    receipt_url: string | null;
    /**
     * Indicates if AI-extracted data was reviewed and confirmed by user.
     * Default TRUE for manually entered expenses.
     * Set to FALSE when auto-filled by AI, then TRUE after user confirms.
     */
    ai_confirmed: boolean;
    created_at: string;    // ISO timestamp
    updated_at: string;    // ISO timestamp
}

export interface ExpenseSplit {
    id: string;
    expense_id: string;    // References expenses.id
    /**
     * IMPORTANT: References trip_members.id, NOT auth.users.id
     * Consistent with expenses.paid_by reference.
     */
    member_id: string;
    amount: number;        // Stored as DECIMAL(12,2), >= 0
}

export interface SettlementSnapshot {
    id: string;
    trip_id: string;
    filter_type: SettlementFilterType;
    generated_at: string;
    generated_by: string;
    transactions: SettlementTransaction[];
    algorithm_version: string;
}

// ============================================
// ENUM TYPES
// ============================================

export type ExpenseCategory = 'travel' | 'food' | 'stay' | 'fun' | 'other';

export type ExpenseType = 'major' | 'daily';

export type MemberRole = 'admin' | 'member' | 'ghost';

export type TripStatus = 'active' | 'archived';

export type SettlementFilterType = 'all' | 'major' | 'daily';

// ============================================
// ALGORITHM TYPES
// ============================================

/**
 * Net balance per member.
 * - Positive: member gets money back
 * - Negative: member owes money
 * 
 * Keys are trip_members.id (not user_id)
 */
export interface Balance {
    [memberId: string]: number;
}

/**
 * A single settlement transaction.
 * Represents: "from pays to amount X"
 */
export interface SettlementTransaction {
    from: string;        // trip_members.id (debtor)
    fromName: string;    // Display name for UI
    to: string;          // trip_members.id (creditor)
    toName: string;      // Display name for UI
    amount: number;      // Rounded to 2 decimal places for display
}

/**
 * Aggregated balance summary.
 * Calculated separately for global, major-only, and daily-only expenses.
 */
export interface Summary {
    globalBalance: Balance;
    majorBalance: Balance;
    dailyBalance: Balance;
    totalSpent: number;
}

// ============================================
// AI TYPES
// ============================================

/**
 * Raw response from Gemini AI receipt scanning.
 * This is a DRAFT and must be confirmed by user before persistence.
 */
export interface AIReceiptDraft {
    amount: number | null;
    description: string | null;
    /**
     * Raw category string from AI.
     * Must be validated/mapped to ExpenseCategory before use.
     * Unknown values should fall back to 'other'.
     */
    rawCategory: string | null;
}

/**
 * Validated receipt data after mapping AI output.
 * Safe to use in expense creation form (still requires user confirmation).
 */
export interface ValidatedReceiptData {
    amount: number;
    description: string;
    category: ExpenseCategory;
}

// ============================================
// INPUT TYPES (for service functions)
// ============================================

export interface CreateTripInput {
    name: string;
    creatorDisplayName: string;
}

export interface JoinTripInput {
    code: string;
    displayName: string;
}

export interface CreateExpenseInput {
    trip_id: string;
    description: string;
    amount: number;
    category: ExpenseCategory;
    type: ExpenseType;
    paid_by: string;       // trip_members.id
    split_type: 'equal' | 'custom';
    custom_splits?: { member_id: string; amount: number }[];
    expense_date?: string;
    receipt_url?: string;
    ai_confirmed?: boolean;
}

export interface AddGhostMemberInput {
    trip_id: string;
    display_name: string;
}

// ============================================
// CONTEXT STATE TYPES
// ============================================

export interface AuthState {
    user: { id: string; email?: string } | null;
    loading: boolean;
    error: string | null;
}

export interface TripState {
    activeTripId: string | null;
    trip: Trip | null;
    members: TripMember[];
    expenses: Expense[];
    loading: boolean;
    error: string | null;
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Mapping of category ID to UI metadata.
 */
export interface CategoryConfig {
    id: ExpenseCategory;
    label: string;
    iconName: string;
    colorClass: string;
}

/**
 * Settlement algorithm configuration.
 */
export const SETTLEMENT_ALGORITHM_VERSION = '1.0';
