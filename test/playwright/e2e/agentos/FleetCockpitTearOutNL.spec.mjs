import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e for the Fleet cockpit's GESTURE tear-out vessel-death return leg — the
 * uncovered sibling of the click pop-out witness (`FleetCockpitPopOutNL.spec.mjs`) and the dockdemo
 * tear-out matrix (`TearOutMatrixRows4To7NL.spec.mjs`). A dock pane is torn out to a REAL second
 * browser window on the ONE SharedWorker heap, the vessel adopts the SAME live instance, then the
 * vessel DIES — and the pane must come HOME to the cockpit tree, never strand in the dead
 * vessel's view (the defect: tab header returns, live pane orphaned under the dead vessel viewport).
 * The death is driven while the vessel view is live (the widest tree-live-occupant window), plus a
 * second disconnect delivery to pin no-op idempotency. The strand itself is schedule-dependent —
 * this spec gates the full return CONTRACT on every schedule, with the arm-time parking fix making
 * the handoff independent of which slot consumer (resolver vs refresh) serves the return.
 *
 * The return oracle binds every dimension of the return contract mechanically (no conditional identity, no
 * inequality stand-ins): the pane id is captured as a REQUIRED precondition and compared
 * unconditionally after return; the returned `windowId` must EQUAL the live cockpit's own
 * `windowId` (never merely differ from the dead vessel's); the pane's parent must itself live in
 * the cockpit window's tree; and the pane BODY must be visible in the main window's rendered DOM —
 * the original defect rendered the returning tab header over an empty page, so header-level checks
 * cannot witness it.
 *
 * Two items run the exact same cycle: `stream` lives in the default tree; `operator`
 * starts auto-hidden on the right rail and is first pinned through the production semantic-op path
 * (`applyDockZoneOperation setItemAutoHidden`, the FleetCockpitController.onAgentSelect precedent) —
 * reintegration itself is item-keyed through the one `reintegrateTearOutItem` branch.
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

    /**
     * Normalizes the Neural Link component-query return into one flat shape — the earlier
     * two-shape read (`[0].id` at capture vs `.properties.id` after return) is exactly how an
     * identity precondition can go silently undefined and never bind.
     * @param {Object} app
     * @param {String} className
     * @returns {Object|null} `{id, mounted, windowId, parentId}` or null
     */
    const queryPane = async (app, className) => {
        const result = await app.queryComponent({className}, ['id', 'mounted', 'windowId', 'parentId']),
              first  = (Array.isArray(result) ? result : [result]).filter(Boolean)[0];

        if (!first) return null;

        const flat = first.properties ?? first;

        return {id: flat.id, mounted: flat.mounted, windowId: flat.windowId, parentId: flat.parentId}
    };

    /**
     * Runs the full tear-out → real vessel window → vessel death → return cycle for one item,
     * binding the complete AC1 oracle.
     * @param {Object}  page
     * @param {Object}  neuralLink
     * @param {Object}  descriptor
     * @param {String}  descriptor.itemId       Dock item id in the committed document
     * @param {String}  descriptor.className    App Worker class of the pane instance
     * @param {String}  descriptor.domSelector  Main-window DOM selector of the rendered pane body
     * @param {Boolean} [descriptor.pin=false]  Un-rail the item through the production semantic op first
     */
    const runVesselDeathCycle = async (page, neuralLink, {itemId, className, domSelector, pin = false}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const app       = await neuralLink.connectToApp('AgentOS'),
              cockpits  = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              cockpitId = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id;

        expect(cockpitId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        if (pin) {
            // the production un-rail path (FleetCockpitController.onAgentSelect precedent), BOTH
            // halves: `applyDockZoneOperation` is a pure reducer returning `{document, errors}` —
            // the mutation only lands when the caller commits the produced document
            const pinResult = await app.callMethod(cockpitId, 'applyDockZoneOperation',
                [{operation: 'setItemAutoHidden', itemId, autoHidden: false}]);

            expect(pinResult?.errors ?? [], `the '${itemId}' un-rail reduction carries no errors`).toEqual([]);
            expect(pinResult?.document, 'the reducer produced a document to commit').toBeTruthy();

            await app.callMethod(cockpitId, 'onDockZoneDocumentChange', [pinResult.document])
        }

        const readDoc = async () => {
            const topo = await app.getDockTopology(cockpitId);
            return topo?.document ?? topo;
        };

        const docBefore = await readDoc(),
              homeNode  = Object.keys(docBefore.nodes).find(id =>
                  docBefore.nodes[id].type === 'tabs' && docBefore.nodes[id].items?.includes(itemId));

        expect(homeNode, `the '${itemId}' item starts in a live tabs node`).toBeTruthy();

        // ── AC1 precondition: the pane instance id is REQUIRED before the cycle — identity is
        // asserted unconditionally after return, never skipped behind a falsy capture. Polled
        // because `resolveDockComponentRef` materializes a freshly un-railed pane asynchronously
        // (projection → tab render → instance); the requirement itself stays hard.
        await expect.poll(async () => (await queryPane(app, className))?.id ?? null, {
            message  : `the '${className}' pane id must be captured before the tear-out`,
            timeout  : 15000,
            intervals: [200, 500]
        }).not.toBeNull();

        const paneId0 = (await queryPane(app, className)).id;

        expect(paneId0, `the '${className}' pane id must be captured before the tear-out`).toBeTruthy();

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

        // ── the defect surface: vessel death while the vessel view is still LIVE ─────────────
        // Driven with the vessel window open — the ordering that maximizes the tree-live-occupant
        // window (the App Worker's disconnect handling legitimately races the vessel teardown).
        // This witness is the return CONTRACT gate (same instance, exact cockpit windowId, main-tree
        // parent, rendered body, records consumed) — not a deterministic red-gate for the strand:
        // the strand is schedule-dependent (observed 4/4 under session load on 2026-07-24; idle-host
        // controls later ran the unfixed code green under every public-seam ordering). The parking
        // fix makes the handoff order-independent, so this contract holds on every schedule.
        await app.callMethod(cockpitId, 'onWindowDisconnect', [{windowId: vesselWindowId}]);

        // fired a second time on purpose: production can deliver the disconnect through two
        // independent paths (port-close event + programmatic drive) — the consumed tear-out
        // record must make the second arrival a harmless no-op, never a double reintegration
        await app.callMethod(cockpitId, 'onWindowDisconnect', [{windowId: vesselWindowId}]);

        // ── the item must come HOME: tree-live again ─────────────────────────────────────────
        await expect.poll(async () => {
            const doc = await readDoc();
            return Object.values(doc.nodes).some(node => node.items?.includes(itemId));
        }, {message: 'the item must re-tree after vessel death', timeout: 20000, intervals: [200, 500]}).toBe(true);

        // the live cockpit window is the EXACT return target — captured, asserted, then compared
        const {windowId: cockpitWindowId} = await app.getComponent(cockpitId, ['windowId']);

        expect(cockpitWindowId, 'the live cockpit windowId must be readable').toBeTruthy();
        expect(cockpitWindowId, 'the cockpit itself never lives on the vessel').not.toBe(vesselWindowId);

        // AC1, bound exactly: mounted in the cockpit window — `windowId === cockpitWindowId`,
        // never the weaker `!== vesselWindowId` (null/undefined/a third window must all FAIL)
        await expect.poll(async () => {
            const pane = await queryPane(app, className);
            return pane && {mounted: pane.mounted, windowId: pane.windowId};
        }, {
            message  : `the pane must come home mounted in the cockpit window (${cockpitWindowId}), off the dead vessel (${vesselWindowId})`,
            timeout  : 15000,
            intervals: [200, 500]
        }).toEqual({mounted: true, windowId: cockpitWindowId});

        const pane = await queryPane(app, className);

        // same instance — asserted unconditionally against the required precondition
        expect(pane.id, 'same instance — never a recreation').toBe(paneId0);

        // parentId in the main window's tree: the parent component itself must live in the
        // cockpit's window — a pane re-parented under the dead vessel's surviving view tree fails
        expect(pane.parentId, 'the returned pane has a parent').toBeTruthy();

        const {windowId: parentWindowId} = await app.getComponent(pane.parentId, ['windowId']);

        expect(parentWindowId, 'the returned pane\'s parent lives in the cockpit window').toBe(cockpitWindowId);

        // pane body rendered — in the MAIN window's real DOM. The defect's signature was a
        // returned tab header over an empty page, so header presence can never witness this.
        await expect(page.locator(domSelector).first(),
            'the returned pane body renders in the main window').toBeVisible({timeout: 10000});

        // the tear-out records are consumed exact-once (no leaked capture / orphan bookkeeping)
        const {tearOutPanes: after, returningTearOutPanes} = await app.getComponent(cockpitId,
            ['tearOutPanes', 'returningTearOutPanes']);

        expect(after?.[itemId], 'the tearOutPanes record is consumed').toBeFalsy();
        expect(returningTearOutPanes?.[itemId], 'the returning slot is consumed').toBeFalsy();

        // cleanup: the emptied vessel window closes (the return was already proven above)
        const popupClosed = popup.waitForEvent('close', {timeout: 30000});

        await popup.evaluate(() => window.close());
        await popupClosed;

        expect(pageErrors, 'zero main-window page errors').toEqual([]);
        expect(popupErrors, 'zero vessel page errors').toEqual([])
    };

    test('stream: tear out → own OS window → vessel death → same instance comes HOME, no orphan', async ({page, neuralLink}) => {
        await runVesselDeathCycle(page, neuralLink, {
            itemId     : 'stream',
            className  : 'AgentOS.view.fleet.activity.Container',
            domSelector: '.fm-activity-stream'
        })
    });

    test('operator (rail-pinned first): the item-keyed return branch holds beyond the default tree', async ({page, neuralLink}) => {
        await runVesselDeathCycle(page, neuralLink, {
            itemId     : 'operator',
            className  : 'AgentOS.view.fleet.mailbox.OperatorContainer',
            domSelector: '.fm-operator-mailbox',
            pin        : true
        })
    });
});
