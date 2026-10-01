import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'PerformanceUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Performance    from '../../../../src/util/Performance.mjs';

/**
 * `Neo.util.Performance` is a singleton without a reset, so every test uses its
 * own key. Exact durations come from replacing `performance.now` for the body of
 * the test, following the timer-stub pattern in `util/Function.spec.mjs`.
 */
test.describe('Neo.util.Performance', () => {
    test('markStart then markEnd records the elapsed time as one sample', () => {
        const originalNow = globalThis.performance.now;
        let   now         = 1000;

        globalThis.performance.now = () => now;

        try {
            Performance.markStart('perf:one-sample');
            now = 1042;
            Performance.markEnd('perf:one-sample');

            expect(Performance.getMetrics()['perf:one-sample'].samples).toEqual([42])
        } finally {
            globalThis.performance.now = originalNow
        }
    });

    test('markEnd without a markStart records nothing', () => {
        const key = 'perf:no-start';

        Performance.markEnd(key);

        expect(Performance.getMetrics()[key]).toBeUndefined()
    });

    test('markEnd twice after one markStart records a single sample', () => {
        const originalNow = globalThis.performance.now;
        let   now         = 500;

        globalThis.performance.now = () => now;

        try {
            Performance.markStart('perf:double-end');
            now = 525;
            Performance.markEnd('perf:double-end');
            now = 900;
            Performance.markEnd('perf:double-end');

            expect(Performance.getMetrics()['perf:double-end'].samples).toEqual([25])
        } finally {
            globalThis.performance.now = originalNow
        }
    });

    test('an eleventh sample drops the oldest and keeps ten', () => {
        const originalNow = globalThis.performance.now;
        let   now         = 1000;

        globalThis.performance.now = () => now;

        try {
            for (let i = 1; i <= 11; i++) {
                Performance.markStart('perf:window');
                now += i;
                Performance.markEnd('perf:window')
            }

            expect(Performance.getMetrics()['perf:window'].samples).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        } finally {
            globalThis.performance.now = originalNow
        }
    });

    test('getAverage returns the mean of that key\'s samples', () => {
        const originalNow = globalThis.performance.now;
        let   now         = 1000;

        globalThis.performance.now = () => now;

        try {
            Performance.markStart('perf:average');
            now += 10;
            Performance.markEnd('perf:average');
            Performance.markStart('perf:average');
            now += 30;
            Performance.markEnd('perf:average');

            expect(Performance.getAverage('perf:average')).toBe(20)
        } finally {
            globalThis.performance.now = originalNow
        }
    });

    test('getAverage returns 0 for a key that was never used', () => {
        expect(Performance.getAverage('perf:never-used')).toBe(0)
    });

    test('getSma returns the same value as getAverage', () => {
        const originalNow = globalThis.performance.now;
        let   now         = 1000;

        globalThis.performance.now = () => now;

        try {
            Performance.markStart('perf:sma');
            now = 80;
            Performance.markEnd('perf:sma');

            expect(Performance.getSma('perf:sma')).toBe(Performance.getAverage('perf:sma'))
        } finally {
            globalThis.performance.now = originalNow
        }
    });

    test('getMetrics returns a copy so callers cannot mutate the singleton data', () => {
        const originalNow = globalThis.performance.now;
        let   now         = 1000;

        globalThis.performance.now = () => now;

        try {
            Performance.markStart('perf:metrics');
            now += 60;
            Performance.markEnd('perf:metrics');

            const metrics = Performance.getMetrics();

            expect(metrics['perf:metrics'].start).toBe(0);
            expect(metrics['perf:metrics'].samples).toEqual([60]);

            metrics['perf:metrics'].samples.push(999);

            expect(Performance.getMetrics()['perf:metrics'].samples).toEqual([60])
        } finally {
            globalThis.performance.now = originalNow
        }
    })
});
