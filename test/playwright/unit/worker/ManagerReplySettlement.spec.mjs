import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

/**
 * @summary Sends one reply per case into a real `Neo.worker.Manager` and reports how each registered promise settled.
 *
 * Runs in a child process: the Manager is a main-thread singleton that reads `window` at module load, so the DOM it
 * touches is stubbed there, as in `MainRenderQueue.spec.mjs`.
 * @param {Object[]} cases `{replyId, destination, data?, error?, reject?}`; `error` sends an `Error` with that message
 * @returns {Promise<Object>} Per replyId: `{settled, value, entryLeft}`
 */
async function runReplyProbe(cases) {
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
        globalThis.Worker              = class {};
        globalThis.SharedWorker        = class {};

        Neo.insideWorker = true;
        delete Neo.main.DomAccess;
        delete Neo.worker.Manager;

        const
            {default: WorkerManager} = await import('./src/worker/Manager.mjs'),
            cases                    = ${JSON.stringify(cases)},
            report                   = {},
            describe                 = value => value instanceof Error ? {error: value.message} : value === undefined ? '<undefined>' : value;

        WorkerManager.windowId = 'window-1';

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
    `;
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd     : REPO_ROOT,
        encoding: 'utf8',
        timeout : 15_000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
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
