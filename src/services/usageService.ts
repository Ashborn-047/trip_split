/**
 * TripSplit - Usage Tracking Service (Freemium Model)
 *
 * Tracks AI receipt scanning usage in localStorage.
 * Limit: 5 scans per month.
 */

const STORAGE_KEY = 'ai_usage';
export const FREE_LIMIT = 5;

interface UsageData {
    count: number;
    month: string; // YYYY-MM
}

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

/**
 * Gets current usage stats. Resets if month has changed.
 */
export function getUsage(): UsageData {
    const raw = localStorage.getItem(STORAGE_KEY);
    const currentMonth = getCurrentMonth();

    if (!raw) {
        return { count: 0, month: currentMonth };
    }

    try {
        const data: UsageData = JSON.parse(raw);
        if (data.month !== currentMonth) {
            // New month, reset
            return { count: 0, month: currentMonth };
        }
        return data;
    } catch {
        return { count: 0, month: currentMonth };
    }
}

/**
 * Checks if user has remaining free scans.
 */
export function canScanReceipt(): boolean {
    const usage = getUsage();
    return usage.count < FREE_LIMIT;
}

/**
 * Increments the usage counter.
 */
export function incrementUsage(): void {
    const usage = getUsage();
    usage.count++;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

/**
 * Returns number of remaining free scans.
 */
export function getRemainingScans(): number {
    const usage = getUsage();
    return Math.max(0, FREE_LIMIT - usage.count);
}
