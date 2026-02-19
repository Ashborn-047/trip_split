/**
 * TripSplit - Currency Utility (Hardened)
 *
 * Provides safe integer-based arithmetic for monetary values.
 * All calculations are performed in cents (integer) to avoid floating-point errors.
 *
 * Design Decisions:
 * 1. Default currency is assumed to be decimal with 2 places (cents).
 * 2. Inputs are numbers (floats) from the DB/UI, converted to cents immediately.
 * 3. Outputs are converted back to numbers (floats) for storage/display.
 */

// Multiplier for 2 decimal places (100)
const PRECISION = 100;

/**
 * Converts a float amount to integer cents.
 * Uses Math.round to handle floating point inaccuracies (e.g. 1.0000001).
 */
export function toCents(amount: number): number {
    return Math.round(amount * PRECISION);
}

/**
 * Converts integer cents back to a float amount.
 */
export function fromCents(cents: number): number {
    return cents / PRECISION;
}

/**
 * Safely adds two float amounts.
 */
export function safeAdd(a: number, b: number): number {
    return fromCents(toCents(a) + toCents(b));
}

/**
 * Safely subtracts two float amounts.
 */
export function safeSubtract(a: number, b: number): number {
    return fromCents(toCents(a) - toCents(b));
}

/**
 * Safely multiplies a float amount by a scalar.
 */
export function safeMultiply(amount: number, factor: number): number {
    return fromCents(Math.round(toCents(amount) * factor));
}

/**
 * Distributes an amount equally among N participants.
 * Handles remainders by distributing pennies to the first few participants.
 *
 * @param totalAmount - Total amount to split (float)
 * @param count - Number of participants
 * @returns Array of amounts (floats) summing exactly to totalAmount
 */
export function distributeAmount(totalAmount: number, count: number): number[] {
    if (count <= 0) return [];

    const totalCents = toCents(totalAmount);
    const baseShare = Math.floor(totalCents / count);
    const remainder = totalCents % count;

    const shares: number[] = [];
    for (let i = 0; i < count; i++) {
        // Distribute remainder one cent at a time
        const shareCents = baseShare + (i < remainder ? 1 : 0);
        shares.push(fromCents(shareCents));
    }

    return shares;
}

/**
 * Validates if a list of split amounts sums up to the total amount.
 * Allows for a tiny epsilon difference due to floating point inputs, but strictly checks cents.
 */
export function validateTotal(total: number, splits: number[]): boolean {
    const totalCents = toCents(total);
    const splitsCents = splits.reduce((sum, s) => sum + toCents(s), 0);
    return totalCents === splitsCents;
}
