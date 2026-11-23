import {setup} from '../../setup.mjs';

const appName = 'DesktopContainerTest';

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
import Apps           from '../../../../src/desktop/store/Apps.mjs';
import AppWindow      from '../../../../src/desktop/AppWindow.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/desktop/Container.mjs';
import Rectangle      from '../../../../src/util/Rectangle.mjs';
import StateProvider  from '../../../../src/state/Provider.mjs';
import Tasks          from '../../../../src/desktop/store/Tasks.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

/**
 * @summary `Neo.desktop.Container` assembles the shell: it hands one apps store to the launcher, the start menu and
 * its window manager, opens `Neo.desktop.AppWindow`s that show their app and continue into the container's state
 * provider, and takes them along when it goes. The main-thread reads and the mount are stubbed, as in
 * `WindowManagerDialog.spec.mjs`.
 */

const
    dialogRect = {height: 300, left: 400, top: 250, width: 400},
    targetRect = {height: 56,  left: 32,  top: 40,  width: 56};

/**
 * An app window whose main-thread reads answer at once and whose mount lands at once. Its item shows the app and the
 * desktop's `user`, both through bindings.
 */
class TestWindow extends AppWindow {
    static config = {
        className: 'Test.Unit.Desktop.Container.TestWindow',
        draggable: false,
        resizable: false,
        items    : [{
            module   : Component,
            bind     : {text: data => `${data.record?.text} for ${data.user}`},
            reference: 'content'
        }]
    }

    async getDomRect(ids) {
        // The boundary check measures the window inside its workspace; the animations measure the launcher icon
        if (ids[1] === this.boundaryContainerId) {
            return [new Rectangle(400, 250, 400, 300), new Rectangle(0, 0, 1200, 800)]
        }

        return Array.isArray(ids) ? [dialogRect, targetRect] : targetRect
    }

    initVnode() {
        this._mounted = true;
        return Promise.resolve()
    }

    async waitForDomRect() {
        return [dialogRect, {height: 800, left: 0, top: 0, width: 1200}]
    }
}

TestWindow = Neo.setupClass(TestWindow);

/**
 * An app's own view, which an `appWindowConfigs` entry puts into its window
 */
class MailView extends Component {
    static config = {
        className: 'Test.Unit.Desktop.Container.MailView',
        text     : 'Inbox'
    }
}

MailView = Neo.setupClass(MailView);

const catalog = [
    {id: 'work',  text: 'Work',  iconCls: 'fas fa-briefcase', isLeaf: false, collapsed: false},
    {id: 'mail',  text: 'Mail',  iconCls: 'fas fa-envelope', parentId: 'work', color: '#3b82f6'},
    {id: 'notes', text: 'Notes', iconCls: 'fas fa-note',     parentId: 'work', color: '#f97316'}
];

test.describe('Neo.desktop.Container', () => {
    let applyDeltas, apps, desktop, domAccess, ownMethods, provider;

    test.beforeEach(() => {
        applyDeltas     = Neo.applyDeltas;
        Neo.applyDeltas = async () => {};

        // setup() stands in for most of DomAccess, not for the two remotes a dialog syncs on every show and hide
        domAccess  = Neo.main.DomAccess;
        ownMethods = ['syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);

        ownMethods.forEach(([name]) => {domAccess[name] = () => {}});

        apps = Neo.create(Apps, {data: catalog})
    });

    test.afterEach(() => {
        desktop?.isDestroyed || desktop?.destroy();
        provider?.isDestroyed || provider?.destroy();
        apps.destroy();

        desktop = provider = null;

        Neo.applyDeltas = applyDeltas;

        ownMethods.forEach(([name, own, method]) => {own ? domAccess[name] = method : delete domAccess[name]})
    });

    /**
     * @param {Object} [config]
     * @returns {Neo.desktop.Container}
     */
    const create = config => desktop = Neo.create(Container, {
        appName,
        appStore   : apps,
        windowClass: TestWindow,
        windowId   : 1,
        ...config
    });

    /**
     * @param {String} id
     * @returns {Promise<Neo.desktop.AppWindow>} The app's window, once its show animation landed
     */
    const open = async id => {
        const window = await desktop.openApp(apps.get(id));

        await expect.poll(() => window.mounted && !window.mountFlight).toBe(true);

        return window
    };

    test('one apps store feeds the launcher, the start menu and the window manager', async () => {
        create();

        const startButton = desktop.getItem('start-button');

        expect(desktop.getItem('launcher').store, 'launcher').toBe(apps);
        expect(desktop.getItem('taskbar').appStore, 'taskbar').toBe(apps);
        expect(desktop.windowManager.appStore, 'window manager').toBe(apps);
        expect(startButton.menu.store, 'start menu').toBe(apps)
    });

    test('without a task store it creates one, shares it, and destroys only its own', () => {
        create();

        const created = desktop.taskStore;

        expect(created).toBeInstanceOf(Tasks);
        expect(desktop.getItem('tasks').store, 'task list').toBe(created);
        expect(desktop.windowManager.taskStore, 'window manager').toBe(created);

        desktop.destroy();
        expect(created.isDestroyed, 'created store').toBe(true);

        const given = Neo.create(Tasks);

        create({taskStore: given});
        desktop.destroy();

        expect(given.isDestroyed, 'given store').toBeFalsy();
        expect(apps.isDestroyed, 'apps store').toBeFalsy();

        given.destroy()
    });

    test('an app opens in a window that shows its record and lists it as a task', async () => {
        create();

        const mail = await open('mail');

        expect(mail).toBeInstanceOf(TestWindow);
        expect(mail.record).toBe(apps.get('mail'));
        expect(mail.title).toBe('Mail');
        expect(mail.parentComponent).toBe(desktop);
        expect(mail.boundaryContainerId).toBe(desktop.getItem('workspace').id);
        expect(mail.keepInBoundary, 'stays inside a workspace that changes size').toBe(true);
        expect(mail.headerToolbar.down({flag: 'app-icon'}).cellIconCls).toEqual(['fas', 'fa-envelope']);
        expect(desktop.taskStore.get('mail').text).toBe('Mail')
    });

    test('a start menu copy of an app opens the window of the store record', async () => {
        create();

        const window = await desktop.openApp({id: 'notes', text: 'Notes'});

        expect(window.record).toBe(apps.get('notes'));
        expect(apps.get('notes').handler, 'start menu handler').toBe('up.onStartMenuAppChoose');
        expect(apps.get('work').handler, 'a group opens its submenu').toBeNull()
    });

    test('a window item binds the app and the data of the container\'s provider', async () => {
        provider = Neo.create(StateProvider, {data: {user: 'Ada'}});
        create({stateProvider: provider});

        const mail = await open('mail');

        await expect.poll(() => mail.getReference('content').text).toBe('Mail for Ada')
    });

    test('an appWindowConfigs entry gives its app a size and a view; an app without one opens the window class as it is', async () => {
        create({appWindowConfigs: {mail: {height: 520, keepInBoundary: false, width: 760, view: MailView}}});

        const mail  = await open('mail'),
              notes = await open('notes');

        expect([mail.width, mail.height], 'its size').toEqual([760, 520]);
        expect([mail.keepInBoundary, notes.keepInBoundary], 'an entry opts out of the boundary check').toEqual([false, true]);
        expect(mail.down({className: 'Test.Unit.Desktop.Container.MailView'}), 'its view').toBeTruthy();
        expect(mail.down({reference: 'content'}), 'the window class item it replaces').toBeFalsy();

        expect([notes.width, notes.height], 'the window class size').toEqual([520, 380]);
        expect(notes.down({reference: 'content'}), 'the window class item').toBeTruthy()
    });

    test('a loader view runs on its app\'s first open, and a second open during the load joins it', async () => {
        let calls = 0,
            release;

        const loaded = new Promise(resolve => {release = resolve});

        create({appWindowConfigs: {mail: {view: () => {calls++; return loaded}}}});

        expect(calls, 'nothing loads with the desktop').toBe(0);

        const first  = desktop.openApp(apps.get('mail')),
              second = desktop.openApp(apps.get('mail'));

        expect(calls, 'one load for both opens').toBe(1);

        release({default: MailView});

        const [a, b] = await Promise.all([first, second]);

        expect(a, 'one window').toBe(b);
        expect(a.down({className: 'Test.Unit.Desktop.Container.MailView'}), 'the loaded view').toBeTruthy();
        expect(calls, 'still one load').toBe(1)
    });

    test('an open that ends during the view\'s load creates no window, and a failed load lets the next open retry', async () => {
        let attempts = 0,
            release;

        create({appWindowConfigs: {mail: {view: () => {
            attempts++;

            if (attempts === 1) {
                return new Promise(resolve => {release = resolve})
            }

            return attempts === 2 ? Promise.reject(new Error('the chunk failed to load')) : Promise.resolve({default: MailView})
        }}}});

        const ended = desktop.openApp(apps.get('mail'));

        desktop.windowManager.close('mail');
        release({default: MailView});

        expect(await ended, 'the ended open').toBeNull();
        expect(desktop.windowManager.getWindow('mail'), 'no window').toBeNull();

        await expect(desktop.openApp(apps.get('mail')), 'the failed load').rejects.toThrow('the chunk failed to load');

        const mail = await desktop.openApp(apps.get('mail'));

        expect(mail.down({className: 'Test.Unit.Desktop.Container.MailView'}), 'the retry').toBeTruthy();
        expect(attempts).toBe(3)
    });

    test('a task click restores a minimized window', async () => {
        create();

        const mail = await open('mail');

        desktop.windowManager.minimize('mail');

        // The window shrinks into its launcher icon first
        await expect.poll(() => mail.hidden).toBe(true);

        desktop.onTaskItemClick({record: desktop.taskStore.get('mail')});

        expect(mail.hidden).toBe(false);
        expect(desktop.taskStore.get('mail').minimized).toBe(false)
    });

    test('its destroy takes the windows along', async () => {
        create();

        const mail = await open('mail');

        desktop.destroy();

        expect(mail.isDestroyed).toBe(true)
    });

    test('the taskbar clock shows the time over the date, and its wait ends on the next full minute', async () => {
        create();

        const taskbar = desktop.getItem('taskbar'),
              clock   = taskbar.getItem('clock'),
              moment  = new Date(2026, 10, 18, 9, 5, 42, 500);

        taskbar.syncClock(moment);

        const [time, day] = clock.vdom.cn.map(node => node.text);

        expect(time, 'the minutes').toContain('05');
        expect(day, 'the day of the month').toContain('18');

        // A loop of its own: the stubbed wait records its delay, then ends the loop as a destroy would
        let delay;

        taskbar.timeout = ms => {delay = ms; return Promise.reject(Neo.isDestroyed)};

        const started = Date.now();

        await taskbar.runClock();

        // The clock reads the time a moment after `started`, so its wait can end a millisecond before the minute
        // as well as after it: measure the distance to the nearest full minute on either side
        const offset = (started + delay) % 60000;

        expect(Math.min(offset, 60000 - offset), 'the wait ends on a full minute').toBeLessThan(50)
    });

    test('a consumer adds its own items to the workspace and the taskbar by key', () => {
        create({
            items        : {workspace: {items: {panel: {module: Component, cls: ['panel'], weight: 20}}}},
            taskbarConfig: {items: {account: {module: Component, cls: ['account'], weight: 40}}}
        });

        const workspace = desktop.getItem('workspace'),
              taskbar   = desktop.getItem('taskbar');

        expect(workspace.items.map(item => item.reference)).toEqual(['launcher', 'panel']);
        expect(taskbar.items.map(item => item.reference), 'a consumer item sits before the clock').toEqual(['start-button', 'tasks', 'spacer', 'account', 'clock'])
    });

    test('a consumer hides a shipped taskbar item with hidden: true, and the taskbar keeps working', () => {
        create({taskbarConfig: {items: {clock: {hidden: true}, 'start-button': {hidden: true}}}});

        const taskbar = desktop.getItem('taskbar');

        expect(taskbar.getItem('clock').hidden).toBe(true);
        expect(taskbar.getItem('start-button').hidden).toBe(true);
        expect(taskbar.getItem('start-button').menu, 'the hidden start button keeps its app menu').toBeTruthy()
    })
});
