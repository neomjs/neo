import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: reordering tabs never paints the headers the overflow withholds.
 *
 * A reorder changes the tab set, so the overflow plugin recaptures. If that recapture put every withheld
 * header back into the live strip to measure it, the strip would show all of them for a few frames before
 * the split hid them again. A page-side `requestAnimationFrame` sampler records every frame from the drop to
 * the settled partition. No frame may lay out a header that the strip withheld both before the drop and
 * once settled, and no header may paint outside the strip box. The frame count is not the oracle: the
 * drop's focus restore reveals the strip's actions and re-partitions it, so the settled strip may hold
 * fewer headers than the pre-drop one.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> \
 *      npx playwright test workstation/WorkstationTabReorderNoFlashNL -c test/playwright/playwright.config.e2e.mjs --workers=1
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

/** The Overflow plugin owned by the pane's header toolbar, and that toolbar's id. */
const overflowOf = async (app, page, workspaceId) => {
    let chrome;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [NODE]);
        return Object.keys(chrome?.buttons ?? {}).length
    }, {message: `${NODE} projects its tab chrome`, timeout: 10000}).toBeGreaterThan(0);

    const toolbarId = await page.locator(`#${chrome.containerId} .neo-tab-header-toolbar`).first().getAttribute('id');

    for (const {id} of asArray(await app.findInstances({className: OVERFLOW}, ['id']))) {
        if ((await app.getComponent(id, ['owner.id']))['owner.id'] === toolbarId) return {pluginId: id, toolbarId}
    }

    throw new Error(`no ${OVERFLOW} is owned by ${toolbarId}`)
};

/** Resolves once the overflow plugin has no pass in flight or queued. */
const overflowIdle = (app, pluginId) => expect.poll(async () => {
    const state = await app.getComponent(pluginId, ['measuring', 'projectQueued']);
    return !state.measuring && !state.projectQueued
}, {message: 'the overflow projection is idle', timeout: 10000, intervals: [25, 50, 100]}).toBe(true);

/** The strip's laid-out headers, left to right. */
const visibleHeaders = (page, toolbarId) => page.evaluate(id => [...document.getElementById(id).querySelectorAll('.neo-tab-header-button')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
    .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
    .map(el => ({id: el.id, x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y})), toolbarId);

/** Starts a per-frame sampler of the strip: the ids of the laid-out headers and the headers painting outside the strip box. */
const startSampler = (page, toolbarId) => page.evaluate(id => {
    const samples = window.__reorderSamples = [];

    const frame = () => {
        const toolbar = document.getElementById(id),
              box     = toolbar.getBoundingClientRect(),
              shown   = [...toolbar.querySelectorAll('.neo-tab-header-button')]
                  .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');

        samples.push({
            ids    : shown.map(el => el.id),
            outside: shown.filter(el => {
                const r = el.getBoundingClientRect();
                return r.right > box.right + 1 || r.x < box.x - 1 || r.bottom > box.bottom + 1 || r.y < box.y - 1
            }).map(el => el.id)
        });
        window.__reorderSampler = requestAnimationFrame(frame)
    };

    window.__reorderSampler = requestAnimationFrame(frame)
}, toolbarId);

/** Stops the sampler and returns its frames. */
const stopSampler = page => page.evaluate(() => {
    cancelAnimationFrame(window.__reorderSampler);
    return window.__reorderSamples
});

test.describe('Workstation tab reorder (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1440, height: 900}});

    test('a reorder never paints the withheld headers between the drop and the settled partition', async ({page, neuralLink}) => {
        const {app, workspaceId}    = await boot(page, neuralLink),
              {pluginId, toolbarId} = await overflowOf(app, page, workspaceId);

        await overflowIdle(app, pluginId);

        const before = await visibleHeaders(page, toolbarId);
        expect(before.length, 'the strip shows at least two headers to reorder').toBeGreaterThanOrEqual(2);
        expect((await app.getComponent(pluginId, ['appliedHiddenIds']))['appliedHiddenIds'].length,
            'the pane withholds headers behind the overflow').toBeGreaterThan(0);

        // Drag the second header onto the first: an in-strip reorder.
        const [first, second] = await Promise.all(before.slice(0, 2).map(header => page.locator(`#${header.id}`).boundingBox()));

        await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
        await page.mouse.down();
        await page.mouse.move(second.x + second.width / 2 - 8, second.y + second.height / 2, {steps: 4});
        await page.mouse.move(first.x + 6, first.y + first.height / 2, {steps: 12});
        await startSampler(page, toolbarId);
        await page.mouse.up();

        await overflowIdle(app, pluginId);
        await expect.poll(async () => (await visibleHeaders(page, toolbarId))[0]?.id,
            {message: 'the reorder committed', timeout: 10000}).toBe(before[1].id);

        // The drop restores focus to the dragged header, which reveals the strip's focus-gated actions and
        // re-partitions the strip to fewer headers, so the settled strip may show fewer than the pre-drop
        // one, and the pre-drop pair legitimately stays laid out until that re-partition lands (a frame or
        // more under load). A withheld header is one that was in neither set.
        const samples = await stopSampler(page),
              allowed = new Set([...before, ...await visibleHeaders(page, toolbarId)].map(header => header.id)),
              strays  = samples.flatMap(sample => sample.ids.filter(id => !allowed.has(id)));

        expect(samples.length, 'the sampler recorded the frames after the drop').toBeGreaterThan(3);
        expect(strays, 'no frame lays out a header the strip withheld before and after the drop').toEqual([]);
        expect(samples.flatMap(sample => sample.outside), 'no header paints outside the strip box').toEqual([])
    });

    test('an inserted tab is measured: the settled partition equals a fresh projection', async ({page, neuralLink}) => {
        const {app, workspaceId}    = await boot(page, neuralLink),
              {pluginId, toolbarId} = await overflowOf(app, page, workspaceId),
              hiddenIds             = async () => [...(await app.getComponent(pluginId, ['appliedHiddenIds']))['appliedHiddenIds']].sort();

        await overflowIdle(app, pluginId);

        // Metrics joins the twelve-tab strip from its own pane: an insert, so the recapture must measure it.
        await app.callMethod(workspaceId, 'workspaceSet.commit', ['workstation-main', [{operation: 'moveItem', itemId: 'metrics', targetNodeId: NODE}], {cause: 'insert-probe'}]);
        await expect.poll(async () => (await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'))['workstation-main'].nodes[NODE].items.includes('metrics'),
            {message: 'the insert committed', timeout: 10000}).toBe(true);
        await overflowIdle(app, pluginId);

        const settled = await hiddenIds();

        await app.callMethod(pluginId, 'project', [false]);
        await overflowIdle(app, pluginId);

        expect(await hiddenIds(), 'a fresh projection hides the same tabs as the settled one').toEqual(settled);
        expect((await visibleHeaders(page, toolbarId)).length, 'the strip still shows its visible headers').toBeGreaterThan(0)
    })
});
