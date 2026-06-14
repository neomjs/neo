import { test, expect }                from '../fixtures.mjs';
import { NeuralLink_ComponentService } from '../../../ai/services.mjs';

/**
 * @summary Direct multi-window proof for the `create_component` Neural Link tool.
 *
 * The single-window create + inspection path is covered by a sibling spec; this one carries the
 * multi-window axis: that `create_component` lands in the CORRECT window under a shared App Worker.
 * The mechanism is sound by composition (create_component → window-agnostic id-based `call_method` →
 * globally-unique ids → the App Worker's existing per-window delta routing), and this is the DIRECT
 * L3 evidence.
 *
 * Subject app: `apps/shareddialog` (`useSharedWorkers:true`, `useAiClient:true`). Its "Open docked
 * Window" button opens a second window (the `shareddialog2` childapp) sharing the SAME App Worker heap.
 * The window-2 target container is read FROM the popup's own DOM (so it is window-2 by construction, no
 * windowId heuristics), created into via NL with the shared `sessionId`, then asserted to render in
 * window 2 and NOT in window 1 — the negative half is what proves per-window targeting vs a broadcast.
 */
test.describe('Neural Link create_component — multi-window shared-worker targeting (AC1)', () => {
    test.setTimeout(90000);

    test('create_component into a window-2 container renders in window 2, not window 1', async ({ page, neuralLink }) => {
        await page.goto('/apps/shareddialog/index.html');

        // One shared App Worker → a single sessionId covers EVERY window's component tree.
        const app = await neuralLink.connectToApp('SharedDialog');
        expect(app.sessionId).toBeTruthy();

        // AC1 is specifically about the shared-worker topology — assert we are actually in it.
        const isShared = await page.evaluate(() => window.Neo?.config?.useSharedWorkers === true);
        expect(isShared).toBe(true);

        // Open window 2 (the shareddialog2 childapp) in the same SharedWorker via the docked-window button.
        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            page.getByRole('button', { name: 'Open docked Window' }).click()
        ]);
        await popup.waitForLoadState('domcontentloaded');

        // Window 2's own viewport — its id is, by construction, a window-2 container.
        const popupViewport = popup.locator('.neo-viewport').first();
        await expect(popupViewport).toBeAttached({ timeout: 30000 });

        const window2ContainerId = await popupViewport.getAttribute('id');
        expect(window2ContainerId).toBeTruthy();

        // The tool under test: create_component into the window-2 container, over the shared sessionId.
        const probeId = 'nl-multiwin-create-probe';
        await NeuralLink_ComponentService.createComponent({
            sessionId: app.sessionId,
            parentId : window2ContainerId,
            config   : { ntype: 'button', id: probeId, text: 'NL Multi-Window Probe' }
        });

        // It renders in window 2 (its parent's window) ...
        const probeInWindow2 = popup.locator(`#${probeId}`);
        await expect(probeInWindow2).toBeVisible({ timeout: 15000 });
        await expect(probeInWindow2).toContainText('NL Multi-Window Probe');

        // ... and NOT in window 1 — the per-window-targeting assertion.
        expect(await page.locator(`#${probeId}`).count()).toBe(0);

        await popup.close();
    });
});
