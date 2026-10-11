import {test, expect} from '@playwright/test';

/**
 * @summary Light and dark baselines for a grid column's trailing edge: across unused width the last center column
 * closes its edge in the header and in its cells, and where the center meets the locked end one divider stands.
 *
 * Fixture `apps/grid-cell-editing`: `#grid-cell-editing` leaves unused center width at this viewport, and
 * `#grid-cell-editing-pooled` scrolled to its end meets its locked-end column. The CI-run pixel arms for the same
 * contract are `component/grid/ColumnTrailingEdge.spec.mjs`; these goldens are its design record.
 *
 * Baselines refresh ONLY via `--update-snapshots` under the visual config — a refreshed golden is a reviewed design
 * decision (the PR diff is the review surface).
 */
test.describe('Grid column trailing edge — light and dark baselines', () => {
    test.skip(process.env.NEO_TEST_SKIP_CI === 'true', 'visual baselines are rendered-platform artifacts — local harness only');

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        test(`${theme}: an exposed edge and a contiguous seam`, async ({page}) => {
            const pooled = '#grid-cell-editing-pooled';

            await page.goto('/test/playwright/component/apps/grid-cell-editing/index.html');
            await page.waitForSelector(`${pooled} .neo-grid-row .neo-grid-cell`, {state: 'visible'});

            await page.evaluate(theme => Neo.worker.App.setConfigs({id: document.querySelector('.neo-viewport').id, theme}), theme);
            await expect(page.locator('body')).toHaveClass(new RegExp(theme));

            await page.evaluate(grid => {
                const scrollbar = document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`);

                scrollbar.scrollLeft = scrollbar.scrollWidth
            }, pooled);

            // the seam is contiguous once the last center column's cells are mounted flush against the end region
            await expect.poll(() => page.evaluate(grid => {
                const edge = field => document.querySelector(`${grid} .neo-grid-cell[data-field="${field}"]`)?.getBoundingClientRect();

                return edge('c39') && edge('c38') ? Math.round(edge('c39').left - edge('c38').right) : null
            }, pooled)).toBe(0);

            await expect(page.locator('#grid-cell-editing')).toHaveScreenshot(`exposed-edge-${theme}.png`);
            await expect(page.locator(pooled)).toHaveScreenshot(`contiguous-seam-${theme}.png`)
        })
    }
});
