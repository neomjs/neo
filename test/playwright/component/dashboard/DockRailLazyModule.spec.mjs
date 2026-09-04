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

const setWorkspace = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: WORKSPACE_ID, ...configs}
);

const lazyTab = page => page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Lazy'});

const visibleOverlay = page => page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)');

/**
 * Asserts the one-construction contract, and on a break carries the CAUSE rather than only the count.
 *
 * Two callers may legitimately load a parked pane — `layout.Card#afterSetActiveIndex` on activation,
 * and `container.Base#insert` when the inserted index is already active — so a tally of 2 does not
 * say which one arrived second. The duplicate is rare and surfaces only on a loaded runner, where
 * there is no session to attach to afterwards; the failure message is the only channel that reaches
 * a reader, so the captured call sites travel in it.
 *
 * The trail is read only on the failing path, so the green path keeps its single round-trip.
 * @param {Object} page
 * @param {Number} instances
 */
const expectOneConstruction = async (page, instances) => {
    if (instances !== 1) {
        const [trail] = await readWorkspace(page, ['lazyPaneConstructionTrail']);

        expect(instances, `one construction — ${instances} recorded. Call sites:\n${(trail ?? ['(no trail captured)']).join('\n--- next construction ---\n')}`).toBe(1);

        return
    }

    expect(instances, 'one construction').toBe(1)
};

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

    test('un-hidden into a tabs node behind an active sibling, the lazy item parks in the tab flow and loads when its tab activates', async ({page}) => {
        // The commit a consumer's own control makes: the item leaves the rail and the projection
        // places it into its tabs node. The reconciler swaps the staged placeholder through
        // container.insert(), which has to PARK a lazy config — and, this tab not being the active
        // one, must not load it: the header is there, the module is not, until the tab activates.
        await setWorkspace(page, {applyOperationJson: JSON.stringify({operation: 'setItemAutoHidden', itemId: 'lazy', autoHidden: false})});

        const
            tabsNode   = page.locator('.neo-dashboard-dock-tabs', {has: page.locator('.neo-tab-header-button', {hasText: 'Lazy'})}),
            lazyHeader = tabsNode.locator('.neo-tab-header-button', {hasText: 'Lazy'});

        await expect(tabsNode, 'the item is projected as a tab').toHaveCount(1);
        await expect(lazyTab(page), 'it left the rail').toHaveCount(0);
        await expect(visibleOverlay(page), 'no reveal overlay was involved').toHaveCount(0);
        await expect(tabsNode.locator('#dock-lazy-rail-pane-pinned'), 'the eager sibling stays the active card').toBeVisible();

        let [loaded] = await readWorkspace(page, ['lazyPaneModuleLoaded']);

        expect(loaded, 'parked: an inactive tab loads nothing').toBe(false);

        await lazyHeader.click();

        await expect(tabsNode.locator('.dock-lazy-rail-pane'), 'activation loads the module and the pane is the tab\'s card').toBeVisible();
        await expect(tabsNode.locator('.dock-lazy-rail-pane')).toHaveText('Lazy pane');

        const [loadedAfter, instances] = await readWorkspace(page, ['lazyPaneModuleLoaded', 'lazyPaneInstances']);

        expect(loadedAfter).toBe(true);
        await expectOneConstruction(page, instances)
    });

    test('un-hidden as the only visible item of its tabs node, the lazy item is the active card and loads at once', async ({page}) => {
        // The Fleet cockpit's shape: a node whose every item is railed, then one un-hidden by the
        // bootstrap CTA — the projected tab is active from the first frame, and the reconciler's
        // insert lands on the layout's active index, where nothing else would ever trigger the load.
        await setWorkspace(page, {applyOperationJson: JSON.stringify({operation: 'setItemAutoHidden', itemId: 'pinned', autoHidden: true})});
        await expect(page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Pinned'})).toHaveCount(1);

        await setWorkspace(page, {applyOperationJson: JSON.stringify({operation: 'setItemAutoHidden', itemId: 'lazy', autoHidden: false})});

        const tabsNode = page.locator('.neo-dashboard-dock-tabs', {has: page.locator('.neo-tab-header-button', {hasText: 'Lazy'})});

        await expect(tabsNode, 'the item is projected as a tab').toHaveCount(1);
        await expect(tabsNode.locator('.dock-lazy-rail-pane'), 'the active index loads on insert; the pane is the card').toBeVisible();
        await expect(tabsNode.locator('.dock-lazy-rail-pane')).toHaveText('Lazy pane');
        await expect(lazyTab(page), 'it left the rail').toHaveCount(0);
        await expect(visibleOverlay(page), 'no reveal overlay was involved').toHaveCount(0);

        const [loaded, instances] = await readWorkspace(page, ['lazyPaneModuleLoaded', 'lazyPaneInstances']);

        expect(loaded).toBe(true);
        await expectOneConstruction(page, instances)
    });
});
