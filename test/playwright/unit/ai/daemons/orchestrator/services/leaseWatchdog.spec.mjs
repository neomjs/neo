import {test, expect}      from '@playwright/test';
import {isHungLeaseHolder} from '../../../../../../../ai/daemons/orchestrator/services/leaseWatchdog.mjs';

/**
 * Coverage for the pure hung-heavy-lease watchdog decision (sub of the orchestrator heavy-maintenance
 * epic). Catches the alive + within-TTL but sustained-idle holder the pid/TTL stale-check misses. The
 * sustained-run semantics + the fail-SAFE-on-bad-data contract are pinned here.
 */
test.describe('ai/daemons/orchestrator/services/leaseWatchdog — isHungLeaseHolder', () => {
    test('a sustained trailing-idle run → hung (true)', () => {
        expect(isHungLeaseHolder({cpuPercentSamples: [42, 0, 0.2, 0.1]})).toBe(true);
    });

    test('an active sample anywhere in the trailing window → not hung (false)', () => {
        expect(isHungLeaseHolder({cpuPercentSamples: [0, 0, 35]})).toBe(false);  // newest active
        expect(isHungLeaseHolder({cpuPercentSamples: [0, 35, 0]})).toBe(false);  // active mid-window
    });

    test('too few samples → false (cannot conclude a sustained hang)', () => {
        expect(isHungLeaseHolder({cpuPercentSamples: [0, 0]})).toBe(false);  // < minConsecutiveIdle (3)
    });

    test('boundary: a sample exactly at the threshold counts as idle', () => {
        expect(isHungLeaseHolder({cpuPercentSamples: [1, 1, 1], idleThresholdPct: 1})).toBe(true);
        expect(isHungLeaseHolder({cpuPercentSamples: [1.1, 1, 1], idleThresholdPct: 1})).toBe(false); // 1.1 > 1
    });

    test('respects a custom minConsecutiveIdle window', () => {
        expect(isHungLeaseHolder({cpuPercentSamples: [0, 0], minConsecutiveIdle: 2})).toBe(true);
        expect(isHungLeaseHolder({cpuPercentSamples: [5, 0], minConsecutiveIdle: 2})).toBe(false);
    });

    test('fail-SAFE on malformed / insufficient input (never force-release on bad data)', () => {
        expect(isHungLeaseHolder()).toBe(false);                                          // no args
        expect(isHungLeaseHolder({cpuPercentSamples: 'nope'})).toBe(false);               // non-array
        expect(isHungLeaseHolder({cpuPercentSamples: []})).toBe(false);                   // empty
        expect(isHungLeaseHolder({cpuPercentSamples: [0, 0, NaN]})).toBe(false);          // non-finite → not idle
        expect(isHungLeaseHolder({cpuPercentSamples: [0, 0, 0], minConsecutiveIdle: 0})).toBe(false); // bad window
    });
});
