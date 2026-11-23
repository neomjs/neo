/**
 * @file test/playwright/unit/dialog/ShowWithoutAnimateTarget.spec.mjs
 * @summary Pins the offscreen positioning revert of `Neo.dialog.Base` to the lifecycle method `show()` mounts
 * through: a dialog without an `animateTargetId` writes `initial` into its wrapper styles on `initVnode()`, so
 * the parking position from `.neo-floating` (left/top -10000px) gets reverted and the dialog lands on screen.
 *
 * A plain show() is `component.Base#show` → `startMountFlight(initVnode(true))`, and an animated show() awaits
 * `initVnode(true)` inside `animateShow()` as well, so both paths run this override. An override that drifts to
 * a differently named lifecycle method never runs again: the modal mask covers the page while the dialog stays
 * parked at -10000px.
 *
 * The stub replaces the parent chain's `initVnode` (an instance-level stub would erase the override under test):
 * the arms run the real `dialog.Base` override with no DOM and pin which wrapper styles get written and that the
 * mount argument reaches super.
 */

import {setup} from '../../setup.mjs';

const appName = 'DialogShowWithoutAnimateTargetTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Abstract       from '../../../../src/component/Abstract.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Dialog         from '../../../../src/dialog/Base.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import '../../../../src/vdom/util/StringFromVnode.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

test.describe('dialog.Base: showing without an animation target reverts the offscreen parking', () => {
    let calls, instances, parentInitVnode;

    test.beforeEach(() => {
        calls     = [];
        instances = [];

        parentInitVnode              = Abstract.prototype.initVnode;
        Abstract.prototype.initVnode = function(mount) {
            calls.push(mount);
            return Promise.resolve({vnode: {id: this.id}})
        };
    });

    test.afterEach(() => {
        Abstract.prototype.initVnode = parentInitVnode;

        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    /**
     * @summary A hidden dialog whose mount attempt is stubbed away.
     * @param {Object} [config]
     * @returns {Neo.dialog.Base}
     */
    const create = config => {
        const dialog = Neo.create(Dialog, {
            appName,
            autoInitVnode: false,
            autoMount    : false,
            autoShow     : false,
            closeAction  : 'hide',
            draggable    : false,
            hidden       : true,
            resizable    : false,
            windowId     : 1,
            ...config
        });

        instances.push(dialog);

        return dialog
    };

    test('a dialog without an animation target writes initial into its wrapper styles on initVnode(true)', async () => {
        const dialog = create();

        expect(dialog.wrapperStyle.left).not.toBe('initial');
        expect(dialog.wrapperStyle.top).not.toBe('initial');

        const result = await dialog.initVnode(true);

        expect(calls, 'the mount argument reaches super').toEqual([true]);
        expect(result, 'the superclass payload reaches awaiting callers').toEqual({vnode: {id: dialog.id}});
        expect(dialog.wrapperStyle.left).toBe('initial');
        expect(dialog.wrapperStyle.top).toBe('initial')
    });

    test('a dialog with an animation target leaves its wrapper styles alone', async () => {
        const target = Neo.create(Component, {appName}),
              dialog = create({animateTargetId: target.id});

        instances.push(target);

        const result = await dialog.initVnode(true);

        expect(calls).toEqual([true]);
        expect(result).toEqual({vnode: {id: dialog.id}});
        expect(dialog.wrapperStyle.left).not.toBe('initial');
        expect(dialog.wrapperStyle.top).not.toBe('initial')
    });

    test('unstubbed initVnode(false) returns the real VdomLifecycle payload containing vnode', async () => {
        Abstract.prototype.initVnode = parentInitVnode;

        const dialog = create(),
              result = await dialog.initVnode(false);

        expect(result?.vnode?.id).toBe(dialog.id);
        expect(dialog.wrapperStyle.left).toBe('initial');
        expect(dialog.wrapperStyle.top).toBe('initial')
    })
});
