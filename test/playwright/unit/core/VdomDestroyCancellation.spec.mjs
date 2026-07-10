import {setup} from '../../setup.mjs';

const appName = 'CoreVdomDestroyCancellationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
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

        let armed      = null,
            deltaCalls = 0,
            parent, child;

        VdomHelper.updateBatch = function(data) {
            return armed ? armed.promise : realUpdateBatch.call(this, data)
        };
        Neo.applyDeltas = function(...args) {
            deltaCalls++;
            return realApplyDeltas?.apply(this, args)
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

            // Resolve the STALE success payload after destruction: nothing may apply.
            deltaCalls = 0;
            resolveStale({
                deltas: [{action: 'updateVtext', id: 'vdc-child', value: 'stale'}],
                vnodes: {'vdc-child': {id: 'vdc-child', nodeName: 'div'}}
            });
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(deltaCalls, 'a stale success payload from a destroyed flight must apply ZERO deltas').toBe(0)
        } finally {
            VdomHelper.updateBatch = realUpdateBatch;
            Neo.applyDeltas        = realApplyDeltas;
            armed                  = null;
            parent?.destroy?.()
        }
    });
});
