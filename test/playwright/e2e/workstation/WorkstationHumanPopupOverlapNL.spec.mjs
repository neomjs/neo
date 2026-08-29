import {expect, test} from '../../fixtures.mjs';

const MATRIX_CELLS = [
        {
            itemId      : 'commits',
            label       : 'Commits',
            name        : 'small-over-large',
            sourceNodeId: 'right-bottom-tabs',
            sourceSize  : {height: 300, width: 360},
            targetSize  : {height: 560, width: 760}
        },
        {
            itemId      : 'audit',
            label       : 'Audit',
            name        : 'large-over-small',
            sourceNodeId: 'right-top-tabs',
            sourceSize  : {height: 560, width: 760},
            targetSize  : {height: 300, width: 360}
        },
        {
            itemId      : 'feed',
            label       : 'Live Event Stream',
            name        : 'near-equal',
            sourceNodeId: 'bottom-tabs',
            sourceSize  : {height: 480, width: 620},
            targetSize  : {height: 460, width: 600}
        },
        {
            itemId       : 'alerts',
            label        : 'Priority Alert Observatory',
            name         : 'post-resize-asymmetric',
            preSourceSize: {height: 400, width: 500},
            preTargetSize: {height: 480, width: 620},
            sourceNodeId : 'heavy-tabs',
            sourceSize   : {height: 520, width: 740},
            targetSize   : {height: 320, width: 400}
        }
    ],
    MATRIX_CELL           = MATRIX_CELLS.find(cell =>
        cell.name === (process.env.NEO_POPUP_CELL || 'large-over-small')),
    PARTIAL_OVERLAP_RATIO = .68,
    TARGET_ITEM_ID        = 'metrics',
    TARGET_WORKSPACE_ID   = 'workstation-vessel:metrics';

if (!MATRIX_CELL) {
    throw new Error(`Unknown NEO_POPUP_CELL: ${process.env.NEO_POPUP_CELL}`)
}

/**
 * @summary Returns clone-safe rectangle fields from browser, manager, or DOM geometry.
 * @param {Object|null} rect
 * @returns {Object|null}
 */
function pickRect(rect) {
    return rect && {
        height: rect.height,
        width : rect.width,
        x     : rect.x,
        y     : rect.y
    }
}

/**
 * @summary Resolves exactly one Neural Link instance.
 * @param {Object} app
 * @param {Object} selector
 * @param {String[]} properties
 * @returns {Promise<Object>}
 */
async function findOne(app, selector, properties) {
    const
        found = await app.findInstances(selector, properties),
        list  = Array.isArray(found) ? found : found ? [found] : [];

    expect(list, `one ${JSON.stringify(selector)}`).toHaveLength(1);

    return list[0]
}

/**
 * @summary Reads the current browser-observed inner and outer native geometry.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
function readBrowserGeometry(page) {
    return page.evaluate(() => ({
        inner: {
            height: globalThis.innerHeight,
            width : globalThis.innerWidth,
            x     : globalThis.screenX,
            y     : globalThis.screenY
        },
        outer: {
            height: globalThis.outerHeight,
            width : globalThis.outerWidth
        }
    }))
}

/**
 * @summary Preserves the original popup-witness failure when a diagnostic page has already closed.
 * @param {import('@playwright/test').Page} page
 * @param {Function} reader
 * @returns {Promise<Object>}
 */
async function readPageDiagnostic(page, reader) {
    try {
        return await reader()
    } catch (error) {
        return {closed: page.isClosed(), error: error.message}
    }
}

/**
 * @summary Reads the display envelope currently containing one browser window.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
function readScreenEnvelope(page) {
    return page.evaluate(() => ({
        height: globalThis.screen.availHeight,
        left  : globalThis.screen.availLeft,
        top   : globalThis.screen.availTop,
        width : globalThis.screen.availWidth
    }))
}

/**
 * @summary Acquires the Chromium native-window adapter for one real Playwright Page.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
async function acquireNativeWindow(page) {
    const
        cdp        = await page.context().newCDPSession(page),
        {windowId} = await cdp.send('Browser.getWindowForTarget');

    return {cdp, page, windowId}
}

/**
 * @summary Sets real native bounds, then publishes the target realm's observed full geometry.
 * CDP is deliberately only the physical-window adapter; no gesture or dock semantic rides it.
 * @param {Object} handle
 * @param {Object} bounds
 * @returns {Promise<Object>}
 */
async function setNativeBounds(handle, bounds) {
    await handle.cdp.send('Browser.setWindowBounds', {
        bounds  : {...bounds, windowState: 'normal'},
        windowId: handle.windowId
    });

    if (Number.isFinite(bounds.left) && Number.isFinite(bounds.top)) {
        await expect.poll(async () => {
            const observed = (await readBrowserGeometry(handle.page)).inner;

            return Math.max(
                Math.abs(observed.x - bounds.left),
                Math.abs(observed.y - bounds.top)
            )
        }, {
            message  : `native window ${handle.windowId} reaches its requested origin`,
            timeout  : 5000,
            intervals: [25, 50, 100]
        }).toBeLessThanOrEqual(80)
    }

    if (Number.isFinite(bounds.height) || Number.isFinite(bounds.width)) {
        const current = await handle.cdp.send('Browser.getWindowBounds', {windowId: handle.windowId});

        await handle.cdp.send('Browser.setWindowBounds', {
            bounds: {
                ...current.bounds,
                height     : current.bounds.height + 1,
                windowState: 'normal'
            },
            windowId: handle.windowId
        });
        await handle.cdp.send('Browser.setWindowBounds', {
            bounds  : {...current.bounds, windowState: 'normal'},
            windowId: handle.windowId
        })
    }

    await handle.page.evaluate(() => globalThis.Neo.main.addon.WindowPosition.publishGeometry());

    return readBrowserGeometry(handle.page)
}

/**
 * @summary Resizes a real native window without changing its current outer origin.
 * @param {Object} handle
 * @param {Object} size
 * @returns {Promise<Object>}
 */
async function setNativeSize(handle, size) {
    const {bounds} = await handle.cdp.send('Browser.getWindowBounds', {windowId: handle.windowId});

    return setNativeBounds(handle, {...bounds, ...size})
}

/**
 * @summary Reads one runtime window's current manager-owned inner rectangle.
 * @param {Object} app
 * @param {String} managerId
 * @param {String} windowId
 * @returns {Promise<Object|null>}
 */
async function readManagerRect(app, managerId, windowId) {
    const
        state = await app.callMethod(managerId, 'toJSON'),
        win   = state.windows.find(candidate => candidate.id === windowId);

    return pickRect(win?.innerRect)
}

/**
 * @summary Waits until browser observation and App-Worker topology agree on one live rectangle.
 * @param {Object} app
 * @param {String} managerId
 * @param {Object} page
 * @param {String} windowId
 * @returns {Promise<Object>}
 */
async function awaitGeometryParity(app, managerId, page, windowId) {
    let receipt;

    await expect.poll(async () => {
        const
            browser = await readBrowserGeometry(page),
            managed = await readManagerRect(app, managerId, windowId),
            deltas  = managed && ['x', 'y', 'width', 'height']
                .map(key => Math.abs(browser.inner[key] - managed[key]));

        receipt = {browser, managed};

        return deltas ? Math.max(...deltas) : Infinity
    }, {
        message  : `window ${windowId} publishes current browser geometry`,
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(2);

    return receipt
}

/**
 * @summary Waits for the browser-side pointer owner to reach its between-gestures baseline.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
async function awaitPointerSessionIdle(page) {
    let state;

    await expect.poll(async () => {
        state = await page.evaluate(() => {
            const addon = globalThis.Neo.main.addon.DragDrop;

            return {
                dragProxyPresent: Boolean(addon.dragProxyElement),
                dragZoneId      : addon.dragZoneId,
                isWindowDragging: addon.isWindowDragging,
                windowDragParked: addon.windowDragParked
            }
        });

        return state
    }, {
        message  : 'the browser pointer owner settles before the next trusted gesture',
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toEqual({
        dragProxyPresent: false,
        dragZoneId      : null,
        isWindowDragging: false,
        windowDragParked: false
    });
    await expect(
        page.locator('.neo-is-dragging'),
        'the previous worker-side drag presentation retires before the next trusted gesture'
    ).toHaveCount(0, {timeout: 10000});

    return state
}

/**
 * @summary Reads whether one committed bare popup keeps its pane and overlay in the same viewport.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
function readBarePopupLayout(page) {
    return page.evaluate(() => {
        const
            viewport   = document.querySelector('.workstation-popout-host'),
            pane       = viewport?.querySelector(':scope > .workstation-pane'),
            indicators = viewport?.querySelector(':scope > .neo-dashboard-dock-drop-indicators'),
            pick       = element => {
                const rect = element?.getBoundingClientRect();

                return rect && {
                    height: rect.height,
                    width : rect.width,
                    x     : rect.x,
                    y     : rect.y
                }
            };

        return {
            hasContainerSheet: [...document.styleSheets].some(sheet =>
                sheet.href?.includes('/dashboard/Container.css')
            ),
            indicatorPosition: indicators && getComputedStyle(indicators).position,
            indicators       : pick(indicators),
            pane             : pick(pane),
            viewport         : pick(viewport)
        }
    })
}

/**
 * @summary Computes the live smaller-extent per-axis conversion metric.
 * @param {Object} source
 * @param {Object} target
 * @returns {Object}
 */
function sampleMetric(source, target) {
    const
        overlapWidth = Math.max(
            0,
            Math.min(source.x + source.width, target.x + target.width) - Math.max(source.x, target.x)
        ),
        overlapHeight = Math.max(
            0,
            Math.min(source.y + source.height, target.y + target.height) - Math.max(source.y, target.y)
        ),
        rx    = overlapWidth  / Math.min(source.width,  target.width),
        ry    = overlapHeight / Math.min(source.height, target.height),
        score = Math.min(rx, ry);

    return {overlapHeight, overlapWidth, rx, ry, score}
}

/**
 * @summary Drives a genuine trusted tab-header pointer gesture until a real popup connects,
 * while intentionally retaining the pressed button.
 * @param {Object} data
 * @param {Object} data.page
 * @param {String} data.label
 * @returns {Promise<Object>}
 */
async function beginActualTearOut({page, label}) {
    const button = page.locator('.neo-tab-header-button.neo-draggable').filter({hasText: label}).first();

    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.hasFocus()), {
        message  : `the '${label}' source window owns native focus`,
        timeout  : 5000,
        intervals: [25, 50]
    }).toBe(true);
    await expect(button, `the '${label}' tab header is a visible real pointer source`).toBeVisible();

    let hit, layout;

    await expect.poll(async () => {
        const locatorBox = await button.boundingBox();

        layout = await button.evaluate(element => {
            const
                buttonRect   = element.getBoundingClientRect(),
                boundaryRect = element.closest('.neo-dashboard-dock-tabs')?.getBoundingClientRect(),
                pick         = rect => rect && ({
                    bottom: rect.bottom,
                    height: rect.height,
                    left  : rect.left,
                    right : rect.right,
                    top   : rect.top,
                    width : rect.width,
                    x     : rect.x,
                    y     : rect.y
                });

            return {
                boundary: pick(boundaryRect),
                button  : pick(buttonRect),
                viewport: {height: innerHeight, width: innerWidth}
            }
        });
        hit = await button.evaluate((element, {layout, locatorBox}) => {
            const candidates = [
                {
                    coordinateSpace: 'renderer',
                    x              : layout.button.x + layout.button.width  / 2,
                    y              : layout.button.y + layout.button.height / 2
                },
                locatorBox && {
                    coordinateSpace: 'locator',
                    x              : locatorBox.x + locatorBox.width  / 2,
                    y              : locatorBox.y + locatorBox.height / 2
                }
            ].filter(Boolean).map(candidate => {
                const owner = document.elementFromPoint(candidate.x, candidate.y);

                return {
                    ...candidate,
                    ownerClass: owner?.className || null,
                    ownerId   : owner?.id || null,
                    ownerTag  : owner?.tagName || null,
                    within    : owner === element || element.contains(owner)
                }
            });

            return {
                candidates,
                locatorBox,
                rendererBox: layout.button,
                viewport   : layout.viewport,
                ...candidates.find(candidate => candidate.within)
            }
        }, {layout, locatorBox});

        return hit.within === true
    }, {
        message  : `the '${label}' tab center becomes a real pointer hit after projection settles`,
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toBe(true);

    const
        boundary      = layout.boundary,
        rendererStart = {
            x: layout.button.x + layout.button.width  / 2,
            y: layout.button.y + layout.button.height / 2
        },
        start = {x: hit.x, y: hit.y},
        projectedX = start.x + boundary.right + 40 - rendererStart.x,
        out = {
            // A dock-tabs boundary can occupy only one column of the main viewport. Crossing
            // that local boundary is not a native tear-out; guarantee the trusted pointer
            // traverses the browser viewport edge for every workstation topology. Keep the
            // orthogonal coordinate in the usable-screen interior: a bottom-row tab otherwise
            // asks macOS to birth and later park its popup below the movable window range.
            x: Math.round(Math.max(projectedX, layout.viewport.width + 40)),
            y: Math.round(Math.min(360, Math.max(96, start.y)))
        };

    expect(
        out.x > layout.viewport.width || out.y > layout.viewport.height,
        `the '${label}' drag endpoint crosses the source viewport`
    ).toBe(true);

    const
        popupWait = page.waitForEvent('popup', {timeout: 30000}),
        toolbar   = page.locator('.neo-tab-header-toolbar.neo-is-dragging');

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.waitForTimeout(130);

    for (let index = 1; index <= 8 && await toolbar.count() === 0; index++) {
        const ratio = index / 8;

        await page.mouse.move(start.x + 16 * ratio, start.y + 24 * ratio);
        await page.waitForTimeout(34)
    }

    await expect(toolbar, `the '${label}' toolbar owns a live pointer drag`).toBeVisible({timeout: 1500});

    for (let index = 1; index <= 14; index++) {
        const ratio = index / 14;

        await page.mouse.move(
            start.x + (out.x - start.x) * ratio,
            start.y + (out.y - start.y) * ratio
        );
        await page.waitForTimeout(20)
    }

    const popup = await popupWait;

    await popup.waitForURL(url => url.searchParams.has('popout'), {
        timeout  : 30000,
        waitUntil: 'domcontentloaded'
    });
    await popup.waitForSelector('.workstation-viewport', {timeout: 30000});

    for (let index = 1; index <= 3; index++) {
        await page.mouse.move(out.x, out.y + index * 12);
        await page.waitForTimeout(30)
    }

    return {button, hit, out: {x: out.x, y: out.y + 36}, popup}
}

/**
 * @summary Reads a vessel runtime window id from pre-terminal or committed ownership.
 * @param {Object} app
 * @param {String} wsId
 * @param {String} itemId
 * @param {Boolean} committed
 * @returns {Promise<String>}
 */
async function awaitVesselWindowId(app, wsId, itemId, committed) {
    let windowId;

    await expect.poll(async () => {
        const state = await app.getComponent(wsId, ['tearOutConnects', 'tearOutPanes']);

        windowId = (committed ? state.tearOutPanes : state.tearOutConnects)?.[itemId]?.windowId ?? null;

        return windowId
    }, {
        message  : `${committed ? 'committed' : 'held'} vessel '${itemId}' connects`,
        timeout  : 15000,
        intervals: [50, 100]
    }).toBeTruthy();

    return windowId
}

/**
 * @summary Waits for a retired popup generation to leave every App-Worker topology owner.
 * @param {Object} app
 * @param {String} managerId
 * @param {String} wsId
 * @param {String} itemId
 * @param {String} windowId
 * @returns {Promise<Object>}
 */
async function awaitVesselRetirement(app, managerId, wsId, itemId, windowId) {
    let receipt;

    await expect.poll(async () => {
        const
            state   = await app.getComponent(wsId, ['tearOutConnects', 'tearOutPanes']),
            manager = await app.callMethod(managerId, 'toJSON');

        return receipt = {
            connected : Boolean(state.tearOutConnects?.[itemId]),
            committed : Boolean(state.tearOutPanes?.[itemId]),
            registered: manager.windows.some(win => win.id === windowId)
        }
    }, {
        message  : `retired vessel '${itemId}' leaves connection, commit, and window topology`,
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toEqual({connected: false, committed: false, registered: false});

    return receipt
}

/**
 * @summary Positions the target so the still-held pointer yields calibrated partial overlap.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function positionTargetForPartialOverlap({
    app,
    managerId,
    ratio,
    source,
    targetHandle,
    targetWindowId
}) {
    let target = await awaitGeometryParity(
        app,
        managerId,
        targetHandle.page,
        targetWindowId
    );

    const
        overlapWidth  = ratio * Math.min(source.managed.width,  target.managed.width),
        overlapHeight = ratio * Math.min(source.managed.height, target.managed.height),
        desiredX      = source.managed.x + overlapWidth  - target.managed.width,
        desiredY      = source.managed.y + overlapHeight - target.managed.height,
        {bounds}      = await targetHandle.cdp.send('Browser.getWindowBounds', {windowId: targetHandle.windowId});

    await setNativeBounds(targetHandle, {
        ...bounds,
        left: Math.round(bounds.left + desiredX - target.managed.x),
        top : Math.round(bounds.top  + desiredY - target.managed.y)
    });
    target = await awaitGeometryParity(app, managerId, targetHandle.page, targetWindowId);

    return {metric: sampleMetric(source.managed, target.managed), target}
}

/**
 * @summary Actual-pointer proof that a human popup-over-popup drag materializes early.
 *
 * Every gesture input is Playwright's trusted `page.mouse` stream. CDP only controls physical
 * native window bounds so the matrix is deterministic. The held source is never released until
 * exactly one target-local proxy, the target indicators, and its preview coexist. The
 * representative size-asymmetric cell retains renderer and semantic receipts across a live
 * pointer-follow move. Each cell then converts out, restoring the identical popup and exact outer
 * extent before Escape cancels it.
 *
 * The ordinary E2E profile retains `--disable-frame-rate-limit` for engine / OffscreenCanvas
 * coverage. `NEO_FILM_TAKE=1` replays the identical assertions with on-glass compositing; the
 * always-on Playwright trace records the proven target-popup frame without injecting a screenshot
 * action into the held gesture. One matrix cell runs per fresh browser process because Chromium's
 * separate native-window churn can terminate the next reused worker browser. `large-over-small`
 * is the representative default; set `NEO_POPUP_CELL` to execute any other named cell.
 * `NEO_POPUP_PROOF_HOLD_MS` optionally holds the proven coexistence frame for native observation
 * without changing the gesture.
 */
test.describe('Workstation — human popup-over-popup conversion (#16117)', () => {
    test.setTimeout(240000);
    test.use({colorScheme: 'dark', viewport: null});

    test(`${MATRIX_CELL.name}: one local proxy plus readable target choices`,
    async ({page, neuralLink}, testInfo) => {
        await test.step(MATRIX_CELL.name, async () => {
            const cell = MATRIX_CELL;

            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
            await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
            await page.waitForFunction(() => {
                const host = document.querySelector('.workstation-dock-host');

                return host?.getBoundingClientRect().height > 300
            }, {timeout: 60000});
            await page.waitForTimeout(1200);

            const
                app        = await neuralLink.connectToApp('Workstation'),
                workspace  = await findOne(app, {className: 'Workstation.view.Workspace'}, ['id']),
                manager    = await findOne(app, {className: 'Neo.manager.Window'}, ['id']),
                wsId       = workspace.id,
                managerId  = manager.id,
                mainHandle = await acquireNativeWindow(page),
                screen     = await page.evaluate(() => ({
                    fullHeight: globalThis.screen.height,
                    fullWidth : globalThis.screen.width,
                    height    : globalThis.screen.availHeight,
                    left      : globalThis.screen.availLeft,
                    top       : globalThis.screen.availTop,
                    width     : globalThis.screen.availWidth
                }));

            const requiredStageWidth = Math.ceil(
                cell.sourceSize.width + cell.targetSize.width -
                PARTIAL_OVERLAP_RATIO * Math.min(cell.sourceSize.width, cell.targetSize.width)
            );

            test.skip(
                screen.width < requiredStageWidth,
                `${cell.name}: ${screen.width}px stage cannot contain the ${requiredStageWidth}px ` +
                'minimum union for two reachable popup extents at the calibrated partial overlap'
            );

            await setNativeBounds(mainHandle, {
                height: Math.min(820, screen.height - 80),
                left  : screen.left + 24,
                top   : screen.top  + 24,
                // Keep even the 760px large-source cell centered on this display. A source whose
                // center crosses onto another display makes Chrome's unpermissioned window.moveTo
                // clamp to that display; multi-display transport belongs to the portability matrix,
                // not this same-display asymmetric-size witness.
                width : Math.min(1080, screen.width - 80)
            });

            let pointerDown = false,
                sourcePage,
                targetPage,
                targetHandle;

            const receipts = [];

            try {
                const targetGesture = await beginActualTearOut({label: 'Metrics', page});

                pointerDown = true;
                targetPage  = targetGesture.popup;

                const targetWindowId = await awaitVesselWindowId(app, wsId, TARGET_ITEM_ID, false);

                await page.mouse.up();
                pointerDown = false;

                await expect.poll(async () => {
                    const {dockModel} = await app.getComponent(wsId, ['dockModel']);

                    return Object.values(dockModel.nodes).some(node => node.items?.includes(TARGET_ITEM_ID))
                }, {
                    message  : 'the actual-pointer Metrics release commits its detached target vessel',
                    timeout  : 15000,
                    intervals: [50, 100]
                }).toBe(false);
                expect(await awaitVesselWindowId(app, wsId, TARGET_ITEM_ID, true)).toBe(targetWindowId);
                await awaitPointerSessionIdle(page);

                targetHandle = await acquireNativeWindow(targetPage);

                await setNativeBounds(targetHandle, {
                        ...cell.targetSize,
                        left: screen.left + 10,
                        top : screen.top  + 10
                    });

                    let targetLayout,
                        targetLayoutReceipt;

                    await expect.poll(async () => {
                        targetLayout = await readBarePopupLayout(targetPage);

                        const edgeDelta = (first, second) => ({
                            bottom: Math.abs(
                                ((first?.y ?? Infinity) + (first?.height ?? 0)) -
                                ((second?.y ?? 0) + (second?.height ?? 0))
                            ),
                            left : Math.abs((first?.x ?? Infinity) - (second?.x ?? 0)),
                            right: Math.abs(
                                ((first?.x ?? Infinity) + (first?.width ?? 0)) -
                                ((second?.x ?? 0) + (second?.width ?? 0))
                            ),
                            top: Math.abs((first?.y ?? Infinity) - (second?.y ?? 0))
                        }),
                        indicatorEdges = edgeDelta(targetLayout.indicators, targetLayout.viewport),
                        paneEdges      = edgeDelta(targetLayout.pane, targetLayout.viewport);

                        return targetLayoutReceipt = {
                            hasContainerSheet            : targetLayout.hasContainerSheet,
                            indicatorEdges,
                            indicatorEdgesWithinTolerance: Object.values(indicatorEdges)
                                .every(delta => delta <= 1),
                            indicatorPosition: targetLayout.indicatorPosition,
                            nonzero          : [
                                targetLayout.viewport,
                                targetLayout.pane,
                                targetLayout.indicators
                            ].every(rect => rect?.width > 0 && rect?.height > 0),
                            paneEdges,
                            paneEdgesWithinTolerance: Object.values(paneEdges).every(delta => delta <= 1)
                        }
                    }, {
                        message  : `${cell.name}: the committed target pane fills its popup beside an overlay`,
                        timeout  : 10000,
                        intervals: [25, 50, 100]
                    }).toMatchObject({
                        hasContainerSheet            : true,
                        indicatorEdgesWithinTolerance: true,
                        indicatorPosition            : 'absolute',
                        nonzero                      : true,
                        paneEdgesWithinTolerance     : true
                    });

                    for (const edge of ['bottom', 'left', 'right', 'top']) {
                        expect(
                            targetLayoutReceipt.paneEdges[edge],
                            `${cell.name}: pane ${edge} edge tracks its popup viewport`
                        ).toBeLessThanOrEqual(1);
                        expect(
                            targetLayoutReceipt.indicatorEdges[edge],
                            `${cell.name}: indicator overlay ${edge} edge tracks its popup viewport`
                        ).toBeLessThanOrEqual(1)
                    }

                    const sourceGesture = await beginActualTearOut({label: cell.label, page});

                    sourcePage = sourceGesture.popup;

                    pointerDown = true;

                    const
                        sourceWindowId = await awaitVesselWindowId(app, wsId, cell.itemId, false),
                        sourceZone     = await findOne(app, {
                            className       : 'Neo.dashboard.dock.interaction.TabSortZone',
                            dockSourceNodeId: cell.sourceNodeId,
                            dockWorkspaceId : 'workstation-main'
                        }, ['id']),
                        sourceZoneId = sourceZone.id,
                        sourceHandle = await acquireNativeWindow(sourcePage);

                    let resizedFrom = null;

                    if (cell.preSourceSize && cell.preTargetSize) {
                        await setNativeSize(targetHandle, cell.preTargetSize);
                        await setNativeSize(sourceHandle, cell.preSourceSize);
                        resizedFrom = {
                            source: await awaitGeometryParity(
                                app,
                                managerId,
                                sourcePage,
                                sourceWindowId
                            ),
                            target: await awaitGeometryParity(
                                app,
                                managerId,
                                targetPage,
                                targetWindowId
                            )
                        }
                    }

                    await setNativeSize(targetHandle, cell.targetSize);
                    await setNativeSize(sourceHandle, cell.sourceSize);

                    const
                        sourceBefore = await awaitGeometryParity(
                            app,
                            managerId,
                            sourcePage,
                            sourceWindowId
                        ),
                        positioned = await positionTargetForPartialOverlap({
                            app,
                            managerId,
                            ratio : PARTIAL_OVERLAP_RATIO,
                            source: sourceBefore,
                            targetHandle,
                            targetWindowId
                        });

                    const [sourceScreenEnvelope, targetScreenEnvelope] = await Promise.all([
                        readScreenEnvelope(sourcePage),
                        readScreenEnvelope(targetPage)
                    ]);

                    expect(
                        sourceScreenEnvelope,
                        `${cell.name}: the popup-size witness is intentionally same-display`
                    ).toEqual(targetScreenEnvelope);

                    await page.evaluate(() => {
                        globalThis.__neoTrustedPointerProjection = null;
                        addEventListener('mousemove', event => {
                            globalThis.__neoTrustedPointerProjection = {
                                clientX: event.clientX,
                                clientY: event.clientY,
                                screenX: event.screenX,
                                screenY: event.screenY
                            }
                        }, {capture: true, once: true})
                    });
                    await page.mouse.move(sourceGesture.out.x, sourceGesture.out.y);

                    const
                        pointerProjection = await page.evaluate(() => globalThis.__neoTrustedPointerProjection),
                        pointerOrigin     = {
                            x: pointerProjection.screenX - pointerProjection.clientX,
                            y: pointerProjection.screenY - pointerProjection.clientY
                        },
                        pointer = {
                            x: pointerOrigin.x + sourceGesture.out.x,
                            y: pointerOrigin.y + sourceGesture.out.y
                        },
                        pointerInTarget = {
                            x: pointer.x - positioned.target.managed.x,
                            y: pointer.y - positioned.target.managed.y
                        };

                    expect(positioned.metric.rx, `${cell.name}: horizontal overlap clears convert-in`)
                        .toBeGreaterThan(.6);
                    expect(positioned.metric.ry, `${cell.name}: vertical overlap clears convert-in`)
                        .toBeGreaterThan(.6);
                    expect(positioned.metric.score, `${cell.name}: composed score clears .55`).toBeGreaterThan(.6);
                    expect(positioned.metric.score, `${cell.name}: conversion remains partial`).toBeLessThan(.8);
                    expect(pointerInTarget.x, `${cell.name}: pointer intent is inside target x`).toBeGreaterThan(0);
                    expect(pointerInTarget.x).toBeLessThan(positioned.target.managed.width);
                    expect(pointerInTarget.y, `${cell.name}: pointer intent is inside target y`).toBeGreaterThan(0);
                    expect(pointerInTarget.y).toBeLessThan(positioned.target.managed.height);

                    await page.mouse.move(sourceGesture.out.x + 1, sourceGesture.out.y);

                    let
                        activePointer  = {...sourceGesture.out},
                        readyMoveIndex = 0,
                        snapshotA;

                    try {
                        await expect.poll(async () => {
                            await page.mouse.move(
                                sourceGesture.out.x + readyMoveIndex % 2,
                                sourceGesture.out.y + readyMoveIndex++ % 2
                            );
                            snapshotA = await app.callMethod(wsId, 'readCrossWindowGestureSnapshot', [{
                                parkedItemId     : cell.itemId,
                                sourceZoneId,
                                targetWorkspaceId: TARGET_WORKSPACE_ID
                            }]);

                            return Boolean(
                                snapshotA?.claimCount === 1 &&
                                snapshotA.converted &&
                                snapshotA.engaged &&
                                snapshotA.winnerStableId === TARGET_WORKSPACE_ID &&
                                snapshotA.preview?.previewId &&
                                snapshotA.rendered?.previewId === snapshotA.preview.previewId &&
                                snapshotA.parkedItemId === cell.itemId &&
                                snapshotA.sourceVesselConnected &&
                                snapshotA.indicators?.itemId === cell.itemId &&
                                snapshotA.indicators.candidateCount >= 5 &&
                                snapshotA.indicators.visible &&
                                snapshotA.targetProxy?.itemId === cell.itemId &&
                                snapshotA.targetProxy.ownsPane &&
                                snapshotA.targetProxy.settled &&
                                snapshotA.targetProxy.sourceWindowId === snapshotA.sourceVesselWindowId &&
                                snapshotA.targetProxy.targetWindowId === targetWindowId &&
                                snapshotA.targetProxy.visible
                            )
                        }, {
                            message  : `${cell.name}: park materializes before selecting a target choice`,
                            timeout  : 10000,
                            intervals: [25, 50, 100]
                        }).toBe(true);

                        const
                            centerChoice = targetPage.locator(
                                '.neo-dashboard-dock-drop-indicator-center:not(.neo-dashboard-dock-drop-indicator-off)'
                            ),
                            centerRect = await centerChoice.evaluate(element => {
                                const rect = element.getBoundingClientRect();

                                return {height: rect.height, width: rect.width, x: rect.x, y: rect.y}
                            });

                        expect(centerRect, `${cell.name}: center target choice has rendered geometry`).toBeTruthy();
                        activePointer = {
                            x: Math.round(
                                positioned.target.managed.x + centerRect.x + centerRect.width / 2 -
                                pointerOrigin.x
                            ),
                            y: Math.round(
                                positioned.target.managed.y + centerRect.y + centerRect.height / 2 -
                                pointerOrigin.y
                            )
                        };
                        readyMoveIndex = 0;

                        await expect.poll(async () => {
                            // Keep the ordinary pointer stream alive while the newly-mounted
                            // target overlays paint. The gesture claim is a short hover lease;
                            // polling Neural Link alone must not impersonate a stationary user
                            // while that lease expires.
                            let delta = 1 + readyMoveIndex++ % 2;

                            await page.mouse.move(activePointer.x + delta, activePointer.y + delta);
                            snapshotA = await app.callMethod(wsId, 'readCrossWindowGestureSnapshot', [{
                                parkedItemId     : cell.itemId,
                                sourceZoneId,
                                targetWorkspaceId: TARGET_WORKSPACE_ID
                            }]);

                            return snapshotA?.ready
                        }, {
                            message  : `${cell.name}: successful park replays into one ready target-local proxy`,
                            timeout  : 10000,
                            intervals: [25, 50, 100]
                        }).toBe(true)
                    } catch (error) {
                        const diagnostic = {
                            dragDrop: await page.evaluate(() => {
                                const addon = globalThis.Neo.main.addon.DragDrop;

                                return {
                                    isWindowDragging        : addon.isWindowDragging,
                                    offsetX                 : addon.offsetX,
                                    offsetY                 : addon.offsetY,
                                    popupHeight             : addon.popupHeight,
                                    popupName               : addon.popupName,
                                    popupWidth              : addon.popupWidth,
                                    windowDragParked        : addon.windowDragParked,
                                    windowDragParkedGeometry: addon.windowDragParkedGeometry
                                }
                            }),
                            snapshotA,
                            sourceBrowser: await readPageDiagnostic(
                                sourcePage,
                                () => readBrowserGeometry(sourcePage)
                            ),
                            sourceState  : await app.getComponent(sourceZoneId, [
                                'isWindowDragging',
                                'vesselConversionLogicalRect',
                                'vesselConversionSourceRect',
                                'vesselConversionTargetId',
                                'vesselConversionTargetRect',
                                'vesselConversionSensor'
                            ]),
                            targetBrowser: await readPageDiagnostic(
                                targetPage,
                                () => readBrowserGeometry(targetPage)
                            ),
                            targetDom: await readPageDiagnostic(targetPage, () => targetPage.evaluate(() => ({
                                indicators: document.querySelectorAll(
                                    '.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'
                                ).length,
                                previews: document.querySelectorAll('.neo-dock-preview-affordance').length,
                                proxies : document.querySelectorAll('.workstation-vessel-dragproxy').length
                            }))),
                            workspace: await app.getComponent(wsId, [
                                'lastVesselParkReceipt',
                                'lastVesselRestoreReceipt',
                                'vesselConversionTargetWindowId'
                            ])
                        };

                        throw new Error(`${error.message}\nDIAGNOSTIC ${JSON.stringify(diagnostic)}`)
                    }

                    const
                        proxy      = targetPage.locator('.workstation-vessel-dragproxy'),
                        indicators = targetPage.locator(
                            '.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'
                        ),
                        preview       = targetPage.locator('.neo-dock-preview-affordance'),
                        targetChoices = targetPage.locator([
                            '.neo-dashboard-dock-drop-indicator:not(.neo-dashboard-dock-drop-indicator-off)',
                            '.neo-dashboard-dock-drop-chip:not(.neo-dashboard-dock-drop-indicator-off)'
                        ].join(', ')),
                        activeChoice  = targetPage.locator('.neo-dashboard-dock-drop-indicator-active');

                    await expect(proxy, `${cell.name}: exactly one target-local proxy`).toHaveCount(1);
                    await expect(proxy).toBeVisible();
                    await expect(indicators, `${cell.name}: target choices remain visible`).toBeVisible();
                    await expect(
                        targetChoices,
                        `${cell.name}: exactly five rendered target choices remain readable`
                    ).toHaveCount(5);
                    await expect(
                        activeChoice,
                        `${cell.name}: exactly one rendered target choice owns pointer intent`
                    ).toHaveCount(1);
                    await expect(preview, `${cell.name}: target preview remains visible beside proxy`).toBeVisible();

                    const
                        proxyRectA = await proxy.evaluate(element => {
                            const rect = element.getBoundingClientRect();

                            return {height: rect.height, width: rect.width, x: rect.x, y: rect.y}
                        });

                    expect(
                        Math.abs(proxyRectA.width - sourceBefore.managed.width),
                        `${cell.name}: target proxy width follows the live source viewport`
                    ).toBeLessThanOrEqual(1);
                    expect(
                        Math.abs(proxyRectA.height - sourceBefore.managed.height),
                        `${cell.name}: target proxy height follows the live source viewport`
                    ).toBeLessThanOrEqual(1);

                    const proofHoldMs = Number(process.env.NEO_POPUP_PROOF_HOLD_MS || 0);

                    if (proofHoldMs > 0) await targetPage.waitForTimeout(proofHoldMs);

                    await page.mouse.move(activePointer.x + 9, activePointer.y + 6);

                    let
                        followMoveIndex = 0,
                        snapshotB;

                    await expect.poll(async () => {
                        let delta = followMoveIndex++ % 2;

                        await page.mouse.move(activePointer.x + 9 + delta, activePointer.y + 6 + delta);
                        snapshotB = await app.callMethod(wsId, 'readCrossWindowGestureSnapshot', [{
                            parkedItemId     : cell.itemId,
                            sourceZoneId,
                            targetWorkspaceId: TARGET_WORKSPACE_ID
                        }]);

                        return snapshotB?.ready
                    }, {
                        message  : `${cell.name}: second held pointer frame keeps the same conversion ready`,
                        timeout  : 10000,
                        intervals: [25, 50]
                    }).toBe(true);

                    const
                        proxyRectB = await proxy.evaluate(element => {
                            const rect = element.getBoundingClientRect();

                            return {height: rect.height, width: rect.width, x: rect.x, y: rect.y}
                        });

                    expect(
                        Math.abs(proxyRectB.x - proxyRectA.x) + Math.abs(proxyRectB.y - proxyRectA.y),
                        `${cell.name}: target-local proxy follows the still-held pointer`
                    ).toBeGreaterThan(2);

                    expect(sourcePage.isClosed(), `${cell.name}: source popup remains the same live Page`).toBe(false);
                    expect(targetPage.isClosed(), `${cell.name}: target popup remains live`).toBe(false);
                    expect(snapshotA).toMatchObject({
                        claimCount           : 1,
                        converted            : true,
                        engaged              : true,
                        parkedItemId         : cell.itemId,
                        sourceVesselConnected: true,
                        indicators           : {
                            candidateCount: 5,
                            itemId        : cell.itemId,
                            visible       : true
                        },
                        targetProxy          : {
                            itemId : cell.itemId,
                            visible: true
                        },
                        targetWorkspaceId: TARGET_WORKSPACE_ID,
                        winnerStableId   : TARGET_WORKSPACE_ID
                    });
                    expect(snapshotA.parkReceipt?.needsResize)
                        .toBe(sourceBefore.browser.outer.width > positioned.target.browser.inner.width
                            || sourceBefore.browser.outer.height > positioned.target.browser.inner.height);

                    const targetFar = await targetHandle.cdp.send(
                        'Browser.getWindowBounds',
                        {windowId: targetHandle.windowId}
                    );

                    await setNativeBounds(targetHandle, {
                        ...targetFar.bounds,
                        left: screen.left + 10,
                        top : screen.top  + 10
                    });

                    const
                        targetAway = await awaitGeometryParity(
                            app,
                            managerId,
                            targetPage,
                            targetWindowId
                        ),
                        restorePointer = {
                            x: activePointer.x + 11,
                            y: activePointer.y + 8
                        },
                        restoreScreen = {
                            x: pointerOrigin.x + restorePointer.x,
                            y: pointerOrigin.y + restorePointer.y
                        };

                    expect(
                        restoreScreen.x >= targetAway.managed.x &&
                        restoreScreen.x <= targetAway.managed.x + targetAway.managed.width &&
                        restoreScreen.y >= targetAway.managed.y &&
                        restoreScreen.y <= targetAway.managed.y + targetAway.managed.height,
                        `${cell.name}: pointer is outside the relocated target before convert-out`
                    ).toBe(false);
                    await page.mouse.move(restorePointer.x, restorePointer.y);

                    let
                        restore,
                        restoreMoveIndex = 0;

                    try {
                        await expect.poll(async () => {
                            const delta = restoreMoveIndex++ % 2;

                            await page.mouse.move(restorePointer.x + delta, restorePointer.y + delta);

                            const
                                conversion = await app.callMethod(sourceZoneId, 'getVesselConversionState'),
                                state      = await app.getComponent(wsId, ['lastVesselRestoreReceipt']);

                            restore = {conversion, receipt: state.lastVesselRestoreReceipt};

                            return {
                                admitted     : restore.receipt?.admitted === true,
                                converted    : conversion.converted,
                                transitioning: conversion.transitioning
                            }
                        }, {
                            message  : `${cell.name}: convert-out restores before pointer-follow resumes`,
                            timeout  : 15000,
                            intervals: [25, 50, 100]
                        }).toEqual({admitted: true, converted: false, transitioning: false})
                    } catch (error) {
                        const
                            coordinator = await findOne(app, {
                                className: 'Neo.manager.DragCoordinator'
                            }, [
                                'activeTargetCommitEligible',
                                'activeTargetZone',
                                'activeTransitionOwned',
                                'pointerClaimArbiter'
                            ]),
                            diagnostic = {
                                coordinator,
                                dragDrop: await page.evaluate(() => {
                                    const addon = globalThis.Neo.main.addon.DragDrop;

                                    return {
                                        isWindowDragging        : addon.isWindowDragging,
                                        popupName               : addon.popupName,
                                        windowDragGeneration    : addon.windowDragGeneration,
                                        windowDragParked        : addon.windowDragParked,
                                        windowDragParkedGeometry: addon.windowDragParkedGeometry
                                    }
                                }),
                                restore,
                                sourceBrowser: await readBrowserGeometry(sourcePage),
                                sourceState  : await app.getComponent(sourceZoneId, [
                                    'isWindowDragging',
                                    'vesselConversionCoordinatorFrame',
                                    'vesselConversionLogicalRect',
                                    'vesselConversionPointerMissedAt',
                                    'vesselConversionReplayFrame',
                                    'vesselConversionSourceRect',
                                    'vesselConversionTargetId',
                                    'vesselConversionTargetRect'
                                ]),
                                targetAway,
                                targetBrowser: await readBrowserGeometry(targetPage),
                                workspace    : await app.getComponent(wsId, [
                                    'lastVesselParkReceipt',
                                    'lastVesselRestoreReceipt',
                                    'tearOutParkGeometries',
                                    'vesselConversionTargetWindowId'
                                ])
                            };

                        throw new Error(`${error.message}\nDIAGNOSTIC ${JSON.stringify(diagnostic)}`)
                    }

                    const
                        sourceAfter  = await readBrowserGeometry(sourcePage),
                        sourceScreen = await readScreenEnvelope(sourcePage),
                        followDelta  = {
                            x: sourceAfter.inner.x + sourceAfter.outer.width + 24 <=
                                sourceScreen.left + sourceScreen.width
                                ? 24
                                : -24,
                            y: sourceAfter.inner.y + sourceAfter.outer.height + 17 <=
                                sourceScreen.top + sourceScreen.height
                                ? 17
                                : -17
                        };

                    expect(sourceAfter.outer, `${cell.name}: exact outer extent returns on the identical Page`)
                        .toEqual(sourceBefore.browser.outer);
                    expect(sourcePage.isClosed()).toBe(false);

                    await page.mouse.move(
                        restorePointer.x + followDelta.x,
                        restorePointer.y + followDelta.y
                    );
                    await expect.poll(async () => {
                        const followed = await readBrowserGeometry(sourcePage);

                        return {
                            x: followed.inner.x - sourceAfter.inner.x,
                            y: followed.inner.y - sourceAfter.inner.y
                        }
                    }, {
                        message  : `${cell.name}: restored exact popup resumes live pointer-follow`,
                        timeout  : 5000,
                        intervals: [25, 50, 100]
                    }).toEqual(followDelta);

                    await page.keyboard.press('Escape');
                    await expect.poll(() => sourcePage.isClosed(), {
                        message  : `${cell.name}: Escape retires the uncommitted exact source popup`,
                        timeout  : 15000,
                        intervals: [50, 100]
                    }).toBe(true);
                    await awaitVesselRetirement(app, managerId, wsId, cell.itemId, sourceWindowId);
                    await page.mouse.up();
                    pointerDown = false;
                    await awaitPointerSessionIdle(page);

                    await expect(proxy).toHaveCount(0);

                    receipts.push({
                        hit            : sourceGesture.hit,
                        itemId         : cell.itemId,
                        metric         : positioned.metric,
                        name           : cell.name,
                        pointer,
                        pointerInTarget,
                        proxyRectA,
                        proxyRectB,
                        resizedFrom,
                        restore,
                        snapshotA,
                        snapshotB,
                        sourceBefore,
                        screenEnvelopes: {
                            source: sourceScreenEnvelope,
                            target: targetScreenEnvelope
                        },
                        sourceWindowId,
                        target: positioned.target,
                        targetWindowId
                    })

                expect(receipts.map(receipt => receipt.name)).toEqual([cell.name]);
                expect(receipts.every(receipt => receipt.snapshotA.ready && receipt.snapshotB.ready)).toBe(true);

                const resizedReceipt = receipts.find(receipt => receipt.name === 'post-resize-asymmetric');

                if (resizedReceipt) {
                    expect(resizedReceipt.resizedFrom?.source.browser.outer)
                        .not.toEqual(resizedReceipt.sourceBefore.browser.outer)
                }

                await testInfo.attach(`human-popup-overlap-${cell.name}-receipts`, {
                    body       : Buffer.from(JSON.stringify(receipts, null, 2)),
                    contentType: 'application/json'
                })
            } finally {
                if (pointerDown) {
                    await page.keyboard.press('Escape').catch(() => {});
                    await page.mouse.up().catch(() => {})
                }

                if (sourcePage && !sourcePage.isClosed()) await sourcePage.close().catch(() => {});
                if (targetPage && !targetPage.isClosed()) await targetPage.close().catch(() => {});
            }
        })
    })
});
