import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DraggableDragZoneTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import DragZone       from '../../../../src/draggable/DragZone.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * Runs one proxy-teardown scenario against a spied `Neo.applyDeltas` and returns the recorded
 * dispatches plus the proxy id captured BEFORE teardown — the id assertions must compare against
 * an independently held value, never against the recorded payload itself. The spy is installed
 * per call and always restored: the delta surface is global, so a leaked recorder would poison
 * sibling specs.
 * @param {Function} scenario Receives the created zone; drives teardown timing.
 * @param {Object} [options]
 * @param {Function} [options.deltaResult] Maps a recorded call to the spy's returned promise —
 *     the seam for simulating the transport's terminal outcomes (a vanished destination rejects
 *     with `code: 'NEO_DEAD_PORT'`; live-window failures reject with any other reason).
 * @returns {Promise<{proxyId: String, recorded: Object[]}>}
 */
async function recordProxyRemoval(scenario, {deltaResult}={}) {
    const
        originalApplyDeltas = Neo.applyDeltas,
        recorded            = [],
        zone                = Neo.create(DragZone, {
            appName : 'DraggableDragZoneTest',
            windowId: 'test-window-1'
        });

    Neo.applyDeltas = (windowId, deltas) => {
        const call = {deltas, windowId};

        recorded.push(call);

        return deltaResult ? deltaResult(call) : Promise.resolve()
    };

    let proxyId;

    try {
        zone.dragProxy = Neo.create(Component, {appName: 'DraggableDragZoneTest'});
        proxyId        = zone.dragProxy.id;

        await scenario(zone);

        // Both teardown paths resolve within the deferral ceiling (30ms) plus microtasks;
        // one settled wait keeps the assertions race-free for the fixed AND the broken shape.
        await new Promise(resolve => setTimeout(resolve, 60))
    } finally {
        Neo.applyDeltas = originalApplyDeltas;
        !zone.isDestroyed && zone.destroy()
    }

    return {proxyId, recorded}
}

test.describe('Neo.draggable.DragZone', () => {
    test('useProxy=false keeps the gesture but skips proxy construction', async () => {
        const
            addon              = Neo.main.addon.DragDrop,
            originalSetConfigs = addon.setConfigs,
            owner              = Neo.create(Component, {
                appName: 'DraggableDragZoneTest',
                id     : 'dragzone-no-proxy-owner'
            }),
            zone               = Neo.create(DragZone, {
                appName    : 'DraggableDragZoneTest',
                dragElement: {id: owner.id},
                owner,
                useProxy   : false,
                windowId   : 'test-window-1'
            });

        let proxyCreations = 0;

        addon.setConfigs = async () => ({boundaryContainerRect: null});
        zone.createDragProxy = async () => { proxyCreations++ };

        try {
            await zone.dragStart({
                clientX   : 25,
                clientY   : 30,
                path      : [{id: owner.id, rect: {height: 40, left: 10, top: 10, width: 80}}],
                targetPath: []
            });

            expect(proxyCreations, 'the no-proxy mode must not instantiate visual drag state').toBe(0);
            expect(zone.dragProxy).toBe(null)
        } finally {
            addon.setConfigs = originalSetConfigs;
            !zone.isDestroyed && zone.destroy();
            !owner.isDestroyed && owner.destroy()
        }
    });

    test('the proxy removal delta survives a zone destroyed inside the deferral window', async () => {
        const {proxyId, recorded} = await recordProxyRemoval(zone => {
            zone.destroyDragProxy();

            // The dying-window race: the zone's owner chain is torn down before the deferred
            // dispatch fires (a closing dock vessel's un-projection lands in the same tick as
            // the drop). destroy() clears and rejects the pending timeout — the removal must
            // dispatch anyway, or the proxy DOM is orphaned in the source window.
            zone.destroy();

            expect(zone.isDestroyed).toBe(true);

            return Promise.resolve()
        });

        expect(recorded, 'exactly one removal dispatch despite the destroyed zone').toHaveLength(1);
        expect(recorded[0].windowId).toBe('test-window-1');
        expect(recorded[0].deltas).toEqual([{action: 'removeNode', id: proxyId}])
    });

    test('the undisturbed teardown dispatches exactly one deferred removal', async () => {
        const {proxyId, recorded} = await recordProxyRemoval(zone => {
            zone.destroyDragProxy();
            return Promise.resolve()
        });

        expect(recorded, 'one dispatch, no duplicates from the survival guard').toHaveLength(1);
        expect(recorded[0].deltas).toEqual([{action: 'removeNode', id: proxyId}])
    });

    test('a vanished destination settles silently — the closed-port rejection is owned, not unhandled', async () => {
        // worker.Base's closed-port branch rejects the request promise with a typed reason,
        // `code: 'NEO_DEAD_PORT'`. The detached teardown chain must observe that
        // terminal outcome silently on BOTH surfaces: an unowned rejection escapes as
        // unhandledRejection (which this runner converts into a test failure), and a
        // misclassified one would surface through console.error.
        const
            originalConsoleError = console.error,
            surfaced             = [];

        console.error = (...args) => surfaced.push(args);

        let outcome;

        try {
            outcome = await recordProxyRemoval(zone => {
                zone.destroyDragProxy();
                zone.destroy();
                return Promise.resolve()
            }, {
                deltaResult: () => Promise.reject(Object.assign(new Error('no live port for destination "main"'), {code: 'NEO_DEAD_PORT'}))
            })
        } finally {
            console.error = originalConsoleError
        }

        expect(outcome.recorded, 'the dispatch is still attempted at the vanished destination').toHaveLength(1);
        expect(surfaced, 'expected teardown must not be logged as a failure').toHaveLength(0)
    });

    test('a reasonless rejection is no longer classified as teardown — it surfaces', async () => {
        // The historical confusable: the closed-port branch used to reject with bare
        // `undefined`, and this seam treated ANY reasonless rejection as expected teardown.
        // The discrimination now keys on the typed code, so an unexplained failure surfaces
        // instead of vanishing into the teardown classification.
        const
            originalConsoleError = console.error,
            surfaced             = [];

        console.error = (...args) => surfaced.push(args);

        let outcome;

        try {
            outcome = await recordProxyRemoval(zone => {
                zone.destroyDragProxy();
                return Promise.resolve()
            }, {
                deltaResult: () => Promise.reject(undefined)
            })
        } finally {
            console.error = originalConsoleError
        }

        expect(outcome.recorded).toHaveLength(1);
        expect(surfaced, 'a reasonless rejection surfaces exactly once').toHaveLength(1)
    });

    test('a reasoned delta failure in a live window stays visible instead of being swallowed', async () => {
        const
            originalConsoleError = console.error,
            surfaced             = [];

        console.error = (...args) => surfaced.push(args);

        let outcome;

        try {
            outcome = await recordProxyRemoval(zone => {
                zone.destroyDragProxy();
                return Promise.resolve()
            }, {
                deltaResult: () => Promise.reject(new Error('delta transport failure'))
            })
        } finally {
            console.error = originalConsoleError
        }

        expect(outcome.recorded).toHaveLength(1);
        expect(surfaced, 'a reasoned rejection must surface exactly once').toHaveLength(1);
        expect(surfaced[0][1]?.reason?.message, 'the surfaced entry names the failure')
            .toContain('delta transport failure')
    });

    test('register and unregister share ONE root-key expression — a wrapping zone cannot strand a stale id', () => {
        const calls           = [],
              originalAddon   = Neo.main.addon.DragDrop,
              originalGetRoot = DragZone.prototype.getDragElementRoot;

        Neo.main.addon.DragDrop = {
            registerZone  : data => calls.push(['register', data]),
            unregisterZone: data => calls.push(['unregister', data])
        };

        // Simulate the tree/DragZone divergence: the wrapper element is NOT the drag root
        // (the override exists precisely so they can diverge — registration keys must never
        // be recomputed per call site).
        DragZone.prototype.getDragElementRoot = function() { return this.dragElement.cn[0] };

        let zone;

        try {
            zone = Neo.create(DragZone, {
                appName    : 'DraggableDragZoneTest',
                dragElement: {id: 'wrapper', cn: [{id: 'wrapped'}]},
                windowId   : 'test-window-1'
            });

            zone.destroy();

            expect(calls).toHaveLength(2);
            expect(calls[0][0]).toBe('register');
            expect(calls[1][0]).toBe('unregister');
            expect(calls[0][1].dragElementRootId).toBe('wrapped');
            expect(calls[1][1].dragElementRootId).toBe('wrapped');
            expect(calls[0][1].dragElementRootId, 'teardown key === setup key').toBe(calls[1][1].dragElementRootId)
        } finally {
            Neo.main.addon.DragDrop              = originalAddon;
            DragZone.prototype.getDragElementRoot = originalGetRoot;
            zone && !zone.isDestroyed && zone.destroy()
        }
    });
});
