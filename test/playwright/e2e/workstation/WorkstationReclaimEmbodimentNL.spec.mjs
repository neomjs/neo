import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E regression arm for the gesture-less reclaim route: after Reset and after Undo
 * the SAME live pane instance is embodied where the document says it lives, and a vessel that never
 * connected keeps its retained pane past the lease, so `Show … here` re-trees that same instance.
 *
 * Every assertion here is about the live component, never the document alone: the document moves
 * some 30 ms after the click and the pane embodies some 330–360 ms later on the reclaim route, so a
 * single read in between is indistinguishable from a lost pane — both witnesses of the original
 * sighting read inside that window. Embodiment is therefore polled, and identity is read through the
 * workspace's own `getPaneIdentity`, which returns the live instance id: a rebuilt pane would carry a
 * new id, so identity equality IS the "no createPane" claim.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> \
 *      npx playwright test workstation/WorkstationReclaimEmbodimentNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture spec
 * without it, so the command selects ZERO tests and reports success.
 */
const
    ITEM      = 'feed',
    MAIN      = 'workstation-main',
    WORKSPACE = 'Workstation.view.Workspace',
    POLL      = {intervals: [50, 100, 250], timeout: 20000};

/** A window's runtime generation, read where `Main.mjs` reads it. */
const readWindowId = page => page.evaluate(() => Neo.worker.Manager.windowId);

/** Boots the full Workstation in a page and waits for its dock to project. */
const bootRoot = async page => {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-dock-host',               {timeout: 60000});
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000})
};

/** The live Workspace projected for one window, looked up by window rather than "the first". */
const workspaceFor = async (app, windowId) => {
    const records = await app.findInstances({className: WORKSPACE}, ['id', 'windowId']);

    return (Array.isArray(records) ? records : [records]).filter(Boolean)
        .map(record => ({...(record.properties ?? record), id: record.id ?? record.properties?.id}))
        .find(workspace => workspace.windowId === windowId)?.id ?? null
};

/** The workspace keys whose committed document lists the item — the document tier's answer. */
const holdersOf = async (app, workspaceId) => {
    const workspaces = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces');

    return Object.entries(workspaces).filter(([, document]) => document?.items?.[ITEM]).map(([key]) => key).sort()
};

/**
 * The live pane's embodiment, read from the component itself. `isDestroyed` is only ever WRITTEN by
 * `destroy()`, so a live instance reports it as `undefined`; a pane the manager no longer knows reads
 * as destroyed rather than as an error, so a rebuilt-or-lost pane fails the embodiment assertion itself.
 */
const embodimentOf = async (app, paneId) => {
    const pane = await app.getComponent(paneId, ['windowId', 'mounted', 'isDestroyed']).catch(() => null);

    return pane
        ? {windowId: pane.windowId, mounted: pane.mounted, isDestroyed: pane.isDestroyed === true}
        : {windowId: null, mounted: null, isDestroyed: true}
};

/** The tab header button that carries the item in the given workspace's tabs node, or `null`. */
const tabButtonFor = async (app, workspaceId, workspaceKey) => {
    const workspaces = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'),
          nodeId     = Object.entries(workspaces[workspaceKey]?.nodes ?? {})
              .find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))?.[0];

    if (!nodeId) return null;

    const chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

    return chrome?.buttons?.[ITEM] ?? null
};

/**
 * Tears the item into a REAL popup through the focus-gated pop-out header action — the battery's own
 * tear-out path — and resolves the popup at its `popup` event, before the vessel has rendered.
 */
const popOut = async (page, app, workspaceId, paneId) => {
    const tabButton = await tabButtonFor(app, workspaceId, MAIN);

    await page.locator(`#${tabButton}`).click();
    await expect(page.locator(`#${paneId}`), 'the focused pane is visible before it is popped out').toBeVisible({timeout: 10000});

    const workspaces = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'),
          nodeId     = Object.entries(workspaces[MAIN].nodes).find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))[0],
          chrome     = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]),
          action     = await app.callMethod(chrome.containerId, 'getAction', ['pop-out']),
          button     = page.locator(`#${action?.id}`);

    await expect(button, 'the pop-out action projects on the focused pane').toBeVisible({timeout: 10000});

    const popupPromise = page.waitForEvent('popup', {timeout: 30000});

    await button.click();

    return popupPromise
};

test.describe('Workstation reclaim route (Neural Link)', () => {
    test('Reset and Undo carry the same live pane across the window boundary, and a read after the transit finds it embodied', async ({page, neuralLink}) => {
        test.setTimeout(180000);

        const pageErrors = [];
        let   popup      = null;

        page.on('pageerror', error => pageErrors.push(String(error)));

        try {
            await bootRoot(page);

            const app          = await neuralLink.connectToApp('Workstation'),
                  rootWindowId = await readWindowId(page),
                  workspaceId  = await workspaceFor(app, rootWindowId),
                  paneId       = await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]);

            expect(await holdersOf(app, workspaceId), 'the shipped pane starts in main').toEqual([MAIN]);

            // ── tear out: a real vessel window adopts the live pane ───────────────────────────────
            popup = await popOut(page, app, workspaceId, paneId);
            await popup.waitForSelector('.workstation-viewport', {timeout: 30000});
            await expect(popup.locator(`#${paneId}`), 'the vessel renders the live pane').toBeVisible({timeout: 15000});

            const popupWindowId = await readWindowId(popup),
                  holders       = await holdersOf(app, workspaceId),
                  vesselKey     = holders.find(key => key !== MAIN);

            expect(holders, 'after the tear-out the pane lives in exactly one document, the vessel').toEqual([vesselKey]);
            expect(await embodimentOf(app, paneId), 'and its live instance is embodied in the vessel window')
                .toEqual({windowId: popupWindowId, mounted: true, isDestroyed: false});

            // ── Reset: the real button; the pane must come HOME as the same instance ─────────────
            const reset = page.getByRole('button', {name: 'Reset to default', exact: true});

            await expect(reset, 'a torn-out pane modifies the topology, so Reset is offered').toBeEnabled({timeout: 10000});
            await reset.click();

            // The document moves first and the component follows; assert the component, after the transit.
            await expect.poll(async () => ({
                embodiment: await embodimentOf(app, paneId),
                holders   : await holdersOf(app, workspaceId),
                rootDom   : await page.locator(`#${paneId}`).count(),
                popupDom  : popup.isClosed() ? 0 : await popup.locator(`#${paneId}`).count()
            }), {...POLL, message: 'after Reset the SAME live pane is embodied in the root window'}).toEqual({
                embodiment: {windowId: rootWindowId, mounted: true, isDestroyed: false},
                holders   : [MAIN],
                rootDom   : 1,
                popupDom  : 0
            });

            const homeTab = await tabButtonFor(app, workspaceId, MAIN);

            expect(homeTab, 'the home strip projects a tab for the reclaimed item').not.toBe(null);
            await expect(page.locator(`#${homeTab}`), 'and that tab is in the root DOM').toBeVisible({timeout: 10000});
            await expect(page.locator(`#${paneId}`), 'the reclaimed pane is visible in the root window').toBeVisible({timeout: 10000});
            expect(await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
                'Reset moved the live instance rather than rebuilding it').toBe(paneId);

            // ── Undo: the real button; the pane returns to the vessel, still the same instance ───
            const undo = page.getByRole('button', {name: /^Undo/}).first();

            await expect(undo, 'the reset is one history row, so Undo is offered').toBeEnabled({timeout: 10000});
            await undo.click();

            await expect.poll(async () => ({
                embodiment: await embodimentOf(app, paneId),
                holders   : await holdersOf(app, workspaceId),
                rootDom   : await page.locator(`#${paneId}`).count(),
                popupDom  : popup.isClosed() ? 0 : await popup.locator(`#${paneId}`).count()
            }), {...POLL, message: 'after Undo the SAME live pane is embodied in the vessel window again'}).toEqual({
                embodiment: {windowId: popupWindowId, mounted: true, isDestroyed: false},
                holders   : [vesselKey],
                rootDom   : 0,
                popupDom  : 1
            });

            await expect(popup.locator(`#${paneId}`), 'the vessel shows the returned pane').toBeVisible({timeout: 10000});
            expect(await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
                'Undo moved the live instance rather than rebuilding it').toBe(paneId)
        } finally {
            popup && !popup.isClosed() && await popup.close()
        }

        expect(pageErrors).toEqual([])
    });

    test('a vessel that never connected keeps its retained pane past the lease, and `Show … here` re-trees the same instance', async ({page, neuralLink}) => {
        test.setTimeout(180000);

        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error)));

        await bootRoot(page);

        const app          = await neuralLink.connectToApp('Workstation'),
              rootWindowId = await readWindowId(page),
              workspaceId  = await workspaceFor(app, rootWindowId),
              paneId       = await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
              groupId      = (await app.getComponent(workspaceId, ['topologyGroupId'])).topologyGroupId;

        // The reconnect lease is the manager's config; shortening it keeps the arm inside its budget
        // without changing what runs at its end.
        await app.callMethod(workspaceId, 'transactionManager.set', [{reconnectLeaseMs: 3000}]);
        expect((await app.getComponent(workspaceId, ['transactionManager.reconnectLeaseMs']))['transactionManager.reconnectLeaseMs'],
            'the shortened lease is in force before the vessel opens').toBe(3000);

        // ── a vessel that dies before its first render ────────────────────────────────────────
        const popup = await popOut(page, app, workspaceId, paneId);

        await popup.close();

        // The tear-out commits asynchronously to the popup event, and it commits whether or not the
        // vessel ever connects — so the document tier is polled, not read once.
        await expect.poll(() => holdersOf(app, workspaceId),
            {...POLL, message: 'the tear-out commits: the vessel document owns the pane, main no longer does'})
            .not.toContain(MAIN);

        const holders   = await holdersOf(app, workspaceId),
              vesselKey = holders.find(key => key !== MAIN);

        expect(holders, 'the pane lives in exactly one document, the vessel').toEqual([vesselKey]);

        // The lease runs from the reservation; when it ends, the slot is gone from the manager.
        await expect.poll(() => app.callMethod(workspaceId, 'transactionManager.getBinding', [groupId, vesselKey]),
            {...POLL, message: 'the never-bound slot leaves the manager when its lease ends'}).toBe(null);

        // The Workstation retains a headless vessel, so its pane survives the lease end, parked.
        expect(await embodimentOf(app, paneId), 'the retained pane is parked, not destroyed')
            .toEqual({windowId: expect.anything(), mounted: false, isDestroyed: false});
        expect(await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
            'the workspace still resolves the same live instance').toBe(paneId);
        expect(await holdersOf(app, workspaceId), 'the vessel document still lists the pane').toEqual([vesselKey]);

        // ── the recovery affordance re-trees the SAME cached instance into the root ───────────
        const showHere = page.getByRole('button', {name: `Show ${vesselKey} here`, exact: true});

        await expect(showHere, 'the topology bar offers the retained workspace inline').toBeVisible({timeout: 10000});
        await showHere.click();

        await expect.poll(async () => ({
            embodiment: await embodimentOf(app, paneId),
            rootDom   : await page.locator(`#${paneId}`).count()
        }), {...POLL, message: 'the retained pane is embodied in the root window after the re-tree'}).toEqual({
            embodiment: {windowId: rootWindowId, mounted: true, isDestroyed: false},
            rootDom   : 1
        });

        await expect(page.locator(`#${paneId}`), 'the re-treed pane is visible in the root window').toBeVisible({timeout: 10000});
        expect(await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
            'the re-tree resolved the cached instance rather than creating a pane').toBe(paneId);

        expect(pageErrors).toEqual([])
    })
});
