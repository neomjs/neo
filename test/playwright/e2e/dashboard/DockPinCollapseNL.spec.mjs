import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the gesture proof for the pin/collapse ENTRY of the auto-hide round-trip
 * (neomjs/neo#17945, ADR 0029 §2.7).
 *
 * `DockAutoHideRevealNL` proves the way BACK — a committed auto-hidden item rails, the rail reveals,
 * and the overlay's pin control returns it. It has to auto-hide its subject programmatically first,
 * because until this leaf no affordance sent a pane TO the rail. This spec closes that loop with a
 * real gesture: the pane's own header action collapses it, and the existing reveal path brings it
 * home. The product truths a unit spec cannot certify are
 *
 *   1. the projected `pin` action is a REAL, clickable button in the tab header,
 *   2. pressing it commits §2.7's sequence in the App Worker and the pane genuinely leaves its tab
 *      flow for a rail button on its owning edge,
 *   3. the round-trip closes — the revealed overlay's pin control puts the pane back — so the two
 *      halves compose rather than each merely working in isolation,
 *   4. the affordance is absent where the gesture could not complete: the center pane, which §2.7
 *      never rails.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives the native clicks; the Neural Link fixture
 * reads the holder's committed `dockModel` at every stage. NOTHING here is committed programmatically
 * — every mutation in this spec comes from a real gesture, which is the point of it.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test DockPinCollapseNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 * (the port override isolates from any foreign dev-server squatting on 8080)
 */

const bootDockExample = async ({ page, neuralLink }) => {
    await page.goto('/examples/dashboard/dock/');
    page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

    await page.waitForTimeout(2500); // settle worker boot + first render

    const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
    const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
    const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;

    expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

    const readModel = async () => (await app.getComponent(holderId, ['dockModel'])).dockModel;

    return { app, holderId, readModel }
};

/** Resolves the live projected TabContainer id for one semantic dock node. */
const tabsNodeId = async (app, dockNodeId) => {
    const records = await app.queryComponent({ dockNodeId }, ['id', 'ntype']),
          record  = Array.isArray(records) ? records[0] : records;

    return record?.id ?? record?.properties?.id
};

test.describe('Dock pin/collapse round-trip (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('the header pin action collapses a pane to its edge rail, and the reveal overlay brings it back', async ({ page, neuralLink }) => {
        const { app, readModel } = await bootDockExample({ page, neuralLink });

        // Setup truth: the inspector sits VISIBLE in the right edge band, and nothing rails yet. The
        // sibling spec has to commit an auto-hide here; this one gets there by pressing a button.
        const before = await readModel();

        expect(before?.nodes?.['inspector-tabs']?.items, 'the example seeds the inspector in the right edge band').toEqual(['inspector']);
        expect(before?.items?.inspector?.autoHidden, 'the inspector must start visible').not.toBe(true);
        await expect(page.locator('.neo-dashboard-dock-edge-rail .neo-dashboard-dock-rail-tab')).toHaveCount(0);

        const inspectorTabsId = await tabsNodeId(app, 'inspector-tabs'),
              mainTabsId      = await tabsNodeId(app, 'main-tabs');

        expect(inspectorTabsId, 'the inspector band projects a live TabContainer').toBeTruthy();
        expect(mainTabsId,      'the center stack projects a live TabContainer').toBeTruthy();

        // Product truth #1: the opt-in projects a real action instance on the edge-owned pane.
        await expect.poll(async () => (await app.callMethod(inspectorTabsId, 'getActionItem', ['pin']))?.id, {
            message: 'the opt-in projection materialises one persistent pin action',
            timeout: 10000
        }).toBeTruthy();

        const pinAction = await app.callMethod(inspectorTabsId, 'getActionItem', ['pin']),
              pinButton = page.locator(`#${pinAction.id}`);

        // Product truth #4: §2.7's fail-safe reaches the real product — the center stack projects the
        // action too, but hidden, because main content never rails. A visible control there would
        // offer a collapse the model refuses.
        const centerPin = await app.callMethod(mainTabsId, 'getActionItem', ['pin']);

        expect(centerPin?.id, 'the center stack projects the action instance').toBeTruthy();
        await expect(page.locator(`#${centerPin.id}`), 'a center-owned pane must not offer the collapse').toBeHidden();

        // Native gesture: collapse the inspector from its OWN header.
        await expect(pinButton).toBeVisible({ timeout: 10000 });
        await pinButton.click();

        // Product truth #2: worker truth carries the collapse, committed through the semantic path.
        await expect.poll(async () => (await readModel())?.items?.inspector?.autoHidden, {
            message: 'the real header action commits the collapse through the model',
            timeout: 10000
        }).toBe(true);

        const collapsed = await readModel();

        // The item is unpinned-and-hidden, never both — the exclusivity §2.7's sequence exists to keep.
        expect(collapsed.items.inspector.pinned, 'the collapse leaves the item unpinned').not.toBe(true);

        // ...and it genuinely LEFT the tab flow for a rail button on the edge that owns it.
        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();

        await expect(railTab, 'the collapsed pane must become a labeled edge-rail tab').toBeVisible({ timeout: 10000 });
        await expect(
            page.locator('.neo-dashboard-dock-edge-rail-right .neo-dashboard-dock-rail-tab'),
            'the rail is the one on its OWNING edge, not merely some rail'
        ).toHaveCount(1);

        // Product truth #3: the loop closes. The existing reveal path takes it from here.
        await railTab.click();
        await page.waitForTimeout(600);

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay').first();

        await expect(overlay, 'the reveal overlay must open on rail-tab click').toBeVisible({ timeout: 10000 });
        expect(JSON.stringify(await readModel()), 'the reveal stays runtime-only').toBe(JSON.stringify(collapsed));

        await overlay.locator('.neo-dashboard-dock-reveal-pin').first().click();

        await expect.poll(async () => (await readModel())?.items?.inspector?.pinned, {
            message: 'the overlay pin control returns the pane through the reducer',
            timeout: 10000
        }).toBe(true);

        const restored = await readModel();

        expect(restored.items.inspector.autoHidden, 'returning clears the collapse').toBe(false);
        expect(restored.nodes['inspector-tabs'].items, 'the pane is back in its tab flow').toEqual(['inspector']);
        await expect(
            page.locator('.neo-dashboard-dock-edge-rail .neo-dashboard-dock-rail-tab'),
            'and the rail it came from is gone'
        ).toHaveCount(0);

        // The round-trip is a round trip: everything except the pin flag the reveal path sets is back
        // where it started, so the gesture pair leaves no residue in committed state.
        expect({ ...restored.items.inspector, pinned: undefined, autoHidden: undefined })
            .toEqual({ ...before.items.inspector, pinned: undefined, autoHidden: undefined });
        expect(restored.nodes).toEqual(before.nodes)
    })
});
