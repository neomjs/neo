import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: an in-strip tab drag inside a maximized dock pane reorders within
 * the strip without targeting the docked layout behind the maximized plane.
 *
 * When a dock tabs node is maximized, its header strip sits inside the dock host's top-edge
 * activation band. `Neo.dashboard.dock.plugin.Maximize#suppressDragSources` must suppress
 * `Neo.dashboard.dock.interaction.TabSortZone#enableCrossZoneDrag` alongside `allowOverdrag`,
 * `boundaryContainerId`, and `enableProxyToPopup` so an in-strip drag does not engage
 * `DragCoordinator` or fire `dockCrossZoneDragMove` / `dockCrossZoneDrop` against the layout
 * underneath the maximized plane.
 *
 * Run: NEO_NL_PORT=8195 NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> \
 *      npx playwright test workstation/WorkstationMaximizeTabReorderNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const
    NODE      = 'heavy-tabs',
    OVERFLOW  = 'Neo.tab.plugin.Overflow',
    WORKSPACE = 'Workstation.view.Workspace',
    asArray   = value => (Array.isArray(value) ? value : [value]).filter(Boolean);

/**
 * Boots the Workstation, waits for settled layout geometry, and connects Neural Link.
 * @param {Object} page
 * @param {Object} neuralLink
 * @returns {Promise<{app: Object, workspaceId: String}>}
 */
const boot = async (page, neuralLink) => {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
    await page.evaluate(() => document.fonts.ready);

    await page.waitForFunction(() => {
        const host = document.querySelector('.workstation-dock-host'),
              zone = document.querySelector('.neo-dashboard-dock-tabs');
        return host && host.getBoundingClientRect().height > 300
            && zone && zone.getBoundingClientRect().height > 100
    }, {timeout: 60000});

    const app         = await neuralLink.connectToApp('Workstation'),
          workspaceId = asArray(await app.findInstances({className: WORKSPACE}, ['id']))[0]?.id;

    expect(workspaceId, 'the Workstation projects one Workspace').toBeTruthy();
    return {app, workspaceId}
};

/**
 * Resolves the live tab chrome for `heavy-tabs`.
 * @param {Object} app
 * @param {String} workspaceId
 * @returns {Promise<Object>}
 */
const tabChrome = async (app, workspaceId) => {
    let chrome;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [NODE]);
        return Object.keys(chrome?.buttons ?? {}).length
    }, {message: `${NODE} projects its tab chrome`, timeout: 10000}).toBeGreaterThan(0);

    return chrome
};

/**
 * Finds the Overflow plugin owned by the pane's header toolbar.
 * @param {Object} app
 * @param {Object} page
 * @param {String} containerId
 * @returns {Promise<{pluginId: String, toolbarId: String}>}
 */
const overflowOf = async (app, page, containerId) => {
    const toolbarId = await page.locator(`#${containerId} .neo-tab-header-toolbar`).first().getAttribute('id'),
          plugins   = asArray(await app.findInstances({className: OVERFLOW}, ['id']));

    for (const {id} of plugins) {
        if ((await app.getComponent(id, ['owner.id']))['owner.id'] === toolbarId) return {pluginId: id, toolbarId}
    }

    throw new Error(`no ${OVERFLOW} is owned by ${toolbarId}`)
};

/**
 * Waits for the overflow plugin to finish any in-flight or queued projection pass.
 * @param {Object} app
 * @param {String} pluginId
 * @returns {Promise<void>}
 */
const waitOverflowIdle = async (app, pluginId) => {
    await expect.poll(async () => {
        const state = await app.getComponent(pluginId, ['measuring', 'projectQueued']);
        return !state.measuring && !state.projectQueued
    }, {message: 'the overflow projection is idle', timeout: 10000, intervals: [25, 50, 100]}).toBe(true)
};

/**
 * Samples every animation frame for `ms` and reports the frames in which the pane is not maximized or
 * shows fewer than `headers` tab headers — what a staged projection that drops the presentation paints.
 * @param {Object} page
 * @param {String} containerId
 * @param {String} toolbarId
 * @param {Number} headers
 * @param {Number} ms
 * @returns {Promise<{bad: Array[], frames: Number}>} `bad` rows are `[ms, maximized, headers]`.
 */
const watchFrames = (page, containerId, toolbarId, headers, ms) => page.evaluate(({containerId, toolbarId, headers, ms}) => new Promise(resolve => {
    const bad    = [], start = performance.now();
    let   frames = 0;

    const frame = () => {
        const maximized = document.getElementById(containerId)?.classList.contains('neo-dock-maximized'),
              shown     = document.getElementById(toolbarId)?.querySelectorAll(':scope > .neo-tab-header-button').length ?? 0;

        frames++;
        (!maximized || shown < headers) && bad.push([Math.round(performance.now() - start), maximized, shown]);
        performance.now() - start < ms ? requestAnimationFrame(frame) : resolve({bad, frames})
    };

    requestAnimationFrame(frame)
}), {containerId, toolbarId, headers, ms});

/**
 * Resolves once the pane's DockFlip has settled.
 * @param {Object} page
 * @param {String} containerId
 * @returns {Promise<void>}
 */
const flipSettled = (page, containerId) => page.waitForFunction(id => {
    const el = document.getElementById(id);
    return el && !el.style.transform && el.getAnimations().length === 0
}, containerId, {timeout: 15000});

/**
 * Starts a real pointer drag on `buttonId` and parks at `( startX + deltaX, startY )`.
 * @param {Object} page
 * @param {String} buttonId
 * @param {String} toolbarId
 * @param {Number} deltaX
 */
const dragTabHorizontally = async (page, buttonId, toolbarId, deltaX) => {
    const button = page.locator(`#${buttonId}`);
    await expect(button).toBeVisible({timeout: 10000});

    const box     = await button.boundingBox(),
          startX  = box.x + box.width / 2,
          startY  = box.y + box.height / 2,
          targetX = startX + deltaX,
          stepDx  = deltaX < 0 ? -16 : 16;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + stepDx, startY, {steps: 4});
    await expect(page.locator(`#${toolbarId}`)).toHaveClass(/neo-is-dragging/);
    await page.mouse.move(targetX, startY, {steps: 15});

    for (const dx of [2, -2, 1]) {
        await page.mouse.move(targetX + dx, startY, {steps: 1});
        await page.waitForTimeout(80)
    }

    await page.waitForTimeout(200)
};

/**
 * Reads the active dock drop-preview affordances and the header toolbar's left-to-right action order.
 * @param {Object} page
 * @param {String} toolbarId
 * @returns {Promise<Object>}
 */
const readMidDragSurface = (page, toolbarId) => page.evaluate(id => {
    const toolbar     = document.getElementById(id),
          affordances = [...document.querySelectorAll('.neo-dock-preview-affordance')]
              .filter(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
              .map(el => [...el.classList]),
          actions     = [...toolbar.querySelectorAll(':scope > .neo-toolbar-action')]
              .filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden')
              .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
              .map(el => {
                  if (el.classList.contains('neo-tab-overflow-control')) return 'overflow';
                  const glyph = el.querySelector('.neo-button-glyph')?.className || '';
                  if (glyph.includes('fa-window-minimize')) return 'restore';
                  if (glyph.includes('fa-window-maximize')) return 'maximize';
                  if (glyph.includes('fa-times'))           return 'close';
                  return el.getAttribute('aria-label') || 'engine-action'
              });

    return {actions, affordances}
}, toolbarId);

test.describe('Workstation maximized tab reorder (Neural Link)', () => {
    test.setTimeout(120000);

    test('maximized in-strip tab drag shows no cross-zone preview, keeps action order, and stays maximized on release', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});

        const {app, workspaceId}    = await boot(page, neuralLink),
              chrome                = await tabChrome(app, workspaceId),
              {pluginId, toolbarId} = await overflowOf(app, page, chrome.containerId),
              maximizePluginId      = (await app.callMethod(workspaceId, 'getPlugin', ['dock-maximize']))?.id;

        expect(maximizePluginId, 'the workspace installed its maximize plugin').toBeTruthy();
        await waitOverflowIdle(app, pluginId);

        // Focus heavy-tabs to reveal the focus-gated maximize control, then maximize it.
        await page.locator(`#${chrome.buttons.alerts}`).click();
        const maximizeAction = await app.callMethod(chrome.containerId, 'getAction', ['maximize']);
        await expect(page.locator(`#${maximizeAction.id}`)).toBeVisible({timeout: 10000});

        await page.locator(`#${maximizeAction.id}`).click();
        await expect.poll(async () => (await app.getComponent(maximizePluginId, ['maximizedNodeId'])).maximizedNodeId,
            {message: 'the pane is maximized', timeout: 10000}).toBe(NODE);
        await expect(page.locator(`#${chrome.containerId}`)).toHaveClass(/neo-dock-maximized/);
        await flipSettled(page, chrome.containerId);

        // Activate a tab so the header re-projects at the maximized width before dragging. Its staged
        // projection must keep the pane maximized, with every header, in each frame it paints.
        await waitOverflowIdle(app, pluginId);

        const headers     = await page.locator(`#${toolbarId} > .neo-tab-header-button`).count(),
              cycleBefore = (await app.getComponent(workspaceId, ['projectionCycle.id']))['projectionCycle.id'],
              watched     = watchFrames(page, chrome.containerId, toolbarId, headers, 1500);

        await page.locator(`#${chrome.buttons.activity}`).click();
        // The activation's own projection cycle, not merely its committed document: the document
        // changes at commit time, before the staged transaction starts.
        await expect.poll(async () => {
            const state = await app.getComponent(workspaceId, ['dockModel', 'projectionCycle.id', 'projectionCycle.timing']);
            return state.dockModel?.nodes?.[NODE]?.activeItemId === 'activity'
                && state['projectionCycle.id'] !== cycleBefore
                && Boolean(state['projectionCycle.timing']?.settledAt)
        }, {message: 'the activation\'s projection settles', timeout: 10000}).toBe(true);

        const {bad, frames} = await watched;

        expect(frames, 'frames were sampled across the projection').toBeGreaterThan(10);
        expect(bad, `no frame drops the maximized pane or its ${headers} headers`).toEqual([]);
        await expect(page.locator(`#${toolbarId}`)).not.toHaveClass(/neo-no-animation/, {timeout: 10000});
        await waitOverflowIdle(app, pluginId);
        await flipSettled(page, chrome.containerId);

        const itemsBefore = [...(await app.getComponent(workspaceId, ['dockModel'])).dockModel.nodes[NODE].items],
              startIndex  = itemsBefore.indexOf('console');

        expect(startIndex, 'console starts at index 6 in heavy-tabs').toBe(6);

        // Drag "Command and Control Console" 600 px left within the maximized strip.
        await dragTabHorizontally(page, chrome.buttons.console, toolbarId, -600);

        const midDrag = await readMidDragSurface(page, toolbarId);

        await page.mouse.up();
        await expect(page.locator(`#${toolbarId}`)).not.toHaveClass(/neo-is-dragging/, {timeout: 10000});

        expect(midDrag.affordances, 'maximized in-strip drag shows no dock drop preview').toEqual([]);
        expect(midDrag.actions[0], 'overflow control (⋯) stays first among header actions').toBe('overflow');
        expect(midDrag.actions.slice(-2), 'restore and close stay last in frozen order').toEqual(['restore', 'close']);

        await expect.poll(async () => {
            const items = (await app.getComponent(workspaceId, ['dockModel'])).dockModel.nodes[NODE]?.items ?? [];
            return items.indexOf('console')
        }, {message: 'console reorders to the left within heavy-tabs', timeout: 10000}).toBeLessThan(startIndex);

        expect((await app.getComponent(maximizePluginId, ['maximizedNodeId'])).maximizedNodeId,
            'the pane stays maximized after the in-strip reorder').toBe(NODE);
        await expect(page.locator(`#${chrome.containerId}`)).toHaveClass(/neo-dock-maximized/);
        expect((await app.getComponent(maximizeAction.id, ['pressed'])).pressed,
            'the restore action stays pressed').toBe(true)
    });

    test('docked control: an in-strip drag still shows the tab-into preview and reorders in place', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 2000, height: 900});

        const {app, workspaceId}    = await boot(page, neuralLink),
              chrome                = await tabChrome(app, workspaceId),
              {pluginId, toolbarId} = await overflowOf(app, page, chrome.containerId);

        await waitOverflowIdle(app, pluginId);

        const itemsBefore = [...(await app.getComponent(workspaceId, ['dockModel'])).dockModel.nodes[NODE].items];
        expect(itemsBefore.indexOf('alerts')).toBe(0);

        await dragTabHorizontally(page, chrome.buttons.alerts, toolbarId, 150);

        const midDrag = await readMidDragSurface(page, toolbarId);
        expect(
            midDrag.affordances.some(cls => cls.includes('neo-dock-preview-tab-into')),
            `docked in-strip drag still shows tab-into preview: ${JSON.stringify(midDrag.affordances)}`
        ).toBe(true);

        await page.mouse.up();
        await expect(page.locator(`#${toolbarId}`)).not.toHaveClass(/neo-is-dragging/, {timeout: 10000});

        await expect.poll(async () => {
            const items = (await app.getComponent(workspaceId, ['dockModel'])).dockModel.nodes[NODE]?.items ?? [];
            return items.indexOf('alerts')
        }, {message: 'alerts reorders to the right within docked heavy-tabs', timeout: 10000}).toBeGreaterThan(0)
    })
});
