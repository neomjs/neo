import Manager   from './Base.mjs';
import Rectangle from '../util/Rectangle.mjs';

/**
 * @summary The "God View" for the multi-window application workspace.
 * @description This manager maintains a real-time geometric map of all connected browser windows in the App Worker.
 * It is the central authority for spatial awareness, enabling features like the "Infinite Canvas" where
 * interactions (like Drag & Drop) can span across multiple OS-level windows.
 *
 * It receives high-frequency position updates from the Main Thread (via `Neo.main.addon.WindowPosition`)
 * and provides intersection testing APIs to determine which window is under a given screen coordinate.
 *
 * @class Neo.manager.Window
 * @extends Neo.manager.Base
 * @singleton
 * @see Neo.main.addon.WindowPosition
 */
class Window extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.Window'
         * @protected
         */
        className: 'Neo.manager.Window',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.currentWorker.on({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        })
    }

    /**
     * Returns the windowId which intersects with the given global screen coordinates.
     * This is the core intersection test for cross-window drag and drop operations.
     * @param {Number} x Screen X coordinate
     * @param {Number} y Screen Y coordinate
     * @returns {String|null} The windowId of the target window, or null if no intersection.
     */
    getWindowAt(x, y) {
        let item = this.items.find(item => item.outerRect?.intersects({bottom: y, right: x, x, y}));

        return item ? item.id : null
    }

    /**
     * @summary Admits a measured viewport offset only when it can physically describe this frame.
     *
     * The offset is the viewport's origin relative to the frame's, measured on the main thread as
     * `event.screenX - event.clientX - window.screenX`. It is exact at page zoom 1; under browser
     * zoom `clientX` is page CSS pixels while `screenX` is screen CSS pixels, so the reading can
     * drift. Rather than correct for a zoom factor no web API reports reliably, this bounds the
     * offset inside the frame: a viewport cannot start before its frame, and cannot leave less room
     * than it occupies. An out-of-bounds reading falls back to the border assumptions, which is
     * exactly today's behaviour — a bad measurement degrades to the status quo, never past it.
     * @param {Object|null} offset
     * @param {Number} widthDiff `outerWidth - innerWidth`
     * @param {Number} heightDiff `outerHeight - innerHeight`
     * @returns {Object|null} The admitted offset, or null
     * @protected
     */
    usableViewportOffset(offset, widthDiff, heightDiff) {
        if (!offset || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return null;

        const {x, y} = offset;

        return x >= 0 && y >= 0 && x <= widthDiff && y <= heightDiff ? offset : null
    }

    /**
     * Interprets one raw window report into the manager's two rectangles and the chrome between them.
     *
     * `screenLeft` / `screenTop` name the window FRAME's origin — the top-left of the OS window
     * including its title bar — in every engine except Firefox, which publishes the viewport origin
     * itself (`mozInnerScreenX/Y`). Measured, not assumed: a Chromium frame placed at `top: 120`
     * reports `screenY 120` with 87 px of chrome, and a Chrome window filling a display under the
     * macOS menu bar reports `screenTop 33` — a viewport reading would put its frame at y = −54,
     * above the screen. `outerRect` is therefore the frame itself and `innerRect` the frame shifted
     * by the chrome. The chrome split assumes symmetric side borders and a bottom border equal to a
     * side border, so the remaining height difference is the title bar.
     * @param {Object} data The raw report: `innerHeight`, `innerWidth`, `outerHeight`, `outerWidth`, `screenLeft`, `screenTop`, and Firefox's `mozInnerScreenX/Y`
     * @returns {Object} {chrome, innerRect, outerRect}
     */
    calculateGeometry(data) {
        const {
            innerHeight, innerWidth, mozInnerScreenX, mozInnerScreenY,
            outerHeight, outerWidth, screenLeft, screenTop, viewportOffset
        } = data;

        const
            widthDiff  = outerWidth  - innerWidth,
            heightDiff = outerHeight - innerHeight,
            // Assumption: Side borders are symmetric
            sideBorder   = widthDiff / 2,
            // Assumption: Bottom border matches side border (common in Windows)
            bottomBorder = sideBorder,
            // The rest is the top chrome (header)
            topChrome    = heightDiff - bottomBorder,
            firefox      = typeof mozInnerScreenX === 'number',
            measured     = this.usableViewportOffset(viewportOffset, widthDiff, heightDiff);

        let viewportLeft, viewportTop;

        if (firefox) {
            // Firefox publishes the viewport origin directly
            viewportLeft = mozInnerScreenX;
            viewportTop  = mozInnerScreenY
        } else if (measured) {
            // A real viewport reading. It outranks the border assumptions because it carries what
            // they cannot express: WHICH edge lost the space. A panel docked left and one docked
            // right produce the same `widthDiff`, so the side is absent from these numbers and
            // present only in a measurement.
            viewportLeft = screenLeft + measured.x;
            viewportTop  = screenTop  + measured.y
        } else {
            // Chrome, Edge and Safari report the frame origin: the viewport sits inside the chrome
            viewportLeft = screenLeft + sideBorder;
            viewportTop  = screenTop  + topChrome
        }

        // Firefox derives its frame from the viewport it published; everyone else reported the
        // frame in the first place. Deriving `chrome` from the two origins rather than from the
        // assumptions keeps it consistent with whichever branch answered — so a 479 px panel on
        // the right reports `right: 479` instead of splitting itself across both sides.
        const
            frameLeft = firefox ? viewportLeft - sideBorder : screenLeft,
            frameTop  = firefox ? viewportTop  - topChrome  : screenTop,
            left      = viewportLeft - frameLeft,
            top       = viewportTop  - frameTop;

        const chrome = {
            bottom: heightDiff - top,
            left,
            right : widthDiff - left,
            top
        };

        const innerRect = new Rectangle(viewportLeft, viewportTop, innerWidth, innerHeight);

        const outerRect = new Rectangle(frameLeft, frameTop, outerWidth, outerHeight);

        return {chrome, innerRect, outerRect}
    }

    /**
     * @summary Upserts a connected window over any geometry-first provisional record.
     * @description Geometry publication can reach the App Worker before the SharedWorker connect event.
     * In that ordering, `onWindowPositionChange()` registers a geometry-only placeholder. The connect
     * event must enrich that exact record instead of losing its native route to duplicate-registration
     * refusal. A later route-less reconnect deliberately replaces the authority with the fail-closed
     * capability set, so a reload cannot inherit an earlier document's native handle.
     * Triggered when a new browser window connects to the SharedWorker.
     * In Shared Worker mode, `Neo.worker.App#onConnect` ensures that `windowData`
     * is fetched from the Main Thread and included in the payload.
     * @param {Object} data
     * @param {String} data.appName
     * @param {Object} [data.windowData] Contains geometry data (screenLeft, innerHeight, etc.)
     * @param {String} data.windowId
     */
    onWindowConnect({appName, windowData, windowId}) {
        let chrome      = null,
            innerRect   = null,
            nativeRoute = windowData?.nativeRoute || null,
            outerRect   = null;

        if (windowData) {
            ({chrome, innerRect, outerRect} = this.calculateGeometry(windowData))
        }

        console.log('Window.onWindowConnect', {windowId, appName, chrome, innerRect, outerRect});

        const
            item = {
            appName,
            capabilities: nativeRoute?.capabilities || {close: false, focus: false, position: false, resize: false},
            chrome,
            id          : windowId,
            innerRect,
            nativeRoute,
            outerRect
            },
            registeredItem = this.get(windowId);

        if (registeredItem) {
            Object.assign(registeredItem, item)
        } else {
            this.register(item)
        }
    }

    /**
     * @summary Removes live geometry when its source window disconnects.
     * @param {Object} data
     * @param {String} data.appName
     * @param {String} data.windowId
     */
    onWindowDisconnect({windowId}) {
        this.unregister(windowId)
    }

    /**
     * @summary Updates geometry forwarded by the App Worker from a live source port.
     * Updates the geometric state of a window based on data from the Main Thread.
     * This method is called via direct delegation from the App Worker to minimize overhead.
     * @param {Object} data
     * @param {Number} data.innerHeight
     * @param {Number} data.outerHeight
     * @param {Number} data.outerWidth
     * @param {Number} data.screenLeft
     * @param {Number} data.screenTop
     * @param {String} data.windowId
     */
    onWindowPositionChange(data) {
        const
            me     = this,
            item   = me.get(data.windowId),
            before = item?.outerRect ?? null;

        const {chrome, innerRect, outerRect} = me.calculateGeometry(data);

        if (item) {
            item.chrome    = chrome;
            item.innerRect = innerRect;
            item.outerRect = outerRect
        } else {
            me.register({
                chrome,
                capabilities: {close: false, focus: false, position: false, resize: false},
                id          : data.windowId,
                innerRect,
                nativeRoute : null,
                outerRect
            })
        }

        me.fire('positionchange', {windowId: data.windowId, before, after: outerRect, nativeEffect: data.nativeEffect ?? null})
    }

    /**
     * @summary Decides whether a caller may dispatch a native window effect, before it dispatches one.
     *
     * Native-window authority is split in two: the App Worker resolves the topology entry, and the
     * owning main thread revalidates the live generation before touching the handle. `Neo.Main` holds
     * that second half and stays the last word — it additionally sees whether the window is closed,
     * whether a same-name open replaced the entry, and whether the native method exists, none of which
     * an App-Worker caller can observe. A grant here is therefore permission to ask, never a promise
     * the effect lands.
     *
     * Every axis is reported separately rather than collapsed into the verdict, so a refusal says which
     * condition failed.
     *
     * **Asserting an identity is opting in by KEY, not by value.** Omit `ownerWindowId` and ownership
     * goes unchecked — a runtime that dispatches AS the route's owner rather than claiming to be it.
     * Pass the key with a nullish value and the answer is no: a caller whose own id is missing cannot
     * be shown to own anything, and reading that as a waived check would grant on absent evidence.
     * Independently of any assertion, a granted route must itself name a handle, an owning main thread
     * and a target — being unasserted is not the same as being unaddressable.
     * @param {Object} data
     * @param {'close'|'focus'|'position'|'resize'} data.capability
     * @param {String} [data.ownerWindowId] Assert this owner; omit the key to not assert one
     * @param {Object|null} [data.route=null] An already-resolved route; otherwise `windowId` resolves it
     * @param {String} [data.targetWindowId] Require the route to address this exact window
     * @param {String|null} [data.windowId=null] Resolve the route from this window's entry, and require the route to address it
     * @returns {Object} `{capable, granted, hasHandle, hasOwner, hasTarget, ownerAsserted, ownerMatches, present, route, targetMatches}`
     */
    resolveNativeRoute(data) {
        const
            {capability, route: supplied=null, windowId=null} = data,
            // OMITTING a key waives that check; PASSING one that is nullish is a caller whose own
            // identity is missing, and that refuses. Collapsing the two would turn "I have no id to
            // compare" into "no comparison needed", which is the opposite decision.
            assertsOwner   = 'ownerWindowId'  in data,
            assertsTarget  = 'targetWindowId' in data || windowId !== null,
            expectedOwner  = data.ownerWindowId,
            // Resolving by windowId asks about THAT window, so the route has to address it.
            expectedTarget = 'targetWindowId' in data ? data.targetWindowId : windowId,
            route          = supplied ?? ((windowId && this.get(windowId)?.nativeRoute) || null),
            present        = Boolean(route),
            capable        = present && route.capabilities?.[capability] === true,
            hasHandle      = present && Boolean(route.nativeHandleKey),
            // The route must name an owning main thread to address even when the caller does not
            // claim to be it: unasserted ownership is not the same as an unaddressable route.
            hasOwner       = present && Boolean(route.ownerWindowId),
            hasTarget      = present && Boolean(route.targetWindowId),
            ownerMatches   = present && (!assertsOwner  || (Boolean(expectedOwner)  && route.ownerWindowId  === expectedOwner)),
            targetMatches  = present && (!assertsTarget || (Boolean(expectedTarget) && route.targetWindowId === expectedTarget)),
            granted        = capable && hasHandle && hasOwner && hasTarget && ownerMatches && targetMatches;

        return {
            capable, granted, hasHandle, hasOwner, hasTarget, ownerMatches, present, targetMatches,
            ownerAsserted: assertsOwner,
            route        : granted ? route : null
        }
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            className: this.className,
            windows  : this.items.map(win => ({
                id          : win.id,
                appName     : win.appName,
                capabilities: win.capabilities,
                chrome      : win.chrome,
                innerRect   : win.innerRect,
                outerRect   : win.outerRect
            }))
        }
    }
}

export default Neo.setupClass(Window);
