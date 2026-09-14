import {expect, test} from '../../fixtures.mjs';

/**
 * `fixtures.mjs#workerErrors`, one arm per outcome and source. The `test.fail()` arms pass only when
 * the gate failed them, and each sits beside a passing arm proving its error reaches the gate. The
 * worker trigger is benign: App-worker `loadModule` of a missing path logs and returns a receipt.
 */
const APP = '/examples/stateProvider/multiWindow/index.html';

/**
 * Boots the app and waits until its App worker can take a remote call.
 * @param {Object} page
 */
async function bootApp(page) {
    await page.goto(APP);
    await page.waitForFunction(() => globalThis.Neo?.worker?.Manager?.workers?.app, null, {timeout: 30000})
}

/**
 * Makes the App worker log one real error, and waits until the gate has read it.
 * @param {Object} page
 * @param {Object} workerErrors
 */
async function provokeAppWorkerError(page, workerErrors) {
    await bootApp(page);

    const receipt = await page.evaluate(() => Neo.worker.Manager.promiseMessage('app', {
        action         : 'remoteMethod',
        remoteClassName: 'Neo.worker.App',
        remoteMethod   : 'loadModule',
        data           : [{path: 'no/such/module/at/all'}]
    }));

    expect(receipt?.data?.success, 'the load ran and failed, which is the point').toBe(false);

    await expect.poll(() => workerErrors.lines.length, {message: 'the mirrored error reached the gate', timeout: 5000})
        .toBeGreaterThan(0)
}

/**
 * Throws once on the main thread, outside any handler, and waits until the gate has read it.
 * @param {Object} page
 * @param {Object} workerErrors
 */
async function provokePageError(page, workerErrors) {
    await bootApp(page);
    await page.evaluate(() => setTimeout(() => {throw new Error('worker error gate: page probe')}));

    await expect.poll(() => workerErrors.lines.length, {message: 'the page error reached the gate', timeout: 5000})
        .toBeGreaterThan(0)
}

test.describe('the worker error gate', () => {
    test('a worker error the test names passes', async ({page, workerErrors}) => {
        workerErrors.expect(/^App Worker: Failed to load module via RMA: no\/such\/module\/at\/all/);

        await provokeAppWorkerError(page, workerErrors)
    });

    test('a worker error the test does not name fails it', async ({page, workerErrors}) => {
        test.fail();

        await provokeAppWorkerError(page, workerErrors)
    });

    test('a page error the test names passes', async ({page, workerErrors}) => {
        workerErrors.expect(/^pageerror: worker error gate: page probe$/);

        await provokePageError(page, workerErrors)
    });

    test('a page error the test does not name fails it', async ({page, workerErrors}) => {
        test.fail();

        await provokePageError(page, workerErrors)
    })
});
