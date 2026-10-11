import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the gesture proof for the engine-owned reload action — delegation when the pane
 * carries the contract, an engine recreate when it does not.
 *
 * The component battery proves the mechanics on a fixture; the product truths only this spec can
 * certify are
 *
 *   1. the projected `reload` action is a REAL, clickable button on a real product pane that
 *      implements the `dockReload()` contract (the example's Strategy pane, whose reload meaning
 *      is a visible refresh counter),
 *   2. pressing it delegates INTO the pane — the counter advances where a user can read it — and
 *      commits nothing: the App Worker's dock document is byte-identical after the gesture,
 *   3. availability is either path: the very same node's header keeps the action when a pane
 *      WITHOUT `dockReload()` holds the active slot, and pressing it recreates that pane — a new
 *      instance holds the slot, the document stays byte-identical — with the always-visible close
 *      action as the control arm proving the header itself is live.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives the native clicks; the Neural Link fixture
 * reads the holder's committed `dockModel` and the pane's counter. Nothing here is committed
 * programmatically — every mutation comes from a real gesture.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=/path/to/neo-agent-brain NEO_E2E_PORT=8091 npx playwright test \
 *      DockReloadActionNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const bootDockExample = async ({ page, neuralLink }) => {
    await page.goto('/examples/dashboard/dock/');
    page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

    // Event-driven settle: the projected dock chrome proves worker boot + first render, and
    // connectToApp carries its own bounded worker-identity polling — no fixed sleeps.
    await page.waitForSelector('.neo-dashboard-dock-tabs', { state: 'visible' });

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

/**
 * Clicks one pane's tab header, which is how a user gives that pane focus — the engine set is
 * focus-gated, so without this the actions are invisible for a reason unrelated to the policy
 * under test. No settle sleep: every call site follows with its own poll on the action state
 * the focus change produces.
 */
const focusPane = async (app, page, dockItemId) => {
    const records = await app.findInstances({ className: 'Neo.tab.header.Button', dockItemId }, ['id', 'dockItemId']),
          record  = Array.isArray(records) ? records[0] : records,
          id      = record?.id ?? record?.properties?.id;

    expect(id, `the ${dockItemId} pane owns a live tab header button`).toBeTruthy();
    await page.locator(`#${id}`).click()
};

test.describe('Dock reload action — delegation into the pane (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('the reload action asks the contract-bearing pane, commits nothing, and recreates the pane without the contract', async ({ page, neuralLink }) => {
        const { app, readModel } = await bootDockExample({ page, neuralLink }),
              before             = await readModel(),
              mainTabsId         = await tabsNodeId(app, 'main-tabs');

        expect(mainTabsId, 'the center stack projects a live TabContainer').toBeTruthy();

        // Strategy (the contract carrier) is the seeded active pane; focus opens the gated set.
        await focusPane(app, page, 'strategy');

        // The projected action boots hidden BY DESIGN (the adapter row is projection-constant);
        // the workspace's boot sync reveals it for the contract-bearing active pane — so the
        // reveal itself is the settle surface, not the action's existence.
        await expect.poll(async () => {
            const action = await app.callMethod(mainTabsId, 'getAction', ['reload']);

            return action ? action.hidden !== true : null
        }, {
            message: 'the boot sync reveals the persistent reload action for the contract-bearing pane',
            timeout: 10000
        }).toBe(true);

        const reloadAction = await app.callMethod(mainTabsId, 'getAction', ['reload']);

        // The focus consequence, as its own settle surface: the engine set ungates in the DOM.
        await expect(page.locator(`#${reloadAction.id}`)).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        // Product truth 2: the gesture delegates into the pane — the counter is USER-VISIBLE.
        await page.locator(`#${reloadAction.id}`).click();
        await expect(page.getByText('Strategy · reloaded 1×')).toBeVisible();

        await page.locator(`#${reloadAction.id}`).click();
        await expect(page.getByText('Strategy · reloaded 2×')).toBeVisible();

        // …and commits nothing: the committed document is byte-identical after two gestures.
        expect(JSON.stringify(await readModel())).toBe(JSON.stringify(before));

        // Product truth 3: availability is either path. Swarm implements no dockReload(), so the
        // SAME header keeps the action — the engine serves the recreate — while close (the gating
        // opt-out) stays visible on that focused header, proving the header itself is live.
        await focusPane(app, page, 'swarm');

        await expect.poll(async () => (await app.callMethod(mainTabsId, 'getAction', ['reload']))?.hidden, {
            message: 'a pane without the contract keeps the reload action',
            timeout: 10000
        }).toBe(false);

        // The gesture recreates the pane: a NEW instance takes the active slot, and the committed
        // document is still byte-identical — a recreate is presentation, never topology. The
        // baseline is read AFTER the focus click: activating the Swarm tab was itself a committed
        // `setActiveItem`, and that change belongs to the click, not to the recreate.
        const swarmBefore = await app.callMethod(mainTabsId, 'getActiveCard', []),
              swarmDoc    = JSON.stringify(await readModel());

        expect(swarmBefore?.id, 'the Swarm pane holds the active slot').toBeTruthy();

        await page.locator(`#${reloadAction.id}`).click();

        await expect.poll(async () => (await app.callMethod(mainTabsId, 'getActiveCard', []))?.id, {
            message: 'the recreate replaces the active pane instance',
            timeout: 10000
        }).not.toBe(swarmBefore.id);

        expect(JSON.stringify(await readModel()), 'a recreate commits nothing').toBe(swarmDoc);

        const closeAction = await app.callMethod(mainTabsId, 'getAction', ['close']);

        expect(closeAction?.id, 'the control arm: close projects on the same header').toBeTruthy();
        await expect(page.locator(`#${closeAction.id}`)).toBeVisible()
    })
});
