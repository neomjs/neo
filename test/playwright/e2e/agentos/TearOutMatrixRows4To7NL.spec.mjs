import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Headed macOS receipts for the dock-tier half of the tear-out portability matrix.
 *
 * Rows 4 and 6 remain deliberately absent until their named product/test-host blockers are
 * repaired. Row 5 drives the screen-topology fallback. Row 7 drives committed, cancelled, and
 * blocked-acquisition terminals through the real Demo B gesture surface, then proves complete
 * lifecycle cleanup and repeated-terminal idempotency against the living matrix ledger.
 *
 * Run: npx playwright test agentos/TearOutMatrixRows4To7NL.spec.mjs \
 *   -c test/playwright/playwright.config.matrix.mjs --workers=1
 */
test.describe('tear-out portability matrix — Demo B dock lifecycle, headed', () => {
    test.setTimeout(120000);

    /**
     * @param {Object} app Neural Link app wrapper.
     * @returns {Promise<Object>}
     */
    async function getCounter(app) {
        const found = await app.findInstances({
            className: 'Neo.examples.dashboard.crossWindow.CounterPane'
        }, ['frames', 'id', 'isDestroyed', 'mounted', 'mountCount', 'windowId']);

        const counters = (Array.isArray(found) ? found : found ? [found] : [])
            .map(counter => ({...counter.properties, id: counter.id}));

        expect(counters, 'exactly one worker-owned CounterPane instance may exist').toHaveLength(1);

        return counters[0]
    }

    /**
     * @param {Object} app Neural Link app wrapper.
     * @param {String} wsId Demo B workspace component id.
     * @returns {Promise<Object>}
     */
    function getLifecycleState(app, wsId) {
        return app.getComponent(wsId, [
            'dockModel',
            'tearOutConnects',
            'tearOutPanes',
            'tearOutPlacements'
        ])
    }

    /**
     * @param {Object} app Neural Link app wrapper.
     * @param {String} wsId Demo B workspace component id.
     * @returns {Promise<Object>}
     */
    function getTerminalLifecycleState(app, wsId) {
        return app.getComponent(wsId, [
            'dockModel',
            'perspectiveStore.collection',
            'tearOutAcquisitionAttempts',
            'tearOutConnectAdmissions.size',
            'tearOutConnects',
            'tearOutHandlers.activeVessel',
            'tearOutPanes',
            'tearOutPlacements',
            'tearOutRetirements.size',
            'vesselOwnerGrants.size'
        ])
    }

    /**
     * @param {import('@playwright/test').Page} page
     * @param {String} callbackName
     * @returns {Promise<{pageErrors:String[], popupErrors:String[], popupPages:Object[], runtimeErrors:Object[]}>}
     */
    async function installErrorLedger(page, callbackName) {
        const ledger = {pageErrors: [], popupErrors: [], popupPages: [], runtimeErrors: []};

        await page.context().exposeFunction(callbackName, payload => ledger.runtimeErrors.push(payload));
        await page.context().addInitScript(name => {
            globalThis.addEventListener('error', event => globalThis[name]({
                column : event.colno,
                line   : event.lineno,
                message: event.message,
                source : event.filename,
                type   : 'error'
            }));
            globalThis.addEventListener('unhandledrejection', event => globalThis[name]({
                reason: String(event.reason?.stack || event.reason?.message || event.reason),
                type  : 'unhandledrejection'
            }))
        }, callbackName);

        page.on('pageerror', error => ledger.pageErrors.push(String(error?.stack || error?.message || error)));
        page.context().on('page', popup => {
            ledger.popupPages.push(popup);
            popup.on('pageerror', error => ledger.popupErrors.push(String(error?.stack || error?.message || error)))
        });

        return ledger
    }

    /**
     * @param {import('@playwright/test').Page} page
     * @param {Object} neuralLink
     * @returns {Promise<{app:Object, wsId:String}>}
     */
    async function bootDemoB(page, neuralLink) {
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.locator('.agentos-dockdemo-counter-pane').waitFor({timeout: 30000});

        const
            app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
            workspaces = await app.findInstances({
                className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'
            }, ['id']),
            wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'Demo B must expose one Neural Link workspace authority').toBeTruthy();

        return {app, wsId}
    }

    /**
     * @param {import('@playwright/test').Page} page
     * @param {Object} app
     * @param {String} wsId
     * @returns {Promise<Object>}
     */
    async function getTerminalSnapshot(page, app, wsId) {
        const
            lifecycle = await getTerminalLifecycleState(app, wsId),
            pane      = await getCounter(app),
            homes     = Object.values(lifecycle.dockModel.nodes)
                .filter(node => node.items?.includes('workbench'));

        return {
            homeCount      : homes.length,
            lifecycle,
            mainRenderCount: await page.locator('.agentos-dockdemo-counter-pane').count(),
            pane           : {
                id        : pane.id,
                mountCount: pane.mountCount,
                mounted   : pane.mounted,
                windowId  : pane.windowId
            },
            popupUrls: page.context().pages()
                .filter(candidate => candidate !== page && !candidate.isClosed())
                .map(candidate => candidate.url())
                .sort()
        }
    }

    /**
     * @param {Object} snapshot
     */
    function expectNoTearOutResidue(snapshot) {
        expect(snapshot.lifecycle).toMatchObject({
            'tearOutConnectAdmissions.size': 0,
            'tearOutHandlers.activeVessel' : null,
            'tearOutRetirements.size'      : 0,
            'vesselOwnerGrants.size'       : 0,
            tearOutConnects                : {},
            tearOutPanes                   : {},
            tearOutPlacements              : {}
        });
        expect(snapshot.homeCount).toBe(1);
        expect(snapshot.mainRenderCount).toBe(1);
        expect(snapshot.popupUrls).toEqual([])
    }

    /**
     * @param {Object} app
     * @param {String} wsId
     * @param {String} name
     * @param {Object} expectedDocument
     * @returns {Promise<Object>}
     */
    async function persistDockReceipt(app, wsId, name, expectedDocument) {
        expect(await app.callMethod(wsId, 'capturePerspective', [name]))
            .toEqual({errors: [], saved: true});

        const
            collection = (await app.getComponent(wsId, [
                'perspectiveStore.collection'
            ]))['perspectiveStore.collection'],
            stored     = collection.layouts[`demo-b-${name.toLowerCase()}`];

        expect(stored.captureScope).toBe('window');
        expect(stored.dockZone).toEqual(expectedDocument);
        expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);

        return stored
    }

    /**
     * @param {Object} ledger
     */
    function expectNoRuntimeErrors(ledger) {
        expect(ledger.runtimeErrors).toEqual([]);
        expect(ledger.pageErrors).toEqual([]);
        expect(ledger.popupErrors).toEqual([])
    }

    test('row 5 — denied getScreenDetails falls back through window metrics without violating lifecycle invariants', async ({page, neuralLink}) => {
        const runtimeErrors = [], pageErrors = [], popupErrors = [];

        await page.context().exposeFunction('__recordMatrixRow5', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => globalThis.__recordMatrixRow5({
                column : event.colno,
                line   : event.lineno,
                message: event.message,
                source : event.filename,
                type   : 'error'
            }));
            globalThis.addEventListener('unhandledrejection', event => globalThis.__recordMatrixRow5({
                reason: String(event.reason?.stack || event.reason?.message || event.reason),
                type  : 'unhandledrejection'
            }))
        });
        page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));

        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.locator('.agentos-dockdemo-counter-pane').waitFor({timeout: 30000});

        const
            cdp              = await page.context().newCDPSession(page),
            {targetInfo}     = await cdp.send('Target.getTargetInfo'),
            browserContextId = targetInfo.browserContextId,
            origin           = new URL(page.url()).origin,
            permission       = {name: 'window-management'};

        await cdp.send('Browser.setPermission', {browserContextId, origin, permission, setting: 'denied'});

        const denial = await page.evaluate(async () => {
            const timeout    = label => new Promise(resolve => setTimeout(() => resolve({outcome: 'timeout', label}), 2000)),
                  permission = await Promise.race([
                      navigator.permissions.query({name: 'window-management'})
                          .then(({state}) => ({outcome: 'settled', state}))
                          .catch(error => ({errorName: error.name, outcome: 'rejected'})),
                      timeout('permission-query')
                  ]),
                  request = await Promise.race([
                      window.getScreenDetails()
                          .then(() => ({outcome: 'resolved'}))
                          .catch(error => ({errorName: error.name, outcome: 'rejected'})),
                      timeout('getScreenDetails')
                  ]);

            return {permission, request}
        });

        expect(denial.permission).toEqual({outcome: 'settled', state: 'denied'});
        expect(denial.request).toEqual({errorName: 'NotAllowedError', outcome: 'rejected'});

        const
            app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
            workspaces = await app.findInstances({
                className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'
            }, ['id']),
            wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'Demo B must expose one Neural Link workspace authority').toBeTruthy();

        await expect.poll(async () => {
            const pane = await getCounter(app);

            return {id: pane?.id, mountCount: pane?.mountCount}
        }, {
            message: 'CounterPane must start as one mounted live instance',
            timeout: 5000
        }).toEqual({id: expect.any(String), mountCount: 1});

        const
            before     = await getLifecycleState(app, wsId),
            paneBefore = await getCounter(app),
            popupWait  = page.waitForEvent('popup', {timeout: 30000}),
            resultWait = app.callMethod(wsId, 'executeTearOutStep', [{
                itemId      : 'workbench',
                sourceNodeId: 'workbench-tabs'
            }, {postBirthMoves: 4}]),
            popup      = await popupWait;

        popup.on('pageerror', error => popupErrors.push(String(error?.stack || error?.message || error)));

        const result = await resultWait;

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.proof).toMatchObject({
            born              : true,
            catalogPreserved  : true,
            committed         : true,
            detachCommitted   : true,
            itemAbsentFromTree: true,
            itemKeptInCatalog : true,
            survivedProbe     : true
        });
        expect(popup.url()).toContain('popout=workbench');
        expect(page.context().pages().filter(candidate => candidate.url().includes('popout=workbench'))).toEqual([popup]);

        await expect.poll(async () => {
            const state = await getLifecycleState(app, wsId),
                  pane  = await getCounter(app),
                  entry = state.tearOutPanes.workbench;

            return {
                paneId        : pane?.id,
                vesselWindowId: entry?.windowId || null
            }
        }).toEqual({
            paneId        : paneBefore.id,
            vesselWindowId: expect.any(String)
        });

        await popup.locator('.agentos-dockdemo-counter-pane').waitFor();
        expect(await popup.locator('.agentos-dockdemo-counter-pane').getAttribute('id')).toBe(paneBefore.id);
        await expect.poll(async () => (await getCounter(app))?.frames, {
            message  : 'the same instance heartbeat must advance while mounted in the vessel',
            intervals: [100, 250],
            timeout  : 5000
        }).toBeGreaterThan(paneBefore.frames);

        const
            detached       = await getLifecycleState(app, wsId),
            paneDetached   = await getCounter(app),
            vesselWindowId = detached.tearOutPanes.workbench.windowId;

        expect(result.proof.documentBefore).toEqual(before.dockModel);
        expect(result.proof.documentAfter).toEqual(detached.dockModel);
        expect(paneDetached.mountCount).toBe(paneBefore.mountCount + 1);
        expect(paneDetached.frames).toBeGreaterThanOrEqual(paneBefore.frames);
        expect(paneDetached.windowId).toBe(vesselWindowId);
        expect(Object.values(detached.dockModel.nodes).filter(node => node.items?.includes('workbench'))).toHaveLength(0);
        expect(detached.dockModel.items.workbench).toBeTruthy();

        expect(await app.callMethod(wsId, 'capturePerspective', ['Row5Detached']))
            .toEqual({errors: [], saved: true});

        const popupClosed = popup.waitForEvent('close');

        await popup.evaluate(() => window.close());
        await popupClosed;

        await expect.poll(async () => {
            const state = await getLifecycleState(app, wsId),
                  pane  = await getCounter(app),
                  homes = Object.values(state.dockModel.nodes).filter(node => node.items?.includes('workbench'));

            return {
                connects: Object.keys(state.tearOutConnects).length,
                homes   : homes.length,
                panes   : Object.keys(state.tearOutPanes).length,
                paneId  : pane?.id,
                places  : Object.keys(state.tearOutPlacements).length,
                rendered: await page.locator('.agentos-dockdemo-counter-pane').count()
            }
        }, {
            intervals: [100, 250],
            timeout  : 10000
        }).toEqual({
            connects: 0,
            homes   : 1,
            panes   : 0,
            paneId  : paneBefore.id,
            places  : 0,
            rendered: 1
        });

        await expect.poll(async () => (await getCounter(app))?.frames, {
            message  : 'the same instance heartbeat must keep advancing after semantic return',
            intervals: [100, 250],
            timeout  : 5000
        }).toBeGreaterThan(paneDetached.frames);

        const
            returned     = await getLifecycleState(app, wsId),
            paneReturned = await getCounter(app);

        expect(returned.dockModel.items).toEqual(before.dockModel.items);
        expect(Object.values(returned.dockModel.nodes).filter(node => node.items?.includes('workbench'))).toHaveLength(1);
        expect(paneReturned.frames).toBeGreaterThanOrEqual(paneDetached.frames);
        expect(paneReturned.mountCount).toBe(paneDetached.mountCount + 1);
        expect(paneReturned.windowId).toBe(paneBefore.windowId);

        expect(await app.callMethod(wsId, 'capturePerspective', ['Row5Returned']))
            .toEqual({errors: [], saved: true});

        const collection = (await app.getComponent(wsId, [
                  'perspectiveStore.collection'
              ]))['perspectiveStore.collection'],
              storedDetached = collection.layouts['demo-b-row5detached'],
              storedReturned = collection.layouts['demo-b-row5returned'];

        expect(storedDetached.captureScope).toBe('window');
        expect(storedDetached.dockZone).toEqual(detached.dockModel);
        expect(storedReturned.captureScope).toBe('window');
        expect(storedReturned.dockZone).toEqual(returned.dockModel);
        expect(JSON.parse(JSON.stringify({storedDetached, storedReturned})))
            .toEqual({storedDetached, storedReturned});

        // Repeat the same terminal signal: all model, identity, and cleanup state must stay still.
        await app.callMethod(wsId, 'onWindowDisconnect', [{windowId: vesselWindowId}]);

        expect(await getLifecycleState(app, wsId)).toEqual(returned);
        expect((await getCounter(app)).id).toBe(paneBefore.id);
        expect(runtimeErrors).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(popupErrors).toEqual([]);

        console.log('ROW5-RECEIPTS', JSON.stringify({
            denial,
            fallback   : 'Neo.Main.getWindowData screen/window metrics',
            frames     : [paneBefore.frames, paneDetached.frames, paneReturned.frames],
            mountCounts: [paneBefore.mountCount, paneDetached.mountCount, paneReturned.mountCount],
            paneId     : paneBefore.id,
            vesselWindowId
        }))
    })

    test('row 7 — committed drop cleans once and a repeated terminal is a no-op', async ({page, neuralLink}) => {
        const ledger      = await installErrorLedger(page, '__recordMatrixRow7Drop');
        const {app, wsId} = await bootDemoB(page, neuralLink);
        const before      = await getTerminalSnapshot(page, app, wsId);

        const
            popupWait  = page.waitForEvent('popup', {timeout: 30000}),
            resultWait = app.callMethod(wsId, 'executeTearOutStep', [{
                itemId      : 'workbench',
                sourceNodeId: 'workbench-tabs'
            }, {postBirthMoves: 4}]),
            popup      = await popupWait,
            result     = await resultWait;

        expect(result).toMatchObject({
            applied: true,
            errors : [],
            proof  : {
                born              : true,
                committed         : true,
                detachCommitted   : true,
                itemAbsentFromTree: true,
                itemKeptInCatalog : true,
                survivedProbe     : true
            }
        });

        await persistDockReceipt(app, wsId, 'Row7Drop', result.proof.documentAfter);

        const
            committed      = await getTerminalSnapshot(page, app, wsId),
            detachedEntry  = committed.lifecycle.tearOutPanes.workbench,
            vesselWindowId = detachedEntry.windowId;

        expect(result.proof.documentBefore).toEqual(before.lifecycle.dockModel);
        expect(committed.lifecycle.dockModel).toEqual(result.proof.documentAfter);
        expect(committed.lifecycle).toMatchObject({
            'tearOutConnectAdmissions.size': 0,
            'tearOutHandlers.activeVessel' : null,
            'tearOutRetirements.size'      : 0,
            'vesselOwnerGrants.size'       : 0,
            tearOutAcquisitionAttempts     : 1,
            tearOutConnects                : {}
        });
        expect(Object.keys(committed.lifecycle.tearOutPanes)).toEqual(['workbench']);
        expect(Object.keys(committed.lifecycle.tearOutPlacements)).toEqual(['workbench']);
        expect(committed.homeCount).toBe(0);
        expect(committed.mainRenderCount).toBe(0);
        expect(committed.pane).toEqual({
            id        : before.pane.id,
            mountCount: before.pane.mountCount + 1,
            mounted   : true,
            windowId  : vesselWindowId
        });
        expect(committed.popupUrls).toEqual([popup.url()]);

        expect(await app.callMethod(wsId, 'tearOutHandlers.onDockTearOutTerminal', [{
            itemId: 'workbench'
        }])).toBe(false);
        expect(await getTerminalSnapshot(page, app, wsId)).toEqual(committed);

        const popupClosed = popup.waitForEvent('close');

        await popup.evaluate(() => window.close());
        await popupClosed;

        await expect.poll(async () => {
            const snapshot = await getTerminalSnapshot(page, app, wsId);

            return {
                connects: Object.keys(snapshot.lifecycle.tearOutConnects).length,
                homes   : snapshot.homeCount,
                panes   : Object.keys(snapshot.lifecycle.tearOutPanes).length,
                places  : Object.keys(snapshot.lifecycle.tearOutPlacements).length,
                popups  : snapshot.popupUrls.length,
                rendered: snapshot.mainRenderCount
            }
        }, {
            intervals: [100, 250],
            timeout  : 10000
        }).toEqual({connects: 0, homes: 1, panes: 0, places: 0, popups: 0, rendered: 1});

        const returnedBeforePersist = await getTerminalSnapshot(page, app, wsId);

        await persistDockReceipt(app, wsId, 'Row7DropReturned', returnedBeforePersist.lifecycle.dockModel);

        const returned = await getTerminalSnapshot(page, app, wsId);

        expectNoTearOutResidue(returned);
        expect(returned.lifecycle.dockModel).toEqual(returnedBeforePersist.lifecycle.dockModel);
        expect(returned.lifecycle.tearOutAcquisitionAttempts).toBe(1);
        expect(returned.pane).toEqual({
            id        : before.pane.id,
            mountCount: before.pane.mountCount + 2,
            mounted   : true,
            windowId  : before.pane.windowId
        });

        await app.callMethod(wsId, 'onWindowDisconnect', [{windowId: vesselWindowId}]);

        expect(await getTerminalSnapshot(page, app, wsId)).toEqual(returned);
        expectNoRuntimeErrors(ledger);

        console.log('ROW7-DROP-RECEIPT', JSON.stringify({
            acquisitionAttempts: returned.lifecycle.tearOutAcquisitionAttempts,
            mountCounts        : [before.pane.mountCount, committed.pane.mountCount, returned.pane.mountCount],
            paneId             : before.pane.id,
            vesselWindowId
        }))
    });

    test('row 7 — post-birth cancel restores the same pane and cleans once', async ({page, neuralLink}) => {
        const ledger      = await installErrorLedger(page, '__recordMatrixRow7Cancel');
        const {app, wsId} = await bootDemoB(page, neuralLink);
        const before      = await getTerminalSnapshot(page, app, wsId);

        const result = await app.callMethod(wsId, 'executeTearOutStep', [{
            itemId      : 'workbench',
            sourceNodeId: 'workbench-tabs'
        }, {cancel: true, postBirthMoves: 4}]);

        expect(result).toMatchObject({
            applied  : false,
            cancelled: true,
            errors   : [],
            proof    : {
                born              : true,
                cancellation      : {escapeDispatched: true, releaseDispatched: true, settled: true},
                documentsUnchanged: true,
                survivedProbe     : true
            }
        });

        await expect.poll(async () => {
            const snapshot = await getTerminalSnapshot(page, app, wsId);

            return {
                active : snapshot.lifecycle['tearOutHandlers.activeVessel'],
                panes  : Object.keys(snapshot.lifecycle.tearOutPanes).length,
                popups : snapshot.popupUrls.length,
                windows: snapshot.homeCount
            }
        }, {
            intervals: [100, 250],
            timeout  : 10000
        }).toEqual({active: null, panes: 0, popups: 0, windows: 1});

        await persistDockReceipt(app, wsId, 'Row7Cancel', before.lifecycle.dockModel);

        const cancelled = await getTerminalSnapshot(page, app, wsId);

        expect(result.proof.documentBefore).toEqual(before.lifecycle.dockModel);
        expect(result.proof.documentAfter).toEqual(before.lifecycle.dockModel);
        expectNoTearOutResidue(cancelled);
        expect(cancelled.lifecycle.dockModel).toEqual(before.lifecycle.dockModel);
        expect(cancelled.lifecycle.tearOutAcquisitionAttempts).toBe(1);
        expect(cancelled.pane).toEqual({
            id        : before.pane.id,
            mountCount: before.pane.mountCount + 2,
            mounted   : true,
            windowId  : before.pane.windowId
        });
        expect(ledger.popupPages).toHaveLength(1);
        expect(ledger.popupPages[0].isClosed()).toBe(true);

        expect(await app.callMethod(wsId, 'tearOutHandlers.onDockTearOutCancel', [{
            itemId: 'workbench'
        }])).toBe(false);
        expect(await getTerminalSnapshot(page, app, wsId)).toEqual(cancelled);
        expectNoRuntimeErrors(ledger);

        console.log('ROW7-CANCEL-RECEIPT', JSON.stringify({
            acquisitionAttempts: cancelled.lifecycle.tearOutAcquisitionAttempts,
            mountCounts        : [before.pane.mountCount, cancelled.pane.mountCount],
            paneId             : before.pane.id,
            popupClosed        : ledger.popupPages[0].isClosed()
        }))
    });

    test('row 7 — blocked acquisition cleans once without a model commit', async ({page, neuralLink}) => {
        const ledger = await installErrorLedger(page, '__recordMatrixRow7Blocked');

        await page.context().addInitScript(() => {
            const nativeOpen = globalThis.open;

            globalThis.__matrixRow7BlockOpen = false;
            globalThis.__matrixRow7OpenCalls = [];
            globalThis.open = function(url, target, features) {
                const blocked = globalThis.__matrixRow7BlockOpen && url === 'about:blank';

                globalThis.__matrixRow7OpenCalls.push({
                    blocked,
                    features: String(features ?? ''),
                    target  : String(target ?? ''),
                    url     : String(url ?? '')
                });

                if (blocked) return null;

                return nativeOpen.call(this, url, target, features)
            }
        });

        const {app, wsId} = await bootDemoB(page, neuralLink);
        const before      = await getTerminalSnapshot(page, app, wsId);

        await page.evaluate(() => {
            globalThis.__matrixRow7BlockOpen = true
        });

        const result = await app.callMethod(wsId, 'executeTearOutStep', [{
            itemId      : 'workbench',
            sourceNodeId: 'workbench-tabs'
        }, {postBirthMoves: 4}]);

        const openCalls = await page.evaluate(() => globalThis.__matrixRow7OpenCalls);

        expect(result.applied).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('tear-out vessel was not born after the boundary exit');
        expect(result.proof).toMatchObject({
            armed       : true,
            born        : false,
            cancellation: {escapeDispatched: true, releaseDispatched: true, settled: true}
        });

        expect(openCalls.length).toBeGreaterThan(0);
        expect(openCalls.every(call => call.blocked && call.url === 'about:blank' && call.target)).toBe(true);

        await persistDockReceipt(app, wsId, 'Row7Blocked', before.lifecycle.dockModel);

        const blocked = await getTerminalSnapshot(page, app, wsId);

        expectNoTearOutResidue(blocked);
        expect(blocked.lifecycle.dockModel).toEqual(before.lifecycle.dockModel);
        expect(blocked.lifecycle.tearOutAcquisitionAttempts).toBe(openCalls.length);
        expect(blocked.pane).toEqual(before.pane);
        expect(ledger.popupPages).toEqual([]);

        expect(await app.callMethod(wsId, 'tearOutHandlers.onDockTearOutCancel', [{
            itemId: 'workbench'
        }])).toBe(false);
        expect(await getTerminalSnapshot(page, app, wsId)).toEqual(blocked);
        expectNoRuntimeErrors(ledger);

        console.log('ROW7-BLOCKED-RECEIPT', JSON.stringify({
            acquisitionAttempts: blocked.lifecycle.tearOutAcquisitionAttempts,
            openCalls,
            paneId             : before.pane.id
        }))
    })
});
