import {setup} from '../../setup.mjs';

const appName = 'DesktopWindowManagerDialogTest';

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
import TreeModel      from '../../../../src/data/TreeModel.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import Dialog         from '../../../../src/dialog/Base.mjs';
import Tasks          from '../../../../src/desktop/store/Tasks.mjs';
import WindowManager  from '../../../../src/desktop/WindowManager.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

/**
 * @summary `Neo.desktop.WindowManager` with a stock `Neo.dialog.Base` as its window class. The dialog's own close
 * button and its animated hide run for real; the main-thread reads and the mount are stubbed, as in
 * `test/playwright/unit/dialog/AnimateTarget.spec.mjs`.
 */

class AppModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Desktop.WindowManagerDialog.AppModel',
        fields   : [{name: 'id', type: 'String'}, {name: 'text', type: 'String'}]
    }
}

AppModel = Neo.setupClass(AppModel);

const
    dialogRect = {height: 300, left: 400, top: 250, width: 400},
    targetRect = {height: 56,  left: 32,  top: 40,  width: 56};

test.describe('Neo.desktop.WindowManager with a stock Neo.dialog.Base', () => {
    let applyDeltas, apps, domAccess, manager, ownMethods, tasks;

    test.beforeEach(() => {
        applyDeltas     = Neo.applyDeltas;
        Neo.applyDeltas = async () => {};

        // setup() stands in for most of DomAccess, not for the two remotes a dialog syncs on every show and hide
        domAccess  = Neo.main.DomAccess;
        ownMethods = ['syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);

        ownMethods.forEach(([name]) => {domAccess[name] = () => {}});

        apps    = Neo.create(TreeStore, {data: [{id: 'mail', text: 'Mail'}], model: AppModel});
        tasks   = Neo.create(Tasks);
        manager = Neo.create(WindowManager, {
            appStore    : apps,
            taskStore   : tasks,
            windowClass : Dialog,
            // The window grows out of a launcher icon, so its hide animates
            windowConfig: record => ({
                animateTargetId: `launcher-${record.id}`,
                appName,
                draggable      : false,
                resizable      : false,
                title          : record.text,
                windowId       : 1,
                getDomRect     : async ids => Array.isArray(ids) ? [dialogRect, targetRect] : targetRect,
                initVnode() {this._mounted = true; return Promise.resolve()},
                waitForDomRect : async () => [dialogRect, {height: 800, left: 0, top: 0, width: 1200}]
            })
        })
    });

    test.afterEach(() => {
        manager.destroy();
        apps.destroy();
        tasks.destroy();

        Neo.applyDeltas = applyDeltas;

        ownMethods.forEach(([name, own, method]) => {own ? domAccess[name] = method : delete domAccess[name]})
    });

    /**
     * @param {String} id
     * @returns {Promise<Neo.dialog.Base>} The app's window, once its show animation landed
     */
    const open = async id => {
        const window = await manager.openApp(apps.get(id));

        await expect.poll(() => window.mounted && !window.mountFlight).toBe(true);

        return window
    };

    test('the close button hides the window for the next open, and its task goes', async () => {
        const mail = await open('mail');

        mail.executeHeaderAction({action: 'close'});

        await expect.poll(() => mail.hidden || mail.isDestroyed).toBe(true);

        expect(mail.isDestroyed, 'kept').toBeFalsy();
        expect(tasks.getCount()).toBe(0);

        expect(await manager.openApp(apps.get('mail'))).toBe(mail);
        expect(tasks.getCount()).toBe(1)
    });

    test('a minimize keeps a window to restore and its minimized task', async () => {
        const mail = await open('mail');

        mail.executeHeaderAction({action: 'minimize'});

        await expect.poll(() => mail.hidden || mail.isDestroyed).toBe(true);

        expect(mail.isDestroyed, 'kept').toBeFalsy();
        expect(tasks.get('mail').minimized).toBe(true);

        manager.restore('mail');

        expect(mail.hidden).toBe(false);
        expect(tasks.get('mail').minimized).toBe(false)
    })
});
