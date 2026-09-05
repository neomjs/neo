import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The native-titlebar popup drag: previews and reintegration with no pointer event at all.
 *
 * The header-action pop-out births its vessel with the new titlebar right under the pointer, so a
 * human grabs the OS titlebar without the cursor ever entering popup content. That gesture emits
 * no `mouseout` in the popup realm and no pointer stream anywhere; the only production signals are
 * the popup's `screenX`/`screenY` changing and the `WindowPosition` poll noticing.
 *
 * Trigger discipline: this spec dispatches NO mouse event to the popup and never calls
 * `publishGeometry()`. CDP `Browser.setWindowBounds` is the physical-window adapter, standing in
 * for the OS window server; every hop from the poll onward is production code. The poll must be
 * armed by the vessel's `observeMovement` config alone, which the spec asserts before moving —
 * a probe whose trigger never armed cannot report green. The popup realm's `mouseout` count is
 * asserted at zero to prove the synthetic half stayed out of the gesture.
 */

const
    asArray = value => Array.isArray(value) ? value : value ? [value] : [],
    readId  = result => result?.properties?.id ?? result?.id ?? (Array.isArray(result) ? readId(result[0]) : null),
    // The zone the popup's corner is parked in: NOT Commit Stream's stored home (right-bottom-tabs),
    // and the trailing child of a horizontal split, so its left band is a sibling insertion.
    TARGET_NODE = 'heavy-tabs';

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
 * @summary Reads the browser-observed viewport origin and size.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function readScreen(page) {
    return page.evaluate(() => ({
        innerHeight: globalThis.innerHeight,
        innerWidth : globalThis.innerWidth,
        screenX    : globalThis.screenX,
        screenY    : globalThis.screenY
    }))
}

/**
 * @summary Moves a native window and waits until the browser reports the new origin.
 * @param {Object} handle
 * @param {Number} left
 * @param {Number} top
 * @returns {Promise<Object>}
 */
async function moveNative(handle, left, top) {
    const {bounds} = await handle.cdp.send('Browser.getWindowBounds', {windowId: handle.windowId});

    await handle.cdp.send('Browser.setWindowBounds', {
        bounds  : {...bounds, left, top, windowState: 'normal'},
        windowId: handle.windowId
    });

    await expect.poll(async () => {
        const screen = await readScreen(handle.page);

        return Math.max(Math.abs(screen.screenX - left), Math.abs(screen.screenY - top))
    }, {
        message  : `native window ${handle.windowId} reaches ${left},${top}`,
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(80);

    return readScreen(handle.page)
}

/**
 * @summary Reads the instance id of the main window's stable cross-window participation.
 * A dock projection refresh destroys and recreates it, so a changed id is the refresh's receipt.
 * @param {Object} app
 * @returns {Promise<String|null>}
 */
async function readMainParticipationId(app) {
    const participations = asArray(await app.findInstances(
        {className: 'Neo.dashboard.dock.window.Participation'}, ['id', 'workspaceId']
    ));

    return participations.find(entry => entry.properties?.workspaceId === 'workstation-main')?.id ?? null
}

/**
 * @summary Reads one window's manager-owned FRAME rect (`outerRect`) from the App Worker — the basis
 * `window.screenX/Y` and CDP window bounds share, so parity with a screen read is exact.
 * @param {Object} app
 * @param {String} managerId
 * @param {String} windowId
 * @returns {Promise<Object|null>}
 */
async function readManagerRect(app, managerId, windowId) {
    const state = await app.callMethod(managerId, 'toJSON');

    return state.windows.find(win => win.id === windowId)?.outerRect ?? null
}

test.describe('Workstation — native titlebar popup drag (#18029)', () => {
    test('a popup moved by its OS titlebar previews the zone under its corner and reintegrates there under dwell', async ({page, neuralLink}) => {
        const pageErrors = [];
        let popup;

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        try {
            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector('.workstation-workspace', {timeout: 30000});

            const
                app         = await neuralLink.connectToApp('Workstation'),
                workspaceId = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
                managerId   = asArray(await app.findInstances({className: 'Neo.manager.Window'}, ['id']))[0]?.id,
                coordId     = asArray(await app.findInstances({className: 'Neo.manager.DragCoordinator'}, ['id']))[0]?.id,
                paneId      = await app.callMethod(workspaceId, 'getPaneIdentity', ['commits']);

            expect(workspaceId, 'one live Workspace').toBeTruthy();
            expect(managerId, 'manager.Window is live').toBeTruthy();
            expect(coordId, 'manager.DragCoordinator is live').toBeTruthy();
            expect(paneId, 'Commit Stream owns a live pane before pop-out').toBeTruthy();

            // The main window's stable target is re-registered by every dock projection refresh
            // (`afterRefreshDockWorkspace` → `refreshCrossWindowParticipation`). Capture its identity
            // before the pop-out so the detach projection's refresh can be observed landing below.
            const mainParticipationBeforePopOut = await readMainParticipationId(app);

            expect(mainParticipationBeforePopOut, 'the main window registers a stable cross-window target').toBeTruthy();

            // Pop-out through the real header action, exactly the reported gesture's first half.
            let chrome;

            await expect.poll(async () => {
                chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', ['right-bottom-tabs']);

                return chrome?.buttons?.commits ?? null
            }, {
                message  : 'right-bottom-tabs projects commits into live tab chrome',
                timeout  : 10000,
                intervals: [25, 50, 100]
            }).toBeTruthy();

            await page.locator(`#${chrome.buttons.commits}`).click();

            const action = await app.callMethod(chrome.containerId, 'getAction', ['pop-out']);

            expect(action?.id, 'pop-out resolves on the live tab owner').toBeTruthy();
            await expect(page.locator(`#${action.id}`), 'pop-out is user-reachable').toBeVisible({timeout: 10000});

            const popupPromise = page.waitForEvent('popup', {timeout: 30000});

            await page.locator(`#${action.id}`).click();
            popup = await popupPromise;
            await popup.waitForSelector('.workstation-viewport', {timeout: 30000});

            // The realm-side witness for the trigger discipline: installed before anything else
            // touches the popup, it must stay empty for the whole gesture.
            await popup.evaluate(() => {
                globalThis.__nativeTitlebarMouseouts = 0;
                globalThis.addEventListener('mouseout', () => globalThis.__nativeTitlebarMouseouts++)
            });

            let popupWindowId;

            await expect.poll(async () => {
                const state = await app.getComponent(workspaceId, ['lastVesselOpen', 'tearOutPanes']);

                popupWindowId = state.tearOutPanes?.commits?.windowId ?? null;

                return {stage: state.lastVesselOpen?.stage, windowId: popupWindowId}
            }, {
                message  : 'the header action reaches vessel admission and adoption',
                timeout  : 30000,
                intervals: [50, 100, 250]
            }).toEqual({stage: 'granted', windowId: expect.any(String)});

            // Adoption settles before the titlebar is grabbed, as it does for a human: the live pane
            // has left the main window, the popup shows it, and the detach projection's refresh has
            // re-registered the main target. A native candidate claimed BEFORE that refresh dies with
            // the zone it claimed (the coordinator tolerates refreshes only while settling a drop), so
            // moving earlier would test the projection race rather than the reported gesture.
            await expect(page.locator(`#${paneId}`), 'the main window releases the live pane').toHaveCount(0);
            await expect(popup.locator(`#${paneId}`), 'the popup adopts the exact live pane').toBeVisible();
            await expect.poll(() => readMainParticipationId(app), {
                message  : 'the detach projection refresh re-registers the main cross-window target',
                timeout  : 15000,
                intervals: [50, 100, 250]
            }).not.toBe(mainParticipationBeforePopOut);

            const
                mainHandle  = await acquireNativeWindow(page),
                popupHandle = await acquireNativeWindow(popup);

            expect(popupHandle.windowId, 'the popup is a distinct native window').not.toBe(mainHandle.windowId);

            // Positive control for the drag-source branch: the coordinator resolves the moving popup
            // to a live native drag before any movement happens.
            const dragSource = await app.callMethod(coordId, 'getNativeWindowDragSource', [popupWindowId]);

            expect(dragSource?.widgetName, 'the popup resolves to a live native drag source').toBe('commits');

            // The poll must be armed by config, with no pointer event having reached the realm.
            await expect.poll(() => popup.evaluate(() => {
                const addon = globalThis.Neo.main.addon.WindowPosition;

                return {
                    armed          : Boolean(addon.intervalId),
                    mouseouts      : globalThis.__nativeTitlebarMouseouts,
                    observeMovement: addon.observeMovement
                }
            }), {
                message  : 'the vessel realm owns an armed movement poll without any pointer event',
                timeout  : 10000,
                intervals: [25, 50, 100]
            }).toEqual({armed: true, mouseouts: 0, observeMovement: true});

            const
                mainParticipationAtGrab              = await readMainParticipationId(app),
                mainRect                             = await readManagerRect(app, managerId, (await app.getComponent(workspaceId, ['windowId'])).windowId),
                popupBefore                          = await readScreen(popup),
                {nativeWindowDropAnchorInset: inset} = await app.getComponent(coordId, ['nativeWindowDropAnchorInset']),
                zoneId                               = readId(await app.queryComponent({dockNodeId: TARGET_NODE}, ['id'])),
                zoneBox                              = zoneId && await page.locator(`#${zoneId}`).boundingBox();

            expect(mainRect, 'manager.Window holds the main window rect').toBeTruthy();
            expect(zoneBox, `${TARGET_NODE} is a measurable drop zone`).toBeTruthy();

            // The drop anchor is the popup's outer top-left corner, inset — the one point an opaque
            // popup cannot hide. Aim it at the LEFT band of a zone that is not the pane's stored home,
            // below the header carve-out and clear of the centre indicator chips: that zone sits in a
            // horizontal split, so the band is a sibling insertion whose region overlay paints beside
            // the corner. CDP bounds are the frame origin, so the requested origin IS the corner.
            const
                anchor     = {x: zoneBox.x + 10, y: zoneBox.y + zoneBox.height * 0.6},
                targetLeft = Math.round(mainRect.x + anchor.x - inset),
                targetTop  = Math.round(mainRect.y + anchor.y - inset);

            // Walk the popup's corner onto that band. After every step the manager rect must catch
            // up through the production poll: no publishGeometry() call, no pointer event.
            for (const step of [0.5, 1]) {
                const
                    left   = Math.round(popupBefore.screenX + (targetLeft - popupBefore.screenX) * step),
                    top    = Math.round(popupBefore.screenY + (targetTop  - popupBefore.screenY) * step),
                    screen = await moveNative(popupHandle, left, top);

                await expect.poll(async () => {
                    const managed = await readManagerRect(app, managerId, popupWindowId);

                    return managed ? Math.max(Math.abs(managed.x - screen.screenX), Math.abs(managed.y - screen.screenY)) : Infinity
                }, {
                    message  : `manager.Window follows the popup to step ${step} through the poll alone`,
                    timeout  : 5000,
                    intervals: [25, 50, 100]
                }).toBeLessThanOrEqual(2)
            }

            // Land the anchor exactly where the coordinator will read it: it anchors on the manager's
            // OUTER rect, whose relation to the CDP frame origin is the platform's to define, so read
            // that rect back and correct the residual once. The receipt is the coordinator's own
            // arithmetic — outer corner + inset, in the main window's local space — at the aimed point.
            const
                readAnchor = async () => {
                    const outer = (await app.callMethod(managerId, 'toJSON')).windows.find(win => win.id === popupWindowId)?.outerRect;

                    return outer ? {x: outer.x + inset - mainRect.x, y: outer.y + inset - mainRect.y} : null
                },
                residual   = anchorNow => anchorNow ? Math.max(Math.abs(anchorNow.x - anchor.x), Math.abs(anchorNow.y - anchor.y)) : Infinity;

            let anchorNow = await readAnchor();

            if (residual(anchorNow) > 1) {
                await moveNative(popupHandle, Math.round(targetLeft - (anchorNow.x - anchor.x)), Math.round(targetTop - (anchorNow.y - anchor.y)));

                await expect.poll(async () => residual(anchorNow = await readAnchor()), {
                    message  : 'the popup\'s corner anchor lands on the aimed band point',
                    timeout  : 5000,
                    intervals: [25, 50, 100]
                }).toBeLessThanOrEqual(2)
            }

            // The reported defect: previews must render in the target realm while the popup is over
            // it — and with the corner in a split band, as a REGION overlay, not only as indicator arrows.
            await expect.poll(() => page.locator('.neo-dock-preview-region').count(), {
                message  : 'the main window renders a region overlay while the popup\'s corner sits in a split band',
                timeout  : 5000,
                intervals: [50, 100, 250]
            }).toBeGreaterThan(0);

            const snapshot = await app.callMethod(workspaceId, 'readCrossWindowGestureSnapshot', [{targetWorkspaceId: 'workstation-main'}]);

            expect(snapshot.rendered, 'the painted preview is the band\'s sibling insertion, not the stored home')
                .toMatchObject({placement: {kind: 'split-before'}, target: {nodeId: TARGET_NODE}});
            expect(snapshot.preview?.previewId, 'the semantic and painted previews agree').toBe(snapshot.rendered.previewId);

            expect(await popup.evaluate(() => globalThis.__nativeTitlebarMouseouts),
                'no mouseout reached the popup realm during the gesture').toBe(0);
            expect(await readMainParticipationId(app),
                'the claimed target keeps its registration through the hover').toBe(mainParticipationAtGrab);

            // Reintegration under the settle/dwell contract, while the popup stays over the target.
            // The spec never closes the popup; the coordinator's commit retires the vessel.
            try {
                await expect.poll(async () => {
                    const state = await app.getComponent(workspaceId, ['dockModel', 'tearOutPanes']);

                    return {
                        inTree: Object.values(state.dockModel.nodes)
                            .some(node => node.type === 'tabs' && node.items?.includes('commits')),
                        pane  : state.tearOutPanes?.commits ?? null
                    }
                }, {
                    message  : 'dwelling over the main window reintegrates Commit Stream without a close',
                    timeout  : 15000,
                    intervals: [50, 100, 250]
                }).toEqual({inTree: true, pane: null})
            } catch (error) {
                // Bounded triage receipt: which phase the native terminal died in, and whether the
                // target registration survived the hover.
                const diagnostic = {
                    coordinator      : await app.getComponent(coordId, ['nativeWindowDropCandidates', 'nativeHoverTargets', 'claimTrace']).catch(e => String(e)),
                    mainParticipation: {atGrab: mainParticipationAtGrab, now: await readMainParticipationId(app).catch(e => String(e))},
                    popupClosed      : popup.isClosed(),
                    popupScreen      : popup.isClosed() ? null : await readScreen(popup).catch(e => String(e)),
                    previews         : await page.locator('.neo-dock-preview-affordance').count(),
                    workspace        : await app.getComponent(workspaceId, [
                        'lastTearOutClose', 'lastVesselParkReceipt', 'lastVesselRestoreReceipt',
                        'tearOutPanes', 'tearOutParkGeometries', 'tearOutRetirements'
                    ]).catch(e => String(e))
                };

                console.log('[native-titlebar-diagnostic]', JSON.stringify(diagnostic, null, 1));
                throw error
            }

            await expect.poll(() => popup.isClosed(), {
                message: 'the committed reintegration retires the physical vessel',
                timeout: 10000
            }).toBe(true);

            // The drop lands where the corner pointed: a fresh tabs node inserted BEFORE the band's
            // zone in a horizontal split — not at the pane's stored home.
            const
                {dockModel} = await app.getComponent(workspaceId, ['dockModel']),
                landing     = Object.entries(dockModel.nodes).find(([, node]) => node.type === 'tabs' && node.items?.includes('commits'))?.[0],
                split       = Object.values(dockModel.nodes).find(node => node.type === 'split' && node.children?.[0] === landing);

            expect(landing, 'Commit Stream lands in a fresh tabs node, not its stored home').not.toBe('right-bottom-tabs');
            expect(split, 'the landing node is the leading sibling of the band\'s zone')
                .toMatchObject({orientation: 'horizontal', children: [landing, TARGET_NODE]});

            expect(await app.callMethod(workspaceId, 'getPaneIdentity', ['commits']),
                'reintegration retains the exact live pane instance').toBe(paneId);
            await expect(page.locator(`#${paneId}`), 'the live pane is back in the main window').toBeVisible();
            expect(await page.locator('.neo-dock-preview-affordance').count(), 'previews clear after the commit').toBe(0);
            expect(pageErrors, 'no page errors during the native drag').toEqual([])
        } finally {
            popup && !popup.isClosed() && await popup.close()
        }
    })
});
