import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'DesktopWindowManagerTest'
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Base            from '../../../../src/core/Base.mjs';
import TreeModel       from '../../../../src/data/TreeModel.mjs';
import TreeStore       from '../../../../src/data/TreeStore.mjs';
import Tasks           from '../../../../src/desktop/store/Tasks.mjs';
import WindowManager   from '../../../../src/desktop/WindowManager.mjs';

/**
 * @summary The window rules of `Neo.desktop.WindowManager`, run against a real apps tree, a real tasks store and the
 * real store events. A window stands in for a `Neo.dialog.Base`: it fires `hide` when it hides, as a dialog does.
 */

class AppModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Desktop.WindowManager.AppModel',
        fields   : [
            {name: 'color',      type: 'String'},
            {name: 'iconCls',    type: 'String'},
            {name: 'id',         type: 'String'},
            {name: 'permission', type: 'String'},
            {name: 'text',       type: 'String'}
        ]
    }
}

AppModel = Neo.setupClass(AppModel);

class FakeWindow extends Base {
    static config = {
        className: 'Test.Unit.Desktop.WindowManager.FakeWindow',
        hidden   : false,
        record   : null,
        style    : null
    }

    static observable = true

    domListeners = []
    hides        = []

    addDomListeners(listeners) {
        this.domListeners.push(listeners)
    }

    hide(animate = true) {
        this.hidden = true;
        this.hides.push(animate);
        this.fire('hide', {component: this})
    }

    show() {
        this.hidden = false
    }
}

FakeWindow = Neo.setupClass(FakeWindow);

/**
 * @param {Object} [config={}] WindowManager configs
 * @returns {Object}
 */
function createHarness(config = {}) {
    const
        apps    = Neo.create(TreeStore, {
            data   : ['mail', 'photos', 'help'].map(id => ({id, iconCls: `icon-${id}`, permission: `view-${id}`, text: id})),
            filters: [{includeEmptyValues: false, operator: 'included', property: 'permission', value: ['view-mail', 'view-photos', 'view-help']}],
            model  : AppModel
        }),
        tasks   = Neo.create(Tasks),
        manager = Neo.create(WindowManager, {
            appStore    : apps,
            taskStore   : tasks,
            windowClass : FakeWindow,
            windowConfig: record => ({record}),
            ...config
        });

    return {
        apps, manager, tasks,
        destroy() {manager.isDestroyed || manager.destroy(); apps.destroy(); tasks.destroy()},
        taskIds: () => tasks.items.map(task => task.id)
    }
}

/**
 * A window class loader the test releases or fails
 * @returns {{loader: Function, release: Function, fail: Function, calls: Function}}
 */
function heldLoader() {
    let calls = 0,
        settle;

    return {
        calls  : () => calls,
        fail   : () => settle.reject(new Error('load failed')),
        loader : () => {calls++; return new Promise((resolve, reject) => {settle = {resolve, reject}})},
        release: () => settle.resolve({default: FakeWindow})
    }
}

const zIndexOf = window => window.style.zIndex;

test.describe('Neo.desktop.WindowManager', () => {
    let harness;

    test.afterEach(() => {
        harness.destroy()
    });

    test('two opens during one slow load create one window and one task', async () => {
        const held = heldLoader();

        harness = createHarness({windowClass: held.loader});

        const {apps, manager, taskIds} = harness,
              opens                    = [manager.openApp(apps.get('mail')), manager.openApp(apps.get('mail'))];

        held.release();

        const [first, second] = await Promise.all(opens);

        expect(held.calls()).toBe(1);
        expect(second).toBe(first);
        expect(first.record).toBe(apps.get('mail'));
        expect(taskIds()).toEqual(['mail'])
    });

    test('a minimize keeps the task, and a close removes it, minimized or not', async () => {
        harness = createHarness();

        const {apps, manager, tasks, taskIds} = harness,
              mail                            = await manager.openApp(apps.get('mail')),
              photos                          = await manager.openApp(apps.get('photos'));

        photos.fire('headerAction', {action: 'minimize', dialog: photos});

        expect(photos.hidden).toBe(true);
        expect(tasks.get('photos').minimized).toBe(true);

        mail.hide(); // the header X, or Escape
        expect(taskIds()).toEqual(['photos']);

        manager.close('photos');
        expect(taskIds()).toEqual([])
    });

    test('a restore shows a minimized window again, and an open of a minimized app un-minimizes its task', async () => {
        harness = createHarness();

        const {apps, manager, tasks} = harness,
              mail                   = await manager.openApp(apps.get('mail'));

        manager.minimize('mail');
        manager.restore('mail');

        expect(mail.hidden).toBe(false);
        expect(tasks.get('mail').minimized).toBe(false);

        manager.minimize('mail');

        expect(await manager.openApp(apps.get('mail')), 'the same window').toBe(mail);
        expect(mail.hidden).toBe(false);
        expect(tasks.get('mail').minimized).toBe(false)
    });

    test('a filter that drops an app closes its window, minimized or not, without animation', async () => {
        harness = createHarness();

        const {apps, manager, taskIds} = harness,
              mail                     = await manager.openApp(apps.get('mail')),
              photos                   = await manager.openApp(apps.get('photos')),
              help                     = await manager.openApp(apps.get('help'));

        manager.minimize('photos');

        apps.getFilter('permission').value = ['view-help'];

        expect(taskIds()).toEqual(['help']);
        expect(mail.hides, 'hidden at once: its icon may be gone').toEqual([false]);
        expect(photos.hides, 'minimized before, so not hidden again').toEqual([true]);
        expect(help.hidden).toBe(false)
    });

    test('a reset during a load creates no window, and a reset after hides every window without animation', async () => {
        const held = heldLoader();

        harness = createHarness({windowClass: held.loader});

        const {apps, manager, taskIds} = harness,
              opening                  = manager.openApp(apps.get('mail'));

        manager.reset();
        held.release();

        expect(await opening).toBeNull();
        expect(manager.getWindow('mail')).toBeNull();
        expect(taskIds()).toEqual([]);

        const reopening = manager.openApp(apps.get('mail'));

        held.release();

        const mail = await reopening;

        expect(held.calls(), 'a cancelled load caches nothing').toBe(2);

        manager.reset();

        expect(mail.hides).toEqual([false]);
        expect(taskIds()).toEqual([]);
        expect(manager.getWindow('mail'), 'kept for the next open').toBe(mail)
    });

    test('a failed load caches nothing, so the next open loads again', async () => {
        const held = heldLoader();

        harness = createHarness({windowClass: held.loader});

        const {apps, manager, taskIds} = harness,
              failing                  = manager.openApp(apps.get('mail'));

        held.fail();
        await expect(failing).rejects.toThrow('load failed');
        expect(taskIds()).toEqual([]);

        const opening = manager.openApp(apps.get('mail'));

        held.release();

        expect(await opening).toBeTruthy();
        expect(held.calls()).toBe(2);
        expect(taskIds()).toEqual(['mail'])
    });

    test('destroy() destroys the windows it created, and a load still running creates none', async () => {
        const held = heldLoader();

        harness = createHarness();

        const {apps, manager} = harness,
              mail            = await manager.openApp(apps.get('mail')),
              filterListeners = () => (apps.toJSON().listeners.filter || []).length,
              listening       = filterListeners();

        manager.windowClass = held.loader;

        const opening = manager.openApp(apps.get('photos'));

        manager.destroy();
        held.release();

        expect(await opening).toBeNull();
        expect(mail.isDestroyed).toBe(true);
        expect(filterListeners(), 'the apps store reaches a destroyed manager no more').toBe(listening - 1)
    });

    test('a window brought to the front is above the others of its manager, and two managers keep separate stacks', async () => {
        harness = createHarness();

        const {apps, manager} = harness,
              other           = createHarness();

        try {
            const windows = [];

            for (const id of ['mail', 'photos', 'help']) {
                windows.push(await manager.openApp(apps.get(id)))
            }

            expect(windows.map(zIndexOf), 'in the order they opened, from baseZIndex up').toEqual([11, 12, 13]);

            manager.bringToFront('mail');
            expect(windows.map(zIndexOf)).toEqual([13, 11, 12]);

            // A mousedown on a window brings it to the front
            windows[1].domListeners[0].mousedown();
            expect(windows.map(zIndexOf)).toEqual([12, 13, 11]);

            const otherMail = await other.manager.openApp(other.apps.get('mail'));

            expect(zIndexOf(otherMail), 'its own stack').toBe(11);
            expect(windows.map(zIndexOf), 'this stack is untouched').toEqual([12, 13, 11])
        } finally {
            other.destroy()
        }
    })
});
