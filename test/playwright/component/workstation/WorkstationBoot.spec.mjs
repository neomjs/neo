import {test, expect}              from '@playwright/test';
import fs                          from 'node:fs/promises';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

/**
 * @summary Workstation's three boot modes, and the reload that rebinds one of them, observed as RENDERED DOM in the real app.
 *
 * This tier is the point and it is not interchangeable with the unit witness. `apps/workstation`'s
 * boot is decided in `view/ViewportController.mjs#decide` from two synchronous sources — the URL the
 * main thread registered for the window and the window's Group binding — and a window that already
 * has an owner is adopted by that owner in `view/WorkspaceController.mjs#onWindowConnect`, on the App
 * worker's `connect` event. The unit tier drives the decision table and the adoption handler directly;
 * it never runs the real Viewport in a real window, and nothing in it fires the worker's `connect`.
 * The failure this file exists to catch was measured against the previous shape of this boot: a
 * refactor took `.workstation-dock-host` from 1 to 0 while the entire workstation unit tier stayed
 * green at 97/97, because an async rejection inside the then-`onConstructed` was an unhandled
 * rejection and nothing hooks `unhandledrejection`.
 *
 * Deliberately Brain-free. The sibling coverage in `e2e/workstation/` drives the Neural Link and
 * therefore requires `NEO_AGENTOS_RUNTIME_ROOT` pointing at a Brain checkout; these arms navigate
 * and read DOM only, so they run in a tracked-only clone and can gate a boot change on any host.
 *
 * Run: NEO_COMPONENT_PORT=8186 npx playwright test workstation/WorkstationBoot -c test/playwright/playwright.config.component.mjs --workers=1
 */

/** The real app, served from the repo root by the component tier's webServer. */
const APP = 'apps/workstation/index.html';

/**
 * The default-boot host, set in `apps/workstation/view/Workspace.mjs`. Its presence is the whole
 * assertion: the class is written by the Workspace the window's controller creates or its owner moves
 * in, so it cannot appear unless the boot path resolved an owner AND mounted through it.
 */
const DOCK_HOST = '.workstation-dock-host';

/** The arriving side's fail-closed answer to a saved-window URL no owner can adopt. */
const REFUSAL = 'This saved window is waiting for its original workspace.';

/** The root surface's non-modal guidance when the browser refuses a popup open. */
const
    POPUP_GUIDANCE     = '.workstation-popup-guidance',
    POPUP_REFUSAL_COPY = 'The browser could not open this window. Allow pop-ups for this site to use multi-window dragging and pop-out views.';

/** The shipped pane the adoption arms move: its tab title, its pane class, and the vessel key the app mints for it. */
const
    FEED_TITLE = 'Live Event Stream',
    FEED_PANE  = '.workstation-pane-feed:not(.workstation-placeholder)',
    FEED_KEY   = 'workstation-vessel:feed';

/** The workspace the shipped arrangement lives in, `VesselWorkspace.MAIN_WORKSPACE_ID`. */
const MAIN_KEY = 'workstation-main';

/**
 * Reads one Group's persisted topology collection from the page's IndexedDB — the durable record a cold
 * boot hydrates — through the same database, store and key the library's adapter writes.
 * @param {import('@playwright/test').Page} page
 * @param {String} groupId
 * @returns {Promise<Object|null>}
 */
const readPersistedTopology = (page, groupId) => page.evaluate(key => new Promise(resolve => {
    const request = indexedDB.open('neo-dock-topologies', 1);

    request.onerror   = () => resolve(null);
    request.onsuccess = () => {
        const database = request.result;

        try {
            const read = database.transaction('collections', 'readonly').objectStore('collections').get(key);

            read.onsuccess = () => {database.close(); resolve(read.result ?? null)};
            read.onerror   = () => {database.close(); resolve(null)}
        } catch {
            database.close();
            resolve(null)
        }
    }
}), groupId);

/**
 * Tears the shipped feed pane into a REAL popup window through the focus-gated pop-out header action
 * — the app's own tear-out path — and resolves once the popup shows the live pane.
 * @param {import('@playwright/test').Page} page The root window.
 * @returns {Promise<import('@playwright/test').Page>} The vessel window.
 */
const tearOutFeed = async page => {
    const tab = page.locator('.neo-tab-header-button', {hasText: FEED_TITLE}).first();

    await expect(tab).toBeVisible({timeout: 60000});
    await tab.click();

    const header = page.locator('.neo-tab-header-toolbar').filter({has: page.locator('.neo-tab-header-button', {hasText: FEED_TITLE})}).first(),
          popOut = header.locator('.neo-button:has([class*="fa-window-restore"])').first();

    await expect(popOut, 'the pop-out action projects on the focused pane').toBeVisible({timeout: 10000});

    const popupPromise = page.waitForEvent('popup', {timeout: 30000});

    await popOut.click();

    const popup = await popupPromise;

    await popup.waitForSelector('.workstation-popout-host', {state: 'attached', timeout: 60000});
    await expect(popup.locator(FEED_PANE).first(), 'the vessel renders the live pane').toBeVisible({timeout: 60000});

    return popup
};

/**
 * @summary Makes the two-workspace topology durable, ends the worker, and cold-boots a fresh context from the saved
 * storage: the vessel workspace is retained and disconnected, and Reset is the compact toolbar's recovery path.
 *
 * The warm windows go first, the root last, with the carrier read before it goes. A new page in the warm context
 * could still reach the SharedWorker the closing windows leave behind and adopt its live root instead of hydrating
 * (`ViewportController#decide`), so the cold page opens in a new context restored from the auto-saved storage.
 * @param {Object} fixtures `{baseURL, browser, page, context}` of the calling test.
 * @returns {Promise<{carrier: Object, cold: import('@playwright/test').Page, coldContext: import('@playwright/test').BrowserContext}>}
 *     The caller closes `coldContext`.
 */
const bootColdWithRetainedFeed = async ({baseURL, browser, page, context}) => {
    await page.goto(APP);
    await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

    const popup   = await tearOutFeed(page),
          carrier = (await readBoot(page)).carrier;

    expect(carrier?.groupId, 'the root carries its Group identity').toBeTruthy();

    // The teardown may only start once the durable record holds the vessel workspace: read back
    // the collection the library wrote, under this Group's key, until its active topology lists it.
    await expect.poll(async () => {
        const collection = await readPersistedTopology(page, carrier.groupId);
        return Object.keys(collection?.topologies?.[collection.activeLayoutId]?.workspaces ?? {})
    }, {message: 'the saved topology carries the vessel workspace', timeout: 30000}).toContain(FEED_KEY);

    const storageState = await context.storageState({indexedDB: true}),
          viewport     = page.viewportSize();

    await popup.close();
    await page.close();

    const coldContext = await browser.newContext({baseURL, storageState, viewport});

    try {
        const cold = await coldContext.newPage();

        await cold.addInitScript(({key, identity}) => {
            if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(identity))
        }, {key: 'neo-topology-identity', identity: carrier});
        await cold.goto(APP);
        await cold.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        await expect(cold.locator('.workstation-topologybar').getByRole('button'))
            .toHaveText(['Reset to default', 'Undo', 'Redo']);
        expect(await cold.locator(FEED_PANE).count(), 'the pane is not in the root while its workspace is a window').toBe(0);

        return {carrier, cold, coldContext}
    } catch (error) {
        await coldContext.close();
        throw error
    }
};

/**
 * What one Workstation window can say about its own boot, read from the DOM and the main thread: the
 * identity it carries across its reloads, its window generation, and the ids of its Viewport and dock
 * host — the App worker's component ids, so they name the instances behind the elements.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{carrier: Object|null, hostId: String|undefined, viewportId: String|undefined, windowId: String}>}
 */
const readBoot = page => page.evaluate(() => ({
    carrier   : JSON.parse(sessionStorage.getItem(Neo.worker.Manager.topologyIdentityStorageKey) || 'null'),
    hostId    : document.querySelector('.workstation-dock-host')?.id,
    viewportId: document.querySelector('.workstation-viewport')?.id,
    windowId  : Neo.worker.Manager.windowId
}));

/**
 * @summary Reads the main dock workspace's projection record from the page's own App Worker: the latest cycle's timing,
 * whether its refresh settles, and which documents and callbacks are parked. Read after the assertion so it cannot
 * perturb the interaction it explains; the handle closes before the page goes, or the worker would stop answering.
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
const readProjectionState = async (browser, page) => {
    const hostId = await page.evaluate(() => document.querySelector('.workstation-dock-host')?.id),
          handle = await attachPageSharedAppWorker({browser, page}).catch(error => ({error: error.message}));

    if (!handle?.evaluate) return {hostId, attach: handle?.error ?? 'no App Worker handle'};

    try {
        return await handle.evaluate(async id => {
            let workspace = globalThis.Neo.getComponent(id);

            while (workspace && typeof workspace.refreshDockWorkspace !== 'function') workspace = workspace.parent;

            if (!workspace) return {hostId: id, workspace: null};

            const {dockModel, departedProjection, refreshPromise, scheduledProjection} = workspace,
                  host                                                                 = globalThis.Neo.getComponent(id),
                  inside                                                               = component => {
                      for (let node = component; node; node = node.parent) if (node === workspace) return true;
                      return false
                  },
                  // A stamp-less stop between `released` and `reconciled` is one of the reconcile's awaits: the
                  // host's update round trip, or a tab strip's overflow pass
                  overflow  = globalThis.Neo.manager.Component.items
                      .filter(component => component.getPlugin?.('tab-overflow') && inside(component))
                      .map(component => {
                          const plugin = component.getPlugin('tab-overflow');
                          return {strip: component.id, measuring: Boolean(plugin.measuring), projectQueued: Boolean(plugin.projectQueued)}
                      });

            const vdomUpdate = globalThis.Neo.manager.VDomUpdate,
                  lineage    = [];

            for (let component = host; component; component = component.parent) {
                const componentId = component.id,
                      callbacks   = vdomUpdate.promiseCallbackMap.get(componentId) ?? [];

                lineage.push({
                    id                : componentId,
                    parentId          : component.parentId ?? null,
                    windowId          : component.windowId ?? null,
                    mounted           : Boolean(component.mounted),
                    hasVnode          : Boolean(component.vnode),
                    needsUpdate       : Boolean(component.needsVdomUpdate),
                    updating          : Boolean(component.isVdomUpdating),
                    inFlightDepth     : vdomUpdate.getInFlightUpdateDepth(componentId) ?? null,
                    awaitingCollection: vdomUpdate.awaitingCollectionSet.has(componentId),
                    callbacks         : callbacks.length,
                    claimedCallbacks  : callbacks.filter(entry => entry.claimed).length
                })
            }

            const lineageIds   = new Set(lineage.map(component => component.id)),
                  mergedOwners = vdomUpdate.mergedCallbackMap.items.flatMap(({ownerId, children}) =>
                      [...children].filter(([childId]) => lineageIds.has(childId)).map(([childId, entry]) => ({
                          ownerId,
                          childId,
                          depth    : entry.childUpdateDepth,
                          distance : entry.distance,
                          collected: Boolean(entry.collected)
                      }))
                  ),
                  queuedOwners = vdomUpdate.postUpdateQueueMap.items.flatMap(({ownerId, children}) =>
                      children.filter(({childId}) => lineageIds.has(childId)).map(({childId}) => ({ownerId, childId}))
                  );

            return {
                hostId    : id,
                hostUpdate: host ? {updating: Boolean(host.isVdomUpdating), needsUpdate: Boolean(host.needsVdomUpdate)} : null,
                vdomUpdate: {lineage, mergedOwners, queuedOwners},
                overflow,
                workspace : workspace.id,
                cycle     : workspace.projectionCycle?.timing ?? null,
                // The refresh the newest cycle waits on: its last stamp is the phase it never left
                predecessor: workspace.projectionCycle?.predecessorTiming ?? null,
                // 500 ms out-waits the refresh's own longest timer, the 300 ms chrome settle after its motion
                refresh         : refreshPromise ? await Promise.race([
                    refreshPromise.then(() => 'settled', () => 'rejected'),
                    new Promise(resolve => setTimeout(() => resolve('pending'), 500))
                ]) : 'none',
                scheduledIsModel: Boolean(scheduledProjection) && scheduledProjection.document === dockModel,
                scheduledHasFeed: Boolean(scheduledProjection?.document?.items?.feed),
                modelHasFeed    : Boolean(dockModel?.items?.feed),
                parked          : Boolean(departedProjection)
            }
        }, hostId)
    } finally {
        await handle.close()
    }
};

/**
 * @summary Attaches and logs the workspace's projection state for a failed wait, then rethrows its error. The DOM looks
 * the same whether a projection was slow, starved, stuck, stood down or failed; the file sits beside
 * error-context.md in the CI artifact, and the log line reaches a reader without it.
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').Page} page
 * @param {Error} error The failed wait's error
 * @returns {Promise<never>}
 */
const failWithProjectionState = async (browser, page, error) => {
    const state = await readProjectionState(browser, page),
          file  = test.info().outputPath('app-worker-projection-state.json');

    await fs.writeFile(file, JSON.stringify(state, null, 4));
    await test.info().attach('app-worker-projection-state.json', {contentType: 'application/json', path: file});
    console.log(`app-worker-projection-state ${JSON.stringify(state)}`);
    throw error
};

test.describe('workstation boot — the rendered outcome of each URL mode', () => {
    test('default boot mounts the dock host', async ({page}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        // Counted rather than presence-checked: the failure mode on the other side of this arm is a
        // second host mounted by a duplicate boot, which `waitForSelector` alone reports as success.
        expect(await page.locator(DOCK_HOST).count(), 'exactly one dock host, mounted once').toBe(1);

        // And the host is not an empty shell — a mounted-but-unpopulated host is what a boot that
        // resolves its owner and then fails to project would leave behind.
        //
        // Attached, not visible, and scoped INTO the host: an unscoped visible-wait resolves to the
        // first of nine tab-header buttons, which is a collapsed rail's `neo-dashboard-dock-reveal-title`
        // and invisible by design — measured here, so the next author does not re-add the wait that
        // times out against a correct boot.
        await expect(page.locator(`${DOCK_HOST} .neo-tab-header-button`).first())
            .toBeAttached({timeout: 60000});
        expect(await page.locator(`${DOCK_HOST} .neo-tab-header-button`).count(),
            'the host carries projected tab chrome').toBeGreaterThan(0)
    });

    test('a saved window whose workspace is unknown renders the refusal, not an empty page', async ({page}) => {
        // `?workspace=<key>` with no Group binding for this window is the branch that must FAIL
        // CLOSED. `Transaction.findByWindow` finds nothing, so the key cannot match and the Viewport
        // must say so rather than mount a host it has no owner for.
        await page.goto(`${APP}?workspace=no-such-workspace-key`);

        await expect(page.getByText(REFUSAL)).toBeVisible({timeout: 60000});

        expect(await page.locator(DOCK_HOST).count(),
            'the refusal branch must not mount a dock host').toBe(0)
    });

    test('a reload of the root window while the worker lives moves the retained root into the new window', async ({page, context}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        const before = await readBoot(page);

        // The App worker is shared, and a SharedWorker ends with its last client — which a reload of the
        // only window is. A second window keeps the worker, and with it the root, alive across the
        // reload. Its own boot is the refusal arm above, so it creates no root that could confuse the count.
        const keeper = await context.newPage();

        await keeper.goto(`${APP}?workspace=no-such-workspace-key`);
        await expect(keeper.getByText(REFUSAL)).toBeVisible({timeout: 60000});

        await page.reload();
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        const after = await readBoot(page);

        // Controls first. A reload is a new window generation carrying the same identity, and the new
        // Viewport's id continues the worker's counter: a worker that restarted would mint the first id
        // again, and a same-id host below would then prove nothing.
        expect(after.windowId, 'a reload is a new window generation').not.toBe(before.windowId);
        expect(after.carrier, 'carrying the identity its slot rebinds under').toEqual(before.carrier);
        expect(after.viewportId, 'into a worker heap that survived the reload').not.toBe(before.viewportId);

        // The claim: the host the root already owned, moved — not a second one, not a fresh one.
        expect(await page.locator(DOCK_HOST).count(), 'exactly one dock host').toBe(1);
        expect(after.hostId, 'the same host instance, adopted into the new window').toBe(before.hostId);

        await keeper.close()
    });

    test('a torn-out pane\'s window, reloaded while the worker lives, is re-adopted by the owner with the same live pane', async ({page}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        // A real vessel: `?popout=feed`, bound under the app's vessel key, holding the live pane.
        const popup  = await tearOutFeed(page),
              before = {...await readBoot(popup), paneId: await popup.locator(FEED_PANE).first().getAttribute('id')};

        // The root window keeps the SharedWorker; reloading the vessel rebinds its slot to a new window
        // generation, and the owner's `connect` adoption is the only path that puts the pane back.
        await popup.reload();
        await popup.waitForSelector('.workstation-popout-host', {state: 'attached', timeout: 60000});
        await expect(popup.locator(FEED_PANE).first(), 'the reloaded vessel shows the pane again').toBeVisible({timeout: 60000});

        const after = {...await readBoot(popup), paneId: await popup.locator(FEED_PANE).first().getAttribute('id')};

        expect(after.windowId, 'a reload is a new window generation').not.toBe(before.windowId);
        expect(after.carrier, 'carrying the vessel identity its slot rebinds under').toEqual(before.carrier);
        expect(after.viewportId, 'into a worker heap that survived').not.toBe(before.viewportId);
        expect(after.paneId, 'the same live pane instance, adopted into the new window').toBe(before.paneId);
        expect(await page.locator(FEED_PANE).count(), 'and the root does not also show it').toBe(0);

        await popup.close()
    });

    test('a cold boot retains the saved workspace and Reset brings its pane back', async ({baseURL, browser, page, context}) => {
        // The two waits after Reset declare 30 s and 60 s, and a slow hosted runner spent most of the
        // default 30 s budget before them, so the budget cut the last wait short
        test.setTimeout(150000);

        const {carrier, cold, coldContext} = await bootColdWithRetainedFeed({baseURL, browser, page, context});

        try {
            await cold.getByRole('button', {name: 'Reset to default', exact: true}).click();

            // The saved document first, then the render, so a stall in either fails at its own step
            await expect.poll(async () => {
                const collection = await readPersistedTopology(cold, carrier.groupId),
                      workspaces = collection?.topologies?.[collection.activeLayoutId]?.workspaces ?? {};

                return {
                    main  : Object.keys(workspaces[MAIN_KEY]?.items ?? {}).includes('feed'),
                    vessel: Object.keys(workspaces[FEED_KEY]?.items ?? {})
                }
            }, {message: 'the saved topology gives the pane back to the main workspace', timeout: 30000})
                .toEqual({main: true, vessel: []});
            try {
                await expect(cold.locator(FEED_PANE).first(), 'Reset returns the retained pane to the default arrangement')
                    .toBeVisible({timeout: 60000})
            } catch (error) {
                await failWithProjectionState(browser, cold, error)
            }
            const control = await readProjectionState(browser, cold).catch(error => ({snapshotError: error.message}));
            console.log(`app-worker-projection-control ${JSON.stringify(control)}`);
        } finally {
            await coldContext.close()
        }
    });

    test('a cold-boot Reset renders its pane while an older projection\'s overflow read is still unanswered', async ({baseURL, browser, page, context}) => {
        // A re-projection of the hydrated document reaches its overflow recapture, and the natural-width read it
        // awaits does not answer until the test lets it. Reset's projection must not queue behind that read.
        test.setTimeout(210000);

        const {cold, coldContext} = await bootColdWithRetainedFeed({baseURL, browser, page, context});
        let probe;

        try {
            const hostId = await cold.locator(DOCK_HOST).getAttribute('id');

            probe = await attachPageSharedAppWorker({browser, page: cold});

            await probe.evaluate(async id => {
                const {Neo} = globalThis,
                      api   = Neo.main.DomAccess,
                      read  = api.getLayoutRect,
                      held  = globalThis.__heldOverflowRead = {release: null, request: null};

                let workspace = Neo.getComponent(id);

                while (workspace && typeof workspace.projectDockZoneDocument !== 'function') workspace = workspace.parent;

                // Setup, not the step under test: the cold boot's own projection settles first, read right before the
                // held read goes in, as a follow-up projection replaces refreshPromise. A loaded runner took longer than
                // 20 s for it, so it gets 60 s, and a miss leaves the projection state to tell slow from stuck.
                await Promise.race([workspace.refreshPromise, new Promise((resolve, reject) => setTimeout(() => reject(new Error('unsettled: the boot projection')), 60000))]);

                held.workspace = workspace;

                // A recapture's first read asks for its strip's tab headers; the answer comes, and is held
                api.getLayoutRect = async function (options) {
                    if (!held.request && Array.isArray(options.id) && options.id.length > 0
                        && options.id.every(itemId => String(itemId).startsWith('neo-tab-header-button'))) {
                        held.request = options.id;
                        // The strip that asked, pinned now: Reset may move its headers before the answer comes
                        held.toolbar = Neo.getComponent(options.id[0])?.parent;
                        held.plugin  = held.toolbar?.getPlugin?.('tab-overflow');

                        const answer = await read.call(this, options);

                        await new Promise(resolve => {held.release = resolve});
                        return answer
                    }

                    return read.call(this, options)
                };

                held.restore = () => {
                    api.getLayoutRect = read;
                    held.release?.()
                };

                workspace.projectDockZoneDocument(workspace.dockModel).catch(() => {})
            }, hostId).catch(error => failWithProjectionState(browser, cold, error));

            await expect.poll(() => probe.evaluate(() => typeof globalThis.__heldOverflowRead.release === 'function'),
                {message: 'the older projection waits on its overflow read', timeout: 10000}).toBe(true);

            await cold.getByRole('button', {name: 'Reset to default', exact: true}).click();

            await expect(cold.locator(FEED_PANE).first(), 'Reset renders its pane while the older read is still unanswered')
                .toBeVisible({timeout: 60000});

            // The read is still unanswered: the strip that asked for it is idle again, and once the refresh
            // settles, its answer arriving late moves no header and writes no cache.
            const strip = () => probe.evaluate(async () => {
                const held              = globalThis.__heldOverflowRead,
                      {plugin, toolbar} = held;

                await Promise.race([held.workspace.refreshPromise, new Promise((resolve, reject) => setTimeout(() => reject(new Error('unsettled: the refresh after Reset')), 20000))]);

                return {
                    busy   : Boolean(plugin && (plugin.measuring || plugin.projectQueued)),
                    hidden : plugin?.appliedHiddenIds ?? null,
                    headers: (toolbar?.items || []).map(button => [button.id, Boolean(button.hidden), button.maxWidth ?? null]),
                    widths : plugin?.naturalWidths ?? null
                }
            });

            await expect.poll(async () => (await strip()).busy,
                {message: 'the strip whose read is held is idle again', timeout: 10000}).toBe(false);

            const before = await strip();

            await probe.evaluate(() => globalThis.__heldOverflowRead.release());
            await cold.waitForTimeout(500);

            expect(await strip(), 'the late answer writes nothing').toEqual(before)
        } finally {
            if (probe) {
                await probe.evaluate(() => globalThis.__heldOverflowRead?.restore?.()).catch(() => {});
                await probe.close()
            }

            await coldContext.close()
        }
    });

    test('a popout URL takes the popout branch and does not mount a default host', async ({page}) => {
        // `?popout=<id>` marks the window as a vessel host. With no live pane to adopt it stays
        // empty — that is correct, and the discriminator is the class rather than the emptiness:
        // an empty page proves nothing, while `workstation-popout-host` proves the branch ran.
        await page.goto(`${APP}?popout=no-such-pane`);

        await page.waitForSelector('.workstation-popout-host', {state: 'attached', timeout: 60000});

        expect(await page.locator(DOCK_HOST).count(),
            'the popout branch must not also mount the default host').toBe(0)
    });

    test('a refused popup open shows non-modal setup guidance without mutating the dock, deduplicates repeated refusals, and clears when a subsequent open is allowed (#19537)', async ({page, context}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        const
            guidance = page.locator(POPUP_GUIDANCE),
            tab      = page.locator('.neo-tab-header-button', {hasText: FEED_TITLE}).first();

        await expect(guidance).toBeHidden();
        await expect(tab).toBeVisible({timeout: 60000});
        await tab.click();

        const
            header = page.locator('.neo-tab-header-toolbar').filter({has: page.locator('.neo-tab-header-button', {hasText: FEED_TITLE})}).first(),
            popOut = header.locator('.neo-button:has([class*="fa-window-restore"])').first();

        await expect(popOut).toBeVisible({timeout: 10000});

        // Inject a browser popup-blocker refusal at the platform `window.open` seam (`src/Main.mjs#windowOpen`).
        await page.evaluate(() => {
            window.__originalWindowOpen = window.open.bind(window);
            window.__refusedPopupCount  = 0;
            window.open = () => {
                window.__refusedPopupCount++;
                return null
            }
        });

        await popOut.click();

        await expect(guidance, 'refused pop-out renders the non-modal setup guidance').toBeVisible({timeout: 10000});
        await expect(guidance).toHaveText(POPUP_REFUSAL_COPY);
        await expect(guidance).toHaveAttribute('role', 'status');

        const guidanceMeta = await page.evaluate(selector => {
            const node = document.querySelector(selector);
            return {
                count        : document.querySelectorAll(selector).length,
                pointerEvents: node ? getComputedStyle(node).pointerEvents : null,
                stoleFocus   : document.activeElement === node
            }
        }, POPUP_GUIDANCE);

        expect(guidanceMeta).toEqual({
            count        : 1,
            pointerEvents: 'none',
            stoleFocus   : false
        });
        expect(context.pages(), 'no orphan popup window was created').toHaveLength(1);
        await expect(page.locator(FEED_PANE).first(), 'the pane stays in the root document').toBeVisible();

        // Repeated refusal deduplicates rather than stacking warnings.
        await popOut.click();
        await expect.poll(() => page.evaluate(() => window.__refusedPopupCount), {timeout: 10000}).toBe(2);
        expect(await guidance.count(), 'repeated refusals keep a single guidance banner').toBe(1);
        await expect(guidance).toBeVisible();
        await expect(guidance).toHaveText(POPUP_REFUSAL_COPY);

        // Allow pop-ups and retry: the vessel opens and stale guidance clears.
        await page.evaluate(() => {
            if (window.__originalWindowOpen) {
                window.open = window.__originalWindowOpen
            }
        });

        const popup = await tearOutFeed(page);

        await expect(guidance, 'a subsequent granted popup open clears stale guidance').toBeHidden({timeout: 10000});

        await popup.close()
    })
});
