import {expect, test}              from '../../fixtures.mjs';
import * as RmaHelpers             from '../../util/RmaHelpers.mjs';
import {countPixelsUnlikeDominant} from '../utils/pngPixels.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';
import {popOut}                    from '../utils/workstationPopOut.mjs';

const APP = '/apps/workstation/index.html';

/**
 * @summary Boots a full Workstation root and waits for its real dock to project.
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function bootRoot(page) {
    await page.goto(APP);
    await expect(page.locator('.workstation-dock-host')).toBeVisible({timeout: 60000});
    await expect(page.locator('.neo-tab-header-button.neo-draggable').first()).toBeVisible({timeout: 60000});
}

/**
 * @summary Reads the runtime identities from the page that owns them, rather than from an app-name lookup.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
function rootIdentity(page) {
    return page.evaluate(async () => {
        const reply = await Neo.worker.App.getWorkerId();

        return {
            appWorkerId: typeof reply === 'string' ? reply : reply?.data,
            canvasGroup: sessionStorage.getItem('neo-canvas-group'),
            topology   : JSON.parse(sessionStorage.getItem('neo-topology-identity') || 'null'),
            windowId   : Neo.worker.Manager.windowId
        }
    })
}

/**
 * @summary Records page errors and the exact HTTP failures, so a resource error is explained by its request.
 * @param {Object} page
 * @param {String} root
 * @param {Object[]} errors
 * @param {Object[]} resources
 * @returns {void}
 */
function watchRoot(page, root, errors, resources) {
    page.on('crash', () => errors.push({root, kind: 'renderer-crash'}));
    page.on('pageerror', error => errors.push({root, kind: 'javascript', text: error.message}));
    page.on('console', message => message.type() === 'error'
        && errors.push({root, kind: 'console', text: message.text(), location: message.location()}));
    page.on('response', response => response.status() >= 400
        && resources.push({root, status: response.status(), url: response.url()}));
}

/**
 * @summary Adds a static canvas witness to the actual root; its pixels can change only when that witness updates.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
async function paintWitness(page, id) {
    await RmaHelpers.registerRmaHelpers(page);

    const created = await RmaHelpers.createComponent(page, {
        className    : 'Neo.component.Sparkline',
        id,
        importPath   : '/src/component/Sparkline.mjs',
        parentId     : await page.locator('.neo-viewport').first().getAttribute('id'),
        style        : {background: '#fff', bottom: '8px', height: '48px', position: 'fixed', right: '8px', width: '160px', zIndex: 2147483000},
        usePulse     : false,
        useTransition: false,
        values       : [1, 6, 2, 8, 3, 9, 4]
    });

    expect(created.success, 'the root creates its static paint witness').toBe(true);
    await expect.poll(() => RmaHelpers.getComponentConfig(page, id, 'offscreenRegistered'),
        {message: 'the root\'s canvas worker acknowledges adoption', timeout: 20000}).toBe(true);

    const shot = () => page.locator(`#${id}`).screenshot();

    await expect.poll(async () => countPixelsUnlikeDominant(await shot()).unlike,
        {message: 'the adopted witness is painted', timeout: 20000}).toBeGreaterThanOrEqual(20);

    return {id, page, shot}
}

/**
 * @summary Requires a real repaint while a foreign root's static witness stays byte-identical.
 * @param {Object} local
 * @param {Object} foreign
 * @returns {Promise<void>}
 */
async function paintsAlone(local, foreign) {
    const before = await local.shot(), other = await foreign.shot();

    await RmaHelpers.setComponentConfig(local.page, local.id, {values: [9, 2, 8, 1, 7, 3, 6]});
    await expect.poll(async () => !(await local.shot()).equals(before),
        {message: 'this root still paints after the other root booted', timeout: 10000}).toBe(true);
    expect((await foreign.shot()).equals(other), 'the foreign root did not paint this update').toBe(true)
}

/**
 * @summary Binds a page to its physical Chromium window; pages in one tab strip are not independent windows.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
async function nativeWindow(page) {
    const cdp        = await page.context().newCDPSession(page),
          {windowId} = await cdp.send('Browser.getWindowForTarget');

    return {cdp, page, windowId}
}

/**
 * @summary Opens an opener-free second root in its own real window, retaining the first root's browser context.
 * @param {Object} context
 * @param {Object} first
 * @returns {Promise<Object>}
 */
async function independentWindow(context, first) {
    const {targetInfo} = await first.cdp.send('Target.getTargetInfo'),
          opened       = context.waitForEvent('page');

    await first.cdp.send('Target.createTarget', {
        browserContextId: targetInfo.browserContextId, newWindow: true, url: 'about:blank'
    });
    const second = await nativeWindow(await opened);

    expect(second.windowId, 'B is a separately movable native window').not.toBe(first.windowId);
    expect(await second.page.opener(), 'B is a full independent root, not A\'s vessel').toBeNull();
    return second
}

/**
 * @summary Moves only a native frame and requires the engine to observe the browser's actual geometry.
 * @param {Object} app
 * @param {String} managerId
 * @param {Object} handle
 * @param {Object} bounds
 * @returns {Promise<Object>}
 */
async function placeWindow(app, managerId, handle, bounds) {
    await handle.cdp.send('Browser.setWindowBounds', {windowId: handle.windowId, bounds: {...bounds, windowState: 'normal'}});
    const current = (await handle.cdp.send('Browser.getWindowBounds', {windowId: handle.windowId})).bounds;

    await handle.cdp.send('Browser.setWindowBounds', {windowId: handle.windowId,
        bounds: {...current, height: current.height + 1, windowState: 'normal'}});
    await handle.cdp.send('Browser.setWindowBounds', {windowId: handle.windowId, bounds: {...current, windowState: 'normal'}});
    await handle.page.evaluate(() => Neo.main.addon.WindowPosition.publishGeometry());

    const runtimeId = await handle.page.evaluate(() => Neo.worker.Manager.windowId);
    let receipt;

    await expect.poll(async () => {
        const actual = await handle.page.evaluate(() => ({x: screenX, y: screenY,
            width: outerWidth, height: outerHeight, innerWidth, innerHeight})),
              {windows} = await app.callMethod(managerId, 'toJSON'),
              managed = windows.find(window => window.id === runtimeId);

        receipt = {actual, inner: managed?.innerRect, outer: managed?.outerRect, runtimeId};
        return managed?.innerRect && managed?.outerRect ? Math.max(
            ...['x', 'y', 'width', 'height'].map(key => Math.abs(actual[key] - managed.outerRect[key])),
            Math.abs(actual.innerWidth - managed.innerRect.width),
            Math.abs(actual.innerHeight - managed.innerRect.height)
        ) : Infinity
    }, {message: 'native frame and manager rectangles agree', timeout: 10000}).toBeLessThanOrEqual(2);
    expect(Math.abs(receipt.actual.x - bounds.left)).toBeLessThanOrEqual(80);
    expect(Math.abs(receipt.actual.y - bounds.top)).toBeLessThanOrEqual(80);
    return receipt
}

/**
 * @summary Resolves a full root by the window that constructed it, never the shared application name.
 * @param {Object} app
 * @param {Object} page
 * @returns {Promise<Object>}
 */
async function workspaceIn(app, page) {
    const {windowId} = await rootIdentity(page),
          found      = await app.findInstances({className: 'Workstation.view.Workspace', windowId},
              ['id', 'windowId', 'topologyGroupId']);

    expect(found).toHaveLength(1);
    return {id: found[0].id, ...found[0].properties}
}

/**
 * @summary Observes every successful Group commit, including writes that preserve history.
 * @param {Object} worker
 * @param {String} workspaceId
 * @returns {Promise<void>}
 */
async function observeCommits(worker, workspaceId) {
    await worker.evaluate(id => {
        const manager = Neo.getComponent(id).transactionManager,
              events  = [], listener = event => events.push({groupId: event.groupId,
                  cause: event.row?.cause ?? null, transactionId: event.transactionId});

        manager.on({commit: listener, scope: manager});
        globalThis.__twoRootCommits = {events, listener, manager}
    }, workspaceId)
}

/**
 * @summary Waits until setup geometry is in the placement owner's committed hints before opening the witness window.
 * @param {Object} worker
 * @param {String[]} rootIds
 * @returns {Promise<void>}
 */
async function settlePlacement(worker, rootIds) {
    await expect.poll(() => worker.evaluate(ids => ids.every(id => {
        const root      = Neo.getComponent(id), group = root.transactionManager.get(root.topologyGroupId),
              placement = Neo.get(group.participants.get('placementHints').componentId);

        return JSON.stringify(placement.hints) === JSON.stringify(placement.observedHints())
    }), rootIds), {message: 'native setup moves reach committed placement hints', timeout: 15000}).toBe(true);
    await worker.evaluate(async ids => {
        for (const id of ids) {
            const root      = Neo.getComponent(id), group = root.transactionManager.get(root.topologyGroupId),
                  placement = Neo.get(group.participants.get('placementHints').componentId);
            await placement.lastWrite;
            await group.queue
        }
    }, rootIds)
}

/**
 * @summary Takes an independent copy of committed documents, full history and the separate commit counter.
 * @param {Object} worker
 * @param {String} workspaceId
 * @returns {Promise<Object>}
 */
function committedState(worker, workspaceId) {
    return worker.evaluate(id => {
        const workspace = Neo.getComponent(id), group = workspace.transactionManager.get(workspace.topologyGroupId),
              events    = globalThis.__twoRootCommits.events.filter(event => event.groupId === group.id);

        return JSON.parse(JSON.stringify({documents: workspace.getDockTopologyWorkspaces(),
            rows: group.history.rows, cursor: group.history.cursor, commits: events}))
    }, workspaceId)
}

/**
 * @summary Reads foreign DOM surfaces in their owning renderer, including staged header proxies.
 * @param {Object} page
 * @param {String} paneId
 * @returns {Promise<Object>}
 */
function foreignSurfaces(page, paneId) {
    return page.evaluate(id => {
        const visible = selector => [...document.querySelectorAll(selector)].filter(element => {
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        }).length;

        return {
            indicators: visible('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'),
            previews  : visible('.neo-dock-preview-affordance'),
            headers   : document.querySelectorAll('.workstation-vessel-dragproxy').length,
            pane      : document.querySelectorAll(`[id="${id}"]`).length
        }
    }, paneId)
}

/**
 * @summary Temporarily equates only the four live participation resolvers; actual Group identities stay distinct.
 * @param {Object} worker
 * @param {String[]} rootIds
 * @param {String[]} windowIds
 * @returns {Promise<Object>}
 */
function forceSharedOwnership(worker, rootIds, windowIds) {
    return worker.evaluate(({rootIds, windowIds}) => {
        const roots        = rootIds.map(id => Neo.getComponent(id)), groupIds = roots.map(root => root.topologyGroupId),
              participants = roots.flatMap(root => [root.participation,
                  ...root.getPopupStates().map(state => state.host?.participation)])
                  .filter(participation => participation && windowIds.includes(participation.windowId));

        if (participants.length !== 4 || new Set(participants.map(participation => participation.id)).size !== 4 ||
            !groupIds[0] || !groupIds[1] || groupIds[0] === groupIds[1]) throw new Error('control requires four distinct hosts in two Groups');
        if (globalThis.__twoRootResolvers) throw new Error('ownership control already installed');
        globalThis.__twoRootResolvers = participants.map(participation => ({participation,
            descriptor: Object.getOwnPropertyDescriptor(participation, 'resolveOwnershipId')}));
        participants.forEach(participation => {participation.resolveOwnershipId = () => groupIds[0]});
        return {groupIds, owners: participants.map(participation => ({id: participation.id,
            windowId: participation.windowId, owner: participation.ownershipId, targetOwner: participation.target.ownershipId}))}
    }, {rootIds, windowIds})
}

/**
 * @summary Releases only this test's observer and restores exact instance descriptors after the red control.
 * @param {Object} worker
 * @returns {Promise<void>}
 */
async function restoreObservers(worker) {
    await worker.evaluate(() => {
        for (const {participation, descriptor} of globalThis.__twoRootResolvers ?? []) {
            if (participation.isDestroyed) continue;
            if (descriptor) Object.defineProperty(participation, 'resolveOwnershipId', descriptor);
            else delete participation.resolveOwnershipId
        }
        delete globalThis.__twoRootResolvers;
        const observer = globalThis.__twoRootCommits;
        if (observer) observer.manager.un({commit: observer.listener, scope: observer.manager});
        delete globalThis.__twoRootCommits
    })
}

/**
 * @summary Holds a real Feed header gesture past the native viewport edge without a terminal input.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
async function holdFeed(page) {
    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
    const button       = page.locator('.neo-tab-header-button.neo-draggable').filter({hasText: 'Live Event Stream'}).first(),
          box          = await button.boundingBox(),
          viewport     = await page.evaluate(() => ({width: innerWidth, height: innerHeight})),
          start        = {x: box.x + box.width / 2, y: box.y + box.height / 2},
          out          = {x: viewport.width + 40, y: Math.min(360, Math.max(96, start.y))},
          popupPromise = page.waitForEvent('popup', {timeout: 30000});

    expect(await button.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), start),
        'the real Feed header receives the pointer').toBe(true);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // input-cadence: arm the real held header before crossing the native boundary.
    await page.waitForTimeout(130);
    for (let step = 1; step <= 8; step++) {
        await page.mouse.move(start.x + 16 * step / 8, start.y + 24 * step / 8);
        // input-cadence: the trusted pointer stream spans arming frames.
        await page.waitForTimeout(34)
    }
    await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
    await page.mouse.move(out.x, out.y, {steps: 24});
    const popup = await popupPromise;
    await popup.waitForSelector('.workstation-viewport', {timeout: 30000});
    return {popup, out}
}

test.describe('Workstation independent roots: rendered drag ownership', () => {
    test.setTimeout(180000);
    test.use({viewport: {width: 1600, height: 900}});

    test('two full roots coexist on one App Worker and keep painting independently', async ({page, context, neuralLink}, testInfo) => {
        const errors = [], resources = [];
        watchRoot(page, 'A', errors, resources);
        await bootRoot(page);
        const app    = await neuralLink.connectToApp('Workstation');
        const second = await context.newPage();
        watchRoot(second, 'B', errors, resources);
        await bootRoot(second);

        const a = await rootIdentity(page), b = await rootIdentity(second);

        expect(b.appWorkerId, 'both roots share the exact App Worker').toBe(a.appWorkerId);
        expect(b.windowId).not.toBe(a.windowId);
        expect(a.canvasGroup).toBeTruthy();
        expect(b.canvasGroup).toBeTruthy();
        expect(b.canvasGroup).not.toBe(a.canvasGroup);
        expect(b.topology.groupId).not.toBe(a.topology.groupId);

        const workspaces = await app.findInstances({className: 'Workstation.view.Workspace'},
            ['id', 'windowId', 'topologyGroupId', 'participation.ownershipId']);
        const byWindow = new Map(workspaces.map(record => {
            const properties = record.properties ?? record;
            return [properties.windowId, properties]
        }));

        expect(byWindow.get(a.windowId)?.topologyGroupId).toBe(a.topology.groupId);
        expect(byWindow.get(b.windowId)?.topologyGroupId).toBe(b.topology.groupId);
        expect(byWindow.get(a.windowId)?.['participation.ownershipId']).toBe(a.topology.groupId);
        expect(byWindow.get(b.windowId)?.['participation.ownershipId']).toBe(b.topology.groupId);

        const witnessA = await paintWitness(page, 'two-roots-paint-a');
        const witnessB = await paintWitness(second, 'two-roots-paint-b');

        // wall-clock-under-test: the historical renderer kill followed the second root's first canvas paint.
        await page.waitForTimeout(8000);
        await paintsAlone(witnessA, witnessB);
        await paintsAlone(witnessB, witnessA);
        await expect(page.locator('.workstation-dock-host')).toBeVisible();
        await expect(second.locator('.workstation-dock-host')).toBeVisible();

        await testInfo.attach('two-roots-console-census', {
            body       : JSON.stringify({identities: {a, b}, errors, resources}, null, 2),
            contentType: 'application/json'
        });
        expect(errors.filter(error => error.kind !== 'console'), 'neither renderer crashed or threw').toEqual([]);
        expect(resources, 'every failed resource is named; none is silently allowed').toEqual([]);
        expect(errors.filter(error => error.kind === 'console'), 'both roots have a clean error census').toEqual([])
    });
});

test.describe('Workstation independent roots: native held gesture', () => {
    test.setTimeout(240000);
    test.use({viewport: null});

    for (const corruptOwnership of [false, true]) {
        test(corruptOwnership ? 'equal ownership makes the unchanged foreign-DOM oracle fail' :
            'one held gesture rejects B main and popup, then transfers into A popup once',
        async ({page, context, browser, neuralLink}, testInfo) => {
            const errors = [], resources = [], receipts = [], handles = [];
            let observer, held = false;

            try {
                watchRoot(page, 'A', errors, resources);
                await bootRoot(page);
                const app   = await neuralLink.connectToApp('Workstation'),
                      mainA = await nativeWindow(page);
                handles.push(mainA);
                const mainB = await independentWindow(context, mainA);
                handles.push(mainB);
                watchRoot(mainB.page, 'B', errors, resources);
                await bootRoot(mainB.page);
                const a            = await workspaceIn(app, page), b = await workspaceIn(app, mainB.page),
                      identities   = {a: await rootIdentity(page), b: await rootIdentity(mainB.page)},
                      managers     = await app.findInstances({className: 'Neo.manager.Window'}, ['id']),
                      coordinators = await app.findInstances({className: 'Neo.manager.DragCoordinator'}, ['id']);

                expect(managers).toHaveLength(1);
                expect(coordinators).toHaveLength(1);
                expect(identities.a.appWorkerId).toBe(identities.b.appWorkerId);
                expect(identities.a.canvasGroup).not.toBe(identities.b.canvasGroup);
                expect(a.topologyGroupId).not.toBe(b.topologyGroupId);
                const screen = await page.evaluate(() => ({left: window.screen.availLeft, top: window.screen.availTop,
                    width: window.screen.availWidth, height: window.screen.availHeight})),
                      gap = 160,
                      width = Math.min(900, Math.floor((screen.width - 48 - gap) / 2)),
                      mainHeight = Math.min(600, screen.height - 480);

                test.skip(width < 760 || mainHeight < 400, 'native display cannot hold two full roots and two visible target vessels');
                const popupA  = await popOut({app, page, workspaceId: a.id, itemId: 'metrics'}),
                      popupB  = await popOut({app, page: mainB.page, workspaceId: b.id, itemId: 'metrics'}),
                      targetA = await nativeWindow(popupA.popup), targetB = await nativeWindow(popupB.popup);
                handles.push(targetA, targetB);
                expect(new Set(handles.map(handle => handle.windowId)).size, 'four independent native frames').toBe(4);
                watchRoot(targetA.page, 'A popup', errors, resources);
                watchRoot(targetB.page, 'B popup', errors, resources);
                for (const [handle, column, row] of [[mainA, 0, 0], [mainB, 1, 0], [targetA, 0, 1], [targetB, 1, 1]]) {
                    handle.geometry = await placeWindow(app, managers[0].id, handle, {
                        left : screen.left + 24 + column * (width + gap),
                        top  : screen.top + 24 + row * (mainHeight + 40),
                        width: row ? 480 : width, height: row ? 380 : mainHeight
                    });
                    receipts.push({nativeId: handle.windowId, geometry: handle.geometry})
                }
                observer = await attachPageSharedAppWorker({browser, page});
                expect(observer, 'the observer binds this context\'s exact App Worker').toBeTruthy();
                await settlePlacement(observer, [a.id, b.id]);
                await observeCommits(observer, a.id);
                const beforeA = await committedState(observer, a.id), beforeB = await committedState(observer, b.id),
                      paneId  = await app.callMethod(a.id, 'getPaneIdentity', ['feed']),
                      zero    = {indicators: 0, previews: 0, headers: 0, pane: 0};

                if (corruptOwnership) {
                    const control = await forceSharedOwnership(observer, [a.id, b.id],
                        handles.map(handle => handle.geometry.runtimeId));
                    expect(control.groupIds).toEqual([a.topologyGroupId, b.topologyGroupId]);
                    expect(control.owners.every(owner => owner.owner === a.topologyGroupId && owner.targetOwner === a.topologyGroupId)).toBe(true);
                    receipts.push({control})
                }
                held = true;
                const gesture = await holdFeed(page);
                watchRoot(gesture.popup, 'A held vessel', errors, resources);
                let token;
                await expect.poll(async () => token = (await app.callMethod(coordinators[0].id, 'toJSON')).pointerGestureToken,
                    {message: 'one live pointer gesture owns the held source'}).toBeTruthy();
                for (const target of [mainB, targetB]) {
                    const targetPoint = {x: target.geometry.inner.x + target.geometry.inner.width / 2,
                        y: target.geometry.inner.y + target.geometry.inner.height / 2},
                          client = {x: targetPoint.x - mainA.geometry.inner.x, y: targetPoint.y - mainA.geometry.inner.y},
                          samples = [];

                    await page.mouse.move(client.x, client.y, {steps: 24});
                    for (let nudge = 1; nudge <= 4; nudge++) {
                        await page.mouse.move(client.x + nudge, client.y + nudge);
                        // input-cadence: hold foreign hover through real pointer sampling frames.
                        await page.waitForTimeout(60);
                        samples.push(await foreignSurfaces(target.page, paneId))
                    }
                    expect((await app.callMethod(coordinators[0].id, 'toJSON')).pointerGestureToken,
                        'no terminal or replacement gesture occurred at the foreign root').toBe(token);
                    receipts.push({target: target.geometry.runtimeId, samples});
                    let falsified = false;
                    for (const surfaces of samples) {
                        try {expect(surfaces, 'foreign renderer has no preview, indicator, staged header or pane').toEqual(zero)}
                        catch (error) {
                            if (!corruptOwnership) throw error;
                            falsified = true
                        }
                    }
                    if (corruptOwnership) expect(falsified,
                        `equal ownership falsifies this window's unchanged DOM assertion (${target.geometry.runtimeId})`).toBe(true);
                    expect(await committedState(observer, b.id), 'B documents, history, cursor and every commit stay unchanged').toEqual(beforeB)
                }
                if (corruptOwnership) {
                    await page.keyboard.press('Escape');
                    await page.mouse.up();
                    held = false;
                    expect(await committedState(observer, b.id), 'the red control cancels before any foreign commit').toEqual(beforeB)
                } else {
                    const target = targetA.geometry.inner, main = mainA.geometry.inner;
                    await page.mouse.move(target.x + target.width / 2 - main.x, target.y + target.height / 2 - main.y, {steps: 24});
                    await expect.poll(async () => (await app.callMethod(coordinators[0].id, 'toJSON')).activeTargetZone?.windowId,
                        {message: 'the same held gesture reaches A\'s own popup', timeout: 15000}).toBe(popupA.windowId);
                    expect((await app.callMethod(coordinators[0].id, 'toJSON')).pointerGestureToken).toBe(token);
                    await page.mouse.up();
                    held = false;
                    await expect.poll(async () => (await app.getComponent(paneId, ['windowId'])).windowId,
                        {message: 'the real source pane moves into A\'s committed popup', timeout: 15000}).toBe(popupA.windowId);
                    await expect(targetA.page.locator(`[id="${paneId}"]`)).toBeVisible();
                    await expect(page.locator(`[id="${paneId}"]`)).toHaveCount(0);
                    const afterA = await committedState(observer, a.id);
                    expect(afterA.commits.filter(event => event.cause === 'dock-transfer')).toHaveLength(1);
                    expect(afterA.rows.filter(row => row.cause === 'dock-transfer').length -
                        beforeA.rows.filter(row => row.cause === 'dock-transfer').length).toBe(1);
                    expect(await committedState(observer, b.id)).toEqual(beforeB);
                    receipts.push({afterA})
                }
                expect(errors, 'every renderer error is accounted for; none is silently allowed').toEqual([]);
                expect(resources).toEqual([])
            } finally {
                if (held) {
                    await page.keyboard.press('Escape').catch(() => {});
                    await page.mouse.up().catch(() => {})
                }
                if (observer) {
                    try {await restoreObservers(observer)}
                    finally {await observer.close()}
                }
                await testInfo.attach('native-two-root-ownership', {
                    body: JSON.stringify({receipts, errors, resources}, null, 2), contentType: 'application/json'
                });
                for (const handle of handles) await handle.cdp.detach().catch(() => {})
            }
        })
    }
});
