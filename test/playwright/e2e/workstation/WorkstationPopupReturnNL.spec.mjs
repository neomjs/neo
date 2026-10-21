import {expect, test}        from '../../fixtures.mjs';
import {readNativeLifecycle} from '../utils/dockNativeLifecycle.mjs';
import {popOut}              from '../utils/workstationPopOut.mjs';

/**
 * @summary A pane that left the main window comes home where the main window shows it will: a second
 * popup docks back by its OS titlebar after a first one did, and a vessel the hand carries back over the
 * main window drops its pane into the zone main previews, booted or still booting.
 *
 * CDP `Browser.setWindowBounds` stands in for the OS window server and Playwright's mouse for the hand;
 * every hop after them is production code.
 */

const
    asArray = value => Array.isArray(value) ? value : value ? [value] : [],
    readId  = result => result?.properties?.id ?? result?.id ?? (Array.isArray(result) ? readId(result[0]) : null);

/**
 * @summary Where one item lives now: in a tabs node of the main document, and whether a vessel owns it.
 * @param {Object} app
 * @param {String} workspaceId
 * @param {String} itemId
 * @returns {Promise<{node: (String|null), owned: Boolean}>}
 */
async function homeOf(app, workspaceId, itemId) {
    const [{dockModel}, lifecycle] = await Promise.all([app.getComponent(workspaceId, ['dockModel']), readNativeLifecycle(app, workspaceId)]);

    return {
        node : Object.entries(dockModel.nodes).find(([, node]) => node.type === 'tabs' && node.items?.includes(itemId))?.[0] ?? null,
        owned: Boolean(lifecycle.owners[itemId])
    }
}

/**
 * @summary Moves one native window and waits until the browser reports its new origin.
 * @param {Object} handle `{cdp, page, windowId}`
 * @param {Number} left
 * @param {Number} top
 * @returns {Promise<void>}
 */
async function moveNative(handle, left, top) {
    const {bounds} = await handle.cdp.send('Browser.getWindowBounds', {windowId: handle.windowId});

    await handle.cdp.send('Browser.setWindowBounds', {bounds: {...bounds, left, top, windowState: 'normal'}, windowId: handle.windowId});

    await expect.poll(async () => {
        const [x, y] = await handle.page.evaluate(() => [globalThis.screenX, globalThis.screenY]);

        return Math.max(Math.abs(x - left), Math.abs(y - top))
    }, {message: `native window ${handle.windowId} reaches ${left},${top}`, timeout: 5000, intervals: [25, 50, 100]}).toBeLessThanOrEqual(80)
}

/**
 * @summary Pops one pane out through its header action, walks the popup's corner onto the left band of
 * a main-window zone by its OS titlebar, and waits for the dwell to dock it home.
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function popOutAndReturnByTitlebar({app, page, workspaceId, managerId, coordId, itemId, zoneNodeId}) {
    const {popup, windowId} = await popOut({app, page, workspaceId, itemId, settleForClaim: true});

    const
        mainWindowId                         = (await app.getComponent(workspaceId, ['windowId'])).windowId,
        mainRect                             = (await app.callMethod(managerId, 'toJSON')).windows.find(win => win.id === mainWindowId)?.outerRect,
        {nativeWindowDropAnchorInset: inset} = await app.getComponent(coordId, ['nativeWindowDropAnchorInset']),
        zoneBox                              = await page.locator(`#${readId(await app.queryComponent({dockNodeId: zoneNodeId}, ['id']))}`).boundingBox(),
        cdp                                  = await popup.context().newCDPSession(popup),
        handle                               = {cdp, page: popup, windowId: (await cdp.send('Browser.getWindowForTarget')).windowId},
        start                                = await popup.evaluate(() => ({x: globalThis.screenX, y: globalThis.screenY})),
        targetLeft                           = Math.round(mainRect.x + zoneBox.x + 10 - inset),
        targetTop                            = Math.round(mainRect.y + zoneBox.y + zoneBox.height * 0.6 - inset);

    // each step reaches the coordinator through the production movement poll, never the spec
    for (const step of [0.5, 1]) {
        const left = Math.round(start.x + (targetLeft - start.x) * step), top = Math.round(start.y + (targetTop - start.y) * step);

        await moveNative(handle, left, top);
        await expect.poll(async () => {
            const managed = (await app.callMethod(managerId, 'toJSON')).windows.find(win => win.id === windowId)?.outerRect;

            return managed ? Math.max(Math.abs(managed.x - left), Math.abs(managed.y - top)) : Infinity
        }, {message: `manager.Window follows ${itemId}'s popup to step ${step}`, timeout: 5000, intervals: [25, 50, 100]}).toBeLessThanOrEqual(80)
    }

    await expect.poll(async () => (await homeOf(app, workspaceId, itemId)).owned === false && (await homeOf(app, workspaceId, itemId)).node !== null, {
        message: `dwelling over the main window docks ${itemId} home`, timeout: 15000, intervals: [50, 100, 250]
    }).toBe(true);
    await expect.poll(() => popup.isClosed(), {message: `${itemId}'s vessel closes after the return`, timeout: 10000}).toBe(true)
}

/**
 * @summary Tears one pane out by dragging its tab past the main window's right edge with the real mouse,
 * then carries the born vessel back over the main window and releases.
 * @param {Object} data
 * @param {Boolean} data.booting Hold the vessel's page back, so the hand comes back before it connects.
 * @param {Boolean} data.edge Come back only over the right column, short of the reattach overlap; else deep inside.
 * @returns {Promise<{popups: Object[], tabInto: Boolean, target: (String|null)}>} The accepted preview under
 *     the hand at the release: its target node, and whether it joins that node's tabs.
 */
async function tearOutAndCarryBack({app, page, workspaceId, itemId, booting, edge}) {
    const popups = [];

    booting && await page.context().route(url => url.href.includes('popout='), async route => {
        // wall-clock-under-test: the vessel's page loads late, so the hand is back before it connects
        await new Promise(resolve => setTimeout(resolve, 1500));
        await route.continue()
    });

    page.on('popup', popup => popups.push(popup));

    const
        sourceNodeId = (await homeOf(app, workspaceId, itemId)).node,
        chrome       = await app.callMethod(workspaceId, 'getTabChromeIdentity', [sourceNodeId]),
        box          = await page.locator(`#${chrome.buttons[itemId]}`).boundingBox(),
        view         = await page.evaluate(() => ({h: globalThis.innerHeight, w: globalThis.innerWidth})),
        x            = box.x + box.width / 2,
        y            = box.y + box.height / 2,
        outX         = view.w + 160,
        outY         = y + 60,
        backX        = edge ? view.w - 70  : view.w * 0.35,
        backY        = edge ? view.h * 0.25 : view.h * 0.4;

    // the drag arms after a delay and a distance, as for a human
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.move(x + 8,  y + 2);
    await page.waitForTimeout(16);
    await page.mouse.move(x + 16, y + 24);

    for (const t of [0.25, 0.5, 0.75, 1]) {
        await page.mouse.move(x + (outX - x) * t, y + (outY - y) * t);
        await page.waitForTimeout(16)
    }

    await expect.poll(() => popups.length, {message: `${itemId}'s vessel opens on the exit`, timeout: 5000}).toBeGreaterThan(0);

    // wall-clock-under-test: how long the hand holds the vessel outside — 0.2 s comes back before the held
    // page connects (the recording), 1.5 s after the vessel booted
    await page.waitForTimeout(booting ? 200 : 1500);

    for (const t of [0.5, 1]) {
        await page.mouse.move(outX + (backX - outX) * t, outY + (backY - outY) * t);
        await page.waitForTimeout(16)
    }

    await page.waitForTimeout(edge ? 600 : 150);

    const preview = page.locator('.neo-dock-preview-affordance.neo-dock-preview-accepted').first(),
          target  = await preview.count() ? await preview.getAttribute('data-dock-target') : null,
          tabInto = target !== null && (await preview.getAttribute('class')).includes('neo-dock-preview-tab-into');

    await page.mouse.up();
    booting && await page.context().unroute(url => url.href.includes('popout='));

    return {popups, tabInto, target}
}

test.describe('Workstation — a popup\'s pane comes home where main shows it will', () => {
    test.setTimeout(120000);
    test.use({viewport: null});

    /**
     * @summary Boots the workstation and resolves the instances the arms read.
     * @param {Object} fixtures
     * @returns {Promise<Object>}
     */
    async function boot({page, neuralLink}) {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));
        page.on('popup',     popup => popup.on('pageerror', error => pageErrors.push(`[popup] ${error.stack || error.message || error}`)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-workspace', {timeout: 30000});

        const app = await neuralLink.connectToApp('Workstation');

        return {
            app,
            page,
            pageErrors,
            coordId    : asArray(await app.findInstances({className: 'Neo.manager.DragCoordinator'}, ['id']))[0]?.id,
            managerId  : asArray(await app.findInstances({className: 'Neo.manager.Window'}, ['id']))[0]?.id,
            workspaceId: asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id
        }
    }

    test('a second popped-out pane docks back by its OS titlebar after the first one did', async ({page, neuralLink}) => {
        const ctx = await boot({page, neuralLink});

        await popOutAndReturnByTitlebar({...ctx, itemId: 'commits', zoneNodeId: 'heavy-tabs'});
        // No pause: the first return's vessel left its native park behind, which refused this one's
        // park, and main, still settling that return, could not preview this drop yet
        await popOutAndReturnByTitlebar({...ctx, itemId: 'alerts', zoneNodeId: 'heavy-tabs'});

        expect(ctx.pageErrors).toEqual([])
    });

    for (const booting of [false, true]) {
        test(`a vessel carried back over the main window's edge drops its pane where main previewed it${booting ? ', while the vessel still boots' : ''}`, async ({page, neuralLink}) => {
            const ctx = await boot({page, neuralLink});

            const {popups, tabInto, target} = await tearOutAndCarryBack({...ctx, itemId: 'alerts', booting, edge: true});

            expect(target, 'main previews an accepted drop under the hand before the release').not.toBeNull();
            await expect.poll(() => homeOf(ctx.app, ctx.workspaceId, 'alerts'), {
                message: `the release lands in the previewed zone (${target}), and no vessel owns the pane`, timeout: 10000
            }).toEqual({node: tabInto ? target : expect.any(String), owned: false});
            await expect.poll(() => popups.every(popup => popup.isClosed()), {message: 'the vessel closes', timeout: 10000}).toBe(true);
            expect(ctx.pageErrors).toEqual([])
        })
    }

    test('a pane carried back inside while its vessel still boots stays home, and the vessel closes', async ({page, neuralLink}) => {
        const ctx = await boot({page, neuralLink});

        const {popups} = await tearOutAndCarryBack({...ctx, itemId: 'alerts', booting: true, edge: false});

        // a closed vessel can no longer adopt, so ownership is read once it is gone
        await expect.poll(() => popups.every(popup => popup.isClosed()), {message: 'the vessel closes', timeout: 10000}).toBe(true);
        expect(await homeOf(ctx.app, ctx.workspaceId, 'alerts'), 'a vessel retired before it connected never adopts')
            .toEqual({node: expect.any(String), owned: false});
        expect(ctx.pageErrors).toEqual([])
    })
});
