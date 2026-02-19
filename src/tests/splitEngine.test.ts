/**
 * TripSplit - SplitEngine Tests
 *
 * Verifies the correctness of expense splitting logic.
 * Focuses on:
 * 1. Exact integer arithmetic (no penny drift).
 * 2. Correct handling of remainders.
 * 3. Subset splitting (the "Chaotic Breakfast" scenario).
 */

import { describe, it, expect } from 'vitest';
import { calculateSplits } from '../utils/splitEngine';

describe('SplitEngine', () => {
    // ==========================================
    // Equal Splits
    // ==========================================
    describe('Equal Splits', () => {
        it('splits amount equally among all members', () => {
            const result = calculateSplits({
                totalAmount: 100,
                payerId: 'u1',
                splitType: 'equal',
                involvedMemberIds: ['u1', 'u2', 'u3', 'u4']
            });

            expect(result.splits).toHaveLength(4);
            expect(result.splits[0].amount).toBe(25);
            expect(result.splits[3].amount).toBe(25);
            expect(result.remainder).toBe(0);
        });

        it('handles remainders correctly (100 / 3)', () => {
            const result = calculateSplits({
                totalAmount: 100,
                payerId: 'u1',
                splitType: 'equal',
                involvedMemberIds: ['u1', 'u2', 'u3']
            });

            // 33.33 * 3 = 99.99, need 0.01 more
            // Expect distribution: 33.34, 33.33, 33.33 (or similar)
            const amounts = result.splits.map(s => s.amount);
            const sum = amounts.reduce((a, b) => a + b, 0);

            expect(sum).toBe(100);
            expect(amounts).toContain(33.34);
            expect(amounts.filter(a => a === 33.33).length).toBe(2);
        });

        it('handles chaotic subset scenario (3 of 5 friends)', () => {
            // User scenario: 5 friends total, but only 3 split this expense
            const result = calculateSplits({
                totalAmount: 60,
                payerId: 'u1',
                splitType: 'equal',
                involvedMemberIds: ['u1', 'u2', 'u3'] // u4, u5 excluded
            });

            expect(result.splits).toHaveLength(3);
            result.splits.forEach(s => {
                expect(s.amount).toBe(20);
                expect(['u1', 'u2', 'u3']).toContain(s.member_id);
            });

            // Implicit check: u4 and u5 are not in the result
            const memberIds = result.splits.map(s => s.member_id);
            expect(memberIds).not.toContain('u4');
            expect(memberIds).not.toContain('u5');
        });
    });

    // ==========================================
    // Share Splits
    // ==========================================
    describe('Share Splits', () => {
        it('splits based on shares (1:2:1)', () => {
            const result = calculateSplits({
                totalAmount: 100,
                payerId: 'u1',
                splitType: 'shares',
                involvedMemberIds: ['u1', 'u2', 'u3'], // Ignored for shares/custom? Check implementation
                customSplits: [
                    { memberId: 'u1', shares: 1 },
                    { memberId: 'u2', shares: 2 },
                    { memberId: 'u3', shares: 1 }
                ]
            });

            // Total shares = 4
            // u1: 25, u2: 50, u3: 25
            const u1 = result.splits.find(s => s.member_id === 'u1');
            const u2 = result.splits.find(s => s.member_id === 'u2');
            const u3 = result.splits.find(s => s.member_id === 'u3');

            expect(u1?.amount).toBe(25);
            expect(u2?.amount).toBe(50);
            expect(u3?.amount).toBe(25);
        });

        it('handles complex shares with remainder', () => {
            // Total 100, Shares: 1, 1, 1 (Same as equal 100/3)
            const result = calculateSplits({
                totalAmount: 100,
                payerId: 'u1',
                splitType: 'shares',
                involvedMemberIds: ['u1', 'u2', 'u3'],
                customSplits: [
                    { memberId: 'u1', shares: 1 },
                    { memberId: 'u2', shares: 1 },
                    { memberId: 'u3', shares: 1 }
                ]
            });

            const sum = result.splits.reduce((acc, s) => acc + s.amount, 0);
            expect(sum).toBe(100);
            expect(result.splits.some(s => s.amount === 33.34)).toBe(true);
        });
    });

    // ==========================================
    // Custom Splits
    // ==========================================
    describe('Custom Splits', () => {
        it('validates correct custom splits', () => {
            const result = calculateSplits({
                totalAmount: 100,
                payerId: 'u1',
                splitType: 'custom',
                involvedMemberIds: ['u1', 'u2'],
                customSplits: [
                    { memberId: 'u1', amount: 40 },
                    { memberId: 'u2', amount: 60 }
                ]
            });

            expect(result.splits).toHaveLength(2);
            expect(result.splits.find(s => s.member_id === 'u1')?.amount).toBe(40);
        });

        it('throws error on mismatching total', () => {
            expect(() => calculateSplits({
                totalAmount: 100,
                payerId: 'u1',
                splitType: 'custom',
                involvedMemberIds: ['u1', 'u2'],
                customSplits: [
                    { memberId: 'u1', amount: 40 },
                    { memberId: 'u2', amount: 50 } // Sum = 90
                ]
            })).toThrow(/do not equal total amount/);
        });
    });

    // ==========================================
    // Edge Cases
    // ==========================================
    describe('Edge Cases', () => {
        it('throws on zero total amount', () => {
            expect(() => calculateSplits({
                totalAmount: 0,
                payerId: 'u1',
                splitType: 'equal',
                involvedMemberIds: ['u1']
            })).toThrow(/greater than zero/);
        });

        it('throws on no involved members', () => {
            expect(() => calculateSplits({
                totalAmount: 100,
                payerId: 'u1',
                splitType: 'equal',
                involvedMemberIds: []
            })).toThrow(/At least one member/);
        });
    });
});
