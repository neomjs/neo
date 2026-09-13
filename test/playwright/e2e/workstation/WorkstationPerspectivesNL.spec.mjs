import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';

const {NeuralLink_DockService} = await loadNeuralLinkModules();

/**
 * @summary Whitebox E2E witness for the Neural Link perspective path on the workstation Workspace.
 *
 * The workstation Workspace carries a `Neo.dashboard.dock.persistence.PerspectiveLibrary`
 * (holder-resolved by the client
 * DockService), so the agent-driven perspective trio activates on the film's primary surface:
 *
 *   capture_perspective (stored through the holder's library) → list_perspectives
 *   → execute_dock_operation (disruption) → restore_perspective
 *   (exact baseline `neo.dock.zone.v1` document through the library's fail-closed load
 *    plus the workspace's document-commit seam)
 *
 * All assertions read worker truth, never the DOM. The baseline is read live, so the spec
 * pins restore-fidelity, not the demo's initial layout.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test workstation/WorkstationPerspectivesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — NL perspectives: capture → list → disrupt → restore', () => {
    test.setTimeout(60000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    test('the store-backed perspective chain returns the exact baseline after a disruption', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordWsPerspectiveRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordWsPerspectiveRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordWsPerspectiveRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });

        page.on('pageerror', error => {
            let value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the workstation Workspace must exist in the App Worker').toBeTruthy();

        const selected = await app.executeDockOperation(wsId, {
            itemId    : 'audit',
            operation : 'setActiveItem',
            tabsNodeId: 'right-top-tabs'
        });

        expect(selected.errors).toEqual([]);
        expect(selected.applied).toBe(true);

        const baseline = (await app.getDockTopology(wsId)).document;

        const baselineLeftExtent = baseline.nodes.root?.zones?.left?.extent;

        expect(
            baselineLeftExtent,
            'precondition: the workspace boots with a committed left-edge extent'
        ).toBe(0.2);
        expect(
            baseline.nodes['right-top-tabs'].activeItemId,
            'precondition: capture starts from the non-first Audit tab'
        ).toBe('audit');

        // 1. capture_perspective — must land in the holder's store, not degrade to agent-held
        const captured = await NeuralLink_DockService.capturePerspective({
            captureScope   : 'window',
            componentId    : wsId,
            layoutId       : 'spec-ws-perspective',
            perspectiveName: 'Spec WS Perspective',
            sessionId      : app.sessionId,
            title          : 'Spec witness baseline'
        });

        expect(captured.errors).toEqual([]);
        expect(captured.captured).toBe(true);
        expect(
            captured.stored,
            'capture must store through the workspace perspective store (stored:false would mean the holder store is absent)'
        ).toBe(true);

        // 2. list_perspectives — the store-backed read tier surfaces the capture
        const listed = await NeuralLink_DockService.listPerspectives({
            componentId: wsId,
            sessionId  : app.sessionId
        });

        expect(listed.errors).toEqual([]);
        expect(
            listed.perspectives.some(p => p.layoutId === 'spec-ws-perspective' && p.perspectiveName === 'Spec WS Perspective'),
            'list_perspectives must surface the just-captured layout'
        ).toBe(true);

        // 3. Disruption through the semantic dockZone.v1 path. Edge extent is document truth, so
        // perspective fidelity must cover it explicitly instead of relying on an unrelated item move.
        const disrupted = await app.executeDockOperation(wsId, {
            edge      : 'left',
            edgeZoneId: 'root',
            extent    : 0.32,
            operation : 'resizeEdgeZone'
        });

        expect(disrupted.errors).toEqual([]);
        expect(disrupted.applied).toBe(true);
        expect(
            disrupted.document.nodes.root.zones.left.extent,
            'the edge-size disruption must be observable before restore (restore-fidelity is vacuous otherwise)'
        ).toBe(0.32);

        // 4. restore_perspective — store load + the workspace commit seam returns the exact baseline
        const restored = await NeuralLink_DockService.restorePerspective({
            componentId: wsId,
            name       : 'Spec WS Perspective',
            sessionId  : app.sessionId
        });

        expect(restored.errors).toEqual([]);
        expect(restored.switched).toBe(true);
        expect(
            restored.document,
            'restore must return the exact pre-disruption dockZone.v1 document'
        ).toEqual(baseline);
        expect(
            restored.document.nodes.root.zones.left.extent,
            'restore must recover the captured edge extent, not retain the disrupted live size'
        ).toBe(baselineLeftExtent);
        expect(
            restored.document.nodes['right-top-tabs'].activeItemId,
            'restore must retain the captured non-first tab selection'
        ).toBe('audit');

        // 5. Fail-closed: an unknown name errors structurally and touches nothing
        const failed = await NeuralLink_DockService.restorePerspective({
            componentId: wsId,
            name       : 'Spec WS Missing',
            sessionId  : app.sessionId
        });

        expect(failed.switched).toBe(false);
        expect(failed.errors.length, 'the fail-closed path must name its reason').toBeGreaterThan(0);

        const untouched = (await app.getDockTopology(wsId)).document;

        expect(
            untouched,
            'a failed restore must leave the live document byte-identical'
        ).toEqual(baseline);

        expect(pageErrors, 'no page errors may escape during the perspective chain').toEqual([]);
        expect(runtimeErrors, 'no runtime errors may escape during the perspective chain').toEqual([]);
    })
})

const
    ITEM      = 'feed',
    MAIN      = 'workstation-main',
    POLL      = {intervals: [50, 100, 250], timeout: 20000},
    WORKSPACE = 'Workstation.view.Workspace';

/** A window's runtime generation, read where `Main.mjs` reads it. */
const readWindowId = page => page.evaluate(() => Neo.worker.Manager.windowId);

/** The live Workspace projected for one window, looked up by window rather than "the first". */
const workspaceFor = async (app, windowId) => {
    const records = await app.findInstances({className: WORKSPACE}, ['id', 'windowId']);

    return (Array.isArray(records) ? records : [records]).filter(Boolean)
        .map(record => ({...(record.properties ?? record), id: record.id ?? record.properties?.id}))
        .find(workspace => workspace.windowId === windowId)?.id ?? null
};

/** The workspace keys whose committed document lists the item. */
const holdersOf = async (app, workspaceId) => {
    const workspaces = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces');

    return Object.entries(workspaces).filter(([, document]) => document?.items?.[ITEM]).map(([key]) => key).sort()
};

/** The live pane's embodiment, read from the component; a pane the manager no longer knows reads as destroyed. */
const embodimentOf = async (app, paneId) => {
    const pane = await app.getComponent(paneId, ['windowId', 'mounted', 'isDestroyed']).catch(() => null);

    return pane
        ? {windowId: pane.windowId, mounted: pane.mounted, isDestroyed: pane.isDestroyed === true}
        : {windowId: null, mounted: null, isDestroyed: true}
};

/** Tears the item into a REAL popup through the focus-gated pop-out header action. */
const popOut = async (page, app, workspaceId, paneId) => {
    const workspaces = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'),
          nodeId     = Object.entries(workspaces[MAIN].nodes).find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))[0],
          chrome     = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

    await page.locator(`#${chrome.buttons[ITEM]}`).click();
    await expect(page.locator(`#${paneId}`), 'the focused pane is visible before it is popped out').toBeVisible({timeout: 10000});

    const action = await app.callMethod(chrome.containerId, 'getAction', ['pop-out']),
          button = page.locator(`#${action?.id}`);

    await expect(button, 'the pop-out action projects on the focused pane').toBeVisible({timeout: 10000});

    const popupPromise = page.waitForEvent('popup', {timeout: 30000});

    await button.click();

    return popupPromise
};

/**
 * @summary Rendered witness for a declared restore across a real window boundary: with a pane torn into a
 * vessel, re-applying the shipped perspective would list that pane in main while the vessel still owns
 * it, so the engine refuses, and the refusal leaves every document, every owner and the live pane as
 * they were. The Workstation's own Reset, which gives torn-out panes back, stays offered.
 */
test.describe('Workstation — a shipped restore across a real popup (Neural Link)', () => {
    test('a shipped restore refuses to duplicate a pane its vessel owns, and every pane keeps one owner', async ({page, neuralLink}) => {
        test.setTimeout(180000);

        const pageErrors = [];
        let   popup      = null;

        page.on('pageerror', error => pageErrors.push(String(error)));

        try {
            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector('.workstation-dock-host',               {timeout: 60000});
            await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

            const app          = await neuralLink.connectToApp('Workstation'),
                  rootWindowId = await readWindowId(page),
                  workspaceId  = await workspaceFor(app, rootWindowId),
                  paneId       = await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
                  perspective  = () => app.callMethod(workspaceId, 'getState', ['dock.perspective']);

            expect(await holdersOf(app, workspaceId), 'the shipped pane starts in main').toEqual([MAIN]);
            await expect.poll(perspective, {...POLL, message: 'a fresh Workstation reads its shipped perspective, unmodified'})
                .toEqual({active: 'shipped', modified: false, pending: null});

            popup = await popOut(page, app, workspaceId, paneId);
            await popup.waitForSelector('.workstation-viewport', {timeout: 30000});
            await expect(popup.locator(`#${paneId}`), 'the vessel renders the live pane').toBeVisible({timeout: 15000});

            const popupWindowId = await readWindowId(popup),
                  holders       = await holdersOf(app, workspaceId),
                  vesselKey     = holders.find(key => key !== MAIN);

            expect(holders, 'after the tear-out the pane lives in exactly one document, the vessel').toEqual([vesselKey]);
            await expect.poll(perspective, {...POLL, message: 'main no longer holds the shipped arrangement'})
                .toEqual({active: 'shipped', modified: true, pending: null});

            const before = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'),
                  result = await app.callMethod(workspaceId, 'resetPerspective');

            expect(result.errors, 'the restore is refused rather than listing the pane twice')
                .toEqual([`perspective restore would duplicate a pane owned by "${vesselKey}"`]);
            expect(await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'), 'no document changed').toEqual(before);
            expect(await holdersOf(app, workspaceId), 'the pane keeps its one owner').toEqual([vesselKey]);
            expect(await embodimentOf(app, paneId), 'and its live instance stays embodied in the vessel window')
                .toEqual({windowId: popupWindowId, mounted: true, isDestroyed: false});
            await expect(popup.locator(`#${paneId}`), 'the vessel still shows it').toBeVisible({timeout: 10000});
            expect(await page.locator(`#${paneId}`).count(), 'with no second embodiment in the root window').toBe(0);
            expect(await perspective(), 'the departure stays truthful').toEqual({active: 'shipped', modified: true, pending: null});
            await expect(page.getByRole('button', {name: 'Reset to default', exact: true}), 'the Workstation Reset stays offered')
                .toBeEnabled({timeout: 10000})
        } finally {
            popup && !popup.isClosed() && await popup.close()
        }

        expect(pageErrors).toEqual([])
    })
})
