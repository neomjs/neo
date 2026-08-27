import {test, expect} from '@playwright/test';

let probeSequence = 0;

/**
 * @summary Executes a unique test-only module in the real App Worker.
 *
 * `Neo.worker.App.loadModule()` is called through its Main-to-App RMA proxy. The imported module then
 * uses the production App-Worker `getAddon()` path, so a named-window stamp traverses App Worker →
 * target Main instead of being simulated with a direct page-realm method call.
 * @param {import('@playwright/test').Page} page
 * @param {String} source
 * @returns {Promise<Object>}
 */
async function runInAppWorker(page, source) {
    const path = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${source}\n// input-modality-probe-${++probeSequence}`)}`;

    return page.evaluate(modulePath => Neo.worker.App.loadModule({path: modulePath}), path)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} windowId
 * @param {'keyboard'|'pointer'} [modality]
 * @returns {Promise<void>}
 */
async function loadOrStampTracker(page, windowId, modality) {
    const lines = [
        `const addon = await Neo.currentWorker.getAddon('InputModality', ${JSON.stringify(windowId)});`
    ];

    if (modality) {
        lines.push(`await addon.setModality(${JSON.stringify({modality, windowId})});`)
    }

    const result = await runInAppWorker(page, lines.join('\n'));

    expect(result?.data ?? result).toMatchObject({success: true})
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Boolean} [includeWorkerId=true]
 * @returns {Promise<{windowId: String, workerId: String|undefined}>}
 */
async function getRealmIdentity(page, includeWorkerId = true) {
    await page.waitForFunction(requireWorkerId =>
        Neo?.worker?.Manager?.windowId && (!requireWorkerId || Neo?.worker?.App?.getWorkerId), includeWorkerId, {
        timeout: 30000
    });

    return page.evaluate(async requireWorkerId => {
        const workerReply = requireWorkerId ? await Neo.worker.App.getWorkerId() : undefined;

        return {
            windowId: Neo.worker.Manager.windowId,
            workerId: typeof workerReply === 'string' ? workerReply : workerReply?.data
        }
    }, includeWorkerId)
}

/**
 * @summary Real two-window proof for document-local input tracking and named-window worker stamps.
 */
test.describe('#15466 per-window input modality tracker', () => {
    test.setTimeout(120000);

    test('isolates real input per document and routes a worker stamp to the named popup', async ({page}) => {
        let popup;

        await page.goto('/apps/workstation/index.html');
        await expect(page.locator('.workstation-viewport')).toBeVisible({timeout: 60000});
        await expect(page.locator('html')).not.toHaveAttribute('data-input-modality');

        const sourceRealm = await getRealmIdentity(page);

        expect(sourceRealm.windowId).toBeTruthy();
        expect(sourceRealm.workerId).toBeTruthy();

        try {
            [popup] = await Promise.all([
                page.waitForEvent('popup'),
                page.evaluate(() => Boolean(window.open('/apps/workstation/index.html?input-modality-popup', 'input-modality-popup')))
            ]);

            await popup.waitForLoadState('domcontentloaded');
            await expect(popup.locator('.workstation-viewport')).toBeVisible({timeout: 60000});
            await expect(popup.locator('html')).not.toHaveAttribute('data-input-modality');

            const popupRealm = await getRealmIdentity(popup, false);

            expect(popupRealm.windowId).toBeTruthy();
            expect(popupRealm.windowId).not.toBe(sourceRealm.windowId);

            await loadOrStampTracker(page, sourceRealm.windowId);
            await loadOrStampTracker(page, popupRealm.windowId);

            await expect(page.locator('html')).not.toHaveAttribute('data-input-modality');
            await expect(popup.locator('html')).not.toHaveAttribute('data-input-modality');

            await page.keyboard.press('Tab');
            await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');
            await expect(popup.locator('html')).not.toHaveAttribute('data-input-modality');

            await popup.mouse.click(5, 5);
            await expect(popup.locator('html')).toHaveAttribute('data-input-modality', 'pointer');
            await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');

            await page.mouse.click(5, 5);
            await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'pointer');

            await loadOrStampTracker(page, popupRealm.windowId, 'keyboard');

            await expect(popup.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');
            await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'pointer')
        } finally {
            await popup?.close().catch(() => {})
        }
    })
});
