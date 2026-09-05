import {test, expect} from '../../fixtures.mjs';
import Operations     from '../../../../src/dashboard/dock/model/Operations.mjs';
import Persistence    from '../../../../src/dashboard/dock/model/Persistence.mjs';

/**
 * @summary Whitebox E2E witness: two Workstation roots under one SharedWorker are two logical topology
 * Groups; a root and the vessel it pops out share one; reloading a root moves its own generation and
 * touches nothing else.
 *
 * Both roots boot the same app under the same name in the same App Worker — the case in which the app
 * name cannot identify a topology, and the case the manager exists for. Root A is the full Workstation.
 * Root B boots the same document in its pane-host mode (`?popout=<item>`) with no opener and no carrier:
 * the same app, the same SharedWorker, its own window, admitted as a root of its own — nothing reserved
 * a slot for it, so it is not a vessel of A. It carries no dock, and that is deliberate: two FULL roots
 * in one headless harness process crash the shared worker on `dev` as on this branch (measured on both
 * trees; real Chrome runs them side by side), so the falsifier's second root is the lightest boot that is
 * still a second Workstation window.
 *
 * Every window's identity is read where the engine keeps it: the `sessionStorage` carrier the worker
 * writes back on admission, and the manager's bindings, read through root A's live Workspace over the
 * Neural Link. The vessel is a REAL popup the pop-out action opens; its carrier was written by the opener
 * before the child navigated, so nothing about the owner is in its URL.
 *
 * The reload is the falsifier: the reloaded root presents the carrier it kept, rebinds its own slot at
 * the next generation, and root B, the popup's binding and the number of Groups are unchanged; the
 * superseded generation holds nothing.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> \
 *      npx playwright test workstation/WorkstationTopologyGroupsNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture spec
 * without it, so the command selects ZERO tests and reports success.
 */
const
    ACTION     = '.neo-toolbar-action',
    CARRIER    = 'neo-topology-identity',
    FEED_TITLE = 'Live Event Stream', // the Feed pane's tab title in the Workstation's boot document
    HEADER     = '.neo-tab-header-toolbar',
    PANE_HOST  = '.workstation-popout-host',
    POP_OUT    = 'window-restore',
    TAB        = '.neo-tab-header-button',
    WORKSPACE  = 'Workstation.view.Workspace';

/** The identity a window carries across its own reloads, as the worker wrote it. */
const readCarrier = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), CARRIER);

/** A window's runtime generation, read where `Main.mjs` reads it. */
const readWindowId = page => page.evaluate(() => Neo.worker.Manager.windowId);

/** Boots the full Workstation in a page and waits for its dock to project. */
const bootRoot = async (page, search = '') => {
    await page.goto(`/apps/workstation/index.html${search}`);
    await page.waitForSelector('.workstation-dock-host',               {timeout: 60000});
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000})
};

/** Boots the Workstation's pane-host mode with no opener: a second root of the same app, carrying no dock. */
const bootPaneHost = async page => {
    await page.goto('/apps/workstation/index.html?popout=alerts');
    await page.waitForSelector(PANE_HOST, {timeout: 60000});
    await page.waitForFunction(() => Boolean(window.Neo?.worker?.Manager?.windowId), null, {timeout: 60000})
};

/**
 * The live Workspace projected for one window, or `null`. Warm reload moves its retained owner to the
 * successor window, so the lookup is by current window, never "the first".
 */
const workspaceFor = async (app, windowId) => {
    const records = await app.findInstances({className: WORKSPACE}, ['id', 'windowId']);

    return (Array.isArray(records) ? records : [records]).filter(Boolean)
        .map(record => ({...(record.properties ?? record), id: record.id ?? record.properties?.id}))
        .find(workspace => workspace.windowId === windowId)?.id ?? null
};

/** The manager's own record, read through a live Workspace's reference to the worker-wide singleton. */
const managerOf = (app, workspaceId) => ({
    binding   : windowId => app.callMethod(workspaceId, 'transactionManager.findByWindow', [windowId]),
    groupCount: async () => (await app.getComponent(workspaceId, ['transactionManager.items.length']))['transactionManager.items.length']
});

/**
 * Clicks a pane's tab by its title, which is how a user gives that pane focus, and returns the tab
 * header toolbar that carries it — the surface the focus-gated action set renders into.
 */
const focusPane = async (page, title) => {
    const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: title})}).first();

    await expect(header, `${title} must have a projected tab header`).toBeVisible({timeout: 30000});
    await header.locator(TAB, {hasText: title}).first().click();

    return header
};

/** @summary Reads the worker's semantic boot receipt without inspecting projection internals. */
const topologyState = (app, workspaceId) => app.callMethod(workspaceId, 'controller.getTopologyState');

/** @summary Resolves the exact App Worker, including remotes which return a reply envelope. */
const readWorkerId = async page => {
    let workerId;
    await expect.poll(async () => {
        const reply = await page.evaluate(async () => {
            const appWorker = window.Neo?.worker?.App;
            return appWorker?.getWorkerId ? await appWorker.getWorkerId() : null
        });
        workerId = typeof reply === 'string' ? reply : reply?.data;
        return typeof workerId === 'string' && workerId.length > 0
    }, {message: 'the exact App Worker remote is ready', timeout: 30000}).toBe(true);

    return workerId
};

/** @summary Creates a page with its prior session carrier, leaving popup reservation carriers untouched. */
const carriedPage = async (context, carrier) => {
    const page = await context.newPage();

    await page.addInitScript(({key, identity}) => {
        if (location.protocol === 'http:' || location.protocol === 'https:') {
            if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(identity))
        }
    }, {key: CARRIER, identity: carrier});
    return page
};

/**
 * @summary Saves two finite topologies through the live library's real IndexedDB adapter.
 * @description A retains the original composition; B moves the real Feed record to keyed details.
 * B is explicitly active although A was inserted first. No live document is hand-constructed.
 */
const savedColdFixture = async (page, context, neuralLink) => {
    await bootRoot(page);
    const app         = await neuralLink.connectToApp('Workstation'),
          workspaceId = await workspaceFor(app, await readWindowId(page)),
          carrier     = await readCarrier(page),
          document    = (await app.getComponent(workspaceId, ['dockModel'])).dockModel,
          empty       = {
              schema: 'neo.dock.zone.v1', root: 'details-root', items: {},
              nodes : {
                  'details-root': {type: 'edge-zone', zones: {center: {nodeId: 'details-tabs'}}},
                  'details-tabs': {type: 'tabs', items: [], activeItemId: null}
              }
          },
          moved = Operations.transferItem(document, empty, {
              itemId: 'feed', sourceWorkspaceId: 'workstation-main', targetWorkspaceId: 'details',
              target: {operation: 'addTab', tabsNodeId: 'details-tabs'}
          });

    expect(moved.errors).toEqual([]);
    const a = Persistence.captureTopologyPerspective({'workstation-main': document}, {layoutId: 'layout-a'}),
          b = Persistence.captureTopologyPerspective({'workstation-main': moved.sourceDocument, details: moved.targetDocument}, {
              layoutId      : 'layout-b',
              placementHints: {details: {dx: 240, dy: 80, fallbackTarget: {workspaceKey: 'workstation-main', nodeId: 'root'}}}
          });
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    const saved = Persistence.createTopologyCollection([a.topology, b.topology], {activeLayoutId: 'layout-b'});
    expect(saved.errors).toEqual([]);

    await app.callMethod(workspaceId, 'topologyLibrary.persist');
    expect(await app.callMethod(workspaceId, 'topologyLibrary.adoptCollection', [saved.collection])).toMatchObject({adopted: true, errors: []});
    expect(await app.callMethod(workspaceId, 'topologyLibrary.persist')).toMatchObject({persisted: true, current: true, errors: []});

    const popupCarrier = await app.callMethod(workspaceId, 'transactionManager.reserve', [{groupId: carrier.groupId, workspaceKey: 'details'}]);
    return {
        carrier, popupCarrier, sessionId: app.sessionId,
        storageState: await context.storageState({indexedDB: true}),
        records     : {a: a.topology, b: b.topology}
    }
};

/** @summary Boots a carried root and identity-binds NL after the original fixture page was closed. */
const coldRoot = async (context, neuralLink, carrier, search = '') => {
    const page = await carriedPage(context, carrier);
    await bootRoot(page, search);
    const app      = await neuralLink.connectToApp(await readWorkerId(page)),
          windowId = await readWindowId(page);
    await expect.poll(() => workspaceFor(app, windowId), {timeout: 15000}).toBeTruthy();
    return {page, app, workspaceId: await workspaceFor(app, windowId)}
};

/** @summary Verifies semantic cold materialization and the atomic writer's empty-history baseline. */
const expectColdTopology = async (root, record) => {
    const state      = await topologyState(root.app, root.workspaceId),
          collection = (await root.app.getComponent(root.workspaceId, ['topologyLibrary.collection']))['topologyLibrary.collection'];
    expect(state.workspaceKeys.slice().sort()).toEqual(Object.keys(record.workspaces).sort());
    expect(state.snapshot?.participants, 'cold truth was published through the atomic Group writer').toEqual(record.workspaces);
    expect(state.historyCount).toBe(0);
    expect(state.historyCursor).toBe(-1);
    expect(collection.activeLayoutId).toBe(record.layoutId);
    expect(Object.keys(collection.topologies).sort()).toEqual(['layout-a', 'layout-b']);
    expect(await root.app.callMethod(root.workspaceId, 'getDockTopologyWorkspaces')).toEqual(record.workspaces);
    return state
};

test.describe('Workstation topology Groups — two roots under one SharedWorker (Neural Link)', () => {
    test.setTimeout(180000);
    test.use({viewport: {width: 1600, height: 900}});

    test('warm F5 preserves the Workspace and its live panes while the Group rebinds', async ({page, context, neuralLink}) => {
        const keeper = await context.newPage();

        await bootRoot(page);
        await bootPaneHost(keeper);

        const app      = await neuralLink.connectToApp('Workstation'),
              windowId = await readWindowId(page),
              carrier  = await readCarrier(page),
              before   = await workspaceFor(app, windowId);

        expect(before, 'the first root has a live Workspace').toBeTruthy();

        const initial = (await app.getComponent(before, ['dockModel'])).dockModel,
              first   = structuredClone(initial), second = structuredClone(initial);
        first.items.feed.title = 'Retained history first';
        second.items.feed.title = 'Retained history second';
        expect(await app.callMethod(before, 'transactionManager.setHistoryDepth', [{groupId: carrier.groupId, depth: 5}])).toBe(true);
        for (const candidate of [first, second]) {
            await app.callMethod(before, 'workspaceSet.write', [{'workstation-main': candidate}, {
                cause: 'warm-reload-witness', provenance: {source: 'test'}, descriptor: {operation: 'applyDocument'}
            }])
        }
        await app.callMethod(before, 'transactionManager.undo', [{groupId: carrier.groupId}]);

        const paneId     = await app.callMethod(before, 'getPaneIdentity', ['feed']),
              pane       = await app.getComponent(paneId, ['cls']),
              document   = (await app.getComponent(before, ['dockModel'])).dockModel,
              groupState = await topologyState(app, before);
        expect(groupState.historyCount).toBe(2);
        expect(groupState.historyCursor, 'one retained row is undone, so redo remains available').toBe(0);
        expect(groupState.snapshot.participants['workstation-main']).toEqual(first);
        expect(document).toEqual(first);

        // Instance state distinguishes reuse from recreating a component under the same id.
        await app.setProperties(paneId, {cls: [...(pane.cls ?? []), 'reload-retained-witness']});
        await expect(page.locator('.reload-retained-witness')).toBeVisible();

        await page.reload();
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});

        const nextWindowId = await readWindowId(page);

        expect(nextWindowId).not.toBe(windowId);
        expect(await readCarrier(page), 'the Group carrier is the unchanged positive control').toEqual(carrier);
        await expect.poll(() => workspaceFor(app, nextWindowId), {timeout: 15000}).toBeTruthy();

        const after = await workspaceFor(app, nextWindowId);

        expect(after, 'warm reload reuses the worker-owned Workspace').toBe(before);
        expect(await app.callMethod(after, 'getPaneIdentity', ['feed']), 'the live pane is not recreated').toBe(paneId);
        expect((await app.getComponent(paneId, ['cls'])).cls).toContain('reload-retained-witness');
        expect((await app.getComponent(after, ['dockModel'])).dockModel).toEqual(document);
        expect(await topologyState(app, after), 'warm rebind changes neither library version nor Group history/snapshot').toEqual(groupState);
        await expect(page.locator('.reload-retained-witness')).toBeVisible();

        await app.callMethod(after, 'transactionManager.redo', [{groupId: carrier.groupId}]);
        expect((await app.getComponent(after, ['dockModel'])).dockModel).toEqual(second);
        expect((await topologyState(app, after)).historyCursor).toBe(1);
        expect(await app.callMethod(after, 'getPaneIdentity', ['feed'])).toBe(paneId);

        await keeper.close()
    });

    test('cold active selection hydrates keyed truth, survives popup refusal and F5, and saves another cold round-trip', async ({page, context, browser, baseURL, neuralLink}) => {
        test.setTimeout(300000);
        const seed = await savedColdFixture(page, context, neuralLink), contexts = [];
        await context.close();

        try {
            const coldContext = await browser.newContext({baseURL, storageState: seed.storageState, viewport: {width: 1600, height: 900}});
            contexts.push(coldContext);
            const root = await coldRoot(coldContext, neuralLink, seed.carrier);
            expect(root.app.sessionId, 'cold restore has a new App Worker').not.toBe(seed.sessionId);
            const hydrated = await expectColdTopology(root, seed.records.b);
            expect(coldContext.pages(), 'semantic hydrate opens no popup').toHaveLength(1);
            expect(hydrated.workspaceHosts.details.hostId).toBeNull();

            await root.page.setViewportSize({width: 800, height: 900});
            const recoveryButtons = ['Save workspace', 'Close workspace', 'Open details as window', 'Show details here']
                .map(name => root.page.getByRole('button', {name, exact: true}));
            for (const button of recoveryButtons) await expect(button).toBeVisible();
            await expect.poll(async () => {
                const boxes = await Promise.all(recoveryButtons.map(button => button.boundingBox()));
                return boxes.every(box => box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 800 && box.y + box.height <= 900)
            }, {message: 'all recovery actions remain inside the narrow viewport'}).toBe(true);
            const topologyToolbar = root.page.locator('.neo-toolbar').filter({has: recoveryButtons[0]}),
                  dock            = root.page.locator('.workstation-dock-host');
            await expect.poll(async () => (await topologyToolbar.boundingBox())?.height, {
                message: 'the topology toolbar stays compact at 800px'
            }).toBeLessThanOrEqual(96);
            await expect.poll(async () => (await dock.boundingBox())?.height, {
                message: 'the dock retains at least 600px of usable height in a 900px viewport'
            }).toBeGreaterThanOrEqual(600);
            await root.page.screenshot({path: test.info().outputPath('cold-topology.png'), fullPage: true});
            await root.page.setViewportSize({width: 1600, height: 900});

            await root.page.evaluate(() => {
                window.__topologyPopupControl = {calls: 0, open: window.open};
                window.open = () => { window.__topologyPopupControl.calls++; return null }
            });
            await root.page.getByRole('button', {name: 'Open details as window', exact: true}).click();
            await root.page.waitForFunction(() => window.__topologyPopupControl.calls === 1);
            expect(coldContext.pages()).toHaveLength(1);
            expect(await root.app.callMethod(root.workspaceId, 'getDockTopologyWorkspaces'), 'native refusal keeps both keyed documents').toEqual(seed.records.b.workspaces);

            await root.page.getByRole('button', {name: 'Show details here', exact: true}).click();
            await expect.poll(async () => (await topologyState(root.app, root.workspaceId)).workspaceHosts.details.hostId).toBeTruthy();
            const inline = await topologyState(root.app, root.workspaceId),
                  paneId = await root.app.callMethod(root.workspaceId, 'getPaneIdentity', ['feed']);
            await expect(root.page.locator(`[id="${paneId}"]`), 'refusal has an inline recovery path').toBeVisible();
            await root.page.evaluate(() => { window.open = window.__topologyPopupControl.open });

            const popupPromise = coldContext.waitForEvent('page', {timeout: 45000});
            await root.page.getByRole('button', {name: 'Open details as window', exact: true}).click();
            const popup = await popupPromise;
            await expect(popup.locator(`[id="${paneId}"]`)).toBeVisible({timeout: 60000});
            const beforePopup = await topologyState(root.app, root.workspaceId), popupCarrier = await readCarrier(popup);
            expect(beforePopup.workspaceHosts.details.hostId).toBe(inline.workspaceHosts.details.hostId);
            expect(beforePopup.snapshot).toEqual(hydrated.snapshot);

            await popup.reload();
            await expect(popup.locator(`[id="${paneId}"]`)).toBeVisible({timeout: 60000});
            const afterPopup = await topologyState(root.app, root.workspaceId);
            expect(await readCarrier(popup)).toEqual(popupCarrier);
            expect(await root.app.callMethod(root.workspaceId, 'getPaneIdentity', ['feed'])).toBe(paneId);
            expect(afterPopup.workspaceHosts.details.hostId).toBe(beforePopup.workspaceHosts.details.hostId);
            expect(afterPopup.workspaceHosts.details.windowId).not.toBe(beforePopup.workspaceHosts.details.windowId);
            expect(afterPopup.libraryVersion).toBe(beforePopup.libraryVersion);
            expect(afterPopup.snapshot).toEqual(beforePopup.snapshot);
            expect(afterPopup.historyCount).toBe(beforePopup.historyCount);
            expect(afterPopup.historyCursor).toBe(beforePopup.historyCursor);

            expect(await root.app.executeDockOperation(root.workspaceId, {operation: 'setActiveItem', tabsNodeId: 'heavy-tabs', itemId: 'activity'})).toMatchObject({applied: true, errors: []});
            const changed = await root.app.callMethod(root.workspaceId, 'getDockTopologyWorkspaces');
            expect(changed['workstation-main'].nodes['heavy-tabs'].activeItemId).toBe('activity');
            await root.page.getByRole('button', {name: 'Save workspace', exact: true}).click();
            await expect.poll(async () => (await root.app.callMethod(root.workspaceId, 'topologyLibrary.persistenceAdapter.read')).topologies['layout-b'].workspaces, {timeout: 15000}).toEqual(changed);
            const savedAgain = await coldContext.storageState({indexedDB: true}), carrierAgain = await readCarrier(root.page);

            const beforeRootReload = await topologyState(root.app, root.workspaceId);
            await root.page.reload();
            await root.page.waitForSelector('.workstation-dock-host', {timeout: 60000});
            expect(await workspaceFor(root.app, await readWindowId(root.page))).toBe(root.workspaceId);
            expect(await topologyState(root.app, root.workspaceId), 'root F5 preserves truth after losing its opener registry').toEqual(beforeRootReload);

            const keeper = await coldContext.newPage();
            await bootPaneHost(keeper);
            const keeperCarrier  = await readCarrier(keeper), keeperWindowId = await readWindowId(keeper),
                  managerId      = (await root.app.getComponent(root.workspaceId, ['transactionManager.id']))['transactionManager.id'],
                  carriersAtExit = {};
            expect(keeperCarrier.groupId).not.toBe(carrierAgain.groupId);
            for (const [label, target] of [['root', root.page], ['popup', popup]]) {
                const marker = `topology-carrier-at-exit:${label}:`;
                target.on('console', message => {
                    if (message.text().startsWith(marker)) carriersAtExit[label] = JSON.parse(message.text().slice(marker.length))
                });
                await target.evaluate(({key, marker}) => {
                    window.addEventListener('beforeunload', () => console.log(marker + String(sessionStorage.getItem(key))), {once: true})
                }, {key: CARRIER, marker})
            }
            await root.page.getByRole('button', {name: 'Close workspace', exact: true}).click();
            await expect.poll(() => popup.isClosed(), {message: 'close-all reaches the retained popup through its own realm', timeout: 15000}).toBe(true);
            await expect.poll(() => root.page.isClosed() || root.page.url() === 'about:blank', {message: 'close-all ends the root document', timeout: 15000}).toBe(true);
            expect(carriersAtExit, 'every Group carrier cleared before its document left').toEqual({root: null, popup: null});
            await expect.poll(async () => (await root.app.getComponent(managerId, ['items.length']))['items.length'], {
                message: 'durable retirement after the reconnect lease leaves only the independent keeper Group', timeout: 45000
            }).toBe(1);
            expect(await root.app.findInstances({className: WORKSPACE}, ['id']), 'the retired Group disposes its retained Workspace').toEqual([]);
            expect(await readCarrier(keeper)).toEqual(keeperCarrier);
            expect(await root.app.callMethod(managerId, 'findByWindow', [keeperWindowId])).toMatchObject({groupId: keeperCarrier.groupId});
            await coldContext.close();

            const secondContext = await browser.newContext({baseURL, storageState: savedAgain, viewport: {width: 1600, height: 900}});
            contexts.push(secondContext);
            const second = await coldRoot(secondContext, neuralLink, carrierAgain);
            expect(second.app.sessionId).not.toBe(root.app.sessionId);
            await expectColdTopology(second, {...seed.records.b, workspaces: changed});
            expect(secondContext.pages()).toHaveLength(1)
        } finally {
            await Promise.allSettled(contexts.map(current => current.close()))
        }
    });

    test('a stale popup arriving first cannot choose a cold topology and the root can explicitly select the other saved layout', async ({page, context, browser, baseURL, neuralLink}) => {
        test.setTimeout(240000);
        const seed = await savedColdFixture(page, context, neuralLink);
        await context.close();
        const coldContext = await browser.newContext({baseURL, storageState: seed.storageState, viewport: {width: 1600, height: 900}});

        try {
            const stale = await carriedPage(coldContext, seed.popupCarrier);
            await stale.goto('/apps/workstation/index.html?workspace=details');
            await stale.waitForFunction(() => Boolean(window.Neo?.worker?.Manager?.windowId), null, {timeout: 60000});
            const popupApp = await neuralLink.connectToApp(await readWorkerId(stale));
            expect(popupApp.sessionId).not.toBe(seed.sessionId);
            expect(await popupApp.findInstances({className: WORKSPACE}, ['id']), 'a stale popup does not hydrate a root').toEqual([]);
            expect(await popupApp.findInstances({className: 'Neo.dashboard.dock.persistence.TopologyLibrary'}, ['id']), 'a stale popup never reads saved topology storage').toEqual([]);

            const root = await coldRoot(coldContext, neuralLink, seed.carrier, '?layout=layout-a');
            expect(root.app.sessionId, 'popup-first and root use the same fresh worker').toBe(popupApp.sessionId);
            expect(await readCarrier(root.page)).toEqual(seed.carrier);
            await expectColdTopology(root, seed.records.a);
            expect(coldContext.pages(), 'no replacement popup was opened').toHaveLength(2)
        } finally {
            await coldContext.close()
        }
    });

    test('A and its pop-out share one Group, B shares only the app name, and reloading A moves one generation and touches nothing else', async ({page, context, neuralLink}) => {
        const pageA = page,
              pageB = await context.newPage();

        await bootRoot(pageA);
        await bootPaneHost(pageB);

        const app = await neuralLink.connectToApp('Workstation'),
              aId = await readWindowId(pageA),
              bId = await readWindowId(pageB);

        expect(aId, 'root A knows its own window id').toBeTruthy();
        expect(bId, 'root B is its own window').not.toBe(aId);

        // Admission writes the minted identity back into each root's carrier.
        await expect.poll(async () => (await readCarrier(pageA))?.groupId, {message: 'root A carries a Group', timeout: 15000}).toBeTruthy();
        await expect.poll(async () => (await readCarrier(pageB))?.groupId, {message: 'root B carries a Group', timeout: 15000}).toBeTruthy();

        const carrierA = await readCarrier(pageA),
              carrierB = await readCarrier(pageB);

        expect(carrierA).toEqual({generationToken: expect.any(String), groupId: expect.any(String), workspaceKey: 'main'});
        expect(carrierB).toEqual({generationToken: expect.any(String), groupId: expect.any(String), workspaceKey: 'main'});
        expect(carrierA.groupId, 'two roots of one app are two Groups').not.toBe(carrierB.groupId);

        const workspaceA = await workspaceFor(app, aId);

        expect(workspaceA, 'root A projects a Workspace').toBeTruthy();

        let manager = managerOf(app, workspaceA);

        await expect(manager.binding(aId)).resolves.toEqual({generation: 1, groupId: carrierA.groupId, workspaceKey: 'main'});
        await expect(manager.binding(bId)).resolves.toEqual({generation: 1, groupId: carrierB.groupId, workspaceKey: 'main'});
        await expect(manager.groupCount(), 'exactly the two roots').resolves.toBe(2);

        // A pops a pane out: the reserved slot rides the opener's `windowOpen` into the child's carrier.
        const header = await focusPane(pageA, FEED_TITLE),
              popOut = header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first();

        await expect(popOut, 'the Feed pane offers the pop-out action').toBeVisible({timeout: 10000});

        // Subscribed before the click: the vessel can open faster than the next await.
        const vesselPromise = context.waitForEvent('page', {timeout: 45000});

        await popOut.click();

        const vessel = await vesselPromise;

        await vessel.waitForLoadState('domcontentloaded');
        await vessel.waitForFunction(() => Boolean(window.Neo?.worker?.Manager?.windowId), null, {timeout: 45000});

        const vesselId      = await readWindowId(vessel),
              vesselCarrier = await readCarrier(vessel);

        expect(vesselId, 'the vessel is its own window').not.toBe(aId);
        expect(vesselCarrier, 'the vessel carries a slot of A\'s Group, never the URL').toEqual({
            generationToken: expect.any(String),
            groupId        : carrierA.groupId,
            workspaceKey   : expect.stringMatching(/^popup:/)
        });
        expect([...new URL(vessel.url()).searchParams.keys()].sort(), 'the vessel URL names content and theme, never an owner').toEqual(['popout', 'theme']);

        await expect.poll(() => manager.binding(vesselId), {message: 'the vessel binds the slot A reserved', timeout: 15000})
            .toEqual({generation: 1, groupId: carrierA.groupId, workspaceKey: vesselCarrier.workspaceKey});
        await expect(manager.groupCount(), 'the vessel joined A\'s Group; nothing was minted').resolves.toBe(2);

        // The falsifier: reload A. The kept carrier rebinds A's own slot one generation on.
        await pageA.reload();
        await pageA.waitForSelector('.workstation-dock-host',               {timeout: 60000});
        await pageA.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const aId2 = await readWindowId(pageA);

        expect(aId2, 'a reload is a new runtime generation').not.toBe(aId);
        expect(await readCarrier(pageA), 'the identity survived the reload unchanged').toEqual(carrierA);

        // The reloaded root reuses its Workspace; the manager behind it is the same singleton.
        await expect.poll(() => workspaceFor(app, aId2), {message: 'the reloaded root projects a Workspace', timeout: 15000}).toBeTruthy();
        manager = managerOf(app, await workspaceFor(app, aId2));

        await expect.poll(() => manager.binding(aId2), {message: 'A rebinds its own slot at the next generation', timeout: 15000})
            .toEqual({generation: 2, groupId: carrierA.groupId, workspaceKey: 'main'});
        await expect(manager.binding(aId), 'the superseded generation holds nothing').resolves.toBeNull();
        await expect(manager.binding(bId), 'B was not touched').resolves.toEqual({generation: 1, groupId: carrierB.groupId, workspaceKey: 'main'});
        expect(await readCarrier(pageB), 'B\'s carrier was not touched').toEqual(carrierB);
        await expect(manager.binding(vesselId), 'A\'s vessel keeps its binding').resolves.toEqual({generation: 1, groupId: carrierA.groupId, workspaceKey: vesselCarrier.workspaceKey});
        expect(vessel.isClosed(), 'A\'s vessel is still open').toBe(false);
        await expect(manager.groupCount(), 'reloading A minted no Group').resolves.toBe(2);

        await vessel.close({runBeforeUnload: true});
        await pageB.close()
    })
});
