import {test, expect} from '@playwright/test';

/**
 * The FM cockpit's visual-regression baselines — the design gate's mechanical guard: pixel
 * goldens for the scope-floor states where a diff means a DESIGN regression (a wrong rail
 * width, an off-token color), never content churn.
 *
 * Determinism stack (each layer load-bearing):
 * - the config forces `reducedMotion: 'reduce'` — every transition collapses through the
 *   motion-token layer, so settling means "the dock motion signal class is ABSENT", never a
 *   timing sleep;
 * - data is the committed fixture seed only: the registry bridge stays unwired here, and the
 *   fail-closed loaders render the honestly-labelled sample state BY DESIGN — the fixture IS
 *   the deterministic render;
 * - `document.fonts.ready` gates every capture (half-loaded webfonts are the classic
 *   false-diff source);
 * - the globalSetup already refused the run if the built theme CSS trails the SCSS sources.
 *
 * Baselines refresh ONLY via `--update-snapshots` under the visual config — a refreshed
 * golden is a reviewed design decision (the PR diff is the review surface).
 */
test.describe('FM cockpit — visual baselines (the design-gate scope floor)', () => {
    test.setTimeout(120000);

    // CI never runs the visual config (named-config discipline), and the skip guard keeps the
    // suite honest even if a workflow ever sweeps broadly
    test.skip(process.env.NEO_TEST_SKIP_CI === 'true', 'visual baselines are rendered-platform artifacts — local harness only');

    /**
     * Boots the agentos shell and waits for the SETTLED fleet cockpit: shell visible, fonts
     * loaded, at least one card rendered from the seed, and no dock motion in flight.
     * @param {Object} page
     */
    const bootSettledCockpit = async page => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 30000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('.neo-dashboard-dock-animating')).toHaveCount(0);
    };

    test('the default shell layout — the committed document projected (fleet over stream, chrome tucked)', async ({page}) => {
        await bootSettledCockpit(page);

        await expect(page.locator('.fm-fleet-cockpit')).toHaveScreenshot('cockpit-default-shell.png')
    });

    test('the fleet grid — one card per seeded resident at the density-ranked bar', async ({page}) => {
        await bootSettledCockpit(page);

        await expect(page.locator('.fm-fleet-grid')).toHaveScreenshot('fleet-grid-cards.png')
    });

    test('the activity stream — the chip-row vocabulary against the fixture feed', async ({page}) => {
        await bootSettledCockpit(page);

        await expect(page.locator('.fm-activity-stream')).toHaveScreenshot('activity-stream-chips.png')
    });

    test('the ~314 vessel window — what the cockpit renders there TODAY (viewport capture, overflow measured)', async ({page}) => {
        // The Retina evidence correction, honestly bounded: a 628-physical-px capture is ~314 CSS px.
        // The current cockpit does NOT fit that window — the bar's spine banner + the zone layout
        // push it to ~971px (see the assertion below; the layout repair is its own surface). This
        // receipt therefore does two things: a PAGE screenshot (can only ever show the true 314
        // viewport, never off-window overflow masquerading as the target width), and an explicit
        // measurement of the overflow so the state is witnessed, not hidden.
        await page.setViewportSize({width: 314, height: 900});
        await bootSettledCockpit(page);

        const geometry = await page.evaluate(() => {
            const cockpit = document.querySelector('.fm-fleet-cockpit');

            return {
                viewport   : window.innerWidth,
                clientWidth: Math.round(cockpit.clientWidth),
                scrollWidth: Math.round(cockpit.scrollWidth)
            }
        });

        expect(geometry.viewport, 'the viewport itself is the 314px vessel window').toBe(314);
        expect(geometry.scrollWidth, 'the cockpit currently overflows the 314px vessel — the measured truth, tracked for the layout-repair ticket').toBeGreaterThan(geometry.viewport);

        await expect(page).toHaveScreenshot('cockpit-vessel-314.png')
    });

    test('the Accounts surface — the inherited design-gate golden, under harness refresh semantics', async ({page}) => {
        await bootSettledCockpit(page);

        await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
        await expect(page.locator('.agent-panel-accounts')).toBeVisible({timeout: 30000});
        await expect(page.locator('.agent-config-card')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        await expect(page.locator('.agent-panel-accounts')).toHaveScreenshot('accounts-config-surface.png')
    });
});
