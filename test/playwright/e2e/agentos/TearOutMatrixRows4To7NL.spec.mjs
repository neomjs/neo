import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Headed macOS receipts for the dock-tier half of the tear-out portability matrix.
 *
 * Rows 4, 6, and 7 remain deliberately absent until their named product/test-host blockers are
 * repaired. Row 5 drives the real Demo B tear-out gesture with the Window Management permission
 * denied, then closes the native vessel and proves the complete fallback lifecycle against all
 * five universal invariants from the living matrix ledger.
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
            className: 'AgentOS.childapps.dockdemo.view.CounterPane'
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

        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=b');
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
            app        = await neuralLink.connectToApp('AgentOSDockDemo'),
            workspaces = await app.findInstances({
                className: 'AgentOS.childapps.dockdemo.view.DemoBWorkspace'
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
});
