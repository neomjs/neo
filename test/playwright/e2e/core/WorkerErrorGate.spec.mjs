import {expect, test} from '../../fixtures.mjs';

/**
 * `fixtures.mjs#workerErrors`, one arm per outcome and source. The `test.fail()` arms pass only when
 * the gate failed them, and each sits beside a passing arm proving its error reaches the gate. The
 * worker trigger is benign: App-worker `loadModule` of a missing path logs and returns a receipt.
 *
 * A worker error reaches the page by one of two channels, so the worker arms run once per channel: a
 * SharedWorker's console is mirrored, a dedicated worker's arrives natively. The same waiver names both.
 */
const WORKER_MODES = [
    {app: '/examples/stateProvider/multiWindow/index.html', mode: 'SharedWorker', shared: true},
    {app: '/examples/button/base/index.html',               mode: 'dedicated',    shared: false}
];

/**
 * Boots the app and waits until its App worker can take a remote call.
 * @param {Object} page
 * @param {String} app
 * @returns {Promise<Boolean>} true if the app runs SharedWorkers
 */
async function bootApp(page, app) {
    await page.goto(app);
    await page.waitForFunction(() => globalThis.Neo?.worker?.Manager?.workers?.app, null, {timeout: 30000});

    return page.evaluate(() => Neo.config.useSharedWorkers === true)
}

/**
 * Makes the App worker log one real error, and waits until the gate has read it.
 * @param {Object}  page
 * @param {Object}  workerErrors
 * @param {Object}  opts
 * @param {String}  opts.app
 * @param {Boolean} opts.shared
 */
async function provokeAppWorkerError(page, workerErrors, {app, shared}) {
    // Asserted, never inherited from the app's config file
    expect(await bootApp(page, app), 'the channel this arm covers').toBe(shared);

    const receipt = await page.evaluate(() => Neo.worker.Manager.promiseMessage('app', {
        action         : 'remoteMethod',
        remoteClassName: 'Neo.worker.App',
        remoteMethod   : 'loadModule',
        data           : [{path: 'no/such/module/at/all'}]
    }));

    // A SharedWorker answers with the message envelope, a dedicated worker with its data
    expect((receipt?.data ?? receipt)?.success, 'the load ran and failed, which is the point').toBe(false);

    await expect.poll(() => workerErrors.lines.length, {message: 'the worker error reached the gate', timeout: 5000})
        .toBeGreaterThan(0)
}

/**
 * Throws once on the main thread, outside any handler, and waits until the gate has read it.
 * @param {Object} page
 * @param {Object} workerErrors
 */
async function provokePageError(page, workerErrors) {
    await bootApp(page, WORKER_MODES[0].app);
    await page.evaluate(() => setTimeout(() => {throw new Error('worker error gate: page probe')}));

    await expect.poll(() => workerErrors.lines.length, {message: 'the page error reached the gate', timeout: 5000})
        .toBeGreaterThan(0)
}

test.describe('the worker error gate', () => {
    WORKER_MODES.forEach(opts => {
        test(`a ${opts.mode} worker error the test names passes`, async ({page, workerErrors}) => {
            workerErrors.expect(/^App Worker: Failed to load module via RMA: no\/such\/module\/at\/all/);

            await provokeAppWorkerError(page, workerErrors, opts)
        });

        test(`a ${opts.mode} worker error the test does not name fails it`, async ({page, workerErrors}) => {
            test.fail();

            await provokeAppWorkerError(page, workerErrors, opts)
        })
    });

    test('a page error the test names passes', async ({page, workerErrors}) => {
        workerErrors.expect(/^pageerror: worker error gate: page probe(\n|$)/);

        await provokePageError(page, workerErrors)
    });

    test('a page error the test does not name fails it', async ({page, workerErrors}) => {
        test.fail();

        await provokePageError(page, workerErrors)
    })
});
