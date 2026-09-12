import {test, expect} from '@playwright/test';

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

/** The shipped pane the adoption arms move: its tab title, its pane class, and the vessel key the app mints for it. */
const
    FEED_TITLE = 'Live Event Stream',
    FEED_PANE  = '.workstation-pane-feed:not(.workstation-placeholder)',
    FEED_KEY   = 'workstation-vessel:feed';

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

    test('a keyed workspace a cold boot recovers is adopted by the owner in the window its recovery button opens', async ({page, context}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        // Make the two-workspace topology durable under this root's Group identity, then end the worker:
        // the vessel window first, the root last, and the carrier read before it goes.
        const popup   = await tearOutFeed(page),
              carrier = (await readBoot(page)).carrier;

        expect(carrier?.groupId, 'the root carries its Group identity').toBeTruthy();

        await page.getByRole('button', {name: 'Save workspace', exact: true}).click();

        // The teardown may only start once the durable record holds the vessel workspace: read back
        // the collection the library wrote, under this Group's key, until its active topology lists it.
        await expect.poll(async () => {
            const collection = await readPersistedTopology(page, carrier.groupId);
            return Object.keys(collection?.topologies?.[collection.activeLayoutId]?.workspaces ?? {})
        }, {message: 'the saved topology carries the vessel workspace', timeout: 30000}).toContain(FEED_KEY);

        await popup.close();
        await page.close();

        // A cold boot with the same carrier hydrates the saved topology: the vessel workspace is
        // retained, disconnected, and the bar offers to open it — the `?workspace=<key>` path.
        const cold = await context.newPage();

        await cold.addInitScript(({key, identity}) => {
            if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(identity))
        }, {key: 'neo-topology-identity', identity: carrier});
        await cold.goto(APP);
        await cold.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        const reopen = cold.getByRole('button', {name: `Open ${FEED_KEY} as window`, exact: true});

        await expect(reopen, 'the recovered topology offers the retained vessel workspace').toBeVisible({timeout: 60000});
        expect(await cold.locator(FEED_PANE).count(), 'the pane is not in the root while its workspace is a window').toBe(0);

        const savedPromise = context.waitForEvent('page', {timeout: 45000});

        await reopen.click();

        const saved = await savedPromise;

        // The arriving window declares `?workspace=<key>`, its binding is under that key, and the owner's
        // `connect` adoption mounts the retained workspace into it — nothing else renders here.
        await saved.waitForSelector('.workstation-viewport', {state: 'attached', timeout: 60000});
        expect(new URL(saved.url()).searchParams.get('workspace'), 'the recovery window is a saved-window URL').toBe(FEED_KEY);
        await expect(saved.locator(FEED_PANE).first(), 'the owner adopted the window and mounted the pane').toBeVisible({timeout: 60000});
        await expect(saved.getByText(REFUSAL), 'and the arriving side refused nothing').toHaveCount(0);

        await saved.close()
    });

    test('a popout URL takes the popout branch and does not mount a default host', async ({page}) => {
        // `?popout=<id>` marks the window as a vessel host. With no live pane to adopt it stays
        // empty — that is correct, and the discriminator is the class rather than the emptiness:
        // an empty page proves nothing, while `workstation-popout-host` proves the branch ran.
        await page.goto(`${APP}?popout=no-such-pane`);

        await page.waitForSelector('.workstation-popout-host', {state: 'attached', timeout: 60000});

        expect(await page.locator(DOCK_HOST).count(),
            'the popout branch must not also mount the default host').toBe(0)
    })
});
