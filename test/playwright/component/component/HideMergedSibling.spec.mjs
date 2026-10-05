import {test, expect} from '@playwright/test';

/**
 * @summary A child hidden while its sibling hides and renames in the same pass leaves the DOM.
 *
 * The second hide's rename is its own update, and it merges into the row's cycle. Before the fix that cycle went
 * sparse and kept the first hidden button as a reference, so its node stayed at `display: flex` while the
 * component read `hidden: true`. The pass runs inside the App Worker in one synchronous turn
 * (`apps/hide-merged-sibling/app.mjs`). The unit witness is `unit/component/HideMergedSibling.spec.mjs`.
 */
test.describe('component.Base: hide() beside a sibling whose own update merges into the parent cycle', () => {
    test('neither hidden button is left in the DOM', async ({page}) => {
        await page.goto('test/playwright/component/apps/hide-merged-sibling/index.html');
        await page.waitForSelector('#hide-merged-sibling-adopt', {state: 'attached'});

        const result = await page.evaluate(() => Neo.worker.App.setConfigs({id: 'hide-merged-sibling-viewport', pass: true}));
        expect(result.success).toBe(true);

        await expect(page.locator('#hide-merged-sibling-adopt')).toHaveCount(0);
        await expect(page.locator('#hide-merged-sibling-change')).toHaveCount(0);
        await expect(page.locator('#hide-merged-sibling-label')).toHaveCount(1)
    })
});
