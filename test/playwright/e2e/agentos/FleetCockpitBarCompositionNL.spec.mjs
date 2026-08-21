import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Pins the cockpit bar's de-crowded composition at the two contract widths: the bar
 * seats the navigation model's five tenants (presets · spine banner+Reconnect · wake telltale ·
 * fleet-start summary · Start fleet), the pane verbs live in pane chrome, the recall pair stays
 * exception-only (zero nominal pixels), and the two status texts hold their shrink floors. At
 * 800px everything shares one row; at the 520px vessel-narrow width the toolbar wraps cleanly
 * instead of squeezing — both pinned as screenshot baselines, so a future tenant or a lost floor
 * fails as pixels, not as an operator surprise.
 */
test.describe('AgentOS Fleet cockpit — bar composition at the contract widths (#17457)', () => {
    test.setTimeout(120000);

    for (const {label, width} of [
        {label: 'contract-800', width: 800},
        {label: 'vessel-narrow-520', width: 520}
    ]) {
        test(`the five-tenant bar holds at ${width}px — no collisions, floors intact, zero pane verbs`, async ({page}) => {
            await page.setViewportSize({width, height: 700});
            await page.goto('/apps/agentos/index.html');

            const bar = page.locator('.fm-cockpit-bar');

            await expect(bar).toBeVisible({timeout: 60000});
            // the cold-state banner is deterministic fixture truth (server offline · static roster)
            await expect(page.locator('.fm-spine-banner')).toBeVisible({timeout: 30000});

            // structural truth before the pixel pin: no pane verb rents bar space in the nominal
            // state — the recall pair exists only while a pane is away (removeDom keeps this exact)
            await expect(bar.locator('.fm-detail-window-toggle, .fm-memories-window-toggle')).toHaveCount(0);

            await expect(bar).toHaveScreenshot(`cockpit-bar-${label}.png`)
        })
    }
});
