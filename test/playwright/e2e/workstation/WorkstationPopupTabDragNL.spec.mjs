import {test, expect}                 from '../../fixtures.mjs';
import {captureCatalogsByParticipant} from '../utils/workstationGesture.mjs';
import {participations, popOut}       from '../utils/workstationPopOut.mjs';

/**
 * Whitebox-e2e: a tab dragged inside a popup vessel gets the main window's drag contract.
 *
 * The popup's strips used to be projected without it, so a drag inside the popup could only resort
 * its own strip: no dock previews over the popup's layout, and a proxy clamped to the popup's edge,
 * which no tear-out can leave. Every arm starts from the reported state: one pane popped out through
 * its header action, and a second pane moved into that popup.
 *
 * 1. A tab dragged to the popup's own root edge shows the dock preview there, and the release commits
 *    what the preview showed: the popup's single stack splits in two.
 * 2. A tab dragged out of the popup over empty desktop tears out into a new vessel. The root owns that
 *    vessel, so the main window opens it and holds its handle; the popup, which runs the gesture, moves
 *    it through that handle. The release transfers the pane from the popup's document into the vessel's.
 * 3. A tab dragged out and cancelled comes home: the riding vessel retires and gives the pane back to the
 *    popup, which still owns it, instead of keeping it as if a transfer had committed.
 * 4. A popup whose last tab tears out retires, as one emptied by any other transfer does.
 *
 * Against `dev` every arm fails on its first read: the popup's strip is unarmed, and no vessel is admitted.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_NL_PORT=<free port> \
 *      npx playwright test WorkstationPopupTabDragNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation popup tab drag (Neural Link)', () => {
    test.setTimeout(180000);

    // Inside the popup's root edge strip (24px) and above the tear-out detach threshold, for the
    // proxy-geometry reason WorkstationRootEdgeCornerNL documents on its own EDGE_INSET
    const EDGE_INSET = 20;

    /** @param {Object|Object[]} result @returns {String|null} */
    const readId = result => (Array.isArray(result) ? result[0] : result)?.id ?? null;

    /**
     * Boots the flagship, pops Metrics out and moves Audit into that popup, so the popup holds one
     * stack of two tabs — the state the defect was reported from.
     * @param {Object} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>} {app, popup, popupKey, tabsNodeId, windowId, wsId}
     */
    async function openTwoTabPopup(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');

        await page.waitForSelector('.workstation-dock-host',               {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.evaluate(() => document.fonts.ready);

        const app  = await neuralLink.connectToApp('Workstation'),
              wsId = readId(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']));

        expect(wsId, 'the Workspace must exist in the App Worker').toBeTruthy();

        const {popup, windowId} = await popOut({app, page, workspaceId: wsId, itemId: 'metrics'}),
              popupKey          = (await participations(app)).find(entry => entry.workspaceId !== 'workstation-main')?.workspaceId,
              popupDocument     = await app.callMethod(wsId, 'getWorkspaceDocument', [popupKey]),
              tabsNodeId        = Object.entries(popupDocument.nodes).find(([, node]) => node.type === 'tabs')?.[0];

        expect(popupKey,   'the popup registers as a Group participant').toBeTruthy();
        expect(tabsNodeId, 'the popup document holds one tabs node').toBeTruthy();

        expect(await app.callMethod(wsId, 'commitCrossWindowTransfer', [{
            sourceWorkspaceId: 'workstation-main', targetWorkspaceId: popupKey,
            descriptor       : {
                operation        : 'transferItem', itemId: 'audit',
                sourceWorkspaceId: 'workstation-main', targetWorkspaceId: popupKey,
                target           : {operation: 'addTab', tabsNodeId}
            }
        }]), 'Audit moves into the popup').toBe(true);

        await expect(popup.locator('.neo-tab-header-button', {hasText: 'Audit'}).first()).toBeVisible({timeout: 15000});
        await popup.evaluate(() => document.fonts.ready);

        return {app, popup, popupKey, tabsNodeId, windowId, wsId}
    }

    /**
     * Asserts that a point of the popup's client space lies off the main window on screen. The cross-window
     * claim gives main every point the two windows share, wherever the popup covers it, so a drag meant to stay
     * in the popup or to reach empty desktop must aim where they do not overlap.
     * @param {Object} page
     * @param {Object} popup
     * @param {{x: Number, y: Number}} point
     * @param {String} purpose
     */
    async function expectOffMain(page, popup, point, purpose) {
        const geometry       = target => target.evaluate(() => ({height: innerHeight, width: innerWidth, x: screenX, y: screenY})),
              [main, origin] = await Promise.all([geometry(page), geometry(popup)]),
              x              = origin.x + point.x,
              y              = origin.y + point.y;

        expect(x < main.x || x > main.x + main.width || y < main.y || y > main.y + main.height,
            `${purpose} lies off the main window (${JSON.stringify({main, point: {x, y}})})`).toBe(true)
    }

    /**
     * Presses one popup tab header and starts its drag with the real pointer of that window.
     * @param {Object} popup
     * @param {String} label
     * @returns {Promise<{x: Number, y: Number}>} the press point
     */
    async function pressTab(popup, label) {
        const header = popup.locator('.neo-tab-header-button', {hasText: label}).first();

        await expect(header).toBeVisible();

        const box   = await header.boundingBox(),
              start = {x: box.x + box.width / 2, y: box.y + box.height / 2};

        await popup.mouse.move(start.x, start.y);
        await popup.mouse.down();
        await popup.mouse.move(start.x + 12, start.y + 12, {steps: 4});
        await expect(popup.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();

        return start
    }

    test('a tab dragged to the popup\'s root edge shows the dock preview and docks there', async ({page, neuralLink}) => {
        const {app, popup, popupKey, tabsNodeId, windowId, wsId} = await openTwoTabPopup(page, neuralLink),
              stackId                                            = readId(await app.queryComponent({dockNodeId: tabsNodeId}, ['id'])),
              stackBox                                           = await popup.locator(`#${stackId}`).boundingBox(),
              target                                             = {x: stackBox.x + stackBox.width - EDGE_INSET, y: stackBox.y + stackBox.height / 2};

        await expectOffMain(page, popup, target, 'the popup\'s right root edge');
        await pressTab(popup, 'Audit');
        await popup.mouse.move(target.x, target.y, {steps: 15});

        // The controller's geometry self-heal runs per move frame, so the settle jiggles along the edge
        for (const delta of [2, -2, 1]) {
            await popup.mouse.move(target.x, target.y + delta, {steps: 1});
            await popup.waitForTimeout(120)
        }

        await popup.waitForTimeout(300);

        const zones = (await app.findInstances({className: 'Neo.dashboard.dock.interaction.TabSortZone'},
            ['id', 'allowOverdrag', 'dockWorkspaceId', 'enableProxyToPopup'])) ?? [];

        const popupZones = zones.map(zone => zone.properties ?? zone).filter(zone => zone.dockWorkspaceId === popupKey);

        expect(popupZones.length, 'the popup strip has a live sort zone').toBeGreaterThan(0);
        popupZones.forEach(zone => {
            expect(zone.allowOverdrag,      `${zone.id} lets the proxy leave the strip, as main's zones do`).toBe(true);
            expect(zone.enableProxyToPopup, `${zone.id} arms the tear-out boundary, as main's zones do`).toBe(true)
        });

        const previews = (await app.findInstances({className: 'Neo.dashboard.dock.interaction.Preview'}, ['id', 'dockPreview', 'windowId'])) ?? [],
              shown    = previews.map(entry => entry.properties ?? entry).find(entry => entry.windowId === windowId)?.dockPreview ?? null;

        expect(shown, 'the drag paints a dock preview over the popup\'s own layout').toBeTruthy();
        expect(shown.itemId,         'the preview carries the dragged tab').toBe('audit');
        expect(shown.placement.kind, 'the root edge strip resolves a root edge').toBe('edge-right');

        await popup.mouse.up();

        // What the preview showed is what lands: the stack splits, and both panes stay in the popup
        await expect.poll(async () => {
            const document = await app.callMethod(wsId, 'getWorkspaceDocument', [popupKey]),
                  holder   = itemId => Object.entries(document.nodes)
                      .find(([, node]) => node.type === 'tabs' && node.items?.includes(itemId))?.[0] ?? null;

            return {
                apart: holder('metrics') !== null && holder('audit') !== null && holder('metrics') !== holder('audit'),
                items: Object.keys(document.items).sort()
            }
        }, {message: 'the release docks Audit beside Metrics inside the popup', timeout: 15000})
            .toEqual({apart: true, items: ['audit', 'metrics']});

        const document = await app.callMethod(wsId, 'getWorkspaceDocument', [popupKey]),
              split    = Object.values(document.nodes).find(node => node.type === 'split');

        expect(split, 'a right edge drop wraps the stack in a horizontal split').toMatchObject({orientation: 'horizontal'});
        expect(split.children.map(childId => document.nodes[childId].items),
            'Audit lands on the right of Metrics').toEqual([['metrics'], ['audit']])
    });

    test('a tab dragged out of the popup tears out into a new vessel the root opens', async ({page, neuralLink}) => {
        const {app, popup, popupKey, wsId} = await openTwoTabPopup(page, neuralLink),
              paneId                       = await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
              viewport                     = await popup.evaluate(() => ({height: innerHeight, width: innerWidth})),
              outside                      = {x: viewport.width + 180, y: viewport.height + 180},
              vesselPromise                = page.waitForEvent('popup', {timeout: 30000});

        expect(paneId, 'Audit owns a live pane inside the popup').toBeTruthy();
        await expectOffMain(page, popup, outside, 'the desktop point');

        // A red run ends before any vessel opens; the wait must not outlive it as a second error
        vesselPromise.catch(() => {});

        // The vessel's handle lives where it was opened. Every move request that reaches the opener
        // is recorded with whether it resolved that live handle, which is the follow this gesture can
        // own; whether the platform then honours `moveTo` is the host's (see WorkstationDragAffordancesNL).
        await page.evaluate(() => {
            const main     = globalThis.Neo.Main,
                  original = main.windowMoveTo.bind(main),
                  trace    = globalThis.__popupSourcedWindowMoves = [];

            main.windowMoveTo = data => {
                const win = main.openWindows[data.windowName]?.win;

                trace.push({exists: Boolean(win), live: Boolean(win) && win.closed === false && typeof win.moveTo === 'function', windowName: data.windowName});

                return original(data)
            }
        });

        let vessel = null;

        try {
            await pressTab(popup, 'Audit');
            await popup.mouse.move(outside.x, outside.y, {steps: 36});

            await expect.poll(async () => (await app.getComponent(wsId, ['tearOutHandlers.activeVessel']))['tearOutHandlers.activeVessel']?.itemId ?? null, {
                message: 'leaving the popup admits a vessel through the root\'s tear-out machine',
                timeout: 15000
            }).toBe('audit');

            // Opened by main, not by the popup: `page` is main's, and only the opener sees its popup event
            vessel = await vesselPromise;
            await vessel.waitForLoadState('domcontentloaded');

            await popup.mouse.move(outside.x + 120, outside.y + 80, {steps: 12});

            await expect.poll(() => page.evaluate(() => globalThis.__popupSourcedWindowMoves.filter(entry => entry.live).length), {
                message: 'the popup-sourced pointer moves the vessel through the opener\'s live handle',
                timeout: 10000
            }).toBeGreaterThan(0);

            await popup.mouse.up();

            await expect.poll(async () => {
                const catalogs = await captureCatalogsByParticipant(app, wsId),
                      holders  = Object.keys(catalogs).filter(key => catalogs[key]?.includes('audit'));

                return {holders, popup: catalogs[popupKey]}
            }, {message: 'the release transfers Audit out of the popup into its own vessel', timeout: 20000})
                .toEqual({holders: ['workstation-vessel:audit'], popup: ['metrics']});

            expect(await app.callMethod(wsId, 'getPaneIdentity', ['audit']), 'the same live pane rides the transfer').toBe(paneId);
            await expect(vessel.locator(`#${paneId}`), 'the vessel adopts Audit\'s exact pane').toBeVisible({timeout: 15000})
        } finally {
            vessel && !vessel.isClosed() && await vessel.close().catch(() => {})
        }
    });

    test('a tab dragged out of the popup and cancelled comes home to the popup', async ({page, neuralLink}) => {
        const {app, popup, popupKey, windowId, wsId} = await openTwoTabPopup(page, neuralLink),
              paneId                                 = await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
              viewport                               = await popup.evaluate(() => ({height: innerHeight, width: innerWidth})),
              outside                                = {x: viewport.width + 180, y: viewport.height + 180},
              vesselPromise                          = page.waitForEvent('popup', {timeout: 30000});

        vesselPromise.catch(() => {});
        await expectOffMain(page, popup, outside, 'the desktop point');

        await pressTab(popup, 'Audit');
        await popup.mouse.move(outside.x, outside.y, {steps: 36});

        const vessel = await vesselPromise;

        // The riding vessel embodies the live pane once it connects; only then does a cancel have a pane to give back
        await expect(vessel.locator(`#${paneId}`), 'the riding vessel embodies Audit\'s pane').toBeVisible({timeout: 15000});

        // Escape, not a re-entry: a pointer back over the popup also lies over main wherever the two overlap, and the
        // cross-window claim gives main that point
        await popup.keyboard.press('Escape');
        await popup.mouse.up();
        await expect.poll(() => vessel.isClosed(), {message: 'the cancel retires the riding vessel', timeout: 15000}).toBe(true);

        await expect.poll(async () => (await app.getComponent(paneId, ['windowId'])).windowId, {
            message: 'the pane is restored into the popup it left, not promoted into the closed vessel',
            timeout: 15000
        }).toBe(windowId);
        await expect(popup.locator('.neo-dashboard-dock-vessel-placeholder'), 'the popup retires the stand-in').toHaveCount(0, {timeout: 15000});

        const catalogs = await captureCatalogsByParticipant(app, wsId);

        expect(catalogs[popupKey]?.slice().sort(), 'the popup still holds both tabs').toEqual(['audit', 'metrics']);
        expect(Object.keys(catalogs).filter(key => catalogs[key]?.includes('audit')), 'no other participant took Audit').toEqual([popupKey])
    });

    test('a popup whose last tab tears out retires', async ({page, neuralLink}) => {
        const {app, popup, popupKey, wsId} = await openTwoTabPopup(page, neuralLink),
              viewport                     = await popup.evaluate(() => ({height: innerHeight, width: innerWidth})),
              outside                      = {x: viewport.width + 180, y: viewport.height + 180},
              vesselPromise                = page.waitForEvent('popup', {timeout: 30000});

        vesselPromise.catch(() => {});
        await expectOffMain(page, popup, outside, 'the desktop point');

        // Metrics goes home, so the popup keeps only Audit, a tab it was not opened for
        expect(await app.callMethod(wsId, 'commitCrossWindowTransfer', [{
            sourceWorkspaceId: popupKey, targetWorkspaceId: 'workstation-main',
            descriptor       : {
                operation        : 'transferItem', itemId: 'metrics',
                sourceWorkspaceId: popupKey, targetWorkspaceId: 'workstation-main',
                target           : {operation: 'addTab', tabsNodeId: 'heavy-tabs'}
            }
        }]), 'Metrics returns to main').toBe(true);
        await expect(popup.locator('.neo-tab-header-button', {hasText: 'Metrics'})).toHaveCount(0, {timeout: 15000});

        let vessel = null;

        try {
            await pressTab(popup, 'Audit');
            await popup.mouse.move(outside.x, outside.y, {steps: 36});

            vessel = await vesselPromise;
            await vessel.waitForLoadState('domcontentloaded');
            await popup.mouse.up();

            await expect.poll(async () => (await captureCatalogsByParticipant(app, wsId))['workstation-vessel:audit'] ?? null, {
                message: 'the release transfers Audit into its own vessel', timeout: 20000
            }).toEqual(['audit']);
            await expect.poll(() => popup.isClosed(), {message: 'the emptied popup retires', timeout: 20000}).toBe(true)
        } finally {
            vessel && !vessel.isClosed() && await vessel.close().catch(() => {})
        }
    })
});
