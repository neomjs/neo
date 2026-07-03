import {test, expect} from '@playwright/test';
import {getDueTask}   from '../../../../../../../ai/daemons/orchestrator/scheduling/dataIntegritySweep.mjs';

const CHECK_MS = 60 * 60 * 1000;

test.describe('dataIntegritySweep.getDueTask — periodic data-integrity cadence projection', () => {
    test('returns a trigger when the interval has elapsed since lastRunAt', () => {
        const now = 10 * CHECK_MS,
              due = getDueTask({state: {lastRunAt: now - CHECK_MS}, now, dataIntegritySweepCheckMs: CHECK_MS});

        expect(due).toMatchObject({taskName: 'data-integrity-sweep', source: 'periodic-data-integrity-check'});
        expect(due.reason).toBe(`periodic-data-integrity-check:${CHECK_MS}`);
    });

    test('returns null before the interval elapses', () => {
        const now = 10 * CHECK_MS;

        expect(getDueTask({state: {lastRunAt: now - 1}, now, dataIntegritySweepCheckMs: CHECK_MS})).toBeNull();
    });

    test('fires on the first run (no prior state) once now >= interval', () => {
        expect(getDueTask({state: undefined, now: CHECK_MS, dataIntegritySweepCheckMs: CHECK_MS}))
            .toMatchObject({taskName: 'data-integrity-sweep'});
    });

    test('a non-positive cadence disables the lane (always null)', () => {
        expect(getDueTask({state: {lastRunAt: 0}, now: 10 * CHECK_MS, dataIntegritySweepCheckMs: 0})).toBeNull();
        expect(getDueTask({state: {lastRunAt: 0}, now: 10 * CHECK_MS, dataIntegritySweepCheckMs: -1})).toBeNull();
    });
});
