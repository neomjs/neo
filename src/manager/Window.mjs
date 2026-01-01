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
         * @member {Boolean} isSafari
         * @protected
         */
        isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
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
     * @param {Object} data
     * @returns {Object} {chrome, innerRect, outerRect}
     */
    calculateGeometry(data) {
        const
            {innerHeight, innerWidth, mozInnerScreenX, mozInnerScreenY, outerHeight, outerWidth, screenLeft, screenTop} = data,
            widthDiff    = outerWidth  - innerWidth,
            heightDiff   = outerHeight - innerHeight,
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
            // Firefox: explicit viewport coordinates
            viewportLeft = mozInnerScreenX;
            viewportTop  = mozInnerScreenY
        } else if (this.isSafari) {
            // Safari: screenLeft/Top is Frame position. Add chrome to get Viewport.
            viewportLeft = screenLeft + sideBorder;
            viewportTop  = screenTop  + topChrome
        } else {
            // Chrome/Edge: screenLeft/Top is Viewport position.
            viewportLeft = screenLeft;
            viewportTop  = screenTop
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
     * Triggered when a new browser window connects to the SharedWorker.
     * In Shared Worker mode, `Neo.worker.App#onConnect` ensures that `windowData`
     * is fetched from the Main Thread and included in the payload.
     * @param {Object} data
     * @param {Number} data.appName
     * @param {Object} [data.windowData] Contains geometry data (screenLeft, innerHeight, etc.)
     * @param {String} data.windowId
     */
    onWindowConnect({appName, windowData, windowId}) {
        let chrome    = null,
            innerRect = null,
            outerRect = null;

        if (windowData) {
            ({chrome, innerRect, outerRect} = this.calculateGeometry(windowData))
        }

        console.log('Window.onWindowConnect', {windowId, appName, chrome, innerRect, outerRect});

        this.register({appName, chrome, id: windowId, innerRect, outerRect})
    }

    /**
     * @param {Object} data
     * @param {Number} data.appName
     * @param {String} data.windowId
     */
    onWindowDisconnect({windowId}) {
        this.unregister(windowId)
    }

    /**
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
            item = me.get(data.windowId),
            {chrome, innerRect, outerRect} = me.calculateGeometry(data);

        if (item) {
            item.chrome    = chrome;
            item.innerRect = innerRect;
            item.outerRect = outerRect
        } else {
            me.register({
                chrome,
                id: data.windowId,
                innerRect,
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
                id       : win.id,
                appName  : win.appName,
                chrome   : win.chrome,
                innerRect: win.innerRect,
                outerRect: win.outerRect
            }))
        }
    }
}

export default Neo.setupClass(Window);
