import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

// A real `Neo.worker.Manager` as window `window-1`. It is a main-thread singleton that reads `window` at module load,
// so a child process stubs the DOM it touches, as in `MainRenderQueue.spec.mjs`.
const MANAGER_STUB = `
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
    globalThis.Worker              = class {};
    globalThis.SharedWorker        = class {};

    Neo.insideWorker = true;
    delete Neo.main.DomAccess;
    delete Neo.worker.Manager;

    const {default: WorkerManager} = await import('./src/worker/Manager.mjs');

    WorkerManager.windowId = 'window-1';
`;

/**
 * @summary Runs a script against the stubbed Manager and parses the JSON report its last line prints.
 * @param {String} body Script source with `WorkerManager` in scope
 * @returns {Promise<*>}
 */
async function runManagerProbe(body) {
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', MANAGER_STUB + body], {
        cwd     : REPO_ROOT,
        encoding: 'utf8',
        timeout : 15_000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/**
 * @summary Sends one reply per case into the Manager and reports how each registered promise settled.
 * @param {Object[]} cases `{replyId, destination, data?, error?, reject?}`; `error` sends an `Error` with that message
 * @returns {Promise<Object>} Per replyId: `{settled, value, entryLeft}`
 */
function runReplyProbe(cases) {
    return runManagerProbe(`
        const
            cases    = ${JSON.stringify(cases)},
            report   = {},
            describe = value => value instanceof Error ? {error: value.message} : value === undefined ? '<undefined>' : value;

        for (const {replyId, destination, data, error, reject} of cases) {
            report[replyId] = {settled: 'pending'};

            WorkerManager.promises[replyId] = {
                reject : value => {report[replyId] = {settled: 'rejected', value: describe(value)}},
                resolve: value => {report[replyId] = {settled: 'resolved', value: describe(value)}}
            };

            WorkerManager.onWorkerMessage({data: {
                action : 'reply',
                data   : error ? new Error(error) : data,
                destination,
                reject,
                replyId
            }})
        }

        for (const {replyId} of cases) {
            report[replyId].entryLeft = Object.hasOwn(WorkerManager.promises, replyId)
        }

        console.log(JSON.stringify(report))
    `)
}

/**
 * @summary Delivers each message to the Manager, which holds no promise for any of them, and reports whether it
 * applied the DOM update (`updateVdom` fired) and what it sent where.
 * @param {Object[]} messages Raw worker messages, as `onWorkerMessage` receives them in `event.data`
 * @returns {Promise<Object[]>} Per message: `{applied, sent: [{action, data, dest, reject}]}`
 */
function runDomUpdateProbe(messages) {
    return runManagerProbe(`
        const report = [];

        for (const data of ${JSON.stringify(messages)}) {
            const entry    = {applied: false, sent: []},
                  onUpdate = () => {entry.applied = true};

            WorkerManager.sendMessage = (dest, opts) => {
                entry.sent.push({action: opts.action, data: opts.data, dest, reject: opts.reject === true})
            };

            WorkerManager.on('updateVdom', onUpdate);
            WorkerManager.onWorkerMessage({data});
            WorkerManager.un('updateVdom', onUpdate);
            report.push(entry)
        }

        console.log(JSON.stringify(report))
    `)
}

/**
 * @summary Pins how the main thread settles the promises of its worker replies.
 *
 * A promise main holds for itself settles the way `worker.Base` settles its own: `reject` comes from the reply
 * envelope, and the value is the payload whatever its truthiness. Main is addressed as `'main'`, or by its window id
 * once SharedWorkers reply per window. A promise main holds for a request it forwarded keeps the whole envelope,
 * which the forward sends on.
 */
test.describe('Neo.worker.Manager reply settlement', () => {
    test('a falsy payload addressed to main resolves with that payload and frees its entry', async () => {
        const report = await runReplyProbe([
            {replyId: 'undefined', destination: 'main'},
            {replyId: 'null',      destination: 'main', data: null},
            {replyId: 'false',     destination: 'main', data: false},
            {replyId: 'zero',      destination: 'main', data: 0}
        ]);

        expect(report).toEqual({
            undefined: {settled: 'resolved', value: '<undefined>', entryLeft: false},
            null     : {settled: 'resolved', value: null,          entryLeft: false},
            false    : {settled: 'resolved', value: false,         entryLeft: false},
            zero     : {settled: 'resolved', value: 0,             entryLeft: false}
        })
    });

    test('a reply to main that carries reject: true rejects with its payload', async () => {
        const report = await runReplyProbe([
            {replyId: 'rejected', destination: 'main', error: 'boom', reject: true}
        ]);

        expect(report.rejected).toEqual({settled: 'rejected', value: {error: 'boom'}, entryLeft: false})
    });

    test('a reply addressed to the window id settles with its payload, not the envelope', async () => {
        const report = await runReplyProbe([
            {replyId: 'window-resolved', destination: 'window-1', data: {ok: 2}},
            {replyId: 'window-rejected', destination: 'window-1', error: 'bang', reject: true}
        ]);

        expect(report).toEqual({
            'window-resolved': {settled: 'resolved', value: {ok: 2},         entryLeft: false},
            'window-rejected': {settled: 'rejected', value: {error: 'bang'}, entryLeft: false}
        })
    });

    test('CONTROL: a reply to a request main forwarded still settles with the envelope it sends on', async () => {
        const report = await runReplyProbe([
            {replyId: 'forwarded', destination: 'app', data: {ok: 3}}
        ]);

        expect(report.forwarded).toEqual({
            settled  : 'resolved',
            value    : {action: 'reply', data: {ok: 3}, destination: 'app', replyId: 'forwarded'},
            entryLeft: false
        })
    })
});

/**
 * @summary Pins that main applies only DOM updates for its own window.
 *
 * A SharedWorker relays a worker-bound reply through any window of its app once the window the reply names departed,
 * so a vdom reply can reach main carrying another document's deltas. Main answers it as a departed port would, and
 * answers an `updateVdom` addressed to another window the same way.
 */
test.describe('Neo.worker.Manager DOM updates for another window', () => {
    const
        deltas  = [{action: 'removeNode', id: 'neo-component-1'}],
        refusal = {
            code    : 'NEO_DEAD_PORT',
            message : 'A DOM update for window window-2 reached window window-1',
            name    : 'PortDisconnectedError',
            windowId: 'window-2'
        };

    test('a relayed vdom reply naming another window is answered as a departed port, not applied', async () => {
        const report = await runDomUpdateProbe([
            {action: 'reply', destination: 'app', replyId: 'update', windowId: 'window-2', data: {updateVdom: true, deltas}},
            {action: 'reply', destination: 'app', replyId: 'mount',  windowId: 'window-2', data: {autoMount: true, outerHTML: '<div></div>', parentId: 'body'}}
        ]);

        expect(report).toEqual([
            {applied: false, sent: [{action: 'reply', data: refusal, dest: 'app', reject: true}]},
            {applied: false, sent: [{action: 'reply', data: refusal, dest: 'app', reject: true}]}
        ])
    });

    test('an updateVdom addressed to another window is answered to its origin, not applied', async () => {
        const [foreign] = await runDomUpdateProbe([
            {action: 'updateVdom', destination: 'window-2', id: 'foreign', origin: 'app', deltas}
        ]);

        expect(foreign).toEqual({applied: false, sent: [{action: 'reply', data: refusal, dest: 'app', reject: true}]})
    });

    test('CONTROL: an update for this window, or naming none, is applied', async () => {
        const report = await runDomUpdateProbe([
            {action: 'reply', destination: 'app', replyId: 'own', windowId: 'window-1', data: {updateVdom: true, deltas}},
            {action: 'reply', destination: 'app', replyId: 'unnamed', data: {updateVdom: true, deltas}},
            {action: 'updateVdom', destination: 'window-1', id: 'direct', origin: 'app', deltas}
        ]);

        expect(report.map(entry => entry.applied)).toEqual([true, true, true])
    })
});
