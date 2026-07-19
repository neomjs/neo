import {setup} from '../../setup.mjs';

const appName = 'ReInitAsyncTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Verifies `Neo.core.Base#reInitAsync()` — the `unitTestMode`-only singleton re-init seam that
 * replaces the private `_initPromise = null; await initAsync()` reach-in. It is a small STATE MACHINE, not
 * an unrestricted second `initAsync()`: it admits only a live singleton, coalesces concurrent re-inits
 * (single-flight — the async leg never runs twice at once), settles the reset `ready()` promise on both
 * success AND `initAsync()` failure (no stranded observers), and re-runs ONLY the async-init leg (not
 * `construct()`). Outside `unitTestMode` it throws — the mechanical replacement for the deleted
 * `_initPromise` guards.
 */
test.describe('Neo.core.Base#reInitAsync (singleton re-init seam, #15034)', () => {
    class ReInitSingleton extends core.Base {
        static config = {
            className: 'Neo.Test.ReInitSingleton',
            singleton: true
        }

        initCount = 0
        failNext  = false

        async initAsync() {
            await super.initAsync();
            if (this.failNext) {
                this.failNext = false;
                throw new Error('reInit-probe-failure')
            }
            this.initCount++
        }
    }
    const singleton = Neo.setupClass(ReInitSingleton);

    test('re-runs ONLY the async-init leg and resets the ready gate (true singleton)', async () => {
        await singleton.ready();
        const before = singleton.initCount;
        expect(singleton.isReady).toBe(true);

        const p = singleton.reInitAsync();
        expect(singleton.isReady).toBe(false);   // the gate reset synchronously (before the first await)

        await p;
        expect(singleton.initCount).toBe(before + 1);   // the async-init leg re-ran exactly once
        expect(singleton.isReady).toBe(true)            // the gate re-resolved
    });

    test('single-flight: concurrent reInitAsync calls coalesce — the async leg runs once', async () => {
        await singleton.ready();
        const before = singleton.initCount;

        // both calls resolve to the same in-flight re-init; each async wrapper differs, so the proof of
        // coalescing is that the async-init leg ran ONCE (initCount + 1), not twice.
        await Promise.all([singleton.reInitAsync(), singleton.reInitAsync()]);

        expect(singleton.initCount).toBe(before + 1)   // ONE re-init, not two concurrent async legs
    });

    test('failure: a rejecting initAsync settles ready() with the rejection — observers are not stranded', async () => {
        await singleton.ready();

        singleton.failNext = true;
        await expect(singleton.reInitAsync()).rejects.toThrow(/reInit-probe-failure/);
        // the reset ready() promise REJECTS (it does not hang) — a stranded observer would time out here
        await expect(singleton.ready()).rejects.toThrow(/reInit-probe-failure/);
        expect(singleton.isReady).toBe(false);

        // recover for isolation: a clean re-init settles ready() again
        await singleton.reInitAsync();
        expect(singleton.isReady).toBe(true)
    });

    test('failure without a ready() observer stays process-clean (no unhandledRejection)', async () => {
        await singleton.ready();

        const unhandled   = [],
              onUnhandled = reason => unhandled.push(reason);

        process.on('unhandledRejection', onUnhandled);
        try {
            singleton.failNext = true;
            // consume ONLY reInitAsync() — deliberately NO `ready()` observer for the rejected gate
            await singleton.reInitAsync().catch(() => {});
            // cross an event-loop turn so any leaked rejection would have surfaced
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(unhandled).toHaveLength(0)   // the reset #readyPromise rejection was internally observed
        } finally {
            process.off('unhandledRejection', onUnhandled)
        }

        await singleton.reInitAsync();   // recover for isolation
        expect(singleton.isReady).toBe(true)
    });

    test('admission: rejects a non-singleton instance, and (fenced) outside unitTestMode', async () => {
        class ReInitOrdinary extends core.Base {
            static config = {className: 'Neo.Test.ReInitOrdinary'}
        }
        Neo.setupClass(ReInitOrdinary);

        const instance = Neo.create(ReInitOrdinary);
        await instance.ready();
        await expect(instance.reInitAsync()).rejects.toThrow(/singleton-only/);   // ordinary instance refused
        instance.destroy();

        // the unitTestMode fence — the mechanical replacement for the deleted _initPromise guards
        const original = Neo.config.unitTestMode;

        Neo.config.unitTestMode = false;
        try {
            await expect(singleton.reInitAsync()).rejects.toThrow(/unitTestMode-only/)
        } finally {
            Neo.config.unitTestMode = original
        }
    })
});
