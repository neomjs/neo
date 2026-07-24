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
     * loaded, at least one card rendered from the seed, every card image settled, and no dock
     * motion in flight.
     * @param {Object} page
     */
    const bootSettledCockpit = async page => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 30000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});
        await page.evaluate(() => document.fonts.ready);
        // The one non-deterministic layer of the fixture render: card avatars are LIVE GitHub
        // image fetches, and a capture that races them locks placeholder circles into the pixels.
        // Wait for every present image to settle (load OR error), bounded so a dead fetch can
        // never wedge the suite.
        await page.evaluate(() => Promise.all(
            [...document.images]
                .filter(img => !img.complete)
                .map(img => new Promise(resolve => {
                    img.addEventListener('load',  resolve, {once: true});
                    img.addEventListener('error', resolve, {once: true});
                    setTimeout(() => {
                        // A dead fetch resolves identically to a load — without this line the gate
                        // emits nothing and the placeholder-circle capture it exists to prevent
                        // lands silently. The bound must be observable to be a bound.
                        console.warn(`[visual-fixture] image did not settle within 10s: ${img.currentSrc || img.src || '(no src)'} — capturing with whatever is rendered`);
                        resolve()
                    }, 10000)
                }))
        ));
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

    test('the ~314 vessel window — the cockpit fits and the interactive core is reachable (viewport capture, geometry asserted)', async ({page}) => {
        // The Retina evidence correction, honestly bounded: a 628-physical-px capture is ~314 CSS px.
        // The vessel-narrow layout makes the cockpit fit this window: inline-size containment
        // on the cockpit root (the own-width discipline) stops descendant min-content floors
        // from escalating, the spine banner shrinks into its ellipsis rules, and the wrapped bar keeps
        // Start fleet reachable. This receipt asserts the INVERSE of the pre-repair overflow witness:
        // the cockpit spans exactly the vessel width, nothing scrolls off-window, and the primary
        // action is inside the viewport.
        await page.setViewportSize({width: 314, height: 900});
        await bootSettledCockpit(page);

        const geometry = await page.evaluate(() => {
            const cockpit = document.querySelector('.fm-fleet-cockpit'),
                  start   = document.querySelector('.fm-fleet-start');

            return {
                viewport      : window.innerWidth,
                clientWidth   : Math.round(cockpit.clientWidth),
                scrollWidth   : Math.round(cockpit.scrollWidth),
                startRect     : start ? start.getBoundingClientRect().toJSON() : null,
                docScrollWidth: Math.round(document.documentElement.scrollWidth)
            }
        });

        expect(geometry.viewport, 'the viewport itself is the 314px vessel window').toBe(314);
        expect(geometry.scrollWidth, 'the repaired cockpit no longer overflows its vessel — scroll width stays inside the client box').toBeLessThanOrEqual(geometry.clientWidth);
        expect(geometry.docScrollWidth, 'the document carries no horizontal overflow at vessel width').toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.startRect, 'the Start fleet button is rendered').not.toBeNull();
        expect(geometry.startRect.right, 'the Start fleet button sits inside the vessel window — the interactive core is reachable').toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.startRect.left, 'the Start fleet button is not clipped at the left edge either').toBeGreaterThanOrEqual(0);

        await expect(page).toHaveScreenshot('cockpit-vessel-314.png')
    });

    test('the 720 intermediate band — shrink-only regime: no wrap, no overflow, banner truncation-capable (viewport capture, geometry asserted)', async ({page}) => {
        // The lattice's third point, between the 314 fit witness and the desktop baselines:
        // above the 570px vessel-narrow threshold (the @container block must stay
        // silent — no bar wrap, no split stacking) but narrow enough that the unconditionally
        // shrinkable spine banner is the only pressure valve. This receipt pins the shrink-only
        // regime: zero document overflow, the bar keeps ONE row (proven via computed flex-wrap,
        // never child-top arithmetic — siblings differ in height), and the banner is permitted to
        // shrink — visibly truncating when the fixture text exceeds its compressed box.
        await page.setViewportSize({width: 720, height: 900});
        await bootSettledCockpit(page);

        const geometry = await page.evaluate(() => {
            const bar    = document.querySelector('.fm-cockpit-bar'),
                  banner = document.querySelector('.fm-spine-banner'),
                  start  = document.querySelector('.fm-fleet-start');

            return {
                viewport      : window.innerWidth,
                docScrollWidth: Math.round(document.documentElement.scrollWidth),
                barWrap       : getComputedStyle(bar).flexWrap,
                banner        : banner ? {
                    clientWidth : Math.round(banner.clientWidth),
                    scrollWidth : Math.round(banner.scrollWidth),
                    flexShrink  : getComputedStyle(banner).flexShrink,
                    textOverflow: getComputedStyle(banner).textOverflow
                } : null,
                startRight    : start ? Math.round(start.getBoundingClientRect().right) : null
            }
        });

        expect(geometry.viewport, 'the viewport is the 720px intermediate band').toBe(720);
        expect(geometry.docScrollWidth, 'no horizontal document overflow in the shrink-only regime').toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.barWrap, 'the vessel-narrow wrap rule stays silent above the 570px threshold').toBe('nowrap');
        expect(geometry.banner, 'the spine banner is rendered').not.toBeNull();
        expect(geometry.banner.flexShrink, 'the banner is permitted to shrink — the unconditional-shrink contract').toBe('1');
        // The truncation witness is UNCONDITIONAL: at this width the banner must be under
        // compression, or the shrink-only regime is not the one being witnessed. A conditional
        // assert could silently no-op into a green run that witnesses nothing — the day the
        // fixture text shortens or a design fix widens the box, this receipt must go red, not quiet.
        expect(geometry.banner.scrollWidth, 'the banner text must exceed its compressed box at 720 — the regime under witness requires live pressure').toBeGreaterThan(geometry.banner.clientWidth);
        expect(geometry.banner.textOverflow, 'the pressure resolves as visible truncation').toBe('ellipsis');
        expect(geometry.startRight, 'Start fleet stays inside the band').toBeLessThanOrEqual(geometry.viewport);

        await expect(page).toHaveScreenshot('cockpit-intermediate-720.png')
    });

    test('the Accounts surface — the inherited design-gate golden, under harness refresh semantics', async ({page}) => {
        await bootSettledCockpit(page);

        await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
        await expect(page.locator('.agent-panel-accounts')).toBeVisible({timeout: 30000});
        // The card's class is fm-agent-config-card (introduced by the define-agent config-card
        // re-skin); the older reference-only `.agent-config-card` selector went stale with it.
        await expect(page.locator('.fm-agent-config-card')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        await expect(page.locator('.agent-panel-accounts')).toHaveScreenshot('accounts-config-surface.png')
    });
});
