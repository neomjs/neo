import {test, expect} from '@playwright/test';

/**
 * @file test/playwright/component/dashboard/DockRailLazyModule.spec.mjs
 * @summary An auto-hidden dock item whose pane config carries a lazy `module` function loads on its
 * FIRST reveal — not at boot, and not never.
 *
 * The tab flow already has this contract: a card layout loads a lazy item's module when its tab
 * activates, so a heavy pane behind a never-opened tab costs nothing at startup. A rail is the same
 * strip with no active item, and reveal is its activation. Before the fix the reveal path handed
 * the loader function to a plain container slot, which threw inside the reveal transition and left
 * the overlay empty.
 *
 * Two observables, both read on the rendered workspace:
 * - the module registry: the lazy pane class is absent from the Neo namespace at boot (a static
 *   import anywhere in the fixture's boot graph would register it) and present after the reveal —
 *   read through the fixture workspace's `lazyPaneModuleLoaded` getter;
 * - the DOM: the visible reveal overlay holds the pane's node after the rail-tab click.
 */

const WORKSPACE_ID = 'dock-lazy-rail-workspace';

const readWorkspace = async (page, keys) => {
    // The main-realm remote answers with the worker-message envelope; the values ride `.data`.
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id: WORKSPACE_ID, keys});

    return reply?.data ?? reply
};

const lazyTab = page => page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Lazy'});

const visibleOverlay = page => page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)');

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-lazy-rail/index.html');
    await page.waitForSelector(`#${WORKSPACE_ID}`,       {state: 'attached'});
    await page.waitForSelector('.neo-dashboard-dock-rail-tab', {state: 'visible'})
});

test.describe('dock rail — a lazy module item loads on its first reveal', () => {
    test('nothing loads at boot, while the eager sibling renders', async ({page}) => {
        // non-vacuity: the projection rendered — the visible edge pane and the rail tab both exist
        await expect(page.locator('#dock-lazy-rail-pane-pinned')).toBeVisible();
        await expect(lazyTab(page)).toHaveCount(1);

        const [loaded, instances] = await readWorkspace(page, ['lazyPaneModuleLoaded', 'lazyPaneInstances']);

        expect(loaded).toBe(false);
        expect(instances).toBe(0);
        await expect(page.locator('.dock-lazy-rail-pane')).toHaveCount(0)
    });

    test('the rail-tab click loads the module and renders the pane inside the reveal overlay', async ({page}) => {
        await lazyTab(page).click();

        await expect(visibleOverlay(page)).toHaveCount(1);
        await expect(visibleOverlay(page).locator('.dock-lazy-rail-pane')).toBeVisible();
        await expect(visibleOverlay(page).locator('.dock-lazy-rail-pane')).toHaveText('Lazy pane');

        const [loaded, instances] = await readWorkspace(page, ['lazyPaneModuleLoaded', 'lazyPaneInstances']);

        expect(loaded).toBe(true);
        expect(instances).toBe(1)
    });

    test('a dismiss parks the loaded pane; the re-reveal shows the same instance, no second construction', async ({page}) => {
        await lazyTab(page).click();
        await expect(visibleOverlay(page).locator('.dock-lazy-rail-pane')).toBeVisible();

        // A click-born reveal holds focus inside the overlay, so Escape reaches its keydown seam —
        // the reveal contract's keyboard dismissal. A rail-tab re-click is not usable here: the
        // pointer leaving the overlay opens the dismiss grace first, and the click re-enters the
        // reveal before it lapses.
        await page.keyboard.press('Escape');
        await expect(visibleOverlay(page)).toHaveCount(0);

        await lazyTab(page).click();
        await expect(visibleOverlay(page).locator('#dock-lazy-rail-pane-lazy')).toBeVisible();

        const [instances] = await readWorkspace(page, ['lazyPaneInstances']);

        expect(instances).toBe(1)
    });
});
