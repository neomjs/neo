import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

async function runRenderQueueProbe(hidden, probeForwarding=false, fire='first') {
    const script = `
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup} from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});

        globalThis.document = {
            readyState         : 'loading',
            hidden             : ${hidden},
            visibilityState    : '${hidden ? 'hidden' : 'visible'}',
            addEventListener   : () => {},
            removeEventListener: () => {},
            getElementById     : () => null,
            querySelector      : () => null,
            createElement      : () => ({
                addEventListener: () => {},
                classList       : {add: () => {}, remove: () => {}}
            }),
            body: {
                addEventListener: () => {},
                classList       : {add: () => {}, remove: () => {}}
            },
            documentElement: {classList: {add: () => {}, remove: () => {}}}
        };
        globalThis.window                  = globalThis;
        globalThis.addEventListener        = () => {};
        globalThis.removeEventListener     = () => {};
        globalThis.location                = {};
        globalThis.screen                  = {orientation: {}};
        globalThis.matchMedia              = () => ({
            matches            : false,
            addEventListener   : () => {},
            removeEventListener: () => {}
        });
        globalThis.Worker                  = class {};
        globalThis.SharedWorker            = class {};

        const scheduled       = [];
        const cancelled       = [];
        const originalClear   = globalThis.clearTimeout;
        const originalTimeout = globalThis.setTimeout;

        globalThis.requestAnimationFrame = callback => {
            scheduled.push({callback, kind: 'animation-frame'});
            return 1
        };
        globalThis.cancelAnimationFrame = id => cancelled.push({id, kind: 'animation-frame'});
        globalThis.setTimeout = (callback, delay) => {
            scheduled.push({callback, delay, kind: 'task'});
            return 2
        };
        globalThis.clearTimeout = id => cancelled.push({id, kind: 'task'});

        Neo.insideWorker = true;
        delete Neo.main.DomAccess;
        delete Neo.worker.Manager;

        const {default: Main}          = await import('./src/Main.mjs');
        const {default: DeltaUpdates}  = await import('./src/main/DeltaUpdates.mjs');
        const {default: WorkerManager} = await import('./src/worker/Manager.mjs');
        const applied                  = [];
        let resolved                   = null;

        DeltaUpdates.update = operation => applied.push(operation);
        WorkerManager.promises['reply-1'] = {
            data   : {settled: true},
            reject : error => { throw error },
            resolve: value => { resolved = value }
        };

        const renderFrame = Main.renderFrame.bind(Main);
        let renderFrames  = 0;

        Main.renderFrame = () => {
            renderFrames++;
            renderFrame()
        };

        scheduled.length = 0;
        cancelled.length = 0;
        Main.queueWrite({deltas: [], replyId: 'reply-1'});

        const scheduledKinds = scheduled.map(entry => entry.kind);
        let next;

        if ('${fire}' === 'task') {
            // a frame-starved visible document: the animation frame never comes, only the timer fires
            next = scheduled.find(entry => entry.kind === 'task');
            next?.callback()
        } else if ('${fire}' === 'both') {
            // a frame wins, then the timer arm's callback runs anyway: it must not drain twice
            next = scheduled[0];
            scheduled.forEach(entry => entry.callback())
        } else {
            next = scheduled.shift();
            next?.callback()
        }

        globalThis.clearTimeout = originalClear;
        globalThis.setTimeout   = originalTimeout;

        let forwarded;

        if (${probeForwarding}) {
            const
                {default: WorkerBase} = await import('./src/worker/Base.mjs'),
                sent                  = [],
                consumer              = Object.create(WorkerBase.prototype);

            WorkerManager.promiseMessage = () => Promise.reject({
                data  : new Error('vdom projection failed'),
                reject: true
            });
            WorkerManager.sendMessage = (destination, message) => sent.push({destination, message});
            WorkerManager.onWorkerMessage({
                data: {action: 'remoteMethod', destination: 'vdom', id: 'origin-q', origin: 'app'}
            });

            await Promise.resolve();
            await Promise.resolve();

            let consumerRejection;
            const [{destination, message}] = sent;

            consumer.promises = {
                'origin-q': {
                    reject : value => {consumerRejection = value},
                    resolve: () => {}
                }
            };
            consumer.onMessage({data: message});

            forwarded = {
                consumerMessage: consumerRejection?.message,
                dataMessage    : message.data?.message,
                destination,
                reject         : message.reject,
                replyId        : message.replyId
            }
        }

        console.log(JSON.stringify({
            applied       : applied.length,
            cancelled,
            delay         : next?.delay,
            kind          : next?.kind,
            queueRemaining: Main.writeQueue.length,
            renderFrames,
            resolved,
            running       : Main.running,
            scheduledKinds,
            ...(${probeForwarding} ? {forwarded} : {})
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
 * @summary Pins Main-thread queue progress across visible, frame-starved and hidden documents.
 *
 * Main keeps DOM writes frame-batched while visible, but a visible document can stop receiving
 * frames, so the frame arm races a timer dam and the winner cancels the loser. Hidden documents
 * may suspend animation frames indefinitely, so their queue drain uses a task directly. Every
 * path must settle the delayed worker reply after the DOM operation has applied.
 */
test.describe('Neo.Main render queue scheduling', () => {
    test('keeps visible writes aligned to the animation frame', async () => {
        const result = await runRenderQueueProbe(false);

        expect(result).toEqual({
            applied       : 1,
            cancelled     : [{id: 2, kind: 'task'}],
            kind          : 'animation-frame',
            queueRemaining: 0,
            renderFrames  : 1,
            resolved      : {settled: true},
            running       : false,
            scheduledKinds: ['animation-frame', 'task']
        })
    });

    test('drains a visible document that gets no frames through the timer dam and settles its reply', async () => {
        const result = await runRenderQueueProbe(false, false, 'task');

        expect(result).toEqual({
            applied       : 1,
            cancelled     : [{id: 1, kind: 'animation-frame'}],
            delay         : 100,
            kind          : 'task',
            queueRemaining: 0,
            renderFrames  : 1,
            resolved      : {settled: true},
            running       : false,
            scheduledKinds: ['animation-frame', 'task']
        })
    });

    test('drains once when the losing arm fires after the winner', async () => {
        const result = await runRenderQueueProbe(false, false, 'both');

        expect(result).toMatchObject({
            applied       : 1,
            cancelled     : [{id: 2, kind: 'task'}],
            renderFrames  : 1,
            resolved      : {settled: true},
            running       : false
        })
    });

    test('drains hidden writes through a task and settles their reply', async () => {
        const result = await runRenderQueueProbe(true);

        expect(result).toEqual({
            applied       : 1,
            cancelled     : [],
            delay         : 0,
            kind          : 'task',
            queueRemaining: 0,
            renderFrames  : 1,
            resolved      : {settled: true},
            running       : false,
            scheduledKinds: ['task']
        })
    });

    test('forwards a rejected worker cause through the reply data the origin consumes', async () => {
        const {forwarded} = await runRenderQueueProbe(false, true);

        expect(forwarded).toEqual({
            consumerMessage: 'vdom projection failed',
            dataMessage    : 'vdom projection failed',
            destination    : 'app',
            reject         : true,
            replyId        : 'origin-q'
        })
    })
});
