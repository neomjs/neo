import {test, expect}                                              from '@playwright/test';
import Neo                                                         from '../../../../../../../src/Neo.mjs';
import * as core                                                   from '../../../../../../../src/core/_export.mjs';
import {createThrottleShedHealOperation, DEFAULT_SHED_DURATION_MS} from '../../../../../../../ai/services/memory-core/helpers/throttleShedHeal.mjs';

test.describe('throttleShedHeal — createThrottleShedHealOperation (#14284)', () => {
    test('opens a shed-window via the injected setShedWindow + returns shed detail (default duration)', async () => {
        const calls = [],
              heal  = createThrottleShedHealOperation({
                  setShedWindow: (durationMs, now) => { calls.push({durationMs, now}); return now + durationMs; }
              });

        const result = await heal({collection: 'mc-server', evidence: {reasonCode: 'contention'}, now: 1000});

        expect(calls).toEqual([{durationMs: DEFAULT_SHED_DURATION_MS, now: 1000}]);
        expect(result).toMatchObject({
            status: 'shed',
            detail: {collection: 'mc-server', shedDurationMs: DEFAULT_SHED_DURATION_MS, shedUntil: 1000 + DEFAULT_SHED_DURATION_MS, reason: 'contention'}
        });
    });

    test('honors an explicit evidence.shedDurationMs over the default', async () => {
        let   captured = null;
        const heal     = createThrottleShedHealOperation({setShedWindow: (durationMs, now) => { captured = durationMs; return now + durationMs; }});

        const result = await heal({collection: 'c1', evidence: {shedDurationMs: 12345}, now: 0});

        expect(captured).toBe(12345);
        expect(result.detail.shedDurationMs).toBe(12345);
    });

    test('falls back to the default for a non-positive / non-finite evidence duration', async () => {
        let   captured = null;
        const heal     = createThrottleShedHealOperation({setShedWindow: durationMs => { captured = durationMs; return durationMs; }});

        await heal({collection: 'c1', evidence: {shedDurationMs: 0}, now: 0});

        expect(captured).toBe(DEFAULT_SHED_DURATION_MS);
    });

    test('requires a setShedWindow function (fail fast on a mis-wired op)', () => {
        expect(() => createThrottleShedHealOperation({})).toThrow(/setShedWindow function is required/);
    });
});
