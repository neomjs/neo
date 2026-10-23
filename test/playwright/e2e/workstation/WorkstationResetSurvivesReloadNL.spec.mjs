import {test, expect} from '../../fixtures.mjs';
import Operations     from '../../../../src/dashboard/dock/model/Operations.mjs';
import Persistence    from '../../../../src/dashboard/dock/model/Persistence.mjs';

/**
 * @summary Whitebox E2E witness: **Reset to default** survives a reload while a popup's placement hint names
 * a root the reset removes.
 *
 * The stored layout is the one the bug was found in: main's root wrapped by a root-edge drop, beside a popup
 * workspace from an earlier session whose hint captured that wrapped root as its fallback. Reset commits the
 * shipped document, so the hint names a node that no longer exists. The persistence boundary refuses such a
 * hint, and before the fix the auto-save gave up silently: the reset showed on screen, and the reload brought
 * the wrapped layout back.
 *
 * Each reload is a cold boot. `page.reload()` alone keeps the dock document, because the App Worker is a
 * SharedWorker; only a new context restored from storage reads what the auto-save actually wrote. The control
 * runs the same path without the popup hint, so a pass of the hinted arm cannot be a harness that never reads
 * storage.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> \
 *      npx playwright test workstation/WorkstationResetSurvivesReloadNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const
    CARRIER   = 'neo-topology-identity',
    MAIN      = 'workstation-main',
    POPUP     = 'details',
    VIEWPORT  = {width: 1600, height: 900},
    WORKSPACE = 'Workstation.view.Workspace',
    // A retired popup's empty workspace, as Reset leaves one behind.
    EMPTY_POPUP = {
        schema: 'neo.dock.zone.v1', root: 'details-root', items: {},
        nodes : {
            'details-root': {type: 'edge-zone', zones: {center: {nodeId: 'details-tabs'}}},
            'details-tabs': {type: 'tabs', items: [], activeItemId: null}
        }
    };

/** Boots the full Workstation in a page and waits for its dock to project. */
const bootRoot = async page => {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-dock-host',               {timeout: 60000});
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000})
};

/** The topology identity a window carries across reloads; the stored layout is keyed by its Group. */
const readCarrier = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), CARRIER);

/** A window's runtime generation, read where `Main.mjs` reads it. */
const readWindowId = page => page.evaluate(() => Neo.worker.Manager.windowId);

/** The live Workspace projected for one window. */
const workspaceFor = async (app, windowId) => {
    const records = await app.findInstances({className: WORKSPACE}, ['id', 'windowId']);

    return (Array.isArray(records) ? records : [records]).filter(Boolean)
        .map(record => ({...(record.properties ?? record), id: record.id ?? record.properties?.id}))
        .find(workspace => workspace.windowId === windowId)?.id ?? null
};

/** Resolves the exact App Worker of a cold page, including remotes which return a reply envelope. */
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

/** Cold-boots the carried root in a context restored from storage and binds the Neural Link to it. */
const coldRoot = async (neuralLink, baseURL, storageState, carrier) => {
    const context = await neuralLink.newContext({baseURL, storageState, viewport: VIEWPORT}),
          page    = await context.newPage();

    await page.addInitScript(({key, identity}) => {
        if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(identity))
    }, {key: CARRIER, identity: carrier});
    await bootRoot(page);

    const app      = await neuralLink.connectToApp(await readWorkerId(page)),
          windowId = await readWindowId(page);
    await expect.poll(() => workspaceFor(app, windowId), {timeout: 15000}).toBeTruthy();

    return {app, context, page, workspaceId: await workspaceFor(app, windowId)}
};

/** Main's committed document, read through the Workspace's keyed topology seam. */
const mainDocument = async root => (await root.app.callMethod(root.workspaceId, 'getDockTopologyWorkspaces'))[MAIN];

/**
 * Stores, through the live library's IndexedDB adapter, a layout whose main root a root-edge drop wrapped,
 * optionally beside a popup workspace whose hint names that wrapped root.
 */
const seedWrappedLayout = async (page, context, neuralLink, withPopupHint) => {
    await bootRoot(page);
    const app            = await neuralLink.connectToApp('Workstation'),
          workspaceId    = await workspaceFor(app, await readWindowId(page)),
          shipped        = (await app.getComponent(workspaceId, ['dockModel'])).dockModel,
          wrapped        = Operations.splitNode(shipped, {itemId: 'alerts', targetNodeId: shipped.root, orientation: 'vertical', edge: 'bottom'}),
          workspaces     = {[MAIN]: wrapped.document},
          placementHints = {};

    expect(wrapped.errors).toEqual([]);

    if (withPopupHint) {
        workspaces[POPUP]     = EMPTY_POPUP;
        placementHints[POPUP] = {dx: 240, dy: 80, fallbackTarget: {workspaceKey: MAIN, nodeId: wrapped.document.root}}
    }

    const record = Persistence.captureTopologyPerspective(workspaces, {layoutId: 'default', title: 'default', placementHints}),
          saved  = Persistence.createTopologyCollection([record.topology], {activeLayoutId: 'default'});

    expect(record.errors).toEqual([]);
    expect(saved.errors).toEqual([]);
    await app.callMethod(workspaceId, 'topologyLibrary.persist');
    expect(await app.callMethod(workspaceId, 'topologyLibrary.adoptCollection', [saved.collection])).toMatchObject({adopted: true, errors: []});
    expect(await app.callMethod(workspaceId, 'topologyLibrary.persist')).toMatchObject({persisted: true, current: true, errors: []});

    return {
        carrier     : await readCarrier(page),
        shippedRoot : shipped.root,
        storageState: await context.storageState({indexedDB: true}),
        wrappedRoot : wrapped.document.root
    }
};

/**
 * Presses Reset to default on a cold boot of the stored layout, waits until the auto-save it triggers has
 * settled, and returns the storage the next cold boot reads.
 */
const resetOnColdBoot = async (neuralLink, baseURL, seed, withPopupHint) => {
    const root = await coldRoot(neuralLink, baseURL, seed.storageState, seed.carrier);

    try {
        expect((await mainDocument(root)).root, 'the cold boot restores the stored wrapped layout').toBe(seed.wrappedRoot);

        if (withPopupHint) {
            expect((await root.app.callMethod(root.workspaceId, 'getPlacementHints'))[POPUP].fallbackTarget,
                'the restored popup hint names the wrapped root').toEqual({workspaceKey: MAIN, nodeId: seed.wrappedRoot})
        }

        await root.page.getByRole('button', {name: 'Reset to default'}).click();
        await expect.poll(async () => (await mainDocument(root)).root, {message: 'Reset to default restores the shipped root on screen'})
            .toBe(seed.shippedRoot);
        // The auto-save captures inside the reset's commit, so by now any write it started is pending.
        await expect.poll(async () => (await root.app.getComponent(root.workspaceId, ['topologyLibrary.dirty']))['topologyLibrary.dirty'],
            {message: 'the auto-save settles'}).toBe(false);

        return await root.context.storageState({indexedDB: true})
    } finally {
        await root.context.close()
    }
};

test.describe('Workstation Reset to default survives a reload (Neural Link)', () => {
    test.setTimeout(180000);
    test.use({viewport: VIEWPORT});

    for (const withPopupHint of [true, false]) {
        const title = withPopupHint
            ? 'a popup hint naming the wrapped root does not keep the reset from persisting'
            : 'control: without a popup hint, the reset persists through the same cold boots';

        test(title, async ({page, context, baseURL, neuralLink}) => {
            const seed = await seedWrappedLayout(page, context, neuralLink, withPopupHint);
            await context.close();

            const storageState = await resetOnColdBoot(neuralLink, baseURL, seed, withPopupHint),
                  root         = await coldRoot(neuralLink, baseURL, storageState, seed.carrier);

            try {
                const main = await mainDocument(root);
                expect(main.root, 'after a reload the shipped layout returns, not the wrapped one').toBe(seed.shippedRoot);

                if (withPopupHint) {
                    const {fallbackTarget} = (await root.app.callMethod(root.workspaceId, 'getPlacementHints'))[POPUP];
                    expect(Object.hasOwn(main.nodes, fallbackTarget.nodeId), 'the stored hint names a node main still has').toBe(true)
                }
            } finally {
                await root.context.close()
            }
        })
    }
});
