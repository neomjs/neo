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
 * Runs one proxy-teardown scenario against a spied `Neo.applyDeltas` and returns the
 * recorded dispatches. The spy is installed per call and always restored: the delta
 * surface is global, so a leaked recorder would poison sibling specs.
 * @param {Function} scenario Receives the created zone; drives teardown timing.
 * @returns {Promise<Object[]>} The recorded `applyDeltas` calls as {windowId, deltas}.
 */
async function recordProxyRemoval(scenario) {
    const
        originalApplyDeltas = Neo.applyDeltas,
        recorded            = [],
        zone                = Neo.create(DragZone, {
            appName : 'DraggableDragZoneTest',
            windowId: 'test-window-1'
        });

    Neo.applyDeltas = (windowId, deltas) => {
        recorded.push({windowId, deltas});
        return Promise.resolve()
    };

    try {
        zone.dragProxy = Neo.create(Component, {appName: 'DraggableDragZoneTest'});

        await scenario(zone);

        // Both teardown paths resolve within the deferral ceiling (30ms) plus microtasks;
        // one settled wait keeps the assertion race-free for the fixed AND the broken shape.
        await new Promise(resolve => setTimeout(resolve, 60))
    } finally {
        Neo.applyDeltas = originalApplyDeltas;
        !zone.isDestroyed && zone.destroy()
    }

    return recorded
}

test.describe('Neo.draggable.DragZone', () => {
    test('the proxy removal delta survives a zone destroyed inside the deferral window', async () => {
        const recorded = await recordProxyRemoval(zone => {
            const proxyId = zone.dragProxy.id;

            zone.destroyDragProxy();

            // The dying-window race: the zone's owner chain is torn down before the deferred
            // dispatch fires (a closing dock vessel's un-projection lands in the same tick as
            // the drop). destroy() clears and rejects the pending timeout — the removal must
            // dispatch anyway, or the proxy DOM is orphaned in the source window.
            zone.destroy();

            expect(zone.isDestroyed).toBe(true);

            return Promise.resolve(proxyId)
        });

        expect(recorded, 'exactly one removal dispatch despite the destroyed zone').toHaveLength(1);
        expect(recorded[0].windowId).toBe('test-window-1');
        expect(recorded[0].deltas[0].action).toBe('removeNode')
    });

    test('the undisturbed teardown dispatches exactly one deferred removal', async () => {
        const recorded = await recordProxyRemoval(zone => {
            zone.destroyDragProxy();
            return Promise.resolve()
        });

        expect(recorded, 'one dispatch, no duplicates from the survival guard').toHaveLength(1);
        expect(recorded[0].deltas).toEqual([{action: 'removeNode', id: recorded[0].deltas[0].id}])
    });
});
