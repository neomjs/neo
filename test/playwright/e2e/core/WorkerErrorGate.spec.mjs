import {expect, test} from '../../fixtures.mjs';

/**
 * `fixtures.mjs#workerErrors` has two outcomes for each of its two sources, and each arm below
 * produces exactly one of them.
 *
 * `test.fail()` marks the arms whose test must fail, so Playwright reports them green only when the
 * gate actually failed them. Each rests on a passing arm for the same source: that arm proves a
 * provoked error really reaches the gate, so an expected failure cannot come from a channel that
 * delivered nothing.
 *
 * The worker trigger is page-only and benign. App-worker `loadModule` of a path that does not exist
 * logs at `error` level and returns a receipt instead of throwing, and the receipt proves it ran.
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
