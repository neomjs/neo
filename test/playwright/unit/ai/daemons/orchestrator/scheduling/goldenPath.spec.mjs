import {test, expect} from '@playwright/test';
import {
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/goldenPath.mjs';

test.describe('orchestrator/scheduling/goldenPath (#11860 / Epic #11831)', () => {
    test('returns a periodic-golden-path trigger when the interval has elapsed', () => {
        expect(getDueTask({
            state               : {lastRunAt: 0},
            now                 : 1800000,
            goldenPathIntervalMs: 1800000
        })).toEqual({
            taskName: 'golden-path',
            source  : 'periodic-golden-path',
            reason  : 'periodic-golden-path:1800000'
        });
    });

    test('returns null when the interval has not yet elapsed', () => {
        expect(getDueTask({
            state               : {lastRunAt: 0},
            now                 : 1799999,
            goldenPathIntervalMs: 1800000
        })).toBeNull();
    });

    test('treats intervalMs <= 0 as disabled', () => {
        expect(getDueTask({state: {lastRunAt: 0}, now: 999999999, goldenPathIntervalMs: 0})).toBeNull();
        expect(getDueTask({state: {lastRunAt: 0}, now: 999999999, goldenPathIntervalMs: -1})).toBeNull();
    });

    test('handles missing state gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({state: undefined, now: 1800000, goldenPathIntervalMs: 1800000})).toEqual({
            taskName: 'golden-path',
            source  : 'periodic-golden-path',
            reason  : 'periodic-golden-path:1800000'
        });
    });
});
