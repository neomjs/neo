import {setup} from '../../setup.mjs';

const appName = 'HelixSortReorderTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Helix          from '../../../../src/component/Helix.mjs';

/**
 * Guards the two structural decisions behind the helix sort regression.
 *
 * A single store sort drives BOTH of this component's store listeners: `data.Store.onCollectionSort`
 * re-fires the sort as a `load`, so `onStoreLoad` rebuilds the item vdom and the differ reorders the
 * DOM — while `onSort` used to hand-write one `moveNode` delta per item on top of it. Two independent
 * reorder passes over the same nodes, ~1176 moves where 590 suffice.
 *
 * Neither assertion is timing-based. The animation itself cannot be verified from this harness (a
 * background tab neither composites nor runs transitions), so these pin the SHAPE that made the
 * animation impossible and leave the visual result to a rendered-tab gate.
 */
test.describe('Neo.component.Helix sort reordering', () => {
    let deltaCalls, realApplyDeltas;

    /**
     * @summary Builds a Helix stub with the real methods under test and a captured delta boundary.
     * @param {Number} itemCount Items the fake store reports.
     * @returns {Object}
     */
    function helixStub(itemCount = 4) {
        // A plain object, invoked via `Helix.prototype.<method>.call`. `Object.create(Helix.prototype)`
        // does NOT work: Neo's Base keeps config state in a private field, so every property access on
        // a prototype-only object throws before the method body runs. The methods under test read plain
        // properties and the module-level `Neo`, so a literal is the honest isolation here.
        return {
            deltaY            : 0,
            flipped           : false,
            id                : 'helix-1',
            itemAngle         : 5,
            matrix            : {items: [], getTransformStyle: () => 'matrix3d(1,0,0,0)'},
            maxItems          : 300,
            mounted           : true,
            radius            : 1500,
            rotationAngle     : 0,
            transitionTimeouts: [],
            translateX        : 0,
            translateY        : 0,
            translateZ        : 0,
            windowId          : 1,

            calculateOpacity: () => 1,
            getRecordId     : record => record.id,
            getItemVnodeId  : id => `helix-1__${id}`,
            // The REAL implementation — `sortItems` delegating to it is the behaviour under test, so
            // stubbing it would assert the delegation and prove nothing about the deltas it emits.
            refresh         : Helix.prototype.refresh,

            store: {
                getCount: () => itemCount,
                getAt   : index => ({id: index})
            }
        }
    }

    test.beforeEach(() => {
        deltaCalls      = [];
        realApplyDeltas = Neo.applyDeltas;

        Neo.applyDeltas = (windowId, deltas) => {
            deltaCalls.push(Array.isArray(deltas) ? deltas : [deltas]);
            return Promise.resolve()
        }
    });

    test.afterEach(() => {
        Neo.applyDeltas = realApplyDeltas
    });

    test('a sort emits NO moveNode deltas — reordering belongs to the differ, once', async () => {
        await Helix.prototype.sortItems.call(helixStub(4));

        const emitted = deltaCalls.flat();

        // The regression this exists to catch is someone re-adding the manual pass "for immediacy".
        // It reorders through `Neo.applyDeltas`, which the differ never sees, so the vdom and the real
        // DOM diverge and the rebuild that follows redoes every move.
        expect(emitted.filter(delta => delta.action === 'moveNode')).toHaveLength(0);

        // Control: the method must still DO something, or an empty implementation passes the above.
        expect(emitted.length).toBe(4);
        expect(emitted.every(delta => delta.style?.transform)).toBe(true)
    });

    test('sortItems resolves only once its transform deltas are applied', async () => {
        let applied = false;

        Neo.applyDeltas = () => new Promise(resolve => {
            setTimeout(() => {
                applied = true;
                resolve()
            }, 10)
        });

        await Helix.prototype.sortItems.call(helixStub(2));

        // Without the returned promise the caller cannot anchor anything to the transform, which is
        // what left the transition window timed from an unrelated event.
        expect(applied).toBe(true)
    });

    test('the transition window opens only AFTER the callback completes, not after the class is added', async () => {
        const order = [];
        let   releaseTransform;

        const instance = helixStub(2);

        Neo.applyDeltas = (windowId, deltas) => {
            const payload = Array.isArray(deltas) ? deltas : [deltas];

            if (payload[0]?.cls?.add?.length) {
                order.push('class-added');
                return Promise.resolve()
            }

            if (payload[0]?.cls?.remove?.length) {
                order.push('class-removed');
                return Promise.resolve()
            }

            order.push('transform-applied');
            return Promise.resolve()
        };

        const slowCallback = () => new Promise(resolve => {
            releaseTransform = () => {
                order.push('transform-applied');
                resolve()
            }
        });

        Helix.prototype.applyItemTransitions.call(instance, slowCallback, 10);

        await new Promise(resolve => setTimeout(resolve, 20));

        // The class-removal timer must NOT have been scheduled yet: the callback has not finished, so
        // the transform has not landed. Against the fire-and-forget form the timer started ~20ms ago
        // with animationTime 10, and the class would already be gone.
        expect(order).toEqual(['class-added']);
        expect(instance.transitionTimeouts).toHaveLength(0);

        releaseTransform();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(order).toEqual(['class-added', 'transform-applied']);
        expect(instance.transitionTimeouts).toHaveLength(1)
    })
});
