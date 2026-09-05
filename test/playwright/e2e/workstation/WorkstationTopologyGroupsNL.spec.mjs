import {test, expect} from '../../fixtures.mjs';

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
const bootRoot = async page => {
    await page.goto('/apps/workstation/index.html');
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
 * The live Workspace projected for one window, or `null`. A reloaded root is a new instance; the one
 * its superseded generation created stays in the worker, so the lookup is by window, never "the first".
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

test.describe('Workstation topology Groups — two roots under one SharedWorker (Neural Link)', () => {
    test.setTimeout(180000);
    test.use({viewport: {width: 1600, height: 900}});

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

        // The reloaded root is a new Workspace instance; the manager behind it is the same singleton.
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
