import {test, expect}  from '@playwright/test';
import {execFile}      from 'node:child_process';
import path            from 'node:path';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'node:url';

const root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
      execute = promisify(execFile);

/**
 * @summary Runs one case against the real app worker and real `Neo.controller.Application` instances, each with a
 * main view holding the components its case names.
 *
 * Runs in a child process: the app worker is a singleton that installs its message handlers and console interceptor
 * at module load. The case body sees the helpers below and writes its observations into `report`.
 * @param {String} body
 * @returns {Promise<Object>} The case's `report`
 */
async function runCase(body) {
    const script = `
        import Neo       from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup}   from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true, useSharedWorkers: true}});

        globalThis.postMessage = () => {};

        delete Neo.worker.App;
        Neo.apps          = {};
        Neo.appsByName    = {};
        Neo.cssMap        = {fileInfo: {}};
        Neo.Main          = {getWindowData: async () => null};
        Neo.windowConfigs = {};

        const
            {default: worker}      = await import('./src/worker/App.mjs'),
            {default: Application} = await import('./src/controller/Application.mjs'),
            {default: Component}   = await import('./src/component/Base.mjs'),
            {default: Container}   = await import('./src/container/Base.mjs'),
            report                 = {},
            // Long enough for an app's main view to settle, and for the task after a disconnect to run
            task                   = () => new Promise(resolve => setTimeout(resolve, 20));

        Object.assign(worker, {isSharedWorker: true, ports: [], promises: {}});

        // A window's port as registerNeoConfig leaves it, with the per-window state the worker keeps for it
        const open = windowId => {
            const entry = {appNames: new Set(), id: 'port-' + windowId, port: {close() {}, postMessage() {}}, windowId};

            worker.ports.push(entry);
            Neo.cssMap[windowId]        = {};
            Neo.windowConfigs[windowId] = {windowId};

            return entry
        };

        // An app booted into its window, as onLoadApplication boots it, whose main view holds one component per name
        const app = (name, windowId, ...names) => {
            Neo.bootingWindowId = windowId;

            const instance = Neo.create(Application, {name,
                mainView: {module: Container, items: names.map(reference => ({module: Component, reference}))}});

            delete Neo.bootingWindowId;

            return {instance, view: instance.mainView, ...Object.fromEntries(names.map((reference, i) =>
                [reference, instance.mainView.items[i]]))}
        };

        const alive = instance => !instance.isDestroyed;

        ${body}

        console.log(JSON.stringify(report));
        process.exit(0)
    `;

    const {stdout} = await execute(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root, encoding: 'utf8', timeout: 15000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/**
 * @summary A departed window's application is destroyed once every `disconnect` listener had its turn.
 *
 * A window is a render target, never a state owner. Its `Neo.controller.Application` and main view would otherwise
 * stay in `Neo.apps` and the component manager for as long as the SharedWorker lives: one app per closed popup and
 * one per reload of the main window. A listener keeps a component by moving it out first; the reap destroys the rest.
 */
test.describe('A departed window\'s application', () => {
    test('is destroyed with its main view one task after the disconnect, while its sibling window keeps its own', async () => {
        const report = await runCase(`
            const port  = open('main');

            open('popup');

            const left  = app('Shop', 'main', 'cart'),
                  stays = app('Shop', 'popup', 'chart');

            await task();

            worker.onDisconnect({appName: 'Shop', windowId: 'main'}, port);
            report.sameTask = alive(left.instance) && alive(left.view);

            await task();
            report.left   = [left.instance, left.view, left.cart].map(alive);
            report.stays  = [stays.instance, stays.view, stays.chart].map(alive);
            report.apps   = Object.keys(Neo.apps);
            report.byName = Neo.appsByName.Shop.map(({windowId}) => windowId);
            report.cssMap = Object.keys(Neo.cssMap);
            report.config = Object.keys(Neo.windowConfigs)
        `);

        expect(report).toEqual({
            sameTask: true,
            left    : [false, false, false],
            stays   : [true, true, true],
            apps    : ['popup'],
            byName  : ['popup'],
            cssMap  : ['fileInfo', 'popup'],
            config  : ['popup']
        })
    });

    test('keeps what a disconnect listener moved out, synchronously or in a microtask', async () => {
        const report = await runCase(`
            const port  = open('popup');

            open('main');

            const left = app('Shop', 'popup', 'now', 'soon', 'lost'),
                  home = app('Shop', 'main');

            await task();

            const move = item => {
                left.view.remove(item, false);
                home.view.add(item)
            };

            worker.on({
                disconnect({windowId}) {
                    if (windowId === 'popup') {
                        move(left.now);
                        Promise.resolve().then(() => move(left.soon))
                    }
                },
                scope: {id: 'departed-window-reap-listener'}
            });

            worker.onDisconnect({appName: 'Shop', windowId: 'popup'}, port);
            await task();

            report.kept   = [left.now, left.soon].map(item => alive(item) && item.parent === home.view);
            report.lost   = alive(left.lost);
            report.reaped = alive(left.instance)
        `);

        expect(report).toEqual({kept: [true, true], lost: false, reaped: false})
    });

    test('naming one app of a window that stays open reaps that app only, and the window keeps its state', async () => {
        const report = await runCase(`
            const port   = open('main'),
                  docs   = app('Docs',   'main', 'page'),
                  editor = app('Editor', 'main', 'canvas');

            await task();
            report.slotBefore = Neo.apps.main === editor.instance;

            worker.onDisconnect({appName: 'Editor', windowId: 'main'}, port);
            await task();

            report.editor    = [editor.instance, editor.view, editor.canvas].map(alive);
            report.docs      = [docs.instance, docs.view, docs.page].map(alive);
            report.slotAfter = Neo.apps.main === docs.instance;
            report.port      = worker.ports.includes(port);
            report.window    = 'main' in Neo.cssMap && 'main' in Neo.windowConfigs
        `);

        expect(report).toEqual({
            slotBefore: true,
            editor    : [false, false, false],
            docs      : [true, true, true],
            slotAfter : true,
            port      : true,
            window    : true
        })
    });

    test('a disconnect from a stale port reaps nothing: the window\'s live port still lists its app', async () => {
        const report = await runCase(`
            open('main');

            const live  = app('Shop', 'main', 'cart'),
                  stale = {appNames: new Set(['Shop']), id: 'port-main-old', port: {close() {}, postMessage() {}}, windowId: 'main'};

            await task();

            worker.onDisconnect({appName: 'Shop', windowId: 'main'}, stale);
            await task();

            report.live = [live.instance, live.view, live.cart].map(alive);
            report.apps = Object.keys(Neo.apps)
        `);

        expect(report).toEqual({live: [true, true, true], apps: ['main']})
    });

    test('a dedicated worker reaps nothing: it ends with its window', async () => {
        const report = await runCase(`
            worker.isSharedWorker = false;

            const only = app('Shop', 'main', 'cart');

            await task();

            worker.onDisconnect({appName: 'Shop', windowId: 'main'});
            await task();

            report.only = [only.instance, only.view, only.cart].map(alive)
        `);

        expect(report).toEqual({only: [true, true, true]})
    })
});
