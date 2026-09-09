import {test, expect} from '@playwright/test';

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
 * ⚠️ **This does NOT prove the mirror fires.** It asserts an absence, so a mirror that never ran
 * would pass it. The presence half was verified by hand — the topology-bar defect reinstated on a
 * local branch produced `App Worker: initVnode error util.VDom.getVdom: Component not found for id:
 * neo-component-34` in the page console of a SharedWorker app — but no page-only trigger for a
 * worker error exists yet: the App-Worker remote manifest exposes none, and `destroyNeoInstance`
 * correctly routes through `parent.remove()`. Until such a trigger exists the gate that would fail a
 * test on a mirrored error is deliberately NOT shipped, because its own failure path could not be
 * exercised in CI.
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
    })
});
