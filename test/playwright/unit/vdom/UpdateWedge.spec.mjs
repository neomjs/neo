import {setup} from '../../setup.mjs';

const appName = 'UpdateWedgeTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false, // Required: Neo.vdom.Helper runs locally and is stubbable
        logVdomUpdateCollisions: false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import VDomUpdate     from '../../../../src/manager/VDomUpdate.mjs';

class WedgeChild extends Component {
    static config = {
        className: 'Test.WedgeChild',
        ntype    : 'test-wedge-child',
        _vdom    : {tag: 'div', cls: ['wedge-child']}
    }
}
WedgeChild = Neo.setupClass(WedgeChild);

class WedgeContainer extends Container {
    static config = {
        className: 'Test.WedgeContainer',
        items    : []
    }
}
WedgeContainer = Neo.setupClass(WedgeContainer);

/**
 * @summary Regression net for the permanent in-flight vdom update wedge.
 *
 * Convicted live: a delta that threw inside the Main thread's `processQueue` dropped its reply,
 * leaving every component awaiting that batch with `isVdomUpdating: true` FOREVER — its own
 * updates gated off, ancestor updates yielding to it, and the worker-side vnode lying about
 * applied state (self-heal impossible: diffs against the lie are empty). The failure was fully
 * silent for ~25 minutes of a production session.
 *
 * The fix contract pinned here:
 * 1. A FAILED update must SETTLE (reject), never hang — and must release all in-flight state.
 * 2. A failed update must NOT adopt a vnode the DOM never received (the vnode stays truthful,
 *    so the next cycle re-diffs and self-heals).
 * 3. `initVnode` failures release in-flight state too (the same leak, render-path flavor).
 * 4. The watchdog screams about any in-flight update that outlives its threshold — wedges can
 *    never be silent again, whatever their mechanism.
 */
test.describe('VdomLifecycle update wedge (#12946)', () => {
    let testIdCounter = 0;
    const getUniqueId = (prefix) => `${prefix}-${Date.now()}-${testIdCounter++}`;
    let createdComponentIds = [];

    const originalUpdateBatch = VdomHelper.updateBatch;
    const originalCreate      = VdomHelper.create;

    test.afterEach(() => {
        VdomHelper.updateBatch = originalUpdateBatch;
        VdomHelper.create      = originalCreate;

        createdComponentIds.forEach(id => {
            Neo.getComponent(id)?.destroy();
        });
        createdComponentIds = [];
    });

    test('a rejected update batch settles, releases in-flight state and does NOT adopt a vnode', async () => {
        Neo.applyDeltas = async () => {};

        const containerId = getUniqueId('wedge-container');
        const childId     = getUniqueId('wedge-child');
        createdComponentIds.push(containerId);

        const container = Neo.create(WedgeContainer, {
            appName,
            id   : containerId,
            items: [{module: WedgeChild, id: childId, text: 'pristine'}]
        });

        await container.initVnode(true);
        container.mounted = true;

        const child = container.items[0];
        await container.promiseUpdate();

        const vnodeBefore = child.vnode;

        // The apply boundary fails: pre-fix, this hung forever (the wedge). Post-fix it rejects.
        // The content mutation settles first so the promiseUpdate below INITIATES its own cycle —
        // a promise queued onto someone else's failing flight is a separate (documented) gap.
        VdomHelper.updateBatch = () => Promise.reject({data: {error: 'test-injected apply failure'}});

        child.text = 'lost-to-the-wedge';
        await new Promise(resolve => setTimeout(resolve, 50));
        await expect(child.promiseUpdate()).rejects.toBeTruthy();

        // The in-flight state is fully released — no permanent wedge, no poisoned registry
        expect(child.isVdomUpdating).toBe(false);
        expect(VDomUpdate.inFlightUpdateMap.has(child.id)).toBe(false);

        // The vnode was NOT adopted: it still holds the last DOM-confirmed truth, so the next
        // diff re-sends the lost content instead of producing the empty-diff self-heal trap
        expect(child.vnode).toBe(vnodeBefore);

        // Self-heal: with the boundary healthy again, the next organic cycle delivers the content.
        // (Deliberate contract: a rejected update does NOT auto-retry — a deterministic failure
        // would hot-loop. The error is loud; the next triggered update re-diffs from the truthful
        // vnode.) The re-update may merge into the parent's cycle, so we drive the parent too and
        // assert CONTENT truth rather than reference identity.
        VdomHelper.updateBatch = originalUpdateBatch;

        child.text = 'healed';
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(child.isVdomUpdating).toBe(false);
        expect(child.vnode.textContent ?? child.vnode.childNodes?.[0]?.textContent).toBe('healed');
    });

    test('REGRESSION: initVnode failure releases the flag and the in-flight registry entry', async () => {
        const containerId = getUniqueId('wedge-container');
        createdComponentIds.push(containerId);

        const container = Neo.create(WedgeContainer, {
            appName,
            id   : containerId,
            items: [{module: WedgeChild, id: getUniqueId('wedge-child')}]
        });

        VdomHelper.create = () => Promise.reject(new Error('test-injected create failure'));

        await expect(container.initVnode(true)).rejects.toThrow('test-injected create failure');

        // Pre-fix: both leaked TRUE/registered forever — the component could never update again,
        // and every ancestor update yielded to the ghost in-flight entry
        expect(container.isVdomUpdating).toBe(false);
        expect(VDomUpdate.inFlightUpdateMap.has(container.id)).toBe(false);
    });

    test('the wedge watchdog screams about an in-flight update that never settles', async () => {
        const originalThreshold = VDomUpdate.watchdogThreshold;
        const originalError     = console.error;
        const errors            = [];

        console.error = (...args) => { errors.push(args.join(' ')) };
        VDomUpdate.watchdogThreshold = 40;

        try {
            // A registration that never unregisters = the wedge signature
            VDomUpdate.registerInFlightUpdate('wedged-component-x', 1);
            await new Promise(resolve => setTimeout(resolve, 120));

            expect(errors.some(e => e.includes('wedged-component-x') && e.includes('12946'))).toBe(true);

            // A healthy round-trip stays silent: unregister disarms the timer
            errors.length = 0;
            VDomUpdate.registerInFlightUpdate('healthy-component-y', 1);
            VDomUpdate.unregisterInFlightUpdate('healthy-component-y');
            await new Promise(resolve => setTimeout(resolve, 120));

            expect(errors.length).toBe(0);
        } finally {
            VDomUpdate.unregisterInFlightUpdate('wedged-component-x');
            VDomUpdate.watchdogThreshold = originalThreshold;
            console.error = originalError;
        }
    });
});
