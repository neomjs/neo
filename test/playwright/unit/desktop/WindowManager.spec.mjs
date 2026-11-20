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
 * A window whose own construction closes its app: the close lands after the window exists and before the open
 * publishes
 */
class ClosingWindow extends FakeWindow {
    static config = {
        className: 'Test.Unit.Desktop.WindowManager.ClosingWindow',
        manager  : null
    }

    onConstructed() {
        super.onConstructed();
        this.manager.close(this.record.id)
    }
}

ClosingWindow = Neo.setupClass(ClosingWindow);

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
 * A window class loader the test releases or fails, by load, the latest by default
 * @returns {{loader: Function, release: Function, fail: Function, calls: Function}}
 */
function heldLoader() {
    let settles = [];

    return {
        calls  : () => settles.length,
        fail   : (index = settles.length - 1) => settles[index].reject(new Error('load failed')),
        loader : () => new Promise((resolve, reject) => {settles.push({resolve, reject})}),
        release: (index = settles.length - 1) => settles[index].resolve({default: FakeWindow})
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

        const {apps, manager, taskIds, tasks} = harness,
              mail                            = await manager.openApp(apps.get('mail')),
              filterListeners                 = () => (apps.toJSON().listeners.filter || []).length,
              listening                       = filterListeners();

        manager.windowClass = held.loader;

        const opening = manager.openApp(apps.get('photos'));

        manager.destroy();
        held.release();

        expect(await opening).toBeNull();
        expect(mail.isDestroyed).toBe(true);
        expect(filterListeners(), 'the apps store reaches a destroyed manager no more').toBe(listening - 1);

        // The tasks named windows that are gone; the store the consumer passed lives on, usable
        expect(taskIds()).toEqual([]);
        tasks.add({id: 'later', text: 'later'});
        expect(taskIds()).toEqual(['later'])
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

// An open publishes its window and task only while it is still current, during its load and after it
test.describe('Neo.desktop.WindowManager: what an open may publish', () => {
    let harness;

    test.afterEach(() => {
        harness.destroy()
    });

    test('a filter that drops the app, or a close, during the load creates no window and no task', async () => {
        const held = heldLoader();

        harness = createHarness({windowClass: held.loader});

        const {apps, manager, taskIds} = harness,
              mail                     = manager.openApp(apps.get('mail'));

        apps.getFilter('permission').value = ['view-photos', 'view-help'];
        held.release();

        expect(await mail).toBeNull();
        expect(manager.getWindow('mail')).toBeNull();

        const photos = manager.openApp(apps.get('photos'));

        manager.close('photos');
        held.release();

        expect(await photos).toBeNull();
        expect(manager.getWindow('photos')).toBeNull();
        expect(taskIds()).toEqual([])
    });

    test('an app store that does not keep an app closes its window and ends its load', async () => {
        const held        = heldLoader(),
              restrictive = Neo.create(TreeStore, {
                  data   : ['mail', 'photos', 'help'].map(id => ({id, permission: `view-${id}`, text: id})),
                  filters: [{includeEmptyValues: false, operator: 'included', property: 'permission', value: []}],
                  model  : AppModel
              });

        // Filtered after its construction, where TreeStore#isKept() reads the filter
        restrictive.getFilter('permission').value = ['view-help'];

        harness = createHarness();

        const {apps, manager, taskIds} = harness;

        try {
            const mail = await manager.openApp(apps.get('mail'));

            manager.windowClass = held.loader;

            const photos = manager.openApp(apps.get('photos'));

            manager.appStore = restrictive;

            expect(taskIds()).toEqual([]);
            expect(mail.hidden).toBe(true);

            held.release();

            expect(await photos).toBeNull();
            expect(taskIds()).toEqual([])
        } finally {
            manager.destroy();
            restrictive.destroy()
        }
    });

    test('an open after a reset loads afresh, and the load the reset cancelled creates nothing', async () => {
        const held = heldLoader();

        harness = createHarness({windowClass: held.loader});

        const {apps, manager, taskIds} = harness,
              first                    = manager.openApp(apps.get('mail'));

        manager.reset();

        const second = manager.openApp(apps.get('mail'));

        expect(held.calls(), 'no wait on the cancelled load').toBe(2);

        held.release(1);

        const mail = await second;

        expect(mail).toBeTruthy();
        expect(taskIds()).toEqual(['mail']);

        held.release(0);

        expect(await first).toBeNull();
        expect(manager.getWindow('mail'), 'one window').toBe(mail)
    });

    test('an open of a kept window ends with a reset right after it, and reads nothing after a destroy', async () => {
        harness = createHarness();

        const {apps, manager, taskIds} = harness,
              mail                     = await manager.openApp(apps.get('mail'));

        manager.close('mail');

        const reopening = manager.openApp(apps.get('mail'));

        manager.reset();
        await reopening;

        expect(taskIds()).toEqual([]);
        expect(mail.hidden).toBe(true);

        const afterDestroy = manager.openApp(apps.get('mail'));

        manager.destroy();

        // A continuation that read the released task store would reject here
        await afterDestroy
    });

    test('an open that ends after its window exists publishes no task and shows nothing', async () => {
        let manager;

        // The close lands between the window's creation and the open's publication
        harness = createHarness({windowClass: ClosingWindow, windowConfig: record => ({manager, record})});
        manager = harness.manager;

        const {apps, taskIds} = harness;

        expect(await manager.openApp(apps.get('mail'))).toBeNull();
        expect(taskIds()).toEqual([]);
        expect(manager.getWindow('mail').hidden, 'kept, never shown').toBe(true)
    });

    test('a restore shows only an app that has a task', async () => {
        harness = createHarness();

        const {apps, manager} = harness,
              mail            = await manager.openApp(apps.get('mail'));

        manager.close('mail');
        manager.restore('mail');

        expect(mail.hidden).toBe(true)
    });

    // An open still loading has no task, so a filter pass over the tasks alone never sees it
    test('a filter that drops an app during its load ends the open, though it keeps the app again before the load settles', async () => {
        const held = heldLoader();

        harness = createHarness({windowClass: held.loader});

        const {apps, manager, taskIds} = harness,
              filter                   = apps.getFilter('permission'),
              mail                     = manager.openApp(apps.get('mail'));

        filter.value = ['view-photos', 'view-help'];
        filter.value = ['view-mail', 'view-photos', 'view-help'];
        held.release();

        expect(await mail).toBeNull();
        expect(manager.getWindow('mail')).toBeNull();
        expect(taskIds()).toEqual([])
    });

    test('a swap to an app store that drops an app during its load, and back, ends the open', async () => {
        const held        = heldLoader(),
              restrictive = Neo.create(TreeStore, {
                  data   : ['mail', 'photos', 'help'].map(id => ({id, permission: `view-${id}`, text: id})),
                  filters: [{includeEmptyValues: false, operator: 'included', property: 'permission', value: []}],
                  model  : AppModel
              });

        // Filtered after its construction, where TreeStore#isKept() reads the filter
        restrictive.getFilter('permission').value = ['view-help'];

        harness = createHarness({windowClass: held.loader});

        const {apps, manager, taskIds} = harness;

        try {
            const mail = manager.openApp(apps.get('mail'));

            manager.appStore = restrictive;
            manager.appStore = apps;
            held.release();

            expect(await mail).toBeNull();
            expect(taskIds()).toEqual([])
        } finally {
            manager.destroy();
            restrictive.destroy()
        }
    });

    test('an app store that lacks an app, filtered or not, closes its window and ends its load', async () => {
        const held = heldLoader(),
              help = Neo.create(TreeStore, {data: [{id: 'help', permission: 'view-help', text: 'help'}], model: AppModel});

        harness = createHarness();

        const {apps, manager, taskIds} = harness;

        try {
            const mail = await manager.openApp(apps.get('mail'));

            manager.windowClass = held.loader;

            const photos = manager.openApp(apps.get('photos'));

            manager.appStore = help;

            expect(taskIds(), 'the window of an app the store lacks closes').toEqual([]);
            expect(mail.hidden).toBe(true);

            held.release();

            expect(await photos, 'the load of an app the store lacks publishes nothing').toBeNull();
            expect(taskIds()).toEqual([])
        } finally {
            manager.destroy();
            help.destroy()
        }
    })
});

test.describe('Neo.desktop.WindowManager: a task store it shares', () => {
    let harness;

    test.afterEach(() => {
        harness.destroy()
    });

    test('a reset and a destroy remove only the manager\'s tasks: a task its owner added stays', async () => {
        harness = createHarness();

        const {apps, manager, tasks, taskIds} = harness;

        tasks.add({id: 'owned-elsewhere', text: 'owned elsewhere'});

        await manager.openApp(apps.get('mail'));
        manager.reset();

        expect(taskIds(), 'after the reset').toEqual(['owned-elsewhere']);

        await manager.openApp(apps.get('photos'));
        manager.destroy();

        expect(taskIds(), 'after the destroy').toEqual(['owned-elsewhere'])
    });

    test('an open a store listener starts while the manager is destroyed publishes nothing', async () => {
        harness = createHarness();

        const {apps, manager, tasks, taskIds} = harness,
              mail                            = await manager.openApp(apps.get('mail'));

        let reopened = null;

        tasks.on('mutate', () => {reopened ??= manager.openApp(apps.get('mail'))});

        manager.destroy();

        expect(reopened, 'the listener ran during the destroy').not.toBeNull();
        expect(await reopened).toBeNull();
        expect(taskIds()).toEqual([]);
        expect(mail.isDestroyed).toBe(true)
    });

    test('a catalog swap of one manager leaves the tasks of another manager on the same store', async () => {
        harness = createHarness();

        const {apps, manager, tasks, taskIds} = harness,
              otherApps = Neo.create(TreeStore, {data: [{id: 'other', permission: 'view-other', text: 'other'}], model: AppModel}),
              mailOnly  = Neo.create(TreeStore, {data: [{id: 'mail',  permission: 'view-mail',  text: 'mail'}],  model: AppModel}),
              other     = Neo.create(WindowManager, {appStore: otherApps, taskStore: tasks, windowClass: FakeWindow, windowConfig: record => ({record})});

        try {
            await manager.openApp(apps.get('mail'));
            await other.openApp(otherApps.get('other'));

            manager.appStore = mailOnly;

            expect(taskIds()).toEqual(['mail', 'other'])
        } finally {
            other.destroy();
            otherApps.destroy();
            mailOnly.destroy()
        }
    });

    test('a replacing app store binds the window of an app it keeps to its own record', async () => {
        harness = createHarness();

        const {apps, manager} = harness,
              renamed         = Neo.create(TreeStore, {data: [{id: 'mail', permission: 'view-mail', text: 'Mail, renamed'}], model: AppModel});

        try {
            const mail = await manager.openApp(apps.get('mail'));

            manager.appStore = renamed;

            expect(manager.getWindow('mail')).toBe(mail);
            expect(mail.record, 'no record of the old store').toBe(renamed.get('mail'))
        } finally {
            renamed.destroy()
        }
    });

    test('a destroy leaves a task the store owner put under a key the manager released', async () => {
        harness = createHarness();

        const {apps, manager, tasks} = harness;

        await manager.openApp(apps.get('mail'));
        manager.close('mail');

        const [owners] = tasks.add({id: 'mail', text: 'the owner\'s mail'});

        manager.destroy();

        expect(tasks.get('mail')).toBe(owners)
    });

    test('an app whose key holds another owner\'s task opens its window and leaves that task alone, through a close', async () => {
        harness = createHarness();

        const {apps, manager, tasks} = harness,
              [owners]               = tasks.add({id: 'mail', text: 'the owner\'s mail'}),
              mail                   = await manager.openApp(apps.get('mail'));

        expect(mail.hidden).toBe(false);
        expect(tasks.get('mail')).toBe(owners);

        manager.close('mail');

        expect(mail.hidden).toBe(true);
        expect(tasks.get('mail')).toBe(owners)
    });

    test('a task a store listener puts in place of the manager\'s during its add stays the listener\'s, through a destroy', async () => {
        harness = createHarness();

        const {apps, manager, tasks} = harness;

        let replacement = null,
            replacing   = false;

        tasks.on('mutate', ({addedItems}) => {
            if (!replacing && addedItems?.some(task => task.id === 'mail')) {
                replacing = true;
                tasks.remove(tasks.get('mail'));
                [replacement] = tasks.add({id: 'mail', text: 'the listener\'s mail'})
            }
        });

        await manager.openApp(apps.get('mail'));

        expect(tasks.get('mail'), 'the listener replaced the task').toBe(replacement);

        manager.destroy();

        expect(tasks.get('mail')).toBe(replacement)
    });

    for (const end of ['reset', 'destroy']) {
        test(`an open a store listener ends with a ${end} during its task's add shows nothing and returns null`, async () => {
            harness = createHarness();

            const {apps, manager, tasks, taskIds} = harness;

            let ended = false;

            tasks.on('mutate', ({addedItems}) => {
                if (!ended && addedItems?.some(task => task.id === 'mail')) {
                    ended = true;
                    manager[end]()
                }
            });

            expect(await manager.openApp(apps.get('mail'))).toBeNull();
            expect(taskIds()).toEqual([]);

            end === 'reset' && expect(manager.getWindow('mail').hidden, 'never shown').toBe(true)
        })
    }
});

test.describe('Neo.desktop.WindowManager: a window config that calls back into the manager', () => {
    let harness;

    test.afterEach(() => {
        harness.destroy()
    });

    test('an open the config callback starts for its own app joins the first: one window, one task', async () => {
        let manager, inner;

        harness = createHarness({windowConfig: record => {
            inner ??= manager.openApp(record);
            return {record}
        }});
        manager = harness.manager;

        const {apps, taskIds} = harness,
              outer           = await manager.openApp(apps.get('mail'));

        expect(outer).toBeTruthy();
        expect(await inner).toBe(outer);
        expect(taskIds()).toEqual(['mail'])
    });

    test('a config callback that closes its app ends that open, and an open right after it loads afresh', async () => {
        let manager, calls = 0;

        harness = createHarness({windowConfig: record => {
            ++calls === 1 && manager.close(record.id);
            return Promise.resolve({record})
        }});
        manager = harness.manager;

        const {apps, taskIds} = harness,
              first           = manager.openApp(apps.get('mail')),
              second          = manager.openApp(apps.get('mail'));

        expect(await first).toBeNull();
        expect(await second).toBe(manager.getWindow('mail'));
        expect(calls).toBe(2);
        expect(taskIds()).toEqual(['mail'])
    });

    test('a config callback that throws rejects the open, the class load beside it stays observed, and the next open loads again', async () => {
        const held      = heldLoader(),
              unhandled = [],
              collect   = reason => unhandled.push(reason);

        let fail = true;

        process.on('unhandledRejection', collect);

        try {
            harness = createHarness({windowClass: held.loader, windowConfig: record => {
                if (fail) throw new Error('config failed');
                return {record}
            }});

            const {apps, manager, taskIds} = harness,
                  failing                  = manager.openApp(apps.get('mail'));

            held.fail();
            await expect(failing).rejects.toThrow('config failed');

            // An unobserved rejection surfaces once the microtasks drained
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(unhandled).toEqual([]);

            fail = false;

            const opening = manager.openApp(apps.get('mail'));

            held.release();

            expect(await opening).toBeTruthy();
            expect(held.calls()).toBe(2);
            expect(taskIds()).toEqual(['mail'])
        } finally {
            process.off('unhandledRejection', collect)
        }
    })
});
