import {test, expect}        from '@playwright/test';
import {capSessionsForSweep} from '../../../../../../ai/services/memory-core/capSessionsForSweep.mjs';

/**
 * Direct coverage for the pure per-sweep cap that bounds how many sessions one summary child drains
 * before releasing the heavy-maintenance lease. Pure — no I/O, no aiConfig — so it tests in isolation.
 */
test.describe('ai/services/memory-core/capSessionsForSweep', () => {
    const sessions = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];

    test('caps to the first N when maxPerSweep is a positive integer', () => {
        expect(capSessionsForSweep(sessions, 3)).toEqual(['s1', 's2', 's3']);
        expect(capSessionsForSweep(sessions, 1)).toEqual(['s1']);
    });

    test('passes through unchanged when the cap exceeds the list length', () => {
        expect(capSessionsForSweep(sessions, 100)).toEqual(sessions);
    });

    test('passes through (no bound) when the cap is unset / zero / negative / non-integer', () => {
        // The same passthrough ref is returned — confirms there is no defensive copy on the no-bound path.
        expect(capSessionsForSweep(sessions, undefined)).toBe(sessions);
        expect(capSessionsForSweep(sessions, null)).toBe(sessions);
        expect(capSessionsForSweep(sessions, 0)).toBe(sessions);
        expect(capSessionsForSweep(sessions, -1)).toBe(sessions);
        expect(capSessionsForSweep(sessions, 2.5)).toBe(sessions);
        expect(capSessionsForSweep(sessions, '3')).toBe(sessions);
    });

    test('does not mutate the input list when capping', () => {
        const input = ['a', 'b', 'c'];
        capSessionsForSweep(input, 1);
        expect(input).toEqual(['a', 'b', 'c']);
    });

    test('handles an empty list', () => {
        expect(capSessionsForSweep([], 5)).toEqual([]);
    });
});
