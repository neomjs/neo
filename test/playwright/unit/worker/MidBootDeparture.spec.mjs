import {test, expect}  from '@playwright/test';
import {execFile}      from 'node:child_process';
import path            from 'node:path';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'node:url';

const root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
      execute = promisify(execFile);

/**
 * @summary Runs one case across both realms of a booting vessel window: the real app worker with the real
 * `Neo.manager.Transaction` and a Group's native lifecycle, and the vessel's own main thread — the real
 * `Neo.main.DomEvents` over its `beforeunload`, with a `Neo.worker.Manager` stand-in carrying the three fields the
 * unload reads. The two realms talk over a real `MessageChannel`, as a SharedWorker port does.
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
        globalThis.window      = new EventTarget();
        globalThis.document    = Object.assign(new EventTarget(), {body: new EventTarget(), documentElement: {}});

        delete Neo.worker.App;
        Neo.apps          = {};
        Neo.Main          = {getWindowData: async () => null};
        Neo.windowConfigs = {};

        const
            {default: app}         = await import('./src/worker/App.mjs'),
            {default: Transaction} = await import('./src/manager/Transaction.mjs'),
            report                 = {},
            // Two tasks: a message lands in one, and what it releases crosses its channel in the next
            tick                   = async () => {
                await new Promise(resolve => setTimeout(resolve, 5));
                await new Promise(resolve => setTimeout(resolve, 5))
            };

        await import('./src/main/DomEvents.mjs');

        Object.assign(app, {isSharedWorker: true, ports: [], promises: {}});

        // The opener's Group, and a source whose vessel slots are one key per item, whatever the vessel's generation
        const
            {groupId}  = Transaction.bind({windowId: 'main'}),
            key        = 'vessel:metrics',
            lifecycle  = Transaction.getNativeLifecycle(groupId),
            identities = [];

        lifecycle.registerSource('workspace', {
            close : async () => true,
            keyFor: itemId => 'vessel:' + itemId,
            open  : async ({topologyIdentity}) => {
                identities.push(topologyIdentity);
                return {windowName: 'vessel-' + identities.length}
            }
        });

        // The key a generation acquires: the slot's own while it is free, a key of its own while it is held
        const acquire = async () => (await lifecycle.acquire('workspace', {itemId: 'metrics'}))?.workspaceKey ?? null;

        // The vessel the first acquire opened, booted to the point its app registers: its port and carried identity
        // as its registerNeoConfig leaves them, and its main thread, which learns its app's name from the worker's
        // registerAppName and sends what its beforeunload sends
        const bootVessel = windowId => {
            const channel = new MessageChannel(),
                  entry   = {appNames: new Set(), id: 'port-' + windowId, port: channel.port1, windowId},
                  sent    = [];

            Neo.windowConfigs[windowId] = {topologyIdentity: identities.at(-1)};
            app.ports.push(entry);
            entry.port.onmessage = event => app.onMessage(event, entry);

            Neo.worker.Manager = {
                appNames : [],
                broadcast: message => {sent.push(message); channel.port2.postMessage(message)},
                windowId
            };

            channel.port2.onmessage = ({data}) => {data.action === 'registerAppName' && Neo.worker.Manager.appNames.push(data.appName)};

            return {sent, unload: () => window.dispatchEvent(new Event('beforeunload'))}
        };

        // What the item's next generation finds: the slot's binder, whether vessel V's port retired, a fresh acquire
        const slot = async () => {
            report.binder     = Transaction.getBinding(groupId, key)?.windowId ?? null;
            report.departed   = app.isWindowDeparted('V');
            report.reacquired = await acquire()
        };

        report.acquired = await acquire();

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
 * @summary A vessel window that leaves while it boots must give its Group slot back.
 *
 * Every generation of a torn-out item prefers the same slot key, and a slot whose binder lives is never handed to
 * the next reservation, so a binder outliving its window keeps the item's next generation off its own slot. The worker binds the slot in
 * `registerApp`, before the window's main thread knows its app's name; until `registerAppName` arrives there, its
 * unload has no named app to disconnect. And the app's module imports asynchronously, so its registration can also
 * come after the window already left.
 */
test.describe('A vessel window departing mid-boot', () => {
    test('control: a live vessel holds its slot, and the next generation gets a key of its own', async () => {
        const report = await runCase(`
            bootVessel('V');
            app.registerApp('Vessel', 'V');

            await tick();
            await slot()
        `);

        expect(report).toEqual({acquired: 'vessel:metrics', binder: 'V', departed: false, reacquired: 'vessel:metrics:2'})
    });

    test('control: a vessel that closes after its app name arrived disconnects that app and frees its slot', async () => {
        const report = await runCase(`
            const vessel = bootVessel('V');

            app.registerApp('Vessel', 'V');
            await tick();

            vessel.unload();
            await tick();
            report.sent = vessel.sent;
            await slot()
        `);

        expect(report).toEqual({
            acquired  : 'vessel:metrics',
            binder    : null,
            departed  : true,
            reacquired: 'vessel:metrics',
            sent      : [{action: 'disconnect', appName: 'Vessel', windowId: 'V'}]
        })
    });

    test('a vessel that closes between registerApp and registerAppName frees its slot', async () => {
        const report = await runCase(`
            const vessel = bootVessel('V');

            // The worker bound the slot and sent registerAppName; the window unloads before that message reaches it
            app.registerApp('Vessel', 'V');
            vessel.unload();

            await tick();
            report.sent = vessel.sent;
            await slot()
        `);

        expect(report).toEqual({
            acquired  : 'vessel:metrics',
            binder    : null,
            departed  : true,
            reacquired: 'vessel:metrics',
            sent      : [{action: 'disconnect', windowId: 'V'}]
        })
    });

    test('an app that registers after its vessel closed binds no slot, and lends its name to no other window', async () => {
        const report = await runCase(`
            const vessel  = bootVessel('V'),
                  // Another window, booting too: no app of its own has registered on its port yet
                  sibling = {appNames: new Set(), id: 'port-S', port: new MessageChannel().port1, windowId: 'S'};

            app.ports.push(sibling);

            // The window unloads while its app module still imports, and the import resolves after all
            vessel.unload();
            await tick();

            app.registerApp('Vessel', 'V');
            await tick();
            report.siblingAppNames = [...sibling.appNames];
            await slot()
        `);

        // The first generation never bound, so its admission stays pending until its reservation's lease runs out
        expect(report).toEqual({acquired: 'vessel:metrics', binder: null, departed: true, reacquired: 'vessel:metrics:2', siblingAppNames: []})
    })
});
