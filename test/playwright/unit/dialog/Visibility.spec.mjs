/**
 * @file test/playwright/unit/dialog/Visibility.spec.mjs
 * @summary Pins `Neo.dialog.Base` to the `component.Base` visibility contract: `show()` and `hide()` keep `hidden`
 * in step, a dialog mounts in one flight at a time, and an explicit `autoMount: false` holds.
 *
 * A kept dialog (`closeAction: 'hide'`) is reopened with `show()` by every engine example, and Escape closes it by
 * setting `hidden = true`, so a `hidden` that stays `true` after `show()` turns that Escape into a no-op. Animated
 * dialogs mount through `animateShow()`, which is a mount flight of its own. The `component.Base` side of the same
 * contract is pinned in `component/MountFlight.spec.mjs`.
 */

import {setup} from '../../setup.mjs';

const appName = 'DialogVisibilityTest';

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
import Dialog         from '../../../../src/dialog/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

const tick = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('dialog.Base: show() and hide() follow the component.Base visibility contract', () => {
    let applyDeltas, domAccess, inserts, instances, ownMethods, removes;

    test.beforeEach(() => {
        applyDeltas = Neo.applyDeltas;
        inserts     = [];
        instances   = [];
        removes     = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            for (const delta of [deltas].flat()) {
                delta.action === 'insertNode' && inserts.push(delta.id);
                delta.action === 'removeNode' && removes.push(delta.id)
            }
        };

        // setup() stands in for most of DomAccess, not for the two remotes a dialog syncs on every show and hide
        domAccess  = Neo.main.DomAccess;
        ownMethods = ['syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);

        ownMethods.forEach(([name]) => {domAccess[name] = () => {}})
    });

    test.afterEach(() => {
        Neo.applyDeltas = applyDeltas;

        ownMethods.forEach(([name, own, method]) => {own ? domAccess[name] = method : delete domAccess[name]});

        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    /**
     * @summary A hidden, unmounted dialog whose `initVnode()` stands in for a mount that lands immediately.
     * @param {Object} [config]
     * @returns {Neo.dialog.Base}
     */
    const create = config => {
        const dialog = Neo.create(Dialog, {
            appName,
            autoInitVnode: false,
            autoMount    : false,
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

    /**
     * @summary Replaces `initVnode()` with a mount that lands when the main thread confirms it.
     * @param {Neo.dialog.Base} dialog
     */
    const landingMounts = dialog => {
        dialog.initVnode = () => {
            // The confirmation is a silent write, as the real insert's
            dialog._mounted = true;
            return Promise.resolve()
        }
    };

    test('show() after hide() leaves hidden false, so Escape still closes a reopened dialog', async () => {
        const dialog = create();

        landingMounts(dialog);

        dialog.hidden = false;
        await tick();
        dialog.hide();   // the header X with closeAction 'hide'
        await tick();
        dialog.show();   // a reopen, as examples/stateProvider/dialog does
        await tick();

        expect(dialog.hidden, 'show() writes hidden').toBe(false);

        const before = removes.length;

        dialog.onKeyDownEscape();
        await tick();

        expect(removes.length - before, 'Escape removes the reopened dialog').toBe(1);
        expect(dialog.hidden).toBe(true)
    });

    test('show, hide, show while the first mount is in flight start one mount and remove nothing', () => {
        const dialog = create();
        let   mounts = 0, unmounts = 0;

        dialog.initVnode = () => {mounts++; return new Promise(() => {})};
        dialog.unmount   = () => {unmounts++};

        dialog.hidden = false;
        dialog.hidden = true;
        dialog.hidden = false;

        expect({mounts, unmounts}).toEqual({mounts: 1, unmounts: 0})
    });

    test('an animated show is one flight, and a mounted dialog is not shown again', async () => {
        const dialog = create({animateTargetId: 'dialog-visibility-opener', autoShow: false});
        let   land, shows = 0;

        dialog.animateShow = () => {
            shows++;
            return new Promise(resolve => {land = () => {dialog._mounted = true; resolve()}})
        };

        dialog.show();
        dialog.show();

        expect(shows, 'a second show() during the flight starts no second animation').toBe(1);

        land();
        await tick();
        dialog.show();

        expect(shows, 'a mounted dialog has nothing to animate').toBe(1);
        expect(dialog.hidden).toBe(false)
    });

    test('a hide() during an animated show lands on the hide, without animating a node that is not there', async () => {
        const dialog         = create({animateTargetId: 'dialog-visibility-opener', autoShow: false});
        let   hideAnimations = 0, land, unmounts = 0;

        dialog.animateShow = () => new Promise(resolve => {land = () => {dialog._mounted = true; resolve()}});
        dialog.animateHide = () => {hideAnimations++};
        dialog.unmount     = () => {unmounts++; dialog._mounted = false};

        dialog.show();
        dialog.hide();

        expect({hideAnimations, unmounts}, 'nothing to animate or remove before the landing').toEqual({hideAnimations: 0, unmounts: 0});

        land();
        await tick();

        expect({hideAnimations, unmounts}, 'the flight lands on the latest hidden').toEqual({hideAnimations: 0, unmounts: 1});
        expect(dialog.hidden).toBe(true)
    });

    test('an explicit autoMount: false holds without an animateTargetId, until the dialog is shown', async () => {
        const dialog = create();

        await tick();

        expect({autoInitVnode: dialog.autoInitVnode, autoMount: dialog.autoMount, inserts: inserts.length, mounted: dialog.mounted})
            .toEqual({autoInitVnode: false, autoMount: false, inserts: 0, mounted: false});

        dialog.hidden = false;
        await tick();

        expect({inserts: inserts.length, mounted: dialog.mounted}).toEqual({inserts: 1, mounted: true})
    });

    test('an animateTargetId still creates the dialog unmounted', async () => {
        const dialog = create({animateTargetId: 'dialog-visibility-opener', autoInitVnode: true, autoMount: true, autoShow: false});

        await tick();

        expect({autoInitVnode: dialog.autoInitVnode, autoMount: dialog.autoMount, inserts: inserts.length})
            .toEqual({autoInitVnode: false, autoMount: false, inserts: 0})
    })
});
