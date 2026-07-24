import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e for the Fleet cockpit's GESTURE tear-out vessel-death return leg — the
 * uncovered sibling of the click pop-out witness (`FleetCockpitPopOutNL.spec.mjs`) and the dockdemo
 * tear-out matrix (`TearOutMatrixRows4To7NL.spec.mjs`). A dock pane is torn out to a REAL second
 * browser window on the ONE SharedWorker heap, the vessel adopts the SAME live instance, then the
 * OS window CLOSES — and the pane must come HOME to the cockpit tree, never strand in the dead
 * vessel's view (the defect: tab header returns, live pane orphaned under the dead vessel viewport).
 *
 * The tear-out seam is driven programmatically over Neural Link: `onDockTearOutExit` /
 * `onDockTearOutTerminal` on the cockpit's own `tearOutHandlers` take `{itemId, proxyRect}` with the
 * `sortZone` OMITTED — every `sortZone` touch in `src/dashboard/DockTearOut.mjs` is optional-chained
 * (the pointer-follow visual affordance), while the capture/detach/commit path is sortZone-free. This
 * is the same seam the production SortZone gesture fires; the intricate native-gesture simulation
 * (`DemoBWorkspace.executeTearOutStep`) is the matrix witness's scope, not needed to prove the
 * lifecycle return.
 *
 * Run: NEO_E2E_PORT=8145 npx playwright test agentos/FleetCockpitTearOutNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet cockpit — gesture tear-out vessel-death return (Neural Link, #15635)', () => {
    test.setTimeout(120000);

    test('tear out → own OS window → vessel death → same instance comes HOME, no orphan', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const app       = await neuralLink.connectToApp('AgentOS'),
              cockpits  = await app.findInstances({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']),
              cockpitId = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id;

        expect(cockpitId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        // pick a live, tabs-held item to tear out — topology-derived, not a layout assumption
        const readDoc = async () => {
            const topo = await app.getDockTopology(cockpitId);
            return topo?.document ?? topo;
        };

        const docBefore = await readDoc(),
              itemId    = 'stream',
              homeNode  = Object.keys(docBefore.nodes).find(id =>
                  docBefore.nodes[id].type === 'tabs' && docBefore.nodes[id].items?.includes(itemId));

        expect(homeNode, `the '${itemId}' item starts in a live tabs node`).toBeTruthy();

        const streamId0 = (await app.queryComponent({className: 'AgentOS.view.fleet.ActivityStream'}, ['id']))
            ?.[0]?.id ?? (await app.queryComponent({className: 'AgentOS.view.fleet.ActivityStream'}, ['id']))?.id;

        // ── tear out via the sortZone-free seam: exit opens the REAL vessel window ──────────
        const popupPromise = page.waitForEvent('popup', {timeout: 30000}),
              exitResult   = await app.callMethod(cockpitId, 'tearOutHandlers.onDockTearOutExit',
                  [{itemId, proxyRect: {x: 80, y: 80, width: 480, height: 360}}]);

        expect(exitResult, 'the exit seam admitted the vessel').toBe(true);

        const popup = await popupPromise;

        // the vessel opens at a staged about:blank, then location.replace navigates to the widget
        // childapp (the same-origin warm-connect staging pattern) — wait for the real URL
        await popup.waitForURL(url => String(url).includes(`tearout=${itemId}`), {timeout: 30000});
        expect(popup.url()).toContain('cockpitId=');

        const popupErrors = [];

        popup.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && popupErrors.push(value)
        });

        // terminal commits the detach (sortZone-free): item leaves the tree, catalog keeps it
        const terminalResult = await app.callMethod(cockpitId, 'tearOutHandlers.onDockTearOutTerminal', [{itemId}]);

        expect(terminalResult, 'the terminal committed the detach').toBe(true);

        // the REAL vessel connects and adopts the pane — wait for the record to carry its windowId
        await expect.poll(async () => {
            const {tearOutPanes} = await app.getComponent(cockpitId, ['tearOutPanes']);
            return tearOutPanes?.[itemId]?.windowId || null;
        }, {message: 'the vessel must join the heap and adopt the pane', timeout: 30000, intervals: [200, 500]})
            .toBeTruthy();

        const {tearOutPanes} = await app.getComponent(cockpitId, ['tearOutPanes']),
              vesselWindowId = tearOutPanes[itemId].windowId;

        // document truth while detached: out of the tree, still in the catalog
        const docDetached = await readDoc();

        expect(Object.values(docDetached.nodes).some(node => node.items?.includes(itemId)),
            'the torn item is absent from the live tree while detached').toBe(false);
        expect(docDetached.items[itemId], 'detachItem keeps the catalog record').toBeTruthy();

        // ── the defect surface: the real OS window closes ──────────────────────────────────
        const popupClosed = popup.waitForEvent('close', {timeout: 30000});

        await popup.evaluate(() => window.close());
        await popupClosed;

        // drive the disconnect (matrix-witness pattern: the harness close does not always emit it)
        await app.callMethod(cockpitId, 'onWindowDisconnect', [{windowId: vesselWindowId}]);

        // ── the item must come HOME: tree-live again, same instance, not orphaned ───────────
        await expect.poll(async () => {
            const doc = await readDoc();
            return Object.values(doc.nodes).some(node => node.items?.includes(itemId));
        }, {message: 'the item must re-tree after vessel death', timeout: 20000, intervals: [200, 500]}).toBe(true);

        const {windowId: cockpitWindowId} = await app.getComponent(cockpitId, ['windowId']);

        const readStream = async () => {
            const streams = await app.queryComponent({className: 'AgentOS.view.fleet.ActivityStream'},
                ['id', 'mounted', 'windowId']);
            return (Array.isArray(streams) ? streams : [streams]).filter(Boolean)[0];
        };

        const stream0 = await readStream();

        expect(stream0, 'the ActivityStream instance survives the vessel death').toBeTruthy();
        streamId0 && expect(stream0.properties.id, 'same instance — never a recreation').toBe(streamId0);

        // the returned pane is fully home only when BOTH hold: it re-targets the LIVE cockpit window
        // (not the dead vessel — the strand under test) AND it is mounted there. Poll both together so a
        // slow reintegration is not a false red; a stuck windowId or a never-remount is the defect.
        await expect.poll(async () => {
            const s = await readStream();
            return {mounted: s?.properties?.mounted, onDeadVessel: s?.properties?.windowId === vesselWindowId};
        }, {
            message  : `the pane must come home mounted in the cockpit window (${cockpitWindowId}), off the dead vessel (${vesselWindowId})`,
            timeout  : 15000,
            intervals: [200, 500]
        }).toEqual({mounted: true, onDeadVessel: false});

        const stream = await readStream();

        // the tear-out records are consumed exact-once (no leaked capture / orphan bookkeeping)
        const {tearOutPanes: after, returningTearOutPanes} = await app.getComponent(cockpitId,
            ['tearOutPanes', 'returningTearOutPanes']);

        expect(after?.[itemId], 'the tearOutPanes record is consumed').toBeFalsy();
        expect(returningTearOutPanes?.[itemId], 'the returning slot is consumed').toBeFalsy();

        expect(pageErrors, 'zero main-window page errors').toEqual([]);
        expect(popupErrors, 'zero vessel page errors').toEqual([])
    })
});
