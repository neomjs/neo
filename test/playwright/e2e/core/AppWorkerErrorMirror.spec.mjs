import {test, expect} from '@playwright/test';

/**
 * Guards both directions of `Neo.worker.Base#forwardErrorToMainThread` for the App worker: a healthy
 * app mirrors nothing, and an error the page could not otherwise see does reach it.
 *
 * A SharedWorker's console output goes to its own inspector context, which no page can read; the
 * mirror gives an error one path that needs neither a Brain checkout nor the Neural Link. Because it
 * writes into the page console, its failure mode is **noise** — a level widening past `error`, an
 * environment escaping the allowlist, or a boot-time error nobody noticed because it was previously
 * invisible. The first arm fails on any of them.
 *
 * **The app under test is chosen, not incidental, and both properties are asserted below.**
 *
 * - `useSharedWorkers: true` — a DEDICATED worker needs no mirror at all, because the browser
 *   already forwards its console to the owner document. Pointed at a dedicated-worker app these arms
 *   would pass while exercising nothing, since the mirror declines to run there.
 * - no `useAiClient` — the mirror lives inside the console interceptor that also feeds the Neural
 *   Link client, and it must not require one. Most consumers have no Brain checkout and no bridge.
 *
 * **The second arm is the presence half, for the input the interceptor cannot see.** A rejected
 * promise nobody handles passes neither through `console.error` nor through `onerror`: the browser
 * reports it to the worker's own inspector. An async config hook that rejects is exactly that, and it
 * fails silently on every page. The trigger is page-only and benign — `loadModule` of a module whose
 * evaluation leaves a rejection behind — and the receipt is the positive control that the worker ran it.
 */

/** SharedWorker mode, and no AI client — the two properties these arms need. See the class docblock. */
const APP = '/examples/stateProvider/multiWindow/index.html';

/**
 * Asserts the preconditions both arms depend on, rather than inheriting them from the app's config.
 * @param {Object} page
 */
async function expectMirrorPreconditions(page) {
    const config = await page.evaluate(() => ({
        sharedWorkers: Neo.config.useSharedWorkers === true,
        aiClient     : Neo.config.useAiClient === true
    }));

    expect(config.sharedWorkers, 'the mirror only runs in SharedWorker mode').toBe(true);
    expect(config.aiClient,      'and must not need the Neural Link client').toBe(false)
}

test.describe('App Worker error mirror', () => {
    test('a healthy SharedWorker app mirrors nothing into the page console', async ({page}) => {
        const mirrored = [];

        page.on('console', message => {
            message.type() === 'error' && message.text().startsWith('App Worker: ') && mirrored.push(message.text())
        });

        await page.goto(APP);
        await expect(page.locator('.neo-viewport').first()).toBeVisible();

        // Without the first precondition this arm passes on an app the mirror never runs in; without
        // the second, it would prove nothing about consumers who have no bridge — which is most of them.
        await expectMirrorPreconditions(page);

        expect(mirrored, 'a clean boot mirrors nothing').toEqual([])
    });

    test('an unhandled rejection in the App worker reaches the page console', async ({page}) => {
        const probe    = 'neo-worker-mirror unhandled rejection probe',
              mirrored = [];

        page.on('console', message => {
            message.type() === 'error' && message.text().includes(probe) && mirrored.push(message.text())
        });

        await page.goto(APP);
        await expect(page.locator('.neo-viewport').first()).toBeVisible();
        await expectMirrorPreconditions(page);

        // The import succeeds, so the receipt proves the App worker evaluated the module; the only
        // thing left unobserved is the rejection its evaluation leaves behind.
        const receipt = await page.evaluate(probe => Neo.worker.Manager.promiseMessage('app', {
            action         : 'remoteMethod',
            remoteClassName: 'Neo.worker.App',
            remoteMethod   : 'loadModule',
            data           : [{path: 'data:text/javascript,' + encodeURIComponent(`Promise.reject(new Error(${JSON.stringify(probe)}))`)}]
        }), probe);

        expect(receipt?.data?.success, 'the module loaded inside the App worker').toBe(true);
        expect(receipt?.origin,        'and it ran there').toBe('app');

        await expect.poll(() => mirrored, {
            message  : 'the unhandled rejection must reach the page console',
            timeout  : 5000,
            intervals: [50, 100, 200]
        }).not.toEqual([]);

        // A browser that forwarded the worker's own "Uncaught (in promise)" line would satisfy the poll
        // above without the mirror; only the mirror writes the worker's name in front.
        expect(mirrored.every(line => line.startsWith('App Worker: ')),
            `every matching line is the mirror's — got ${JSON.stringify(mirrored)}`).toBe(true)
    })
});
