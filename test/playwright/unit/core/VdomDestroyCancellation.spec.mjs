import {setup} from '../../setup.mjs';

const appName = 'CoreVdomDestroyCancellationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        // Load-bearing: `VdomLifecycle` applies a flight's deltas inside
        // `if (!Neo.config.useVdomWorker && …)`. At the harness default of `true` that call is
        // unreachable and the zero-deltas assertion below cannot fail for the reason it names.
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Component        from '../../../../src/component/Base.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import Container        from '../../../../src/container/Base.mjs';
import VDomUpdate       from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper       from '../../../../src/vdom/Helper.mjs';

/**
 * The destruction-as-flight-cancellation-boundary pin: start a flight, destroy the initiator,
 * then resolve the stale success payload — the public promise must already have rejected with
 * the house destroy sentinel, ZERO deltas may apply from the stale payload, no in-flight /
 * callback / post-update residue may remain, and an ancestor that yielded to the flight must
 * restart its own update exactly once.
 */
test.describe('VdomLifecycle destroy cancellation boundary', () => {
    test('flight -> destroy -> stale resolve: reject with sentinel, zero deltas, no residue, ancestor restarts once', async () => {
        const realUpdateBatch = VdomHelper.updateBatch;
        const realApplyDeltas = Neo.applyDeltas;

        let armed = null,
            parent, child;

        /**
         * Payloads, not a call count: `Neo.applyDeltas` is module-global and a worker runs spec
         * files in one process, so a count cannot distinguish this flight's deltas from anyone
         * else's. Recorded so a failure names the delta it caught.
         * @type {Object[]}
         */
        const applied = [];

        /**
         * The batches served the armed promise, by the ids they carry. Only the child's own batch
         * may be served: `VdomLifecycle`'s guard gates on the flight INITIATOR, so a live joiner
         * would legitimately apply a destroyed peer's payload. Asserted, so an ancestor-timing
         * change trips an arm rather than becoming the cause.
         * @type {String[]}
         */
        const armedJoiners = [];

        VdomHelper.updateBatch = function(data) {
            const ids = Object.keys(data?.updates || {});

            if (armed && ids.includes('vdc-child')) {
                armedJoiners.push(ids.join('+'));
                return armed.promise
            }

            return realUpdateBatch.call(this, data)
        };
        Neo.applyDeltas = function(windowId, deltas) {
            applied.push(...(Array.isArray(deltas) ? deltas : [deltas]));
            return realApplyDeltas?.apply(this, arguments)
        };

        try {
            VDomUpdate.mergedCallbackMap.clear();
            VDomUpdate.postUpdateQueueMap.clear();
            ComponentManager.clear();

            parent = Neo.create(Container, {
                appName,
                id   : 'vdc-parent',
                items: [{module: Component, id: 'vdc-child', html: 'gen1'}]
            });

            await parent.initVnode();

            child = Neo.getComponent('vdc-child');
            expect(child).toBeTruthy();

            // Arm the deferred and start the child's flight.
            let resolveStale;
            armed = {};
            armed.promise = new Promise(resolve => resolveStale = resolve);

            child.html = 'gen2';
            const flight = child.promiseUpdate();

            await new Promise(resolve => setTimeout(resolve, 20)); // let the flight depart (macrotask yield inside)
            expect(VDomUpdate.inFlightUpdateMap.has('vdc-child'), 'the flight must be registered in-flight').toBe(true);

            // The ancestor queues behind the in-flight child (the exact registration
            // `isChildUpdating()` performs when a mounted parent yields — headless components
            // defer before that branch, so the queue entry is armed through the manager's own
            // API; the release semantics under test are identical).
            let   parentUpdates    = 0;
            const realParentUpdate = parent.update.bind(parent);
            parent.update = () => { parentUpdates++; return realParentUpdate() };

            VDomUpdate.registerPostUpdate('vdc-child', 'vdc-parent', null);
            expect(VDomUpdate.postUpdateQueueMap.get('vdc-child'), 'the parent must queue behind the child flight').toBeTruthy();

            // DESTROY mid-flight: the cancellation boundary.
            child.destroy();

            await expect(flight, 'the public promise must reject with the house destroy sentinel').rejects.toBe(Neo.isDestroyed);

            expect(VDomUpdate.inFlightUpdateMap.has('vdc-child'), 'no in-flight residue').toBe(false);
            expect(VDomUpdate.hasPromiseCallbacks('vdc-child'),   'no callback residue (the leak)').toBe(false);
            expect(VDomUpdate.postUpdateQueueMap.get('vdc-child'),'no post-update residue').toBeFalsy();
            expect(parentUpdates, 'the waiting ancestor restarts exactly once').toBe(1);

            // Only the child's own batch may hold the armed promise. A second entry here means a
            // live component is being served a destroyed peer's payload — see `armedJoiners`.
            expect(armedJoiners, 'only the destroyed child\'s own batch received the armed promise').toEqual(['vdc-child']);

            // Resolve the STALE success payload after destruction: nothing of the child's may apply.
            applied.length = 0;
            resolveStale({
                deltas: [{action: 'updateVtext', id: 'vdc-child', value: 'stale'}],
                vnodes: {'vdc-child': {id: 'vdc-child', nodeName: 'div'}}
            });

            // In-window control: someone else's delta, applied on purpose. It must be RECORDED
            // (proving the recorder is attached, not silently detached) and NOT attributed to the
            // destroyed flight. This is the shape ambient traffic from a neighbouring spec takes.
            Neo.applyDeltas(parent.windowId, {action: 'updateVtext', id: 'vdc-unrelated', value: 'ambient'});

            await new Promise(resolve => setTimeout(resolve, 20));

            expect(applied.some(delta => delta?.id === 'vdc-unrelated'), 'the recorder must be live').toBe(true);

            const staleApplied = applied.filter(delta => delta?.id === 'vdc-child');

            expect(staleApplied, `a stale success payload from a destroyed flight must apply ZERO deltas — applied in window: ${JSON.stringify(applied)}`).toEqual([])
        } finally {
            VdomHelper.updateBatch = realUpdateBatch;
            Neo.applyDeltas        = realApplyDeltas;
            armed                  = null;
            parent?.destroy?.()
        }
    });
});
