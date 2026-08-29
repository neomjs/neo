import {test, expect} from '../../fixtures.mjs';

/**
 * Reads the rendered split geometry around the horizontal dock splitter (sibling precedent:
 * `WorkstationNL.spec.mjs` — the deferred projection must apply the committed split to live
 * DOM extents before any residue gate is meaningful).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object|null>}
 */
const readHorizontalSplitGeometry = page => page.evaluate(() => {
    const
        // resizable edge zones share the orientation class — this journey reads the SPLIT
        // container's own boundary, the one a resizeSplit commit moves
        splitter = document.querySelector('.neo-dashboard-dock-split-horizontal > .neo-dashboard-dock-splitter-horizontal'),
        children = splitter && [...splitter.parentElement.children]
            .filter(element => !element.classList.contains('neo-dashboard-dock-splitter'));

    if (!splitter || children.length < 2) return null;

    const
        first    = children[0].getBoundingClientRect(),
        second   = children[1].getBoundingClientRect(),
        boundary = splitter.getBoundingClientRect();

    return {
        boundaryWidth: boundary.width,
        firstWidth   : first.width,
        secondWidth  : second.width
    }
});

/**
 * Resolves the main split node's own splitter through its owning split container. Resizable
 * edge zones project splitters with the same orientation class, so a bare first-match on
 * `neo-dashboard-dock-splitter-horizontal` grabs the LEFT EDGE affordance — whose drag commits
 * a `resizeEdgeZone` extent, never the `resizeSplit` sizes this journey settles on.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String|undefined>} The splitter's DOM id.
 */
const resolveSplitSplitterId = page => page.evaluate(() =>
    document.querySelector('.neo-dashboard-dock-split-horizontal > .neo-dashboard-dock-splitter-horizontal')?.id);

/**
 * Arms a MutationObserver that flips a page-global flag the moment the workspace enters the
 * shared dock-motion lifecycle — the positive barrier that absence-of-residue checks can
 * never provide (zero `.neo-dashboard-dock-animating` is the natural state BEFORE the
 * deferred projection starts; only a seen-entry proves the gates run after it).
 * @param {import('@playwright/test').Page} page
 */
const armSplitterMotionWitness = page => page.evaluate(() => {
    const root = document.querySelector('.workstation-workspace');

    globalThis.__gridRepaintSplitterMotion?.observer?.disconnect();
    globalThis.__gridRepaintSplitterMotion = {
        observer: new MutationObserver(() => {
            root.classList.contains('neo-dashboard-dock-animating')
                && (globalThis.__gridRepaintSplitterMotion.seen = true)
        }),
        seen: root.classList.contains('neo-dashboard-dock-animating')
    };
    globalThis.__gridRepaintSplitterMotion.observer.observe(root, {
        attributeFilter: ['class'],
        attributes     : true
    })
});

/**
 * Retires the armed motion witness.
 * @param {import('@playwright/test').Page} page
 */
const disarmSplitterMotionWitness = page => page.evaluate(() => {
    globalThis.__gridRepaintSplitterMotion?.observer?.disconnect()
});

/**
 * @summary Whitebox E2E witness for the grid-freeze-after-splitter hypothesis.
 *
 * Separates three truths that green backend receipts alone conflate:
 *   (1) the provider-owned feed Store accepts a post-drag mutation (worker truth);
 *   (2) pane + Store identities survive the drag (worker truth);
 *   (3) the exact visible row/cell repaints the new value (DOM truth).
 *
 * Protocol: pre-drag rendered-cell control → a real pointer drag on the projected
 * horizontal DockSplitter (await the committed resizeSplit document + motion settlement)
 * → the same rendered-cell control again. A green pre-drag control with a red post-drag
 * control reproduces the freeze; both green closes the hypothesis with a falsifying receipt.
 *
 * The DOM oracle is load-bearing by design: this defect class IS worker-vs-DOM drift, so
 * worker truth alone cannot see it. No timing-only padding: settlement is measured off the
 * committed document, never a fixed delay.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test workstation/WorkstationGridRepaintNL -c test/playwright/playwright.config.e2e.mjs --workers=1 --headed
 */
test.describe('Workstation — grid repaint truth across a real splitter drag', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 900, width: 1440}
    });

    test('a visible feed cell still repaints after repeated committed splitter drags', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordWsGridRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordWsGridRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordWsGridRuntimeError({
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

        // --- Feed store resolution: provider-owned, newest-first -------------------------
        // Binding integrity first: a same-named persistent app (a peer's workstation, a
        // leftover dev tab) must never silently receive this page's worker queries while
        // page.mouse drives THIS browser — the drag would commit in one app and read in the other.
        const pageWorkerId = await page.evaluate(async () => {
            const appWorker = window.Neo?.worker?.App;
            return appWorker?.getWorkerId ? await appWorker.getWorkerId() : null
        });

        expect(
            app.sessionId,
            'the NL session must be THIS page\'s own worker, not a same-named persistent app'
        ).toBe(typeof pageWorkerId === 'string' ? pageWorkerId : pageWorkerId?.data);

        const stores    = await app.findInstances({className: 'Workstation.store.Feed'}, ['id']),
              feedStore = (Array.isArray(stores) ? stores : [stores])[0];

        expect(feedStore?.id, 'the provider-owned feed store must be findable').toBeTruthy();

        let markerSeq = 1;

        const appendMarker = async marker => {
            // A uniquely identifiable feed record, id-sorted to the visible top (newest-first store;
            // the 'zz' band sorts above every zero-padded live id, and the padded counter keeps
            // each marker above the previous without a digit-width lexical break)
            const id = `feed-zz${String(markerSeq++).padStart(6, '0')}`;

            await app.callMethod(feedStore.id, 'add', [[{
                counter  : markerSeq,
                id,
                name     : 'spec.repaint.witness',
                progress : 0,
                status   : marker,
                timestamp: new Date().toLocaleTimeString('en-GB'),
                trend    : [0],
                value    : 0
            }]]);

            const storeBack = await app.callMethod(feedStore.id, 'getAt', [0]);

            if (storeBack?.status !== marker) {
                console.log('[witness-diag] worker-truth miss:', JSON.stringify({
                    expectedMarker: marker,
                    gotId         : storeBack?.id,
                    gotStatus     : storeBack?.status,
                    storeCount    : await app.callMethod(feedStore.id, 'getCount', [])
                }))
            }

            expect(
                storeBack?.status,
                'worker truth: the store must carry the appended marker at its visible top'
            ).toBe(marker)
        };

        const readTopRowCells = () => page.evaluate(() => {
            const pane = document.querySelector('.workstation-feed-pane') || document.querySelector('[id*="feed"] .neo-grid-container'),
                  row  = pane?.querySelector('.neo-grid-row');
            return row ? [...row.querySelectorAll('.neo-grid-cell')].map(cell => cell.textContent.trim()) : []
        });

        const markerOf = tag => `REPAINT-${tag}-${Date.now()}`;

        // --- (0) pre-drag control: store truth + rendered-cell truth ----------------------
        const preMarker = markerOf('PRE');

        await appendMarker(preMarker);

        await expect.poll(
            async () => (await readTopRowCells()).includes(preMarker),
            {message: 'pre-drag control: the visible top row must paint the mutated status', timeout: 8000, intervals: [100]}
        ).toBe(true);

        const identitiesBefore = {
            paneFeed    : await app.callMethod(wsId, 'getPaneIdentity', ['feed']),
            paneScale   : await app.callMethod(wsId, 'getPaneIdentity', ['scale']),
            scaleStoreId: (await (async () => {
                const scaleStores = await app.findInstances({className: 'Workstation.store.Scale'}, ['id']);
                return (Array.isArray(scaleStores) ? scaleStores : [scaleStores])[0]?.id
            })()),
            storeId: feedStore.id
        };

        expect(identitiesBefore.paneFeed, 'live feed pane identity must exist before the drag').toBeTruthy();
        expect(identitiesBefore.paneScale, 'live scale pane identity must exist before the drag').toBeTruthy();

        // --- (1..N) repeated real splitter drags, rendered-cell control after each --------
        // Drag path: the app-side real-pointer dispatch (InteractionService) — the same event
        // class the film's own replay machinery drives. A raw CDP page.mouse drag proved
        // time-flaky on this host (the pointerdown lands, the drag-start chain wedges);
        // the app's own executor path is the film-faithful one.
        const windowId = await page.evaluate(() => Neo.worker.Manager.windowId);

        const dragSplitter = async direction => {
            const splitterDomId = await resolveSplitSplitterId(page),
                  [rect]        = await app.getDomRect(splitterDomId),
                  cx            = rect.x + rect.width / 2,
                  cy            = rect.y + rect.height / 2;

            expect(splitterDomId, 'the horizontal splitter must exist in the vdom').toBeTruthy();

            await app.simulateEvent([{
                options : {bubbles: true, button: 0, clientX: cx, clientY: cy},
                targetId: splitterDomId, type: 'mousedown', windowId
            }, {
                delay   : 60,
                options : {bubbles: true, button: 0, clientX: cx + direction / 3, clientY: cy},
                targetId: splitterDomId, type: 'mousemove', windowId
            }, {
                delay   : 60,
                options : {bubbles: true, button: 0, clientX: cx + 2 * direction / 3, clientY: cy},
                targetId: splitterDomId, type: 'mousemove', windowId
            }, {
                delay   : 60,
                options : {bubbles: true, button: 0, clientX: cx + direction, clientY: cy},
                targetId: splitterDomId, type: 'mousemove', windowId
            }, {
                delay   : 80,
                options : {bubbles: true, button: 0, clientX: cx + direction, clientY: cy},
                targetId: splitterDomId, type: 'mouseup', windowId
            }])
        };

        const DRAG_CYCLES = 10;

        for (let cycle = 1; cycle <= DRAG_CYCLES; cycle++) {
            const sizesBefore    = (await app.getDockTopology(wsId)).document.nodes['split-main'].sizes,
                  geometryBefore = await readHorizontalSplitGeometry(page),
                  direction      = cycle % 2 === 0 ? -90 : 90;

            await armSplitterMotionWitness(page);
            await dragSplitter(direction);

            // Settlement off the committed document — never a fixed delay
            await expect.poll(
                async () => JSON.stringify((await app.getDockTopology(wsId)).document.nodes['split-main'].sizes),
                {message: `cycle ${cycle}: the resizeSplit document must commit with new sizes`, timeout: 8000, intervals: [100]}
            ).not.toBe(JSON.stringify(sizesBefore));

            // Positive projection barrier 1: the deferred projection must apply the committed
            // split to LIVE DOM extents — a document commit alone says nothing about projection
            await expect.poll(
                async () => {
                    const geometry = await readHorizontalSplitGeometry(page);
                    return geometry ? Math.abs(geometry.firstWidth - geometryBefore.firstWidth) : -Infinity
                },
                {message: `cycle ${cycle}: the deferred projection must apply the committed split to live DOM extents`, timeout: 8000, intervals: [100]}
            ).toBeGreaterThan(20);

            // Positive projection barrier 2: the shared dock-motion lifecycle must have been
            // ENTERED — only then do the residue gates run after, not before, projection
            await expect.poll(
                async () => page.evaluate(() => globalThis.__gridRepaintSplitterMotion.seen),
                {message: `cycle ${cycle}: the committed resize must enter the dock-motion lifecycle`, timeout: 8000, intervals: [50]}
            ).toBe(true);

            // Residue gates — meaningful only behind both positive barriers
            await expect.poll(
                async () => page.locator('.neo-dashboard-dock-animating').count(),
                {message: `cycle ${cycle}: projection animation must settle`, timeout: 8000, intervals: [100]}
            ).toBe(0);
            await expect.poll(
                async () => page.locator('.neo-dock-flip-fixed-stage').count(),
                {message: `cycle ${cycle}: the FLIP staging frame must be fully retired`, timeout: 8000, intervals: [100]}
            ).toBe(0);

            await disarmSplitterMotionWitness(page);

            // live identities after cycle 1 only — later cycles re-prove the repaint discriminant
            if (cycle === 1) {
                expect(
                    await app.callMethod(wsId, 'getPaneIdentity', ['feed']),
                    'live pane identity: the SAME feed pane instance must survive the drag'
                ).toBe(identitiesBefore.paneFeed);
                expect(
                    await app.callMethod(wsId, 'getPaneIdentity', ['scale']),
                    'live pane identity: the SAME scale pane instance must survive the drag'
                ).toBe(identitiesBefore.paneScale);

                const feedAfter = await app.findInstances({className: 'Workstation.store.Feed'}, ['id']);

                expect(
                    (Array.isArray(feedAfter) ? feedAfter : [feedAfter]).map(store => store.id),
                    'store identity: the feed store instance survives re-projection'
                ).toContain(identitiesBefore.storeId);

                const scaleAfter = await app.findInstances({className: 'Workstation.store.Scale'}, ['id']);

                expect(
                    (Array.isArray(scaleAfter) ? scaleAfter : [scaleAfter]).map(store => store.id),
                    'store identity: the scale store instance survives re-projection'
                ).toContain(identitiesBefore.scaleStoreId);
            }

            // --- the freeze discriminant, every cycle --------------------------------------
            const postMarker = markerOf(`POST-${cycle}`);

            await appendMarker(postMarker);

            await expect.poll(
                async () => (await readTopRowCells()).includes(postMarker),
                {message: `FREEZE CHECK cycle ${cycle}/${DRAG_CYCLES}: the visible top row must still paint a post-drag mutation`, timeout: 8000, intervals: [100]}
            ).toBe(true);
        }

        expect(pageErrors, 'no page errors may escape during the drag repaint witness').toEqual([]);
        expect(runtimeErrors, 'no runtime errors may escape during the drag repaint witness').toEqual([]);
    });

    test('the scale pane (the pane the main split resizes) still repaints after a committed splitter drag', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordWsScaleRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordWsScaleRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordWsScaleRuntimeError({
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

        const stores     = await app.findInstances({className: 'Workstation.store.Scale'}, ['id']),
              scaleStore = (Array.isArray(stores) ? stores : [stores])[0];

        expect(scaleStore?.id, 'the provider-owned scale store must be findable').toBeTruthy();

        // Resolve this run's scale surface dynamically — generated ids are process-global and
        // must never be hardcoded: pane → grid body → visible row 0 → its record identity
        const scalePanes  = await app.findInstances({className: 'Workstation.view.ScalePane'}, ['id']),
              scalePaneId = (Array.isArray(scalePanes) ? scalePanes : [scalePanes])[0]?.id;

        expect(scalePaneId, 'the ScalePane component must exist in this run').toBeTruthy();

        const bodyProps   = await app.getComponent(scalePaneId, ['body.id']),
              scaleBodyId = bodyProps['body.id'];

        expect(scaleBodyId, 'the scale grid body id must resolve dynamically').toBeTruthy();

        const scaleRowComponent = `${scaleBodyId}__row-0`,
              scaleRowRecord    = (await app.getComponent(scaleRowComponent, ['record.id']))['record.id'];

        expect(scaleRowRecord != null, 'row 0 must carry a live record identity in this run').toBe(true);

        const scaleIdentityBefore = {
            pane  : await app.callMethod(wsId, 'getPaneIdentity', ['scale']),
            record: scaleRowRecord,
            store : scaleStore.id
        };

        expect(scaleIdentityBefore.pane, 'live scale pane identity must exist before the drag').toBeTruthy();

        let markerSeq = 1;

        // Mutate the SAME already-visible Model's counter field through the row component's
        // own `record` handle — the ordinary existing-record repaint path (record.set → store
        // recordChange → Body.onStoreRecordChange → pooled-row redraw), never an
        // insert/materialization shortcut that can green over a detached recordChange listener.
        const mutateTopCounter = async () => {
            const marker = 900000 + markerSeq++;

            await app.callMethod(scaleRowComponent, 'record.set', [{counter: marker}]);

            const storeBack = await app.callMethod(scaleStore.id, 'getAt', [0]);

            expect(
                storeBack?.counter,
                'worker truth: the scale store must carry the mutated counter on the same record'
            ).toBe(marker);

            return marker
        };

        // The rendered counter cell — found by the materialized data.field binding (pool cell
        // ids shift with column switches; the binding is the render-time truth)
        const readCounterCell = () => page.evaluate(rowId => {
            const row  = document.getElementById(rowId),
                  cell = row?.querySelector('[data-field="counter"]');
            return cell ? cell.textContent.trim() : null
        }, scaleRowComponent);

        // --- pre-drag control on the pane the main split resizes --------------------------
        const pre = await mutateTopCounter();

        await expect.poll(
            readCounterCell,
            {message: 'pre-drag control: the exact counter-bound cell must paint the mutated value', timeout: 8000, intervals: [100]}
        ).toBe(String(pre));

        // --- the real drag on the split that resizes THIS pane ----------------------------
        const windowId2      = await page.evaluate(() => Neo.worker.Manager.windowId),
              splitterDomId2 = await resolveSplitSplitterId(page),
              [rect2]        = await app.getDomRect(splitterDomId2),
              cx             = rect2.x + rect2.width / 2,
              cy             = rect2.y + rect2.height / 2;

        expect(splitterDomId2, 'the horizontal splitter must exist in the vdom').toBeTruthy();

        const sizesBefore    = (await app.getDockTopology(wsId)).document.nodes['split-main'].sizes,
              geometryBefore = await readHorizontalSplitGeometry(page);

        await armSplitterMotionWitness(page);

        await app.simulateEvent([{
            options : {bubbles: true, button: 0, clientX: cx, clientY: cy},
            targetId: splitterDomId2, type: 'mousedown', windowId: windowId2
        }, {
            delay   : 60,
            options : {bubbles: true, button: 0, clientX: cx + 30, clientY: cy},
            targetId: splitterDomId2, type: 'mousemove', windowId: windowId2
        }, {
            delay   : 60,
            options : {bubbles: true, button: 0, clientX: cx + 60, clientY: cy},
            targetId: splitterDomId2, type: 'mousemove', windowId: windowId2
        }, {
            delay   : 60,
            options : {bubbles: true, button: 0, clientX: cx + 90, clientY: cy},
            targetId: splitterDomId2, type: 'mousemove', windowId: windowId2
        }, {
            delay   : 80,
            options : {bubbles: true, button: 0, clientX: cx + 90, clientY: cy},
            targetId: splitterDomId2, type: 'mouseup', windowId: windowId2
        }]);

        await expect.poll(
            async () => JSON.stringify((await app.getDockTopology(wsId)).document.nodes['split-main'].sizes),
            {message: 'the resizeSplit document must commit with new sizes', timeout: 8000, intervals: [100]}
        ).not.toBe(JSON.stringify(sizesBefore));

        // Positive projection barrier 1: the deferred projection must apply the committed
        // split to LIVE DOM extents — a document commit alone says nothing about projection
        await expect.poll(
            async () => {
                const geometry = await readHorizontalSplitGeometry(page);
                return geometry ? Math.abs(geometry.firstWidth - geometryBefore.firstWidth) : -Infinity
            },
            {message: 'the deferred projection must apply the committed split to live DOM extents', timeout: 8000, intervals: [100]}
        ).toBeGreaterThan(20);

        // Positive projection barrier 2: the shared dock-motion lifecycle must have been
        // ENTERED — only then do the residue gates run after, not before, projection
        await expect.poll(
            async () => page.evaluate(() => globalThis.__gridRepaintSplitterMotion.seen),
            {message: 'the committed resize must enter the dock-motion lifecycle', timeout: 8000, intervals: [50]}
        ).toBe(true);

        // Residue gates — meaningful only behind both positive barriers
        await expect.poll(
            async () => page.locator('.neo-dashboard-dock-animating').count(),
            {message: 'projection animation must settle', timeout: 8000, intervals: [100]}
        ).toBe(0);
        await expect.poll(
            async () => page.locator('.neo-dock-flip-fixed-stage').count(),
            {message: 'the FLIP staging frame must be fully retired', timeout: 8000, intervals: [100]}
        ).toBe(0);

        await disarmSplitterMotionWitness(page);

        // Same-run identity reassert: pane, store, and row-record must be the SAME instances
        // the pre-drag controls bound — projection must not have swapped them
        expect(
            await app.callMethod(wsId, 'getPaneIdentity', ['scale']),
            'live scale pane identity must survive the drag'
        ).toBe(scaleIdentityBefore.pane);
        expect(
            (await app.getComponent(scaleRowComponent, ['record.id']))['record.id'],
            'row 0 must carry the SAME record instance identity after the drag'
        ).toBe(scaleIdentityBefore.record);
        expect(
            (await app.findInstances({className: 'Workstation.store.Scale'}, ['id']))
                .map(store => (Array.isArray(store) ? store : [store])[0]?.id ?? store.id)[0],
            'the scale store instance identity must survive the drag'
        ).toBe(scaleIdentityBefore.store);

        // --- the freeze discriminant on the resized pane ----------------------------------
        const post = await mutateTopCounter();

        await expect.poll(
            readCounterCell,
            {message: 'FREEZE CHECK (scale pane): the exact counter-bound cell must still paint a post-drag record change', timeout: 8000, intervals: [100]}
        ).toBe(String(post));

        expect(pageErrors, 'no page errors may escape during the scale repaint witness').toEqual([]);
        expect(runtimeErrors, 'no runtime errors may escape during the scale repaint witness').toEqual([]);
    });

})
