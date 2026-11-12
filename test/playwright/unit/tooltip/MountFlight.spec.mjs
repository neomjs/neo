/**
 * @file test/playwright/unit/tooltip/MountFlight.spec.mjs
 * @summary Tooltip show/hide overrides share component.Base's mount flight, including its latest
 * visibility and destroy guards. Each arm holds the real initVnode(true) insertion at the main-thread
 * boundary, after isVnodeInitializing has cleared but before mounted becomes true.
 */

import {setup} from '../../setup.mjs';

const appName = 'TooltipMountFlightTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Tooltip        from '../../../../src/tooltip/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

// The real instances unregister through Neo.get during teardown.
import '../../../../src/manager/Instance.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test.describe('Neo.tooltip.Base: one mount flight lands on the latest visibility', () => {
    let applyDeltas, attempts, inserts, instances, pending, removes;

    /**
     * @summary Creates a real tooltip and records its real initialization promises for deterministic
     * settlement, including on the broken implementation which does not expose a mountFlight.
     * @returns {Neo.tooltip.Base}
     */
    const create = () => {
        const tooltip = Neo.create(Tooltip, {
                  appName,
                  dismissDelay: null,
                  focusOnMount: false,
                  hidden      : true,
                  parentId    : 'document.body',
                  stayOnHover : false,
                  windowId    : 1
              }),
              initVnode = tooltip.initVnode;

        tooltip.initVnode = function(...args) {
            const attempt = initVnode.apply(this, args);
            attempts.push(attempt);
            return attempt
        };

        instances.push(tooltip);

        return tooltip
    };

    const releaseInserts = async () => {
        pending.splice(0).forEach(resolve => resolve());
        await Promise.all(attempts);
        await tick()
    };

    /**
     * @summary Proves the arm reached a real, held insertion outside the vnode-initialization flag.
     * @param {Neo.tooltip.Base} tooltip
     */
    const expectHeldInsert = async tooltip => {
        await tick();

        expect(inserts).toHaveLength(1);
        expect(pending).toHaveLength(1);
        expect(tooltip.isVnodeInitializing).toBe(false);
        expect(tooltip.mounted).toBe(false)
    };

    test.beforeEach(() => {
        applyDeltas = Neo.applyDeltas;
        attempts    = [];
        inserts     = [];
        instances   = [];
        pending     = [];
        removes     = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            for (const delta of [deltas].flat()) {
                if (delta.action === 'insertNode') {
                    inserts.push(delta);
                    await new Promise(resolve => pending.push(resolve))
                } else if (delta.action === 'removeNode') {
                    removes.push(delta)
                }
            }
        }
    });

    test.afterEach(async () => {
        // A failed assertion must still settle the held real attempt before globals are restored.
        await tick();
        pending.splice(0).forEach(resolve => resolve());
        await Promise.allSettled(attempts);
        await tick();
        instances.forEach(instance => !instance.isDestroyed && instance.destroy());
        Neo.applyDeltas = applyDeltas
    });

    test('repeated show calls while an insertion is pending mount one tooltip', async () => {
        const tooltip = create();

        tooltip.show();
        await expectHeldInsert(tooltip);
        tooltip.show();
        tooltip.show();
        await tick();
        await releaseInserts();

        expect(inserts, 'all shows share one real insertNode').toHaveLength(1);
        expect(removes).toEqual([]);
        expect(tooltip.mounted).toBe(true);
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.mountFlight).toBe(null)
    });

    test('a hide during insertion removes the tooltip only when the insertion lands', async () => {
        const tooltip = create();

        tooltip.show();
        await expectHeldInsert(tooltip);
        tooltip.hide();

        expect(removes, 'there is no mounted node to remove yet').toEqual([]);

        await releaseInserts();

        expect(inserts).toHaveLength(1);
        expect(removes.map(delta => delta.id), 'the late insertion honors the hide').toEqual([tooltip.id]);
        expect(tooltip.mounted).toBe(false);
        expect(tooltip.hidden).toBe(true);
        expect(tooltip.mountFlight).toBe(null)
    });

    test('show, hide, show during insertion lands one mounted tooltip', async () => {
        const tooltip = create();

        tooltip.show();
        await expectHeldInsert(tooltip);
        tooltip.hide();
        tooltip.show();
        await tick();

        expect(removes, 'no intermediate removal is sent while the node is in flight').toEqual([]);

        await releaseInserts();

        expect(inserts).toHaveLength(1);
        expect(removes).toEqual([]);
        expect(tooltip.mounted).toBe(true);
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.mountFlight).toBe(null)
    });

    test('destroy during insertion never calls unmount on the destroyed tooltip', async () => {
        const tooltip  = create();
        let   unmounts = 0;

        tooltip.show();
        await expectHeldInsert(tooltip);
        tooltip.hide();

        const flight = tooltip.mountFlight;

        tooltip.destroy();

        // destroy() deletes own spies and installs an empty unmount. Observe calls after teardown
        // without replacing core's frozen config state: this is a real lifecycle control, not proof
        // that a particular guard is the only protection against a late unmount.
        tooltip.unmount = () => {unmounts++};

        await releaseInserts();
        await flight;

        expect(attempts, 'the real insertion promise settled after destruction').toHaveLength(1);
        expect(tooltip.isDestroyed).toBe(true);
        expect(tooltip.mounted, 'core ignores the late mounted write after destruction').toBe(false);
        expect(tooltip.hidden).toBe(true);
        expect(unmounts).toBe(0);
        expect(removes).toEqual([])
    });

    test('show after a hidden flight settles starts a new mount', async () => {
        const tooltip = create();

        tooltip.show();
        await expectHeldInsert(tooltip);
        tooltip.hide();
        await releaseInserts();

        expect(tooltip.mounted, 'the first flight landed hidden').toBe(false);
        expect(tooltip.mountFlight, 'the hidden landing releases its latch').toBe(null);

        tooltip.show();
        await tick();

        expect(inserts, 'the next show starts a fresh insertion').toHaveLength(2);
        expect(pending).toHaveLength(1);

        await releaseInserts();

        expect(removes.map(delta => delta.id)).toEqual([tooltip.id]);
        expect(tooltip.mounted).toBe(true);
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.mountFlight).toBe(null)
    })
});
