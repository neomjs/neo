import {test, expect} from '@playwright/test';

/**
 * Guards the silence of `Neo.worker.App#forwardErrorToMainThread`.
 *
 * A Neo app raises its errors in the App Worker, whose console no page can read; the mirror gives
 * them one path that needs neither a Brain checkout nor the Neural Link. Because it writes into the
 * page console, its failure mode is **noise** — a level widening past `error`, or a boot-time error
 * nobody noticed because it was previously invisible. This arm fails on either.
 *
 * ⚠️ **This does NOT prove the mirror works.** It asserts an absence, so a mirror that never fired
 * at all would pass it. The presence half was verified by hand — the topology-bar defect reinstated
 * on a local branch produced `App Worker: initVnode error util.VDom.getVdom: Component not found for
 * id: neo-component-34` in the page console — but no page-only trigger for a worker error exists yet:
 * the App-Worker remote manifest exposes none, and `destroyNeoInstance` correctly routes through
 * `parent.remove()`. Until such a trigger exists, the gate that would fail a test on a mirrored
 * error is deliberately NOT shipped, because its own failure path could not be exercised in CI.
 */
test.describe('App Worker error mirror', () => {
    test('a healthy app mirrors nothing into the page console', async ({page}) => {
        const mirrored = [];

        page.on('console', message => {
            message.type() === 'error' && message.text().startsWith('App Worker: ') && mirrored.push(message.text())
        });

        await page.goto('/examples/dashboard/dock/');
        await expect(page.locator('.neo-viewport').first()).toBeVisible();

        expect(mirrored, 'a clean boot mirrors nothing').toEqual([])
    })
});
