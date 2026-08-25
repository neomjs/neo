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

import {test, expect}             from '@playwright/test';
import Neo                        from '../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../src/core/_export.mjs';
import {resetMemoryCoreLifecycle} from './util.mjs';

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

    test.beforeEach(() => {
        // Never INHERIT a live interval or pending retry from a previous spec file in this worker.
        //
        // The `afterEach` below defends every LATER spec and never this one: an earlier file whose
        // retry chain has not exhausted leaves `graphProjectionRetryTimers.size >= 1`, and the
        // `expect(size).toBe(1)` arm below then reads 2 — passing in isolation every time, which is
        // what makes it read as flake rather than as leakage.
        //
        // The durable lesson is the asymmetry: a teardown-only convention looks like hygiene while
        // protecting everyone except the file that wrote it.
        MemoryService._clearGraphProjectionTimers();
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

    test('resetMemoryCoreLifecycle cancels pending projection timers, so a spec file cannot end with queued work', async () => {
        const originalProject = MemoryService._projectMemoryToGraph;

        // Hang the projection so the scheduled timer stays pending + observable, exactly as the
        // sibling arm above does.
        MemoryService._projectMemoryToGraph = () => new Promise(() => {});

        try {
            MemoryService._scheduleMemoryGraphProjection({memoryId: 'reset-seam-test'}, 2);
            expect(MemoryService.graphProjectionRetryTimers.size).toBe(1);

            // The seam, not the primitive. `_clearGraphProjectionTimers` is already proven above;
            // what this pins is that the shared spec helper REACHES it — the wiring a cross-file
            // leak depends on, and the line whose silent removal would restore the leak while every
            // other arm here stayed green.
            await resetMemoryCoreLifecycle();

            expect(MemoryService.graphProjectionRetryTimers.size).toBe(0);
        } finally {
            MemoryService._projectMemoryToGraph = originalProject;
        }
    });
});
