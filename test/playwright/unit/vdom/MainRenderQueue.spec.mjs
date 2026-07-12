import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

async function runRenderQueueProbe(hidden) {
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
        const originalTimeout = globalThis.setTimeout;

        globalThis.requestAnimationFrame = callback => {
            scheduled.push({callback, kind: 'animation-frame'});
            return 1
        };
        globalThis.cancelAnimationFrame = () => {};
        globalThis.setTimeout = (callback, delay) => {
            scheduled.push({callback, delay, kind: 'task'});
            return 2
        };

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

        scheduled.length = 0;
        Main.queueWrite({deltas: [], replyId: 'reply-1'});

        const next = scheduled.shift();
        next?.callback();
        globalThis.setTimeout = originalTimeout;

        console.log(JSON.stringify({
            applied       : applied.length,
            delay         : next?.delay,
            kind          : next?.kind,
            queueRemaining: Main.writeQueue.length,
            resolved,
            running       : Main.running
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
 * @summary Pins Main-thread queue progress across visible and hidden documents.
 *
 * Main keeps DOM writes frame-batched while visible. Hidden documents may suspend
 * animation frames indefinitely, so their queue drain must use a task and still settle
 * the delayed worker reply after the DOM operation has applied.
 */
test.describe('Neo.Main render queue scheduling', () => {
    test('keeps visible writes aligned to the animation frame', async () => {
        const result = await runRenderQueueProbe(false);

        expect(result).toEqual({
            applied       : 1,
            kind          : 'animation-frame',
            queueRemaining: 0,
            resolved      : {settled: true},
            running       : false
        })
    });

    test('drains hidden writes through a task and settles their reply', async () => {
        const result = await runRenderQueueProbe(true);

        expect(result).toEqual({
            applied       : 1,
            delay         : 0,
            kind          : 'task',
            queueRemaining: 0,
            resolved      : {settled: true},
            running       : false
        })
    })
});
