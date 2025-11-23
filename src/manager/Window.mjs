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
        let item = this.items.find(item => item.rect?.contains({x, y, right: x, bottom: y}));

        return item ? item.id : null
    }

    /**
     * @param {Object} data
     * @param {Number} data.appName
     * @param {String} data.windowId
     */
    onWindowConnect({appName, windowId}) {
        this.register({appName, id: windowId, rect: null})
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
     * @param {Number} data.outerHeight
     * @param {Number} data.outerWidth
     * @param {Number} data.screenLeft
     * @param {Number} data.screenTop
     * @param {String} data.windowId
     */
    onWindowPositionChange({outerHeight, outerWidth, screenLeft, screenTop, windowId}) {
        let item = this.get(windowId),
            rect = new Rectangle(screenLeft, screenTop, outerWidth, outerHeight);

        if (item) {
            item.rect = rect
        } else {
            this.register({id: windowId, rect})
        }
    }
}

export default Neo.setupClass(Window);
