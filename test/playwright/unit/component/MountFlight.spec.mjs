/**
 * @file test/playwright/unit/component/MountFlight.spec.mjs
 * @summary Pins the one mount attempt a `document.body`-rooted component holds between `show()` and
 * its `initVnode(true)` settling, across both phases `isVnodeInitializing` does not span.
 *
 * A mount attempt starts before the vnode is initialising, while theme files load, and ends after it,
 * while the main thread inserts the node without a VDom worker. A `show()` inside either phase must not
 * start a second attempt, and a `hide()` there must not send a `removeNode` for a node that does not
 * exist yet: the attempt reads `hidden` when it lands. The browser witness of the same race is
 * `component/component/FloatingMountFlight.spec.mjs`.
 */

import {setup} from '../../setup.mjs';

const appName = 'MountFlightTest';

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
import Component      from '../../../../src/component/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

test.describe('component.Base: one mount attempt for a document.body-rooted component', () => {
    let applyDeltas, instances, worker;

    /**
     * @summary Records every delta, holding each insert until the arm releases it.
     * @returns {{inserts: Object[], removes: Object[], release: Function}}
     */
    const recordDeltas = () => {
        const record = {inserts: [], pending: [], removes: []};

        Neo.applyDeltas = async (windowId, deltas) => {
            for (const delta of [deltas].flat()) {
                if (delta.action === 'insertNode') {
                    record.inserts.push(delta);
                    await new Promise(resolve => record.pending.push(resolve))
                } else if (delta.action === 'removeNode') {
                    record.removes.push(delta)
                }
            }
        };

        record.release = async () => {
            record.pending.splice(0).forEach(resolve => resolve());
            await new Promise(resolve => setTimeout(resolve, 0))
        };

        return record
    };

    const create = () => {
        const component = Neo.create(Component, {appName, hidden: true, parentId: 'document.body', windowId: 1});

        instances.push(component);

        return component
    };

    test.beforeEach(() => {
        applyDeltas = Neo.applyDeltas;
        instances   = [];
        worker      = {countLoadingThemeFiles: Neo.currentWorker.countLoadingThemeFiles, on: Neo.currentWorker.on}
    });

    test.afterEach(() => {
        Neo.applyDeltas                          = applyDeltas;
        Neo.config.unitTestMode                  = true;
        Neo.currentWorker.countLoadingThemeFiles = worker.countLoadingThemeFiles;
        Neo.currentWorker.on                     = worker.on;
        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    test('a show and a hide while the attempt is pending start nothing and send nothing', async () => {
        const component = create();
        let   calls     = 0, settle, unmounts = 0;

        component.initVnode = () => {
            calls++;
            return new Promise(resolve => {settle = resolve})
        };
        component.unmount = () => {unmounts++};

        component.hidden = false;
        component.hidden = true;
        component.hidden = false;

        expect(calls, 'one attempt for three presence changes').toBe(1);
        expect(unmounts, 'no unmount for a node still in flight').toBe(0);
        expect(component.mountFlight, 'the latch holds while the attempt is pending').not.toBe(null);

        settle();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(component.mountFlight, 'and releases when it settles').toBe(null);
        expect(unmounts, 'the latest presence was shown: nothing to undo').toBe(0);

        component.hidden = true;
        component.hidden = false;

        expect(calls, 'a released latch lets the next show start its own attempt').toBe(2)
    });

    test('theme deferral: show, hide, show while theme files load registers one attempt and removes nothing', async () => {
        const component = create(),
              deltas    = recordDeltas(),
              listeners = [];

        Neo.config.unitTestMode                  = false;
        Neo.currentWorker.countLoadingThemeFiles = 1;
        Neo.currentWorker.on                     = (name, fn) => {listeners.push(name)};

        component.hidden = false;
        component.hidden = true;
        component.hidden = false;

        expect(component.isVnodeInitializing, 'the deferral sits before the flag is raised').toBe(false);
        expect(listeners, 'one attempt waits for the theme files').toEqual(['themeFilesLoaded']);
        expect(deltas.removes, 'no removeNode for a node that was never inserted').toEqual([])
    });

    test('no VDom worker: show, hide, show while the insert lands mounts one node', async () => {
        const component = create(),
              deltas    = recordDeltas();

        component.hidden = false;
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(deltas.inserts.length, 'the first attempt reached its insert').toBe(1);
        expect(component.isVnodeInitializing, 'the insert sits after the flag is lowered').toBe(false);

        component.hidden = true;
        component.hidden = false;
        await deltas.release();

        expect(deltas.inserts.length, 'one insertNode for three presence changes').toBe(1);
        expect(deltas.removes, 'no removeNode while the insert was in flight').toEqual([]);
        expect(component.mounted, 'the component landed shown').toBe(true)
    });

    test('no VDom worker: a hide while the insert lands unmounts the node when it arrives', async () => {
        const component = create(),
              deltas    = recordDeltas();

        component.hidden = false;
        await new Promise(resolve => setTimeout(resolve, 0));
        component.hidden = true;

        expect(deltas.removes, 'nothing to remove before the insert lands').toEqual([]);

        await deltas.release();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(deltas.inserts.length).toBe(1);
        expect(deltas.removes.map(delta => delta.id), 'the landing removes the node the hide asked away')
            .toEqual([component.vdom.id]);
        expect(component.mounted, 'a hidden component does not stay painted').toBe(false)
    })
});
