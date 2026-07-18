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
 * replaces the private `_initPromise = null; await initAsync()` reach-in. It must re-run ONLY the
 * async-init leg (a subclass `initAsync` side effect re-fires), reset the ready gate so `ready()` awaits the
 * re-init, and — with the bespoke `_initPromise` guards deleted — THROW outside `unitTestMode` as the
 * mechanical production double-init fence (Ada's C1). It must NOT re-run `construct()` (Ada's C2): the same
 * instance, no re-registration.
 */
test.describe('Neo.core.Base#reInitAsync (singleton re-init seam, #15034)', () => {
    class ReInitClass extends core.Base {
        static config = {
            className: 'Neo.Test.ReInitClass'
        }

        initCount = 0

        async initAsync() {
            await super.initAsync();
            this.initCount++
        }
    }
    Neo.setupClass(ReInitClass);

    test('re-runs ONLY the async-init leg and resets the ready gate', async () => {
        const instance = Neo.create(ReInitClass);

        await instance.ready();
        expect(instance.initCount).toBe(1);   // construct's async leg ran exactly once
        expect(instance.isReady).toBe(true);

        const beforeId = instance.id,
              p        = instance.reInitAsync();

        // the gate reset ran synchronously (before the first await): isReady is back to false
        expect(instance.isReady).toBe(false);

        await p;
        expect(instance.initCount).toBe(2);    // the async-init leg re-ran
        expect(instance.isReady).toBe(true);   // the gate re-resolved
        expect(instance.id).toBe(beforeId);    // construct did NOT re-run — same instance, no re-registration

        await instance.ready();                // ready() reflects the completed re-init
        expect(instance.isReady).toBe(true);

        instance.destroy()
    });

    test('the fence: reInitAsync rejects outside unitTestMode (the deleted guards\' replacement)', async () => {
        const instance = Neo.create(ReInitClass);
        await instance.ready();

        const original = Neo.config.unitTestMode;

        Neo.config.unitTestMode = false;
        try {
            await expect(instance.reInitAsync()).rejects.toThrow(/unitTestMode-only seam/)
        } finally {
            Neo.config.unitTestMode = original
        }

        // the fence threw before any reset: the instance is untouched
        expect(instance.isReady).toBe(true);
        expect(instance.initCount).toBe(1);

        instance.destroy()
    })
});
