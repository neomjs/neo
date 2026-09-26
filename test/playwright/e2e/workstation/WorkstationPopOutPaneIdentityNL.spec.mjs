import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A nested pane subtree survives a REAL pop-out and return with its component, provider,
 * store and descendant identities intact.
 *
 * The three identities are deliberately separate claims, because they fail separately. A hop that
 * rebuilt the component would break every one of them at once and is the easy case. The interesting
 * failures are quieter: a pane that keeps its own id while its `state.Provider` is re-resolved in the
 * popup reads different truth from the same expression, and a pane that keeps component AND provider
 * while its `data.Store` is re-created shows the same rows re-fetched rather than the rows the user
 * was looking at. Asserting only the component id certifies none of that.
 *
 * The witness is the Feed pane — a `grid.Container` whose item tree carries real descendants — rather
 * than a leaf panel, because "the same instance made the hop" is trivially true for a component with
 * nothing under it. The descendant census is what makes the subtree claim non-vacuous, and it is read
 * from the App Worker's own instance graph, not from DOM: DOM nodes are necessarily rebuilt in the
 * target document, so a DOM-identity claim would be false by construction and a DOM-count claim
 * proves only that something rendered.
 *
 * Native close returns the popup's panes in one Group transaction; reload keeps the popup.
 * The return and its undo/redo must preserve the same live subtree.
 *
 * Requires a Neural Link runtime root:
 *
 *      NEO_AGENTOS_RUNTIME_ROOT=<neo-agent-brain> \
 *      npx playwright test workstation/WorkstationPopOutPaneIdentityNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * Without it `playwright.config.e2e.mjs` EXCLUDES every neuralLink-fixture spec from selection, so
 * the command selects zero tests and reports success.
 */
const
    ACTION     = '.neo-toolbar-action',
    FEED_ITEM  = 'feed',
    FEED_TITLE = 'Live Event Stream',
    HEADER     = '.neo-tab-header-toolbar',
    POP_OUT    = 'window-restore',
    TAB        = '.neo-tab-header-button';

/**
 * @summary Asserts that every descendant of `before` is still the same instance in `after`.
 *
 * The grid body pools its row components by the height it paints in, so a taller window adds rows:
 * the rest of the subtree must match exactly, and every pooled row that existed before must survive.
 * @param {String[]} after
 * @param {String[]} before
 * @param {String} message
 */
const expectSameInstances = (after, before, message) => {
    const isPooledRow = id => /__row-\d+$/.test(id);

    expect(after.filter(id => !isPooledRow(id)), message).toEqual(before.filter(id => !isPooledRow(id)));
    expect(after, `${message}, pooled rows included`).toEqual(expect.arrayContaining(before))
};

/**
 * @summary The identity triple plus the descendant census, read from the App Worker instance graph.
 * @param {Object} app Neural Link app wrapper.
 * @param {String} paneId
 * @returns {Promise<{componentId: String, providerId: String|null, storeId: String|null, descendants: String[]}>}
 */
const readIdentity = async (app, paneId) => {
    const props    = await app.getComponent(paneId, ['id', 'store.id']),
          provider = await app.callMethod(paneId, 'getStateProvider'),
          response = await app.getComponentTree(paneId, -1, true),
          // The service answers `{tree: node}`; the node itself is `{className, id, items?}`.
          // Walking the envelope instead of the node yields an empty census that reads exactly like
          // a leaf — which is why the subtree guard below exists at all.
          root     = response?.tree ?? response;

    /** Every id under the pane, the pane itself excluded — the subtree the claim is about. */
    const walk = node => node ? [node.id, ...(node.items || []).flatMap(walk)] : [];

    return {
        componentId: props.id,
        descendants: walk(root).filter(id => id && id !== paneId).sort(),
        providerId : provider?.id ?? provider?.properties?.id ?? null,
        storeId    : props['store.id'] ?? null
    }
};

test.describe('Workstation pop-out — default affordances and retained pane identities', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1600}});

    test('a full popup paints default target affordances through Neural Link hover dispatch', async ({page, context, neuralLink}, testInfo) => {
        await page.goto('/apps/workstation/index.html');
        const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: 'Metrics'})}).first();
        await expect(header).toBeVisible({timeout: 60000});
        await header.locator(TAB, {hasText: 'Metrics'}).click();

        const app          = await neuralLink.connectToApp('Workstation'),
              popupPromise = context.waitForEvent('page', {timeout: 45000});
        await header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first().click();
        const vessel = await popupPromise;

        try {
            await expect(vessel.locator(TAB, {hasText: 'Metrics'})).toBeVisible({timeout: 45000});

            const popups = await app.findInstances({className: 'Workstation.view.PopupWorkspace'}, ['id', 'windowId', 'dockModel']);
            expect(popups).toHaveLength(1);
            const popup        = await app.getComponent(popups[0].id, ['id', 'windowId', 'dockModel']),
                  participants = await app.findInstances({ntype: 'dock-crosswindow-participation', windowId: popup.windowId}, ['id']);
            expect(participants).toHaveLength(1);

            const participationId = participants[0].id,
                  hostRect        = await vessel.locator(`#${popup.id}`).boundingBox(),
                  payload         = {
                      draggedItem: {dockItemId: 'audit'},
                      localX     : hostRect.x + hostRect.width / 2,
                      localY     : hostRect.y + hostRect.height / 2
                  };

            await expect.poll(async () => (await app.callMethod(participationId, 'defaultPreviewFor', [payload]))?.feedback?.state,
                {message: 'the default target accepts a hover after real geometry settles', timeout: 15000}).toBe('accepted');

            const owned  = await app.getComponent(participationId, ['ownedPreview.id', 'ownedIndicators.id']),
                  menu   = vessel.locator(`#${owned['ownedIndicators.id']}`),
                  region = vessel.locator(`#${owned['ownedPreview.id']} .neo-dock-preview-affordance`);

            await expect(menu.locator('.neo-dashboard-dock-drop-indicator:not(.neo-dashboard-dock-drop-indicator-off)')).toHaveCount(5);
            await expect(menu).toBeVisible();
            await expect(region, 'an accepted preview is painted, not only returned').toBeVisible();

            const top      = await menu.locator('.neo-dashboard-dock-drop-indicator-top').boundingBox(),
                  selected = await app.callMethod(participationId, 'defaultPreviewFor', [{
                      ...payload, localX: top.x + top.width / 2, localY: top.y + top.height / 2
                  }]);
            expect(selected.placement.kind).toBe('edge-top');
            await expect(region).toHaveClass(/neo-dock-preview-edge-top/);
            expect((await app.getComponent(popup.id, ['dockModel'])).dockModel).toEqual(popup.dockModel);

            await testInfo.attach('popup-default-affordances', {body: await vessel.screenshot(), contentType: 'image/png'});
            await app.callMethod(participationId, 'defaultClearPreview');
            await expect(region).toHaveCount(0);
            await expect(menu).toBeHidden();
            testInfo.annotations.push({
                type       : 'evidence-boundary',
                description: 'Real header pop-out and painted popup; default hover dispatched through Neural Link. No full human drag or transfer claim.'
            })
        } finally {
            !vessel.isClosed() && await vessel.close()
        }
    });

    test('closing a multi-pane popup after opener reload returns every pane in one Group row', async ({page, context, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: FEED_TITLE})}).first();
        await expect(header).toBeVisible({timeout: 60000});
        await header.locator(TAB, {hasText: FEED_TITLE}).click();
        const app          = await neuralLink.connectToApp('Workstation'),
              roots        = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              workspaceId  = roots[0].id,
              items        = [FEED_ITEM, 'metrics', 'audit'],
              identities   = await Promise.all(items.map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id]))),
              popupPromise = context.waitForEvent('page');
        await header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).click();
        const popup = await popupPromise;

        try {
            await expect(popup.locator(`#${identities[0]}`)).toBeVisible({timeout: 30000});
            const topology      = await app.callMethod(workspaceId, 'controller.getTopologyState'),
                  popupKey      = Object.keys(topology.workspaceHosts)[0],
                  popupDocument = topology.snapshot.participants[popupKey],
                  tabsNodeId    = Object.entries(popupDocument.nodes).find(([, node]) => node.type === 'tabs')[0];

            for (const itemId of items.slice(1)) {
                expect(await app.callMethod(workspaceId, 'commitCrossWindowTransfer', [{
                    sourceWorkspaceId: 'workstation-main', targetWorkspaceId: popupKey,
                    descriptor       : {
                        operation        : 'transferItem', itemId,
                        sourceWorkspaceId: 'workstation-main', targetWorkspaceId: popupKey,
                        target           : {operation: 'addTab', tabsNodeId}
                    }
                }])).toBe(true)
            }
            await expect(popup.locator(`#${identities.at(-1)}`), 'the final transferred pane is rendered before opener reload').toBeVisible();
            expect(await Promise.all(items.map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id]))),
                'the three transfers retain every original instance').toEqual(identities);
            await app.callMethod(workspaceId, 'commitLocalWorkspaceOperation', ['workstation-main', {
                operation: 'setActiveItem', tabsNodeId: 'heavy-tabs', itemId: 'activity'
            }]);
            await page.reload();
            await expect(page.locator('.workstation-dock-host')).toBeVisible({timeout: 30000});
            expect(await Promise.all(items.map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id]))),
                'opener reload retains every popup instance before close').toEqual(identities);
            await app.callMethod(workspaceId, 'transactionManager.set', [{reconnectLeaseMs: 3000}]);
            const beforeClose = await app.callMethod(workspaceId, 'controller.getTopologyState');
            await popup.close({runBeforeUnload: true});
            await expect.poll(async () => {
                const state = await app.callMethod(workspaceId, 'controller.getTopologyState');
                return items.filter(id => state.snapshot.participants['workstation-main'].items[id])
            }, {timeout: 15000, message: 'the expired reconnect lease recovers every pane after opener handle loss'}).toEqual(items);

            const returned = await app.callMethod(workspaceId, 'controller.getTopologyState');
            expect(returned.historyCount).toBe(beforeClose.historyCount + 1);
            expect(returned.snapshot.participants[popupKey].items).toEqual({});
            expect(returned.snapshot.participants['workstation-main'].nodes['heavy-tabs'].activeItemId).toBe('activity');
            expect(await Promise.all(items.map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id])))).toEqual(identities)
        } finally {
            !popup.isClosed() && await popup.close({runBeforeUnload: true})
        }
    });

    test('component, provider, store and descendant identities survive pop-out AND return', async ({page, context, neuralLink}, testInfo) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const app         = await neuralLink.connectToApp('Workstation'),
              workspaces  = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              workspaceId = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(workspaceId, 'the App Worker owns one Workstation workspace').toBeTruthy();

        const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: FEED_TITLE})}).first();

        await expect(header, 'the Feed pane must have a projected tab header').toBeVisible({timeout: 30000});
        await header.locator(TAB, {hasText: FEED_TITLE}).first().click();

        const paneId = await app.callMethod(workspaceId, 'getPaneIdentity', [FEED_ITEM]);

        expect(paneId, 'the Feed pane owns a live instance before the gesture').toBeTruthy();

        const before      = await readIdentity(app, paneId),
              beforeModel = (await app.getComponent(workspaceId, ['dockModel'])).dockModel;

        // The arm is only meaningful over a real subtree; a leaf would make every claim below
        // trivially true. This is the census the identity assertions are measured against.
        expect(before.descendants.length, 'the Feed pane is a real subtree, not a leaf').toBeGreaterThan(0);
        expect(before.providerId, 'the pane resolves a state provider in the opener').toBeTruthy();
        expect(before.storeId, 'the Feed grid owns a store in the opener').toBeTruthy();

        const popOut = header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first();

        await expect(popOut, 'the Feed pane offers the pop-out action').toBeVisible({timeout: 10000});

        // Subscribed before the click: the vessel can open faster than the next await.
        const vesselPromise = context.waitForEvent('page', {timeout: 45000});

        let vessel, reopened;

        try {
            await popOut.click();

            vessel = await vesselPromise;

            await vessel.waitForLoadState('domcontentloaded');
            await vessel.waitForSelector('.workstation-viewport', {timeout: 45000});

            expect(new URL(vessel.url()).searchParams.get('popout'), 'the vessel carries the Feed identity').toBe(FEED_ITEM);
            await expect(vessel.locator(`#${paneId}`), 'the popup adopts the exact live pane').toBeVisible({timeout: 30000});
            await expect(page.locator(`#${paneId}`), 'and the opener released it').toHaveCount(0);

            const detached = await readIdentity(app, paneId);

            expect(detached.componentId, 'the SAME component made the hop').toBe(before.componentId);
            expect(detached.providerId, 'and it resolves the SAME provider from inside the popup').toBe(before.providerId);
            expect(detached.storeId, 'and its store was not re-created').toBe(before.storeId);
            expectSameInstances(detached.descendants, before.descendants, 'and every descendant travelled as the same instance');

            const detachedGroup = await app.callMethod(workspaceId, 'controller.getTopologyState');

            expect(Object.keys(detachedGroup.workspaceHosts), 'one popup Workspace holds the pane').toHaveLength(1);
            await vessel.reload();
            await expect(vessel.locator(`#${paneId}`), 'reload retains the same pane in its popup').toBeVisible({timeout: 30000});
            expect((await app.callMethod(workspaceId, 'controller.getTopologyState')).snapshot,
                'reload is not a close-return transaction').toEqual(detachedGroup.snapshot);
            await vessel.close({runBeforeUnload: true});

            await expect.poll(() => vessel.isClosed(), {
                message: 'the native popup closes',
                timeout: 15000
            }).toBe(true);

            await expect.poll(async () => {
                const state = await app.getComponent(workspaceId, ['dockModel']);

                return Object.values(state.dockModel.nodes)
                    .some(node => node.type === 'tabs' && node.items?.includes(FEED_ITEM))
            }, {
                intervals: [50, 100, 250],
                message  : 'native close returns the pane to main without an undo command',
                timeout  : 15000
            }).toBe(true);

            const returnedGroup = await app.callMethod(workspaceId, 'controller.getTopologyState');

            expect(returnedGroup.historyCount, 'native close adds one Group row').toBe(detachedGroup.historyCount + 1);
            expect((await app.getComponent(workspaceId, ['dockModel'])).dockModel,
                'native close restores the surviving home').toEqual(beforeModel);

            await expect(page.locator(`#${paneId}`), 'the exact live pane returns to the main window').toBeVisible({timeout: 30000});

            const returned = await readIdentity(app, paneId);

            expect(returned.componentId, 'the SAME component came home').toBe(before.componentId);
            expect(returned.providerId, 'resolving the SAME provider again').toBe(before.providerId);
            expect(returned.storeId, 'with its store intact — not re-created on the way back').toBe(before.storeId);
            expectSameInstances(returned.descendants, before.descendants, 'and the whole subtree returned as the same instances');

            const reopenedPromise = context.waitForEvent('page', {timeout: 30000});
            await app.callMethod(workspaceId, 'transactionManager.undo', [{groupId: detachedGroup.groupId}]);
            reopened = await reopenedPromise;
            await expect(reopened.locator(`#${paneId}`), 'undo reopens the popup with the same pane').toBeVisible({timeout: 30000});
            expect((await app.callMethod(workspaceId, 'controller.getTopologyState')).snapshot.participants)
                .toEqual(detachedGroup.snapshot.participants);
            await app.callMethod(workspaceId, 'transactionManager.redo', [{groupId: detachedGroup.groupId}]);
            await expect.poll(() => reopened.isClosed(), {timeout: 15000}).toBe(true);
            await expect(page.locator(`#${paneId}`), 'redo returns the same pane again').toBeVisible();
            expect((await app.callMethod(workspaceId, 'controller.getTopologyState')).historyCount)
                .toBe(returnedGroup.historyCount);

            // The receipt carries its own magnitudes, so a reader never has to take "passed" as the
            // measurement. A census of one would satisfy every assertion above and mean nothing.
            testInfo.annotations.push({
                type       : 'ac-4-identity-receipt',
                description: `component ${before.componentId} · provider ${before.providerId} · store ${before.storeId} · ${before.descendants.length} descendants, each the same instance after pop-out (${detached.descendants.length} there) and return (${returned.descendants.length})`
            })
        } finally {
            reopened && !reopened.isClosed() && await reopened.close({runBeforeUnload: true});
            vessel && !vessel.isClosed() && await vessel.close()
        }

        expect(pageErrors, 'the journey raises no page errors').toEqual([])
    })
});
