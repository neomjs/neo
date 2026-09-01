import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The native-titlebar drag of one torn-out popup ONTO ANOTHER torn-out popup.
 *
 * A Workstation pane popped out into its own OS window is dragged by that window's titlebar over a
 * second popped-out pane. The engine's multi-window path must claim the target vessel, render the
 * drop preview inside the target popup, park the source, commit a `transferItem` into the target
 * vessel's document and retire the source vessel — the sibling of `WorkstationNativeTitlebarDragNL`,
 * which proves the same gesture against the main window.
 *
 * Trigger discipline: an OS titlebar drag cannot be produced by Playwright, so CDP
 * `Browser.setWindowBounds` stands in for the window server — ONLY to move windows, always fully
 * on-screen, with the fewest moves the receipts need. No pointer event reaches either popup realm
 * (a `mouseout` counter in the source realm is asserted at zero), nothing calls `publishGeometry()`,
 * and no runtime code is patched. Every hop from the source realm's movement poll onward is
 * production code.
 *
 * Rig facts this spec is built on, so the next author does not re-derive them:
 * 1. Playwright emulates `window.screen` at the viewport size; a popup outside the main window is
 *    then off the emulated screen and the app's `window.moveTo` cannot park it. `viewport: null`
 *    uses the real display.
 * 2. Chrome will not shrink the main window below roughly 500px wide or 375px tall. On an 800×600
 *    display the vessels therefore sit to the RIGHT of a 500px-wide main window: the 300px beside it
 *    hold a 146px vessel with room to spare, while nothing fits below a 375px-tall one.
 * 3. The Workstation collapses its tab headers into the overflow menu when the main window is small,
 *    so both pop-outs happen while the main window is full-size; it is narrowed afterwards.
 * 4. The claim arbiter keeps hover seniority across moves: a source that first claims the main window
 *    keeps main while it still intersects it, and a pause there longer than dwell + settle
 *    reintegrates into main. The source therefore moves once, directly onto the target, and only
 *    nudges afterwards.
 * 5. The native drop anchor is the moving popup's outer top-left corner plus a small inset, read from
 *    manager.Window — which takes `screenX/Y` as the FRAME origin, the basis a CDP bounds move
 *    shares, so placing a frame at (left, top) puts its anchor at (left + inset, top + inset)
 *    with no chrome arithmetic. Positioning a vessel is itself a move the native path listens to: a
 *    vessel whose corner lands inside the main window would hand its anchor to main and be
 *    reintegrated the moment it is placed. Side by side, the anchors' x stays clear of main whatever
 *    their y.
 */

test.use({viewport: null});

const
    SOURCE_ITEM         = 'commits',
    TARGET_ITEM         = 'metrics',
    TARGET_WORKSPACE_ID = `workstation-vessel:${TARGET_ITEM}`,
    asArray             = value => Array.isArray(value) ? value : value ? [value] : [];

/**
 * @summary Resolves one native CDP window handle for a page.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{cdp: Object, page: Object, windowId: Number}>}
 */
async function acquireNativeWindow(page) {
    const
        cdp        = await page.context().newCDPSession(page),
        {windowId} = await cdp.send('Browser.getWindowForTarget');

    return {cdp, page, windowId}
}

/**
 * @summary Reads the browser-observed display envelope and viewport geometry of a page.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function readScreen(page) {
    return page.evaluate(() => ({
        availHeight: globalThis.screen.availHeight,
        availLeft  : globalThis.screen.availLeft,
        availTop   : globalThis.screen.availTop,
        availWidth : globalThis.screen.availWidth,
        innerHeight: globalThis.innerHeight,
        innerWidth : globalThis.innerWidth,
        outerHeight: globalThis.outerHeight,
        outerWidth : globalThis.outerWidth,
        screenX    : globalThis.screenX,
        screenY    : globalThis.screenY
    }))
}

/**
 * @summary Sets real native bounds and waits until the browser reports the requested origin.
 * @param {Object} handle
 * @param {Object} bounds Any of `left`, `top`, `width`, `height`.
 * @returns {Promise<Object>} The page's geometry after the move.
 */
async function setBounds(handle, bounds) {
    const current = (await handle.cdp.send('Browser.getWindowBounds', {windowId: handle.windowId})).bounds;

    await handle.cdp.send('Browser.setWindowBounds', {
        bounds  : {...current, ...bounds, windowState: 'normal'},
        windowId: handle.windowId
    });

    await expect.poll(async () => {
        const screen = await readScreen(handle.page);

        return Math.max(
            Number.isFinite(bounds.left) ? Math.abs(screen.screenX - bounds.left) : 0,
            Number.isFinite(bounds.top)  ? Math.abs(screen.screenY - bounds.top)  : 0
        )
    }, {
        message  : `native window ${handle.windowId} reaches its requested origin`,
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(80);

    return readScreen(handle.page)
}

/**
 * @summary Reads one window's manager-owned rect from the App Worker — the FRAME (`outerRect`) by
 * default, which is the basis `window.screenX/Y` and CDP window bounds share; `innerRect` is the
 * viewport inside the chrome, for size comparisons against `innerWidth/Height`.
 * @param {Object} app
 * @param {String} managerId
 * @param {String} windowId
 * @param {String} [key='outerRect']
 * @returns {Promise<Object|null>}
 */
async function readManagerRect(app, managerId, windowId, key='outerRect') {
    const state = await app.callMethod(managerId, 'toJSON');

    return state.windows.find(win => win.id === windowId)?.[key] ?? null
}

/**
 * @summary Waits until manager.Window agrees with the browser about a window's origin.
 * @param {Object} app
 * @param {String} managerId
 * @param {String} windowId
 * @param {Object} screen
 * @param {String} message
 * @returns {Promise<void>}
 */
function awaitOriginParity(app, managerId, windowId, screen, message) {
    return expect.poll(async () => {
        const rect = await readManagerRect(app, managerId, windowId);

        return rect ? Math.max(Math.abs(rect.x - screen.screenX), Math.abs(rect.y - screen.screenY)) : Infinity
    }, {message, timeout: 5000, intervals: [25, 50, 100]}).toBeLessThanOrEqual(2)
}

/**
 * @summary Lists the live cross-window participations by workspace.
 * @param {Object} app
 * @returns {Promise<Object[]>}
 */
async function participations(app) {
    return asArray(await app.findInstances({className: 'Neo.dashboard.dock.window.Participation'}, ['id', 'workspaceId']))
        .map(entry => ({id: entry.id, workspaceId: entry.properties?.workspaceId}))
}

/**
 * @summary The main workspace participation's instance id — a projection refresh recreates it.
 * @param {Object} app
 * @returns {Promise<String|null>}
 */
async function mainParticipationId(app) {
    return (await participations(app)).find(entry => entry.workspaceId === 'workstation-main')?.id ?? null
}

/**
 * @summary Pops one pane out through the real header action and waits for adoption plus the
 * detach projection's refresh, so a later native claim cannot die with a re-registered zone.
 * @param {Object} data
 * @param {Object} data.app
 * @param {import('@playwright/test').Page} data.page
 * @param {String} data.workspaceId
 * @param {String} data.itemId
 * @returns {Promise<{popup: import('@playwright/test').Page, windowId: String}>}
 */
async function popOut({app, page, workspaceId, itemId}) {
    const
        {dockModel} = await app.getComponent(workspaceId, ['dockModel']),
        nodeId      = Object.entries(dockModel.nodes)
            .find(([, node]) => node.type === 'tabs' && node.items?.includes(itemId))?.[0],
        paneId      = await app.callMethod(workspaceId, 'getPaneIdentity', [itemId]),
        mainBefore  = await mainParticipationId(app);

    expect(nodeId, `${itemId} sits in a tabs node`).toBeTruthy();
    expect(paneId, `${itemId} owns a live pane`).toBeTruthy();

    let chrome;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

        return chrome?.buttons?.[itemId] ?? null
    }, {
        message  : `${nodeId} projects ${itemId} into live tab chrome`,
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toBeTruthy();

    await page.locator(`#${chrome.buttons[itemId]}`).click();

    const action = await app.callMethod(chrome.containerId, 'getActionItem', ['pop-out']);

    expect(action?.id, `pop-out resolves on ${itemId}'s tab owner`).toBeTruthy();
    await expect(page.locator(`#${action.id}`), `pop-out is user-reachable for ${itemId}`).toBeVisible({timeout: 10000});

    const popupPromise = page.waitForEvent('popup', {timeout: 30000});

    await page.locator(`#${action.id}`).click();

    const popup = await popupPromise;

    await popup.waitForSelector('.workstation-viewport', {timeout: 30000});

    let windowId;

    await expect.poll(async () => {
        const state = await app.getComponent(workspaceId, ['tearOutPanes']);

        windowId = state.tearOutPanes?.[itemId]?.windowId ?? null;

        return windowId
    }, {
        message  : `${itemId} reaches vessel adoption`,
        timeout  : 30000,
        intervals: [50, 100, 250]
    }).toBeTruthy();

    await expect(page.locator(`#${paneId}`), `the main window releases ${itemId}'s live pane`).toHaveCount(0);
    await expect(popup.locator(`#${paneId}`), `the popup adopts ${itemId}'s exact live pane`).toBeVisible();
    await expect.poll(() => mainParticipationId(app), {
        message  : `the detach projection refresh re-registers the main target after ${itemId}`,
        timeout  : 15000,
        intervals: [50, 100, 250]
    }).not.toBe(mainBefore);

    return {popup, windowId}
}

test.describe('Workstation — native titlebar drag popup onto popup (#18047)', () => {
    test('a popup moved by its OS titlebar onto another popup previews there and transfers its pane', async ({page, neuralLink}) => {
        const
            pageErrors = [],
            popups     = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        try {
            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector('.workstation-workspace', {timeout: 30000});

            const stage = await readScreen(page);

            // Rig facts 1–3: a full-size main window for the pop-outs, then a 500px-wide main window
            // with the target vessel beside it and the source's corner inside that target — all of it
            // must fit the real display.
            test.skip(
                stage.availWidth < 760 || stage.availHeight < 560,
                `${stage.availWidth}x${stage.availHeight} display cannot hold a 760px main window plus a target vessel below it`
            );

            const
                app         = await neuralLink.connectToApp('Workstation'),
                workspaceId = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
                managerId   = asArray(await app.findInstances({className: 'Neo.manager.Window'}, ['id']))[0]?.id,
                coordId     = asArray(await app.findInstances({className: 'Neo.manager.DragCoordinator'}, ['id']))[0]?.id,
                mainWinId   = (await app.getComponent(workspaceId, ['windowId'])).windowId,
                sourcePane  = await app.callMethod(workspaceId, 'getPaneIdentity', [SOURCE_ITEM]),
                mainHandle  = await acquireNativeWindow(page);

            expect(workspaceId, 'one live Workspace').toBeTruthy();
            expect(managerId, 'manager.Window is live').toBeTruthy();
            expect(coordId, 'manager.DragCoordinator is live').toBeTruthy();

            await setBounds(mainHandle, {
                height: Math.min(560, stage.availHeight),
                left  : stage.availLeft,
                top   : stage.availTop,
                width : Math.min(760, stage.availWidth)
            });

            // Target first, then source: both born inside the main window, both adopted and settled.
            const target = await popOut({app, page, workspaceId, itemId: TARGET_ITEM});

            popups.push(target.popup);
            target.popup.on('close', () => console.log('[native-popup-over-popup] target popup closed at', new Date().toISOString()));

            const source = await popOut({app, page, workspaceId, itemId: SOURCE_ITEM});

            popups.push(source.popup);

            await expect.poll(async () => (await participations(app)).map(entry => entry.workspaceId).sort(), {
                message  : 'both vessels register as cross-window targets beside the main workspace',
                timeout  : 20000,
                intervals: [50, 100, 250]
            }).toEqual(['workstation-main', `workstation-vessel:${SOURCE_ITEM}`, TARGET_WORKSPACE_ID]);

            // The source realm's witness for the trigger discipline: installed before any movement,
            // it must still read zero when the previews have rendered.
            await source.popup.evaluate(() => {
                globalThis.__nativeTitlebarMouseouts = 0;
                globalThis.addEventListener('mouseout', () => globalThis.__nativeTitlebarMouseouts++)
            });

            // Rig fact 2: a vessel (146 px) and its gap must fit beside the main window. A wide display
            // holds them beside the full-size 760 px main; a small one (the 800×600 headless screen)
            // needs the main narrowed to 500 px first — done now that nothing needs clicking in it,
            // waiting for manager.Window to publish the new extents (observeResize on the render target).
            if (stage.availLeft + 760 + 20 + 200 > stage.availLeft + stage.availWidth) {
                const shrunk = await setBounds(mainHandle, {width: 500});

                await expect.poll(async () => (await readManagerRect(app, managerId, mainWinId, 'innerRect'))?.width ?? Infinity, {
                    message  : 'manager.Window follows the main window resize',
                    timeout  : 5000,
                    intervals: [25, 50, 100]
                }).toBeLessThanOrEqual(shrunk.innerWidth + 2);

                // Environment gate: headless Chrome leaves `outerWidth/outerHeight` at the pre-resize
                // size after a CDP bounds change while the viewport follows it. manager.Window derives
                // the frame and the chrome from exactly those numbers, so the main window would
                // keep a 760 px frame that swallows any vessel beside its 500 px viewport — the main
                // claims the vessel's own anchor the moment it is placed. Only a real window measures it.
                test.skip(
                    shrunk.outerWidth - shrunk.innerWidth > 60,
                    `outerWidth ${shrunk.outerWidth} vs innerWidth ${shrunk.innerWidth} after the resize: headless Chrome reports a stale frame size — run this arm headed on a wide display`
                )
            }

            // Place the vessel from the main window's own screen read, not from its manager rects:
            // headless Chrome keeps `outerWidth/outerHeight` at the pre-resize 760×560 after a CDP
            // bounds change while `innerWidth/innerHeight` follow it, so the frame rect would put the
            // vessel off-screen and the chrome split (260 px of "side border", a negative top chrome)
            // would put the viewport rect above the screen — and a vessel parked at a negative y is a
            // move the platform refuses. `screenX + innerWidth` is right in both worlds.
            const
                targetHandle = await acquireNativeWindow(target.popup),
                sourceHandle = await acquireNativeWindow(source.popup),
                mainScreen   = await readScreen(page),
                mainRight    = mainScreen.screenX + mainScreen.innerWidth,
                targetScreen = await setBounds(targetHandle, {
                    left: Math.round(mainRight + 20),
                    top : Math.round(Math.max(mainScreen.screenY, mainScreen.availTop) + 40)
                }),
                placement    = JSON.stringify({mainScreen, targetScreen});

            expect(targetScreen.screenX, `the target vessel sits beside the main window ${placement}`).toBeGreaterThanOrEqual(mainRight);
            expect(targetScreen.screenX + targetScreen.innerWidth, `the target vessel is fully on-screen ${placement}`).toBeLessThanOrEqual(targetScreen.availLeft + targetScreen.availWidth);
            await awaitOriginParity(app, managerId, target.windowId, targetScreen, 'manager.Window follows the target vessel');

            // Rig fact 5's hazard, named: positioning the target is itself a window move, and a move
            // is what the native path listens to. Main must not have claimed the target's own anchor.
            await target.popup.waitForTimeout(800);

            expect((await app.getComponent(workspaceId, ['tearOutPanes'])).tearOutPanes?.[TARGET_ITEM]?.windowId,
                'placing the target vessel did not hand it to the main window').toBe(target.windowId);

            const
                // the drop anchor is the source FRAME's top-left corner plus the inset, and the claim
                // tests the target's VIEWPORT — so the aim is frame-corner-into-viewport
                targetInner                          = await readManagerRect(app, managerId, target.windowId, 'innerRect'),
                sourceScreen                         = await readScreen(source.popup),
                {nativeWindowDropAnchorInset: inset} = await app.getComponent(coordId, ['nativeWindowDropAnchorInset']),
                armed                                = await source.popup.evaluate(() => ({
                    intervalArmed  : Boolean(globalThis.Neo.main.addon.WindowPosition.intervalId),
                    mouseouts      : globalThis.__nativeTitlebarMouseouts,
                    observeMovement: globalThis.Neo.main.addon.WindowPosition.observeMovement
                }));

            expect(armed, 'the source realm owns an armed movement poll with no pointer event').toEqual({
                intervalArmed  : true,
                mouseouts      : 0,
                observeMovement: true
            });

            // Rig facts 4 + 5: one direct move that parks the source's CORNER anchor inside the target,
            // then two nudges inside the dwell window — the first update over an unmeasured target only
            // starts the preview measurement, the following updates render it, and each update re-arms
            // the commit. The anchor is the coordinator's arithmetic: the source's outer rect plus the
            // inset, and manager.Window takes `screenX/Y` as the FRAME origin, the same basis a CDP
            // bounds move uses — so a frame placed at (left, top) puts the anchor at (left + inset,
            // top + inset), no chrome arithmetic. Aim it 24 px inside the target's viewport.
            const
                goalLeft = Math.round(targetInner.x + 24 - inset),
                goalTop  = Math.round(targetInner.y + 24 - inset);

            for (const [dx, dy] of [[0, 0], [3, 2], [6, 4]]) {
                const moved = await setBounds(sourceHandle, {left: goalLeft + dx, top: goalTop + dy});

                await awaitOriginParity(app, managerId, source.windowId, moved, 'manager.Window follows the source popup through the poll alone');
                await source.popup.waitForTimeout(120)
            }

            // The coordinator's own arithmetic must place the anchor inside the target — the source's
            // OUTER corner plus the inset, against the target's inner rect. It is the precondition every
            // claim below depends on, named here so a placement mistake fails as itself.
            const
                sourceOuter = (await app.callMethod(managerId, 'toJSON')).windows.find(win => win.id === source.windowId)?.outerRect,
                anchor      = sourceOuter && {x: sourceOuter.x + inset, y: sourceOuter.y + inset};

            expect(anchor, 'manager.Window holds the source popup\'s outer rect').toBeTruthy();
            expect(
                anchor.x >= targetInner.x && anchor.x <= targetInner.x + targetInner.width &&
                anchor.y >= targetInner.y && anchor.y <= targetInner.y + targetInner.height,
                `the source's corner anchor ${JSON.stringify(anchor)} sits inside the target ${JSON.stringify(targetInner)} ` +
                `(requested ${goalLeft},${goalTop}; source ${JSON.stringify(await readScreen(source.popup))}; stage ${JSON.stringify(stage)})`
            ).toBe(true);

            // Every movement of the gesture is done: read the trigger witness NOW, while the source
            // realm is certainly alive. The dwell timer is already running, and the commit that retires
            // the source can land while the preview poll below is still reading — so a read placed after
            // it would race the retirement, and any catch on that read would turn a dead probe into a 0.
            expect(await source.popup.evaluate(() => globalThis.__nativeTitlebarMouseouts),
                'no mouseout reached the source realm during the gesture').toBe(0);

            const {claimTrace} = await app.getComponent(coordId, ['claimTrace']);

            expect(claimTrace.at(-1), 'the last claim resolution names the target vessel').toMatchObject({
                claimedStableId: TARGET_WORKSPACE_ID,
                outcome        : 'claimed'
            });

            await expect.poll(() => target.popup.locator('.neo-dock-preview-affordance').count(), {
                message  : 'the target popup renders a drop-zone preview while the source hovers it',
                timeout  : 3000,
                intervals: [25, 50, 100]
            }).toBeGreaterThan(0);

            expect(await page.locator('.neo-dock-preview-affordance').count(), 'the main window renders no preview').toBe(0);

            // Dwell + settle: the native terminal parks the source, commits the transfer into the
            // target vessel and retires the source vessel. The spec never closes a popup itself.
            let receipt;

            try {
                await expect.poll(async () => {
                    const state = await app.getComponent(workspaceId, ['dockModel', 'lastCrossWindowTransfer', 'lastVesselParkReceipt', 'tearOutPanes']);

                    receipt = state;

                    return {
                        applied     : state.lastCrossWindowTransfer?.applied === true,
                        operation   : state.lastCrossWindowTransfer?.descriptor?.operation ?? null,
                        parked      : state.lastVesselParkReceipt?.parked === true,
                        sourceClosed: source.popup.isClosed(),
                        sourcePane  : state.tearOutPanes?.[SOURCE_ITEM] ?? null,
                        target      : state.lastCrossWindowTransfer?.targetWorkspaceId ?? null
                    }
                }, {
                    message  : 'dwelling over the target vessel commits the transfer and retires the source vessel',
                    timeout  : 15000,
                    intervals: [50, 100, 250]
                }).toEqual({
                    applied     : true,
                    operation   : 'transferItem',
                    parked      : true,
                    sourceClosed: true,
                    sourcePane  : null,
                    target      : TARGET_WORKSPACE_ID
                })
            } catch (error) {
                // Bounded triage receipt: which phase the native terminal died in, what the target saw
                // at that instant, and where every window stood in the manager's own coordinates.
                console.log('[native-popup-over-popup-diagnostic]', JSON.stringify({
                    claimTail: ((await app.getComponent(coordId, ['claimTrace'])).claimTrace ?? []).slice(-6)
                        .map(entry => ({claimedStableId: entry.claimedStableId, outcome: entry.outcome, token: entry.gestureToken})),
                    candidates    : await app.getComponent(coordId, ['nativeWindowDropCandidates']).catch(e => String(e)),
                    participations: await participations(app).catch(e => String(e)),
                    popups        : {sourceClosed: source.popup.isClosed(), targetClosed: target.popup.isClosed()},
                    vessels       : await app.getComponent(workspaceId, ['tearOutPanes', 'lastTearOutClose', 'lastVesselRestoreReceipt', 'vesselConversionTargetWindowId']).catch(e => String(e)),
                    park          : receipt?.lastVesselParkReceipt ?? null,
                    snapshot      : await app.callMethod(workspaceId, 'readCrossWindowGestureSnapshot', [{parkedItemId: SOURCE_ITEM, targetWorkspaceId: TARGET_WORKSPACE_ID}]).catch(e => String(e)),
                    transfer      : receipt?.lastCrossWindowTransfer ?? null,
                    windows       : (await app.callMethod(managerId, 'toJSON')).windows.map(win => ({id: win.id, chrome: win.chrome, innerRect: win.innerRect, outerRect: win.outerRect}))
                }, null, 1));
                throw error
            }

            const
                targetDocument = await app.callMethod(workspaceId, 'getWorkspaceDocument', [TARGET_WORKSPACE_ID]),
                mainItems      = Object.values(receipt.dockModel.nodes)
                    .filter(node => node.type === 'tabs')
                    .flatMap(node => node.items || []);

            expect(Object.keys(targetDocument.items).sort(), 'the target vessel document holds both panes').toEqual([SOURCE_ITEM, TARGET_ITEM]);
            expect(targetDocument.nodes[`workstation-vessel-tabs:${TARGET_ITEM}`]?.items, 'the target vessel tabs node lists the transferred pane')
                .toContain(SOURCE_ITEM);
            expect(mainItems, 'the main document no longer lists the transferred pane').not.toContain(SOURCE_ITEM);

            // Object permanence across windows: the transferred item is the SAME live pane instance,
            // now owned by the target vessel's window. It lands as an inactive tab (the target keeps
            // its own active item), so the witness is the instance's window, not its visibility.
            expect(await app.callMethod(workspaceId, 'getPaneIdentity', [SOURCE_ITEM]),
                'the transfer keeps the exact live pane instance').toBe(sourcePane);
            expect((await app.getComponent(sourcePane, ['windowId'])).windowId,
                'the live pane instance now belongs to the target vessel window').toBe(target.windowId);
            expect(pageErrors, 'no page errors during the native drag').toEqual([])
        } finally {
            for (const popup of popups) {
                popup && !popup.isClosed() && await popup.close()
            }
        }
    })
});
