import {expect, test} from '../../fixtures.mjs';

/**
 * Guards the silence of `Neo.worker.App#forwardErrorToMainThread`.
 *
 * A SharedWorker's console output goes to its own inspector context, which no page can read; the
 * mirror gives an error one path that needs neither a Brain checkout nor the Neural Link. Because it
 * writes into the page console, its failure mode is **noise** — a level widening past `error`, an
 * environment escaping the allowlist, or a boot-time error nobody noticed because it was previously
 * invisible. This arm fails on any of them.
 *
 * **The app under test is chosen, not incidental, and both properties are asserted below.**
 *
 * - `useSharedWorkers: true` — a DEDICATED worker needs no mirror at all, because the browser
 *   already forwards its console to the owner document. Pointed at a dedicated-worker app this arm
 *   would pass while exercising nothing, since the mirror declines to run there.
 * - no `useAiClient` — the mirror lives inside the console interceptor that also feeds the Neural
 *   Link client, and it must not require one. Most consumers have no Brain checkout and no bridge.
 *
 * **The second arm is the presence half.** A rejection nobody handles reaches neither the console
 * interceptor nor `onerror`, so it has its own forward and its own witness: a page-only `loadModule`
 * of a module whose evaluation rejects, with the receipt proving the App worker ran it.
 */

/** SharedWorker mode, and no AI client — the two properties this arm needs. See the class docblock. */
const APP = '/examples/stateProvider/multiWindow/index.html';

test.describe('App Worker error mirror', () => {
    test('a healthy SharedWorker app mirrors nothing into the page console', async ({page}) => {
        const mirrored = [];

        page.on('console', message => {
            message.type() === 'error' && message.text().startsWith('App Worker: ') && mirrored.push(message.text())
        });

        await page.goto(APP);
        await expect(page.locator('.neo-viewport').first()).toBeVisible();

        // The preconditions, asserted rather than assumed. Without the first, this arm passes on an
        // app the mirror never runs in; without the second, it would prove nothing about consumers
        // who have no bridge — which is most of them.
        const config = await page.evaluate(() => ({
            sharedWorkers: Neo.config.useSharedWorkers === true,
            aiClient     : Neo.config.useAiClient === true
        }));

        expect(config.sharedWorkers, 'the mirror only runs in SharedWorker mode').toBe(true);
        expect(config.aiClient,      'and must not need the Neural Link client').toBe(false);

        expect(mirrored, 'a clean boot mirrors nothing').toEqual([])
    });

    test('an unhandled rejection in the App worker reaches the page console', async ({page, workerErrors}) => {
        // Only the mirror writes the worker's name in front, so a browser forwarding its own
        // "Uncaught (in promise)" line cannot match.
        const probe = /^App Worker: Error: neo-worker-mirror unhandled rejection probe/;

        workerErrors.expect(probe);

        await page.goto(APP);
        await expect(page.locator('.neo-viewport').first()).toBeVisible();

        const receipt = await page.evaluate(() => Neo.worker.Manager.promiseMessage('app', {
            action         : 'remoteMethod',
            remoteClassName: 'Neo.worker.App',
            remoteMethod   : 'loadModule',
            data           : [{path: 'data:text/javascript,' + encodeURIComponent('Promise.reject(new Error("neo-worker-mirror unhandled rejection probe"))')}]
        }));

        expect(receipt?.data?.success, 'the module loaded inside the App worker').toBe(true);

        await expect.poll(() => workerErrors.lines.some(line => probe.test(line)), {
            message: 'the unhandled rejection must reach the page console',
            timeout: 5000
        }).toBe(true)
    })
});
