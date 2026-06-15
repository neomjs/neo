import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'MemoryServiceLifecycleTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Lifecycle coverage for the MemoryService graph-projection drain loop + retry timers.
 *
 * The drain loop is a perpetual background process; it must (a) NOT start while unitTestMode keeps
 * the singleton hermetic, (b) start when a real host reaches the ready state, and (c) be fully
 * torn down — interval + in-flight retry timers — so nothing fires against a destroyed singleton.
 * These tests exercise the teardown via the `_clearGraphProjectionTimers` seam instead of calling
 * the real `destroy()`, which would tear down the shared singleton for every other spec.
 */
test.describe('Neo.ai.services.memory-core.MemoryService — graph-projection lifecycle (#13313)', () => {
    let MemoryService;

    test.beforeAll(async () => {
        MemoryService = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
    });

    test.afterEach(() => {
        // Never leave a live interval or pending retry behind for the next spec.
        MemoryService._clearGraphProjectionTimers();
    });

    test('afterSetIsReady does NOT start the drain loop under unitTestMode', () => {
        expect(Neo.config.unitTestMode).toBe(true);

        MemoryService._clearGraphProjectionTimers();
        // Reaching ready must not spin up a live drain interval while unitTestMode is on — this is
        // the hermetic-singleton-import guarantee (no real-WAL-dir startup drain either).
        MemoryService.afterSetIsReady(true, false);

        expect(MemoryService.graphProjectionDrainTimer == null).toBe(true);
    });

    test('_startGraphProjectionDrainLoop sets an interval that _clearGraphProjectionTimers tears down', () => {
        const originalDrain = MemoryService.drainPendingGraphProjections;

        // Keep the startup drain + interval callback off the real WAL dir.
        MemoryService.drainPendingGraphProjections = async () => ({pending: 0, projected: 0, failed: 0});

        try {
            MemoryService._startGraphProjectionDrainLoop();
            expect(MemoryService.graphProjectionDrainTimer != null).toBe(true);

            // Idempotent: a second call must not replace the live timer.
            const firstTimer = MemoryService.graphProjectionDrainTimer;
            MemoryService._startGraphProjectionDrainLoop();
            expect(MemoryService.graphProjectionDrainTimer).toBe(firstTimer);

            MemoryService._clearGraphProjectionTimers();
            expect(MemoryService.graphProjectionDrainTimer == null).toBe(true);
        } finally {
            MemoryService.drainPendingGraphProjections = originalDrain;
        }
    });

    test('_scheduleMemoryGraphProjection tracks an unref-d retry timer that teardown cancels', () => {
        const originalProject = MemoryService._projectMemoryToGraph;

        // Hang the projection so the scheduled timer stays pending + observable.
        MemoryService._projectMemoryToGraph = () => new Promise(() => {});

        try {
            // attempt 2 → a real (250ms) backoff delay, so the timer is still pending on inspection.
            MemoryService._scheduleMemoryGraphProjection({memoryId: 'lifecycle-test'}, 2);

            expect(MemoryService.graphProjectionRetryTimers.size).toBe(1);

            const [timer] = [...MemoryService.graphProjectionRetryTimers];
            // unref'd so a one-shot CLI add_memory exits without waiting on the backoff chain.
            expect(typeof timer.hasRef !== 'function' || timer.hasRef() === false).toBe(true);

            MemoryService._clearGraphProjectionTimers();
            expect(MemoryService.graphProjectionRetryTimers.size).toBe(0);
        } finally {
            MemoryService._projectMemoryToGraph = originalProject;
        }
    });
});
