/**
 * Simple UUID v4 generator for mutation IDs.
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Monotonic sequence number generator.
 */
let lastSequence = Date.now();
export function getSequenceNumber() {
    const now = Date.now();
    if (now <= lastSequence) {
        lastSequence += 1;
    } else {
        lastSequence = now;
    }
    return lastSequence;
}
