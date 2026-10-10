import {expect, test}        from '../../fixtures.mjs';
import {readNativeLifecycle} from '../utils/dockNativeLifecycle.mjs';

const
    TARGET_ITEM_ID      = 'metrics',
    TARGET_WORKSPACE_ID = 'workstation-vessel:metrics';

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
        frame: {
            x: globalThis.screenX,
            y: globalThis.screenY
        },
        inner: {
            height: globalThis.innerHeight,
            width : globalThis.innerWidth
        },
        outer: {
            height: globalThis.outerHeight,
            width : globalThis.outerWidth
        }
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
            const observed = (await readBrowserGeometry(handle.page)).frame;

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
 * @summary Reads the manager's distinct content and frame rectangles for one runtime window.
 * @param {Object} app
 * @param {String} managerId
 * @param {String} windowId
 * @returns {Promise<Object|null>}
 */
async function readManagerGeometry(app, managerId, windowId) {
    const
        state = await app.callMethod(managerId, 'toJSON'),
        win   = state.windows.find(candidate => candidate.id === windowId);

    return {inner: pickRect(win?.innerRect), outer: pickRect(win?.outerRect)}
}

/**
 * @summary Verifies transport of the browser's frame origin and both extents. Content-origin
 * conversion is owned by manager.Window; the witness consumes it without duplicating its formula.
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
            geometry = await readManagerGeometry(app, managerId, windowId),
            deltas   = geometry.inner && geometry.outer && [
                ...['x', 'y'].map(key => Math.abs(browser.frame[key] - geometry.outer[key])),
                ...['width', 'height'].map(key => Math.abs(browser.outer[key] - geometry.outer[key])),
                ...['width', 'height'].map(key => Math.abs(browser.inner[key] - geometry.inner[key]))
            ];

        receipt = {browser, managed: geometry.inner};

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
                isWindowDragging: addon.isWindowDragging
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
        isWindowDragging: false
    });
    await expect(
        page.locator('.neo-is-dragging'),
        'the previous worker-side drag presentation retires before the next trusted gesture'
    ).toHaveCount(0, {timeout: 10000});

    return state
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
        const lifecycle = await readNativeLifecycle(app, wsId);

        windowId = (committed ? lifecycle.owners : lifecycle.connections)[itemId]?.windowId ?? null;

        return windowId
    }, {
        message  : `${committed ? 'committed' : 'held'} vessel '${itemId}' connects`,
        timeout  : 15000,
        intervals: [50, 100]
    }).toBeTruthy();

    return windowId
}

/**
 * @summary Waits for a retired popup generation to leave live native connections and window topology.
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
            lifecycle = await readNativeLifecycle(app, wsId),
            manager   = await app.callMethod(managerId, 'toJSON');

        return receipt = {
            connected : Boolean(lifecycle.connections[itemId]),
            boundOwner: Boolean(lifecycle.owners[itemId]?.windowId),
            registered: manager.windows.some(win => win.id === windowId)
        }
    }, {
        message  : `retired vessel '${itemId}' leaves live ownership, connection, and window topology`,
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toEqual({connected: false, boundOwner: false, registered: false});

    return receipt
}

/**
 * @summary Actual-pointer proof of the human popup paths.
 *
 * Every gesture input is Playwright's trusted `page.mouse` stream; CDP only controls physical native
 * window bounds. A tear-out commits the same pane into its full PopupWorkspace and themes the slot it
 * vacated. A drag over a foreign popup follows the docking design record §2.8.6: the window that
 * claims the pointer carries the drag as the tab-header proxy, the vessel riding the hand closes, and
 * leaving that window opens a fresh one.
 *
 * The ordinary E2E profile retains `--disable-frame-rate-limit` for engine / OffscreenCanvas
 * coverage. `NEO_FILM_TAKE=1` replays the identical assertions with on-glass compositing.
 */
test.describe('Workstation — human popup-over-popup drag (#16117)', () => {
    test.setTimeout(240000);
    test.use({colorScheme: 'dark', viewport: null});

    test('pointer tear-out commits the same pane into its full PopupWorkspace (#18409)',
    async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});

        const
            app       = await neuralLink.connectToApp('Workstation'),
            workspace = await findOne(app, {className: 'Workstation.view.Workspace'}, ['id']),
            paneId    = await app.callMethod(workspace.id, 'getPaneIdentity', [TARGET_ITEM_ID]);

        await expect(page.locator(`#${paneId}`)).toBeVisible();

        // the size the pane shows at in the room is the OUTER size its window opens at, floored
        // at the platform's 320×240 — the tab header's drag proxy is no measure of the widget
        const paneRect = await page.locator(`#${paneId}`).boundingBox();

        let popup;
        try {
            ({popup} = await beginActualTearOut({label: 'Metrics', page}));
            const windowId = await awaitVesselWindowId(app, workspace.id, TARGET_ITEM_ID, false);

            const liveElement = await popup.locator(`[id="${paneId}"]`).elementHandle();
            expect(liveElement).toBeTruthy();

            // the window's frame takes over the pane's footprint: its OUTER size is the pane's, and
            // its content is smaller by the window chrome on purpose (no inner size is required)
            const
                vessel = await popup.evaluate(() => ({inner: {height: innerHeight, width: innerWidth}, outer: {height: outerHeight, width: outerWidth}})),
                birth  = (await app.getComponent(workspace.id, ['lastVesselOpen'])).lastVesselOpen,
                sizing = `pane ${JSON.stringify(paneRect)}, vessel ${JSON.stringify(vessel)}, birth ${JSON.stringify(birth)}`,
                want   = {height: Math.max(240, Math.round(paneRect.height)), width: Math.max(320, Math.round(paneRect.width))};

            expect(birth.sourceRect, `the zone measured the pane at arming (${sizing})`).toMatchObject({height: paneRect.height, width: paneRect.width});
            expect(Math.abs(vessel.outer.width  - want.width),  `the vessel's outer width is the pane's (${sizing})`).toBeLessThanOrEqual(2);
            expect(Math.abs(vessel.outer.height - want.height), `the vessel's outer height is the pane's (${sizing})`).toBeLessThanOrEqual(2);
            await expect(popup.locator('.workstation-vessel-provisional-chrome .neo-tab-header-button'),
                'the staged popup shows its pane header before the terminal').toContainText('Metrics');
            await expect(page.locator('.neo-dashboard-dock-vessel-placeholder'),
                'one stand-in reserves the held source slot').toHaveCount(1);
            await expect(popup.locator('.neo-dashboard-dock-vessel-placeholder'),
                'the first vessel holds the live pane, not another stand-in').toHaveCount(0);
            await page.mouse.up();
            expect(await awaitVesselWindowId(app, workspace.id, TARGET_ITEM_ID, true)).toBe(windowId);
            await awaitPointerSessionIdle(page);

            const target = await findOne(app, {
                className   : 'Workstation.view.PopupWorkspace',
                workspaceKey: TARGET_WORKSPACE_ID
            }, ['id', 'windowId']);

            await expect.poll(async () => {
                const found = await app.findInstances({
                    className      : 'Neo.dashboard.dock.interaction.TabContainer',
                    dockWorkspaceId: target.id
                }, ['id']);
                return Array.isArray(found) ? found.length : Number(Boolean(found))
            }, {message: 'the committed popup projects its tab container', timeout: 10000}).toBe(1);

            const tabs = await findOne(app, {
                className      : 'Neo.dashboard.dock.interaction.TabContainer',
                dockWorkspaceId: target.id
            }, ['id']);
            const body = await app.callMethod(tabs.id, 'getCardContainer');

            expect(body.id, 'the committed popup owns a live card body').toBeTruthy();
            expect(target.properties.windowId).toBe(windowId);
            expect(await app.callMethod(workspace.id, 'getPaneIdentity', [TARGET_ITEM_ID])).toBe(paneId);

            await expect.poll(async () => {
                const state = await app.getComponent(paneId, ['parent.id', 'windowId']),
                      dom   = await popup.evaluate(({paneId, bodyId}) => {
                          const pane = document.getElementById(paneId),
                                body = document.getElementById(bodyId),
                                rect = pane?.getBoundingClientRect(),
                                area = body?.getBoundingClientRect();

                          return {
                              domParents: [...document.querySelectorAll(`[id="${paneId}"]`)]
                                  .map(element => element.parentElement?.id),
                              fillsBody: Boolean(rect && area && rect.width > 20 && rect.height > 20 &&
                                  Math.abs(rect.x - area.x) <= 1 && Math.abs(rect.y - area.y) <= 1 &&
                                  Math.abs(rect.width - area.width) <= 1 && Math.abs(rect.height - area.height) <= 1)
                          }
                      }, {paneId, bodyId: body.id});

                return {...dom, windowId: state.windowId, workerParent: state['parent.id']}
            }, {message: 'the committed pane belongs to its full popup card body', timeout: 10000}).toEqual({
                domParents: [body.id], fillsBody: true, windowId, workerParent: body.id
            });
            expect(await liveElement.evaluate(element => element.isConnected &&
                element === document.getElementById(element.id)), 'the same DOM node moves with its pane').toBe(true);
            await expect(popup.locator('.workstation-vessel-handover'),
                'the temporary overlapping layout retires with the provisional chrome').toHaveCount(0);
            for (const window of [page, popup]) {
                await expect(window.locator('.neo-dashboard-dock-vessel-placeholder'),
                    'a committed tear-out leaves no stand-in in either window').toHaveCount(0);
            }
        } finally {
            await page.mouse.up().catch(() => {});
            await popup?.close().catch(() => {});
        }
    });

    // The vacated slot is the only frame in which a user meets the placeholder, and it exists ONLY
    // while the vessel is open and the pointer is still held: `stage()` inserts it at the source
    // index and the next commit retires it. So the read has to happen between `beginActualTearOut`
    // returning and `mouse.up()`. A manually constructed instance cannot stand in — that proves the
    // class resolves theme values, not that the slot the engine actually builds resolves them.
    test('the vacated source slot is themed while its pane is torn out (#18424)',
    async ({page}, testInfo) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        let popup;
        try {
            ({popup} = await beginActualTearOut({label: 'Metrics', page}));

            const slot = page.locator('.neo-dashboard-dock-vessel-placeholder').first();

            await expect(slot, 'the engine builds a registered placeholder into the vacated slot')
                .toBeVisible({timeout: 10000});

            const paint = await slot.evaluate(element => {
                const
                    style = getComputedStyle(element),
                    mask  = element.querySelector('.neo-load-mask'),
                    text  = element.querySelector('.neo-loading-message');

                return {
                    ground : style.getPropertyValue('--dock-vessel-placeholder-ground').trim(),
                    ink    : style.getPropertyValue('--dock-vessel-placeholder-ink').trim(),
                    hostBg : style.backgroundColor,
                    hostInk: style.color,
                    maskBg : mask && getComputedStyle(mask).backgroundColor,
                    textInk: text && getComputedStyle(text).color
                }
            });

            // Attached rather than only asserted: the assertions below prove the relationships,
            // and a reviewer asking "what did the user actually see" wants the values.
            await testInfo.attach('vacated-slot-paint', {
                body: JSON.stringify(paint, null, 4), contentType: 'application/json'
            });

            // The defect this witnesses was a transparent host: the mask paints `inherit`, so with
            // no host declaration both chains reached the user-agent default and the slot rendered
            // black-on-white under every theme. Asserting "not transparent" rather than a literal
            // colour keeps the arm true for whichever theme the app boots.
            expect(paint.ground, 'the slot resolves a theme ground token').toBeTruthy();
            expect(paint.ink,    'the slot resolves a theme ink token').toBeTruthy();
            expect(paint.hostBg, 'the slot paints an opaque ground rather than falling through')
                .not.toBe('rgba(0, 0, 0, 0)');
            expect(paint.maskBg, 'the load mask inherits the slot ground it sits on')
                .toBe(paint.hostBg);
            expect(paint.textInk, 'the status message inherits the slot ink').toBe(paint.hostInk);
        } finally {
            await page.mouse.up().catch(() => {});
            await popup?.close().catch(() => {});
        }
    });

    /**
     * @summary Stages a foreign window of the group: Metrics torn out, released on the desktop and placed
     * clear of a narrowed main, with free desktop beyond it.
     * @param {Object} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>} the app handles, the popup's Page and window id, and main-client points
     *     over the popup (`overTarget`) and on the desktop beyond it (`desktop`)
     */
    async function stageForeignPopup(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const
            app       = await neuralLink.connectToApp('Workstation'),
            workspace = await findOne(app, {className: 'Workstation.view.Workspace'}, ['id', 'windowId']),
            manager   = await findOne(app, {className: 'Neo.manager.Window'}, ['id']),
            wsId      = workspace.id,
            managerId = manager.id,
            screen    = await page.evaluate(() => ({
                height: globalThis.screen.availHeight,
                left  : globalThis.screen.availLeft,
                top   : globalThis.screen.availTop,
                width : globalThis.screen.availWidth
            })),
            mainWidth  = 760,
            gap        = 160,
            popupWidth = 480;

        test.skip(screen.width < 24 + mainWidth + gap + popupWidth + gap + 40,
            `${screen.width}px stage cannot hold main, the foreign popup and free desktop beside them`);

        await setNativeBounds(await acquireNativeWindow(page), {
            height: Math.min(720, screen.height - 80),
            left  : screen.left + 24,
            top   : screen.top  + 24,
            width : mainWidth
        });

        const {popup: targetPage} = await beginActualTearOut({label: 'Metrics', page});

        const targetWindowId = await awaitVesselWindowId(app, wsId, TARGET_ITEM_ID, false);

        await page.mouse.up();
        expect(await awaitVesselWindowId(app, wsId, TARGET_ITEM_ID, true)).toBe(targetWindowId);
        await awaitPointerSessionIdle(page);

        await setNativeBounds(await acquireNativeWindow(targetPage), {
            height: 440,
            left  : screen.left + 24 + mainWidth + gap,
            top   : screen.top  + 80,
            width : popupWidth
        });

        const
            main   = (await awaitGeometryParity(app, managerId, page, workspace.properties.windowId)).managed,
            target = (await awaitGeometryParity(app, managerId, targetPage, targetWindowId)).managed,
            // the mouse speaks main's client space; a screen point maps through main's content origin
            client = point => ({x: Math.round(point.x - main.x), y: Math.round(point.y - main.y)});

        return {
            app,
            desktop   : client({x: target.x + target.width + gap / 2, y: target.y + target.height / 2}),
            mainInner : main,
            managerId,
            overTarget: client({x: target.x + target.width / 2, y: target.y + target.height / 2}),
            targetPage,
            targetWindowId,
            wsId
        }
    }

    /**
     * @summary Records every native move main asks for, with its settled answer: a host may admit the popup
     * but refuse every `window.moveTo`, which is a stage ceiling, not a gesture that stopped asking.
     * @param {Object} page
     */
    async function traceWindowMoves(page) {
        await page.evaluate(() => {
            const
                main     = globalThis.Neo.Main,
                original = main.windowMoveTo.bind(main),
                trace    = globalThis.__foreignPopupMoves = [];

            main.windowMoveTo = data => {
                const entry  = {data: {...data}, result: 'pending'},
                      result = original(data);

                trace.push(entry);
                Promise.resolve(result).then(value => {entry.result = value}, error => {entry.result = `reject:${error.message}`});

                return result
            }
        })
    }

    /**
     * @summary Where an item lives: in main's arrangement, in the foreign popup's, and its pane's window.
     * @param {Object} app
     * @param {String} wsId
     * @param {String} itemId
     * @returns {Promise<Object>}
     */
    async function readPlacement(app, wsId, itemId) {
        const [main, target, paneId] = await Promise.all([
            app.callMethod(wsId, 'getWorkspaceDocument', ['workstation-main']),
            app.callMethod(wsId, 'getWorkspaceDocument', [TARGET_WORKSPACE_ID]),
            app.callMethod(wsId, 'getPaneIdentity', [itemId])
        ]);

        return {
            main        : Object.values(main.nodes).some(node => node.items?.includes(itemId)),
            paneWindowId: (await app.getComponent(paneId, ['windowId'])).windowId,
            target      : Object.values(target.nodes).some(node => node.items?.includes(itemId))
        }
    }

    // Inside a window of the group the drag is that window's tab-header proxy; outside every window it
    // is a vessel (docking design record §2.8.6). So under one pointer-down the vessel that left main
    // retires over a foreign popup, and leaving that popup for the desktop opens a fresh one.
    test('one pointer-down crosses a foreign popup: its vessel closes there and a fresh one carries the drag out',
    async ({page, neuralLink}) => {
        const {app, desktop, mainInner, managerId, overTarget, targetPage, wsId} = await stageForeignPopup(page, neuralLink);

        let firstVessel, pointerDown = false, secondVessel;

        try {
            const paneId = await app.callMethod(wsId, 'getPaneIdentity', ['audit']);

            ({popup: firstVessel} = await beginActualTearOut({label: 'Audit', page}));
            pointerDown = true;

            const firstWindowId = await awaitVesselWindowId(app, wsId, 'audit', false);

            await page.mouse.move(overTarget.x, overTarget.y, {steps: 24});
            await expect.poll(() => firstVessel.isClosed(), {
                message: 'the vessel retires once the foreign window claims the pointer',
                timeout: 10000
            }).toBe(true);
            await awaitVesselRetirement(app, managerId, wsId, 'audit', firstWindowId);
            await expect(targetPage.locator('.neo-dock-dragproxy'),
                'the foreign window carries the drag as the tab-header proxy').toBeVisible({timeout: 10000});
            expect(page.context().pages().filter(child => !child.isClosed()),
                'over a window, only the windows the user owns are open').toHaveLength(2);

            const secondPopup = page.waitForEvent('popup', {timeout: 30000});

            await traceWindowMoves(page);
            await page.mouse.move(desktop.x, desktop.y, {steps: 24});
            secondVessel = await secondPopup;

            const secondWindowId = await awaitVesselWindowId(app, wsId, 'audit', false);

            expect(secondWindowId, 'leaving the foreign window opens a fresh vessel').not.toBe(firstWindowId);
            await expect(targetPage.locator('.neo-dock-dragproxy'),
                'the foreign window lets the drag go').toHaveCount(0);

            // The fresh vessel rides the held pointer: it sits under the pointer and follows one more move.
            const
                step     = {x: 48, y: 36},
                pointer  = {x: mainInner.x + desktop.x + step.x, y: mainInner.y + desktop.y + step.y},
                readMove = () => page.evaluate(() => globalThis.__foreignPopupMoves),
                readSelf = () => secondVessel.evaluate(() => ({h: outerHeight, w: outerWidth, x: screenX, y: screenY}));

            await expect.poll(async () => (await readMove()).some(entry => entry.result !== 'pending'), {
                message: 'the continuing pointer asks the fresh vessel to move',
                timeout: 5000
            }).toBe(true);

            const settledAt = await readSelf();

            await page.mouse.move(desktop.x + step.x, desktop.y + step.y, {steps: 8});

            test.skip((await readMove()).every(entry => entry.result === false),
                'the host refused every verified window.moveTo; native pointer-follow is stage-bound here');

            await expect.poll(async () => {
                const now = await readSelf();

                return {x: now.x - settledAt.x, y: now.y - settledAt.y}
            }, {message: 'the fresh vessel follows the held pointer', timeout: 10000}).toEqual(step);

            const under = await readSelf();

            expect(pointer.x >= under.x && pointer.x <= under.x + under.w && pointer.y >= under.y && pointer.y <= under.y + under.h,
                `the fresh vessel sits under the pointer: ${JSON.stringify({pointer, under})}`).toBe(true);

            await page.mouse.up();
            pointerDown = false;
            expect(await awaitVesselWindowId(app, wsId, 'audit', true),
                'the release detaches the item into the fresh vessel').toBe(secondWindowId);

            const {dockModel} = await app.getComponent(wsId, ['dockModel']);

            expect(Object.values(dockModel.nodes).some(node => node.items?.includes('audit')),
                'the item left the main arrangement').toBe(false);
            expect(await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
                'the same live pane rides every hop').toBe(paneId)
        } finally {
            pointerDown && await page.mouse.up().catch(() => {});

            for (const child of [secondVessel, firstVessel, targetPage]) {
                await child?.close().catch(() => {})
            }
        }
    });

    test('a release over a foreign popup transfers the pane there, and undo and redo move it back and forth',
    async ({page, neuralLink}) => {
        const {app, overTarget, targetPage, targetWindowId, wsId} = await stageForeignPopup(page, neuralLink);

        let pointerDown = false, vessel;

        try {
            const
                paneId    = await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
                {groupId} = await app.callMethod(wsId, 'controller.getTopologyState'),
                committed = {main: false, paneWindowId: targetWindowId, target: true};

            ({popup: vessel} = await beginActualTearOut({label: 'Audit', page}));
            pointerDown = true;
            await page.mouse.move(overTarget.x, overTarget.y, {steps: 24});
            await expect.poll(() => vessel.isClosed(), {
                message: 'the vessel retires once the foreign window claims the pointer',
                timeout: 10000
            }).toBe(true);
            await expect(targetPage.locator('.neo-dock-dragproxy'),
                'one local proxy carries the drag').toHaveCount(1);
            expect(await readPlacement(app, wsId, 'audit'), 'the held drag has not committed early')
                .toMatchObject({main: true, target: false});

            await page.mouse.up();
            pointerDown = false;
            await expect.poll(() => readPlacement(app, wsId, 'audit'), {
                message: 'the release transfers the item into the foreign window',
                timeout: 10000
            }).toEqual(committed);
            await expect(targetPage.locator(`[id="${paneId}"]`)).toBeVisible();
            await expect(page.locator(`[id="${paneId}"]`)).toHaveCount(0);

            await app.callMethod(wsId, 'transactionManager.undo', [{groupId}]);
            await expect.poll(() => readPlacement(app, wsId, 'audit'), {message: 'undo brings the pane home'})
                .toMatchObject({main: true, target: false});
            await expect(page.locator(`[id="${paneId}"]`)).toBeVisible();

            await app.callMethod(wsId, 'transactionManager.redo', [{groupId}]);
            await expect.poll(() => readPlacement(app, wsId, 'audit'), {message: 'redo moves it back'})
                .toEqual(committed);
            expect(await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
                'the same live pane through every move').toBe(paneId)
        } finally {
            pointerDown && await page.mouse.up().catch(() => {});
            await vessel?.close().catch(() => {});
            await targetPage.close().catch(() => {})
        }
    });

    test('Escape over a foreign popup leaves both arrangements and the pane where they were',
    async ({page, neuralLink}) => {
        const {app, overTarget, targetPage, wsId} = await stageForeignPopup(page, neuralLink);

        let pointerDown = false, vessel;

        try {
            const
                paneId = await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
                before = await readPlacement(app, wsId, 'audit');

            ({popup: vessel} = await beginActualTearOut({label: 'Audit', page}));
            pointerDown = true;
            await page.mouse.move(overTarget.x, overTarget.y, {steps: 24});
            await expect(targetPage.locator('.neo-dock-dragproxy')).toHaveCount(1, {timeout: 10000});

            await page.keyboard.press('Escape');
            await expect(targetPage.locator('.neo-dock-dragproxy'),
                'the foreign window lets the drag go').toHaveCount(0);
            await page.mouse.up();
            pointerDown = false;

            await expect.poll(() => readPlacement(app, wsId, 'audit'), {message: 'nothing moved'})
                .toEqual(before);
            await expect(page.locator(`[id="${paneId}"]`)).toBeVisible()
        } finally {
            pointerDown && await page.mouse.up().catch(() => {});
            await vessel?.close().catch(() => {});
            await targetPage.close().catch(() => {})
        }
    });
});
