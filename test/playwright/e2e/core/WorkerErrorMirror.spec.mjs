import {test, expect} from '@playwright/test';

/**
 * Proves `Neo.worker.Base#forwardErrorToMainThread` reaches the page from a NON-App SharedWorker.
 *
 * The App worker gained a main-thread mirror first. Its premise — a SharedWorker's console output
 * goes to its own inspector context, which no page can read — is a property of every SharedWorker,
 * and `worker/Manager.mjs` makes all of them shared through one `createWorker` path. Before the
 * hoist, `grep -ln interceptConsole src/worker/*.mjs` returned one file, so an error in Data, VDom,
 * Canvas or Task reached neither the page nor the Neural Link.
 *
 * **This arm proves presence, not absence, which is what its predecessors could not do.**
 * `Data.loadModule` catches an import failure, logs at `error` level and RETURNS A RECEIPT rather
 * than throwing (`Data.mjs:237`), and `RemoteMethodAccess.onRemoteMethod` resolves by class name
 * with no caller verification — so a page can provoke a real Data-worker error benignly and get an
 * independent confirmation that the operation ran. `PAGE_CONSOLE = []` beside a successful receipt
 * was the defect, measured on `d080a73813` before the hoist existed.
 *
 * That receipt is the positive control: without it, "no mirrored line appeared" would read exactly
 * the same whether the mirror works, never ran, or the operation never happened. `Neo.Main?.log?.()`
 * returns `undefined` rather than throwing when the manifest does not reach a worker, so the silent
 * no-op is the failure this arm exists to exclude.
 */
const APP = '/examples/stateProvider/multiWindow/index.html';

test.describe('SharedWorker error mirror — beyond the App worker', () => {
    test('a Data-worker error reaches the page console, and names its worker', async ({page}) => {
        const mirrored = [];

        page.on('console', message => {
            message.type() === 'error' && message.text().includes('Worker:') && mirrored.push(message.text())
        });

        await page.goto(APP);
        await page.waitForFunction(() => globalThis.Neo?.worker?.Manager?.workers?.app, null, {timeout: 30000});

        // Preconditions asserted, never inherited from the app's config file. `Manager.workers` is a
        // DECLARATION map — `broadcast:199` pairs its keys with `getWorker` for exactly this reason —
        // so liveness is asked of `hasWorker`, and only for the worker this arm actually drives.
        const pre = await page.evaluate(() => ({
            dataLive: Neo.worker.Manager.hasWorker('data'),
            shared  : Neo.config.useSharedWorkers === true
        }));

        expect(pre.shared,   'the mirror only runs in SharedWorker mode').toBe(true);
        expect(pre.dataLive, 'and this arm drives the Data worker specifically').toBe(true);

        // The trigger: a real failure inside the Data worker, provoked from the page, which logs at
        // error level and answers with a receipt instead of throwing.
        const receipt = await page.evaluate(() => Neo.worker.Manager.promiseMessage('data', {
            action         : 'remoteMethod',
            remoteClassName: 'Neo.worker.Data',
            remoteMethod   : 'loadModule',
            data           : [{path: 'no/such/module/at/all'}]
        }));

        expect(receipt?.data?.success, 'the operation ran and failed, which is the point').toBe(false);
        expect(receipt?.origin,        'and it ran in the Data worker').toBe('data');

        await expect.poll(() => mirrored, {
            message  : 'the Data worker error must reach the page console',
            timeout  : 5000,
            intervals: [50, 100, 200]
        }).not.toEqual([]);

        // AC-3: the line names its heap, so a Data error is distinguishable from an App error
        // without reading a stack. Four workers writing one prefix is worse than no prefix.
        expect(mirrored.some(line => line.startsWith('Data Worker: ')),
            `the mirrored line names the worker that raised it — got ${JSON.stringify(mirrored)}`).toBe(true)
    })
});
