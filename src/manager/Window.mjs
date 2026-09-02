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
            outerHeight, outerWidth, screenLeft, screenTop
        } = data;

        const
            widthDiff  = outerWidth  - innerWidth,
            heightDiff = outerHeight - innerHeight,
            // Assumption: Side borders are symmetric
            sideBorder   = widthDiff / 2,
            // Assumption: Bottom border matches side border (common in Windows)
            bottomBorder = sideBorder,
            // The rest is the top chrome (header)
            topChrome    = heightDiff - bottomBorder;

        const chrome = {
            bottom: bottomBorder,
            left  : sideBorder,
            right : sideBorder,
            top   : topChrome
        };

        let viewportLeft, viewportTop;

        if (typeof mozInnerScreenX === 'number') {
            // Firefox publishes the viewport origin directly
            viewportLeft = mozInnerScreenX;
            viewportTop  = mozInnerScreenY
        } else {
            // Chrome, Edge and Safari report the frame origin: the viewport sits inside the chrome
            viewportLeft = screenLeft + sideBorder;
            viewportTop  = screenTop  + topChrome
        }

        const innerRect = new Rectangle(viewportLeft, viewportTop, innerWidth, innerHeight);

        const outerRect = new Rectangle(
            viewportLeft - sideBorder,
            viewportTop  - topChrome,
            outerWidth,
            outerHeight
        );

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
            me   = this,
            item = me.get(data.windowId);

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
