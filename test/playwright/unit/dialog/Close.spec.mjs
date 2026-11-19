/**
 * @file test/playwright/unit/dialog/Close.spec.mjs
 * @summary Pins what a `Neo.dialog.Base` leaves behind when it goes: the modal mask goes with it, focus goes back to
 * its opener, and Escape does what the close button does.
 *
 * A destroyed dialog runs no timer, so `destroy()` itself syncs the mask before the removal, for a close and for an
 * owner's direct destroy alike, and the main thread places the mask without waiting for the removal
 * (`main/DomAccessModalMask.spec.mjs`). Focus can enter a dialog from the
 * body, when its opener disabled itself or a browser did not focus the clicked button; the dialog still knows its
 * opener as `animateTarget`.
 */

import {setup} from '../../setup.mjs';

const appName = 'DialogCloseTest';

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
import Dialog         from '../../../../src/dialog/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

const tick = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('dialog.Base: a dialog takes its mask along and hands focus back', () => {
    let applyDeltas, domAccess, events, instances, ownMethods;

    test.beforeEach(() => {
        applyDeltas = Neo.applyDeltas;
        events      = [];
        instances   = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            for (const delta of [deltas].flat()) {
                delta.action === 'removeNode' && events.push(`remove:${delta.id}`)
            }
        };

        // setup() stands in for most of DomAccess, not for the remotes a dialog calls when it shows and goes
        domAccess  = Neo.main.DomAccess;
        ownMethods = ['focus', 'syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);

        domAccess.focus         = ({id, restoreFrom}) => {events.push(`focus:${id}:${restoreFrom}`)};
        domAccess.syncModalMask = ({id, modal})       => {events.push(`mask:${id}:${modal}`)};
        domAccess.trapFocus     = () => {}
    });

    test.afterEach(() => {
        // A mounted modal dialog syncs its mask away in destroy(), so the stubs stay until every dialog is gone
        instances.forEach(instance => !instance.isDestroyed && instance.destroy());

        Neo.applyDeltas = applyDeltas;

        ownMethods.forEach(([name, own, method]) => {own ? domAccess[name] = method : delete domAccess[name]})
    });

    /**
     * @summary A hidden, unmounted, non-animated dialog
     * @param {Object} [config]
     * @returns {Neo.dialog.Base}
     */
    const create = config => {
        const dialog = Neo.create(Dialog, {
            appName,
            autoInitVnode: false,
            autoMount    : false,
            draggable    : false,
            hidden       : true,
            modal        : true,
            resizable    : false,
            windowId     : 1,
            ...config
        });

        instances.push(dialog);

        return dialog
    };

    /**
     * @param {String} id
     * @returns {Neo.component.Base}
     */
    const createOpener = id => {
        const opener = Neo.create(Component, {appName, autoMount: false, id, windowId: 1});

        instances.push(opener);

        return opener
    };

    /**
     * @summary A modal dialog on the page, with the events of its showing cleared
     * @returns {Promise<Neo.dialog.Base>}
     */
    const createMounted = async () => {
        const dialog = create();

        dialog.hidden = false;
        await expect.poll(() => dialog.mounted).toBe(true);
        events.length = 0;

        return dialog
    };

    test('a close syncs the mask away before destroy() removes the dialog, with no timer left behind', async () => {
        const dialog = await createMounted();
        let   closes = 0;

        dialog.on('close', () => {closes++});

        dialog.close(false);

        expect(events).toEqual([`mask:${dialog.id}:false`, `remove:${dialog.id}`]);
        expect({closes, destroyed: dialog.isDestroyed}).toEqual({closes: 1, destroyed: true})
    });

    test('a modal dialog its owner destroys without close() takes its mask along; one never shown leaves it alone', async () => {
        const dialog = await createMounted(),
              hidden = create();

        dialog.destroy(true);
        hidden.destroy();

        expect(events).toEqual([`mask:${dialog.id}:false`, `remove:${dialog.id}`])
    });

    test('Escape runs the closeAction without the animation: close destroys, hide keeps the dialog', async () => {
        const closing = create({closeAction: 'close'}),
              keeping = create({closeAction: 'hide'});
        let closes = 0;

        closing.on('close', () => {closes++});
        keeping.on('close', () => {closes++});

        closing.onKeyDownEscape();
        keeping.onKeyDownEscape();
        await tick();

        expect({closes, destroyed: !!closing.isDestroyed}, 'the close button\'s path').toEqual({closes: 1, destroyed: true});
        expect({destroyed: !!keeping.isDestroyed, hidden: keeping.hidden}).toEqual({destroyed: false, hidden: true})
    });

    test('the focus goes back to the component it came from, else to the opener the dialog grows out of', () => {
        const opener   = createOpener('dialog-close-opener'),
              previous = createOpener('dialog-close-previous'),
              dialog   = create({animateTargetId: opener.id, autoShow: false}),
              bare     = create();

        expect(dialog.getFocusReturnTarget(), 'focus entered from the body').toBe(opener);
        expect(bare.getFocusReturnTarget(), 'no opener and no origin').toBeFalsy();

        dialog.focusEnterData = {relatedTarget: {id: previous.id}};

        expect(dialog.getFocusReturnTarget()).toBe(previous)
    });

    test('a departing dialog that holds focus hands it to its opener, settled against the departure', () => {
        const opener = createOpener('dialog-close-departure-opener'),
              dialog = create({animateTargetId: opener.id, autoShow: false});

        dialog.containsFocus = true;
        dialog.revertFocusOnDeparture();

        expect(events).toEqual([`focus:${opener.id}:${dialog.id}`])
    });

    test('a dialog that mounts syncs the mask below itself once it is on the page', async () => {
        const dialog  = create(),
              mounted = [];

        // show() syncs before the mount lands; the sync that places the mask is the one the mount runs
        domAccess.syncModalMask = ({id, modal}) => {mounted.push(`${id}:${modal}:${Neo.getComponent(id).mounted}`)};

        // a sync timed from the creation would land here, while the dialog is not on the page
        await tick(150);
        dialog.hidden = false;

        await expect.poll(() => dialog.mounted).toBe(true);
        expect(mounted).toContain(`${dialog.id}:true:true`)
    })
});
