import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: a maximized dock pane's tab overflow partitions for the size the pane settles
 * at, and so does the restored pane.
 *
 * Maximize and restore resize the pane through a DockFlip. The node takes its new layout box at once, and an
 * inverse transform plays it visually from the old rect. The resize-driven overflow pass lands inside that
 * window, and a settling transform fires no further resize. A pass that read the visual box therefore kept a
 * partition for a width the pane no longer had: two of twelve headers in a maximized pane with room for most.
 *
 * The oracle needs no expected count. Once the motion and the overflow are idle, a forced re-projection must
 * leave the hidden set unchanged, and no visible header may run under the action cluster.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> \
 *      npx playwright test workstation/WorkstationMaximizeTabOverflowNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const
    NODE      = 'heavy-tabs', // the shipped layout's twelve-tab pane
    OVERFLOW  = 'Neo.tab.plugin.Overflow',
    WORKSPACE = 'Workstation.view.Workspace',
    asArray   = value => (Array.isArray(value) ? value : [value]).filter(Boolean);

/** Boots the Workstation and binds the Neural Link to its one Workspace. */
const boot = async (page, neuralLink) => {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-workspace', {timeout: 30000});

    const app         = await neuralLink.connectToApp('Workstation'),
          workspaceId = asArray(await app.findInstances({className: WORKSPACE}, ['id']))[0]?.id;

    expect(workspaceId, 'the Workstation projects one Workspace').toBeTruthy();
    return {app, workspaceId}
};

/** The pane's live tab chrome, once its header buttons are projected. */
const tabChrome = async (app, workspaceId) => {
    let chrome;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [NODE]);
        return Object.keys(chrome?.buttons ?? {}).length
    }, {message: `${NODE} projects its tab chrome`, timeout: 10000}).toBeGreaterThan(0);

    return chrome
};

/** The Overflow plugin owned by the pane's header toolbar. */
const overflowOf = async (app, page, containerId) => {
    const toolbarId = await page.locator(`#${containerId} .neo-tab-header-toolbar`).first().getAttribute('id'),
          plugins   = asArray(await app.findInstances({className: OVERFLOW}, ['id']));

    for (const {id} of plugins) {
        if ((await app.getComponent(id, ['owner.id']))['owner.id'] === toolbarId) return {pluginId: id, toolbarId}
    }

    throw new Error(`no ${OVERFLOW} is owned by ${toolbarId}`)
};

/** Resolves once the overflow plugin has no pass in flight or queued, and returns its hidden set. */
const settledHiddenIds = async (app, pluginId) => {
    let state;

    await expect.poll(async () => {
        state = await app.getComponent(pluginId, ['measuring', 'projectQueued', 'appliedHiddenIds']);
        return !state.measuring && !state.projectQueued
    }, {message: 'the overflow projection is idle', timeout: 10000, intervals: [25, 50, 100]}).toBe(true);

    return [...state.appliedHiddenIds ?? []].sort()
};

/** Resolves once the pane's DockFlip has played out: no inline transform, no running animation. */
const flipSettled = (page, containerId) => page.waitForFunction(id => {
    const el = document.getElementById(id);
    return el && !el.style.transform && el.getAnimations().length === 0
}, containerId, {timeout: 15000});

/** Visible header ids, and how far the last one runs past the first action's start (0 = clear). */
const readStrip = (page, toolbarId) => page.evaluate(id => {
    const toolbar = document.getElementById(id),
          visible = [...toolbar.querySelectorAll('.neo-tab-header-button')]
              .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'),
          action  = [...toolbar.querySelectorAll('.neo-toolbar-action')].find(el => el.getBoundingClientRect().width > 0),
          end     = Math.max(...visible.map(el => el.getBoundingClientRect().right));

    return {ids: visible.map(el => el.id).sort(), overlap: action ? Math.max(0, Math.round(end - action.getBoundingClientRect().left)) : 0}
}, toolbarId);

/**
 * Asserts the settled partition is the one a fresh projection computes: forcing `project(false)` changes no
 * hidden id, and the visible headers stop short of the action cluster.
 */
const expectSettledPartition = async ({app, page, pluginId, toolbarId, phase}) => {
    const hidden = await settledHiddenIds(app, pluginId),
          strip  = await readStrip(page, toolbarId);

    await app.callMethod(pluginId, 'project', [false]);

    expect(await settledHiddenIds(app, pluginId), `after ${phase} settles, a fresh projection hides the same tabs`).toEqual(hidden);
    expect((await readStrip(page, toolbarId)).ids, `after ${phase}, the visible headers stay the same`).toEqual(strip.ids);
    expect(strip.overlap, `after ${phase}, no visible header runs under the action cluster`).toBe(0);

    return strip
};

test.describe('Workstation maximized tab overflow (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1440, height: 900}});

    test('maximize and restore leave the overflow partitioned for the settled pane', async ({page, neuralLink}) => {
        const {app, workspaceId}    = await boot(page, neuralLink),
              chrome                = await tabChrome(app, workspaceId),
              {pluginId, toolbarId} = await overflowOf(app, page, chrome.containerId),
              maximizePluginId      = (await app.callMethod(workspaceId, 'getPlugin', ['dock-maximize']))?.id,
              activeItemId          = (await app.getComponent(workspaceId, ['dockModel'])).dockModel.nodes[NODE].activeItemId;

        expect(maximizePluginId, 'the workspace installed its maximize plugin').toBeTruthy();

        const before = await expectSettledPartition({app, page, pluginId, toolbarId, phase: 'boot'});
        expect(before.ids.length, 'the default pane is narrow enough to overflow').toBeLessThan(Object.keys(chrome.buttons).length);

        // Focus reveals the focus-gated header actions, maximize among them.
        await page.locator(`#${chrome.buttons[activeItemId]}`).click();
        const action = await app.callMethod(chrome.containerId, 'getAction', ['maximize']);
        await expect(page.locator(`#${action.id}`), 'maximize is reachable after focus').toBeVisible({timeout: 10000});

        await page.locator(`#${action.id}`).click();
        await expect.poll(async () => (await app.getComponent(maximizePluginId, ['maximizedNodeId'])).maximizedNodeId,
            {message: 'the pane is maximized', timeout: 10000}).toBe(NODE);
        // The class lands with the FLIP's invert, so the play can only be awaited after it.
        await expect(page.locator(`#${chrome.containerId}`)).toHaveClass(/neo-dock-maximized/);
        await flipSettled(page, chrome.containerId);

        const maximized = await expectSettledPartition({app, page, pluginId, toolbarId, phase: 'maximize'});
        expect(maximized.ids.length, 'the maximized pane shows more headers than the default one').toBeGreaterThan(before.ids.length);

        await page.locator(`#${action.id}`).click();
        await expect.poll(async () => (await app.getComponent(maximizePluginId, ['maximizedNodeId'])).maximizedNodeId,
            {message: 'the pane is restored', timeout: 10000}).toBeNull();
        await expect(page.locator(`#${chrome.containerId}`)).not.toHaveClass(/neo-dock-maximized|neo-dock-maximize-restoring/, {timeout: 10000});
        await flipSettled(page, chrome.containerId);

        await expectSettledPartition({app, page, pluginId, toolbarId, phase: 'restore'})
    })
});
