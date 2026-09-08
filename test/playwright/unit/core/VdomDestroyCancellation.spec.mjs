import {setup} from '../../setup.mjs';

const appName = 'CoreVdomDestroyCancellationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        // Load-bearing, and the reason this arm can observe anything at all. `VdomLifecycle`
        // applies a flight's deltas inside `if (!Neo.config.useVdomWorker && …)`, and the harness
        // default is `true` — so with the default the delta call is UNREACHABLE and the
        // zero-deltas assertion below cannot fail for the reason it names. It was still able to
        // fail: `Neo.applyDeltas` is module-global, so any other component's delta landing in the
        // window reddened it. A vacuous assertion that reds on ambient traffic is the worst of
        // both, and it is what made this arm an unownable intermittent.
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
         * Every delta applied while the patch is installed, not a count of calls.
         *
         * A bare counter cannot express this arm's contract. `Neo.applyDeltas` is module-global and
         * a Playwright worker runs spec files sequentially in ONE process, so an earlier file's
         * un-awaited update landing inside the window increments a process-wide count exactly like
         * the leak under test does. That arm reported `Received: 1` on CI and could not say whose
         * delta it was — which is why the intermittent stayed unactionable. Recording the payloads
         * makes a failure name its own cause on a runner nobody can attach a session to.
         * @type {Object[]}
         */
        const applied = [];

        /**
         * The batches that received the armed promise, by the ids they carry.
         *
         * The mock used to hand `armed.promise` to EVERY caller while armed. A live component
         * reaching `updateBatch` in that window would then receive the destroyed child's stale
         * payload — and `VdomLifecycle`'s guard gates on the flight INITIATOR, so a live joiner
         * passes it legitimately and applies deltas that were never its own. Serving only the
         * child's own batch removes that; asserting the joiner set means a future ancestor-timing
         * change trips an arm instead of quietly becoming the cause.
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

            // In-window control, and the reason this arm can be trusted at a count of zero: a delta
            // belonging to someone else, applied inside the same window on purpose. It must be
            // RECORDED (so the instrument is proven live rather than silently detached) and must
            // NOT be attributed to the destroyed flight. Ambient traffic from a neighbouring spec
            // file arrives exactly like this, and it is what the previous process-wide counter
            // could not tell apart from the leak.
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
