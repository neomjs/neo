import {test, expect}  from '@playwright/test';
import {execFile}      from 'node:child_process';
import path            from 'node:path';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'node:url';

const root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
      execute = promisify(execFile);

/**
 * @summary Runs one case against the real app worker: `Neo.worker.App#insertThemeFiles` sends `addThemeFiles` through
 * the `Neo.main.addon.Stylesheet` remote proxy over a real `MessageChannel` per window, and a component in a live
 * window runs its `updateVdom()` gate against the same worker.
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

        setup({
            appConfig: {name: 'ThemeFileDepartureTest'},
            mockMain : false,
            neoConfig: {allowVdomUpdatesInTests: true, unitTestMode: true, useDomApiRenderer: true, useVdomWorker: false}
        });

        globalThis.postMessage = () => {};
        delete Neo.worker.App;

        const
            {default: app}       = await import('./src/worker/App.mjs'),
            {default: Component} = await import('./src/component/Base.mjs'),
            report               = {},
            // Two tasks: a message lands in one, and what it releases crosses its channel in the next
            tick                 = async () => {
                await new Promise(resolve => setTimeout(resolve, 5));
                await new Promise(resolve => setTimeout(resolve, 5))
            };

        await import('./src/vdom/Helper.mjs');
        await import('./src/vdom/util/DomApiVnodeCreator.mjs');

        Object.assign(app, {isSharedWorker: true, ports: [], promises: {}});
        app.onRegisterRemote({className: 'Neo.main.addon.Stylesheet', destination: 'app', methods: ['addThemeFiles'], origin: 'main'});

        // The worker's boundary for a rejection nobody handles, which its unhandledrejection listener runs in a browser
        process.on('unhandledRejection', reason => app.onUnhandledRejection({defaultPrevented: false, preventDefault() {}, reason}));

        Neo.cssMap        = {fileInfo: {Neo: {button: {Base: ['src', 'theme-light']}}}};
        Neo.windowConfigs = {};

        // One themed window's main thread over its own port: it answers every remote call until it unloads. The
        // returned close() is that unload — no further answers, and the disconnect it sends
        const openWindow = windowId => {
            const channel = new MessageChannel(),
                  entry   = {appNames: new Set(['App']), id: 'port-' + windowId, port: channel.port1, windowId};
            let open = true;

            Neo.windowConfigs[windowId] = {themes: ['neo-theme-light']};
            app.ports.push(entry);
            entry.port.onmessage = event => app.onMessage(event, entry);

            channel.port2.onmessage = ({data}) => {
                open && data.action === 'remoteMethod' && channel.port2.postMessage({action: 'reply', data: null, replyId: data.id})
            };

            return () => {
                open = false;
                channel.port2.postMessage({action: 'disconnect', appName: 'App', windowId})
            }
        };

        // A mounted component of a live window, ready for its next update
        const mountedComponent = async windowId => {
            const component = Neo.create(Component, {appName: 'ThemeFileDepartureTest', windowId});

            await component.initVnode();
            component.mounted = true;

            return component
        };

        // The gate a component's update passes outside unit-test mode: it either executes, or waits for theme files
        const nextUpdate = component => {
            const on    = app.on,
                  waits = [];
            let executed = 0;

            component.executeVdomUpdate = () => {executed++};
            app.on = function(name, ...args) {typeof name === 'string' && waits.push(name); return on.call(this, name, ...args)};

            Neo.config.unitTestMode = false;

            try {
                component.updateVdom()
            } finally {
                Neo.config.unitTestMode = true;
                app.on = on
            }

            return {executed, waits}
        };

        ${body}

        app.ports.forEach(({port}) => port.close());

        console.log(JSON.stringify(report));
        process.exit(0)
    `;

    const {stdout} = await execute(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root, encoding: 'utf8', timeout: 15000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/**
 * @summary A theme-file load holds every window's vdom work until its reply settles, so a reply that can never resolve
 * must still release it.
 *
 * `countLoadingThemeFiles` is worker-wide: while it is above zero, every `initVnode(true)` and every `updateVdom()` of
 * every window waits for `themeFilesLoaded`. A window that departs while one of its theme files loads rejects that
 * reply — its port's retirement settles the call in flight, and a call sent later finds no live port — and the count
 * must fall all the same.
 */
test.describe('Neo.worker.App theme-file loads of a departed window', () => {
    test('control: an answered load releases the count, and a later update in a live window runs', async () => {
        const report = await runCase(`
            openWindow('live');

            const component = await mountedComponent('live');

            app.insertThemeFiles('live', null, 'Neo.button.Base');
            report.loading = app.countLoadingThemeFiles;

            await tick();
            report.settled = app.countLoadingThemeFiles;
            report.update  = nextUpdate(component)
        `);

        expect(report).toEqual({loading: 1, settled: 0, update: {executed: 1, waits: []}})
    });

    test('a load in flight when its window departs releases the count, and a later update in a live window runs', async () => {
        const report = await runCase(`
            openWindow('live');

            const closeGone = openWindow('gone'),
                  component = await mountedComponent('live');

            app.insertThemeFiles('gone', null, 'Neo.button.Base');
            report.loading = app.countLoadingThemeFiles;

            closeGone();
            await tick();
            report.departed = app.isWindowDeparted('gone');
            report.settled  = app.countLoadingThemeFiles;
            report.update   = nextUpdate(component)
        `);

        expect(report).toEqual({departed: true, loading: 1, settled: 0, update: {executed: 1, waits: []}})
    });

    test('a load sent after its window departed releases the count, and a later update in a live window runs', async () => {
        const report = await runCase(`
            openWindow('live');

            const closeGone = openWindow('gone'),
                  component = await mountedComponent('live');

            closeGone();
            await tick();

            // The departed window's own config went with it, so the late load reads the worker's
            Neo.config.themes = ['neo-theme-light'];
            app.insertThemeFiles('gone', null, 'Neo.button.Base');
            report.loading = app.countLoadingThemeFiles;

            await tick();
            report.settled = app.countLoadingThemeFiles;
            report.update  = nextUpdate(component)
        `);

        expect(report).toEqual({loading: 1, settled: 0, update: {executed: 1, waits: []}})
    })
});
