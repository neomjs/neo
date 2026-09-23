import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

/**
 * @summary Creates one worker through a real `Neo.worker.Manager` with a stubbed `Worker`/`SharedWorker` and reports where the load-failure handler landed.
 *
 * Runs in a child process: the Manager reads `window` at module load, so the DOM it touches is stubbed there, as in
 * `ManagerReplySettlement.spec.mjs`. The stub fires a load error the way a browser does, on the worker object.
 * @param {Object} opts
 * @param {Boolean} opts.shared `true` creates through `SharedWorker`, `false` through `Worker`
 * @returns {Promise<Object>} `{onWorkerErrorCalls, boundOnWorkerObject, boundOnPort, portMessageBound}`
 */
async function runWorkerErrorProbe({shared}) {
    const script = `
        import Neo       from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup}   from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});

        globalThis.document = {
            readyState         : 'loading',
            hidden             : false,
            visibilityState    : 'visible',
            addEventListener   : () => {},
            removeEventListener: () => {},
            getElementById     : () => null,
            querySelector      : () => null,
            createElement      : () => ({addEventListener: () => {}, classList: {add: () => {}, remove: () => {}}}),
            body               : {addEventListener: () => {}, classList: {add: () => {}, remove: () => {}}},
            documentElement    : {classList: {add: () => {}, remove: () => {}}}
        };
        globalThis.window              = globalThis;
        globalThis.addEventListener    = () => {};
        globalThis.removeEventListener = () => {};
        globalThis.location            = {};
        globalThis.screen              = {orientation: {}};
        globalThis.matchMedia          = () => ({matches: false, addEventListener: () => {}, removeEventListener: () => {}});

        // A load or parse failure fires \`error\` on the worker object. \`port\` mirrors a MessagePort: no \`onerror\`,
        // and \`onmessage\` is the only handler it carries.
        class StubWorker {
            constructor() {
                // A real MessagePort has no error event, so a naive stub would let an assigned
                // port.onerror read as bound. A prototype-less object keeps the probe honest.
                this.port = Object.assign(Object.create(null), {start: () => {}})
            }

            fireLoadError() {
                this.onerror?.({type: 'error'})
            }
        }

        globalThis.Worker       = StubWorker;
        globalThis.SharedWorker = StubWorker;

        Neo.insideWorker = true;
        delete Neo.main.DomAccess;
        delete Neo.worker.Manager;

        Neo.config.useSharedWorkers = ${shared};

        const {default: WorkerManager} = await import('./src/worker/Manager.mjs');

        WorkerManager.windowId             = 'window-1';
        WorkerManager.sharedWorkersEnabled = true;

        let calls = 0;

        WorkerManager.onWorkerError = () => {calls++};

        const worker = WorkerManager.createWorker({fileName: 'App.mjs', basePath: '/'});

        worker.fireLoadError();

        console.log(JSON.stringify({
            onWorkerErrorCalls  : calls,
            boundOnWorkerObject : typeof worker.onerror === 'function',
            boundOnPort         : 'onerror' in worker.port,
            portMessageBound    : typeof worker.port.onmessage === 'function'
        }))
    `;
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd     : REPO_ROOT,
        encoding: 'utf8',
        timeout : 15_000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/**
 * @summary Pins where `Neo.worker.Manager#createWorker` binds its load-failure handler.
 *
 * A dedicated `Worker` fires `error` on itself, so binding there is correct for both modes. A `SharedWorker` fires it
 * on the worker object too, while `worker.port` is a `MessagePort` with no `error` event: a handler bound on the port
 * is a property nothing calls, so `onWorkerError` never runs and a SharedWorker that fails to load or parse reports
 * nothing at all. `onmessage` stays on the port, which is where messages do arrive.
 */
test.describe('Neo.worker.Manager#createWorker — the load-failure binding', () => {
    test('a SharedWorker reports a load failure through onWorkerError', async () => {
        const report = await runWorkerErrorProbe({shared: true});

        expect(report.onWorkerErrorCalls, 'the shared arm reaches onWorkerError').toBe(1);
        expect(report.boundOnWorkerObject, 'onerror is bound where the browser fires it').toBe(true);
        expect(report.boundOnPort, 'the port carries no error handler').toBe(false);
        expect(report.portMessageBound, 'onmessage stays on the port').toBe(true)
    });

    test('a dedicated worker reports a load failure through onWorkerError', async () => {
        const report = await runWorkerErrorProbe({shared: false});

        expect(report.onWorkerErrorCalls, 'the dedicated arm reaches onWorkerError').toBe(1);
        expect(report.boundOnWorkerObject, 'onerror is bound on the worker').toBe(true)
    })
});
