import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

/**
 * @summary Runs one lifetime case against the real app worker: `Neo.worker.App` with its `CanvasGroups`, the
 * `RemoteMethodAccess` proxy and `Neo.worker.Base#removePort`, over real `MessageChannel`s.
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

        setup({mockMain: false, neoConfig: {unitTestMode: true}});

        globalThis.postMessage = () => {};
        delete Neo.worker.App;

        const
            {default: app}          = await import('./src/worker/App.mjs'),
            {default: CanvasGroups} = await import('./src/worker/CanvasGroups.mjs'),
            channels                = [],
            report                  = {},
            // Two tasks: a signal lands in one, and what it releases crosses its channel in the next
            tick                    = async () => {
                await new Promise(resolve => setTimeout(resolve, 5));
                await new Promise(resolve => setTimeout(resolve, 5))
            };

        Object.assign(app, {isSharedWorker: true, ports: [], promises: {}});
        app.canvasGroups = new CanvasGroups({isDeparted: id => app.isWindowDeparted(id), startBound: 5000});

        // One main-thread port generation of a window
        const mainPort = (id, windowId) => {
            const entry = {appNames: new Set(['App']), id, port: new MessageChannel().port1, windowId};
            app.ports.push(entry);
            return entry
        };

        // A canvas worker's channel; its far end keeps what the app worker sends over it
        const canvasChannel = () => {
            const channel = new MessageChannel();
            channel.received = [];
            channel.port1.onmessage = event => channel.received.push(event.data);
            channels.push(channel);
            return channel
        };

        // A canvas worker's first channel, relayed through a main thread
        const relay = (group, channel) => app.onRegisterPort({origin: 'canvas', group, transfer: channel.port2});

        // A new channel the same canvas worker sends over one it already has
        const handOver = (group, over, channel) => over.port1.postMessage(
            {action: 'registerPort', group, origin: 'canvas', transfer: channel.port2}, [channel.port2]
        );

        // The canvas worker's remotes, registered over one channel
        const register = channel => channel.port1.postMessage(
            {action: 'registerRemote', className: 'Neo.worker.Canvas', destination: 'app', methods: ['probe'], origin: 'canvas'}
        );

        const outcome = promise => {
            const box = {settled: 'pending'};
            promise.then(
                ()    => {box.settled = 'resolved'},
                error => Object.assign(box, {code: error.code, departure: app.isDeparture(error), settled: 'rejected'})
            );
            return box
        };

        const probe = app.generateRemote({className: 'Neo.worker.Canvas', origin: 'canvas'}, 'probe');
        const sent  = channel => channel.received.filter(({action}) => action === 'remoteMethod').map(({data, port}) => ({data, port: port ?? null}));

        ${body}

        channels.forEach(({port1, port2}) => {port1.close(); port2.close()});
        app.ports.forEach(({port}) => port.close());

        console.log(JSON.stringify(report));
        process.exit(0)
    `;
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd     : REPO_ROOT,
        encoding: 'utf8',
        timeout : 15_000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/**
 * @summary The exact-generation lifetimes of canvas routing, through the real app worker.
 *
 * A group id outlives its channels and a window outlives a port, so neither may stand in for the generation that
 * admitted a call or delivered a signal: a wait belongs to the main port that admitted it, readiness to the channel
 * that carried it, and a retired group keeps nothing a reload could inherit. Each arm below is a sequence the
 * pre-repair code got wrong, or the live path those repairs must keep.
 */
test.describe('Neo.worker.App canvas group lifetimes', () => {
    test('a wait retires with the exact port that admitted it, while its window\'s other port still sends', async () => {
        const report = await runCase(`
            const old = mainPort('port-old', 'W'), A = canvasChannel();

            mainPort('port-new', 'W');
            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            relay('g', A);

            report.oldCall = outcome(probe({port: 'port-old', windowId: 'W'}));
            report.newCall = outcome(probe({port: 'port-new', windowId: 'W'}));

            app.removePort(old);
            await tick();
            register(A);
            await tick();

            report.sent = sent(A)
        `);

        expect(report.oldCall).toMatchObject({code: 'NEO_DEAD_PORT', settled: 'rejected'});
        expect(report.newCall.settled).toBe('pending');
        expect(report.sent).toEqual([{data: {port: 'port-new', windowId: 'W'}, port: 'port-new'}])
    });

    test('readiness over a replaced channel never readies the group; the new worker\'s own registration does', async () => {
        const report = await runCase(`
            const A = canvasChannel(), B = canvasChannel();

            mainPort('port-1', 'W');
            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            relay('g', A);
            relay('g', B);

            register(A);
            await tick();
            report.readyAfterOld = app.canvasGroups.isReady('W');
            report.oldReleased   = A.port2.onmessage === null;

            register(B);
            await tick();
            report.readyAfterNew = app.canvasGroups.isReady('W');

            outcome(probe({windowId: 'W'}));
            await tick();
            report.overOld = sent(A).length;
            report.overNew = sent(B).length
        `);

        expect(report).toEqual({oldReleased: true, overNew: 1, overOld: 0, readyAfterNew: true, readyAfterOld: false})
    });

    test('control: a channel the same worker hands over keeps the group ready, and the old one is released', async () => {
        const report = await runCase(`
            const A = canvasChannel(), C = canvasChannel();

            mainPort('port-1', 'W');
            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            relay('g', A);
            register(A);
            await tick();

            handOver('g', A, C);
            await tick();
            report.ready       = app.canvasGroups.isReady('W');
            report.oldReleased = A.port2.onmessage === null;

            outcome(probe({windowId: 'W'}));
            await tick();
            report.overOld = sent(A).length;
            report.overNew = sent(C).length
        `);

        expect(report).toEqual({oldReleased: true, overNew: 1, overOld: 0, ready: true})
    });

    test('a retired group\'s channel cannot ready the reload that rejoins it; the reload\'s own worker does', async () => {
        const report = await runCase(`
            const w = mainPort('port-1', 'W'), A = canvasChannel(), D = canvasChannel();

            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            relay('g', A);
            register(A);
            await tick();

            app.removePort(w);
            register(A);
            await tick();

            mainPort('port-2', 'W2');
            app.onRegisterCanvasGroup({group: 'g', windowId: 'W2'});
            report.readyOnRejoin = app.canvasGroups.isReady('W2');

            relay('g', D);
            register(D);
            await tick();
            report.readyOnNewWorker = app.canvasGroups.isReady('W2');

            outcome(probe({windowId: 'W2'}));
            await tick();
            report.overRetired = sent(A).length;
            report.overNew     = sent(D).length
        `);

        expect(report).toEqual({overNew: 1, overRetired: 0, readyOnNewWorker: true, readyOnRejoin: false})
    });

    test('control: a channel and readiness that arrive before the window announcement are kept for it', async () => {
        const report = await runCase(`
            const E = canvasChannel();

            mainPort('port-1', 'W');
            relay('g', E);
            register(E);
            await tick();

            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            report.ready = app.canvasGroups.isReady('W');

            outcome(probe({windowId: 'W'}));
            await tick();
            report.overEarly = sent(E).length
        `);

        expect(report).toEqual({overEarly: 1, ready: true})
    });

    test('the last window\'s departure settles named and omitted waits alike, as that window\'s departure', async () => {
        const report = await runCase(`
            const w = mainPort('port-1', 'W'), A = canvasChannel();

            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            relay('g', A);

            report.named   = outcome(probe({windowId: 'W'}));
            report.omitted = outcome(probe({}));

            app.removePort(w);
            await tick()
        `);

        expect(report.named).toEqual({code: 'NEO_DEAD_PORT', departure: true, settled: 'rejected'});
        expect(report.omitted).toEqual({code: 'NEO_DEAD_PORT', departure: true, settled: 'rejected'})
    });

    test('control: an omitted wait survives a sibling\'s departure and sends once its group is ready', async () => {
        const report = await runCase(`
            const w = mainPort('port-1', 'W'), A = canvasChannel();

            mainPort('port-2', 'W2');
            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            app.onRegisterCanvasGroup({group: 'g', windowId: 'W2'});
            relay('g', A);

            const omitted = outcome(probe({}));

            app.removePort(w);
            await tick();
            report.afterDeparture = omitted.settled;

            register(A);
            await tick();
            report.overChannel = sent(A).length
        `);

        expect(report).toEqual({afterDeparture: 'pending', overChannel: 1})
    });

    test('the 13.1 scalar setTheme still routes with one group, is refused across two, and sets the theme', async () => {
        const report = await runCase(`
            const A = canvasChannel(), B = canvasChannel(), setTheme = app.generateRemote({className: 'Neo.canvas.Header', origin: 'canvas'}, 'setTheme');

            mainPort('port-1', 'W');
            app.onRegisterCanvasGroup({group: 'g', windowId: 'W'});
            relay('g', A);
            register(A);
            await tick();

            outcome(setTheme('dark'));
            await tick();
            report.oneGroup = sent(A).map(({data}) => data);

            mainPort('port-2', 'W2');
            app.onRegisterCanvasGroup({group: 'g2', windowId: 'W2'});
            relay('g2', B);
            register(B);
            await tick();

            report.twoGroups = outcome(setTheme('dark'));
            await tick();

            const {default: CanvasBase} = await import('./src/canvas/Base.mjs'),
                  renderer              = Neo.create(CanvasBase);

            renderer.setTheme('dark');
            report.scalar = renderer.theme;

            renderer.setTheme({theme: 'light', windowId: 'W'});
            report.object = renderer.theme
        `);

        expect(report.oneGroup).toEqual(['dark']);
        expect(report.twoGroups).toMatchObject({code: 'NEO_UNROUTABLE', settled: 'rejected'});
        expect(report.scalar).toBe('dark');
        expect(report.object).toBe('light')
    })
});
