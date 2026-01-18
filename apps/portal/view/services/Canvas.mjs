import BaseCanvas from '../../../../src/component/Canvas.mjs';

/**
 * @summary The App Worker component for the Services "Neural Lattice" background.
 *
 * This component acts as the **Controller** and **Bridge** for the "Neural Lattice" visualization.
 * It does not perform any rendering itself. Instead, it coordinates the lifecycle and
 * data transfer to the `Portal.canvas.ServicesCanvas` (SharedWorker) which handles the physics and drawing.
 *
 * **Responsibilities:**
 * 1. **Lifecycle Management:** Imports and initializes the SharedWorker graph when the canvas
 *    becomes available offscreen via `afterSetOffscreenRegistered`.
 * 2. **Resize Observation:** Tracks the DOM element's size via `Neo.main.addon.ResizeObserver` and pushes
 *    dimensions to the worker to ensure the simulation matches the viewport.
 * 3. **Input Bridging:** Captures high-frequency mouse events (move, leave) from the parent container
 *    and forwards normalized coordinates to the worker for interactive physics.
 *
 * @class Portal.view.services.Canvas
 * @extends Neo.component.Canvas
 * @see Portal.canvas.ServicesCanvas
 */
class Canvas extends BaseCanvas {
    static config = {
        /**
         * @member {String} className='Portal.view.services.Canvas'
         * @protected
         */
        className: 'Portal.view.services.Canvas',
        /**
         * @member {String[]} cls=['portal-services-canvas']
         * @reactive
         */
        cls: ['portal-services-canvas'],
        /**
         * @member {Object} listeners
         */
        listeners: {
            resize: 'onResize'
        },
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'canvas'},
        /**
         * @member {Boolean} isCanvasReady_=false
         */
        isCanvasReady_: false
    }

    /**
     * @member {String|null} canvasId=null
     */
    canvasId = null
    /**
     * @member {Object|null} canvasRect=null
     */
    canvasRect = null

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetIsCanvasReady(value, oldValue) {
        if (value) {
            let mode = this.theme?.includes('dark') ? 'dark' : 'light';
            Portal.canvas.ServicesCanvas.setTheme(mode)
        }
    }

    /**
     * Lifecycle hook triggered when the canvas is registered offscreen.
     * Initializes the Shared Worker graph and sets up resize observation.
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        let me = this;

        if (value) {
            await Portal.canvas.Helper.importServicesCanvas();
            await Portal.canvas.ServicesCanvas.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            Neo.main.addon.ResizeObserver.register({
                id      : me.id,
                windowId: me.windowId
            });

            await me.updateSize()
        } else if (oldValue) {
            me.isCanvasReady = false;
            await Portal.canvas.ServicesCanvas.clearGraph()
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        if (value && this.isCanvasReady) {
            let mode = value.includes('dark') ? 'dark' : 'light';
            Portal.canvas.ServicesCanvas.setTheme(mode)
        }
    }

    /**
     * @returns {String}
     */
    getCanvasId() {
        let me = this;
        if (!me.canvasId) {
            me.canvasId = me.id
        }
        return me.canvasId
    }

    /**
     * Resets the mouse state in the Shared Worker when the cursor leaves the canvas.
     * This prevents nodes from being "stuck" in a repulsion state.
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            Portal.canvas.ServicesCanvas.updateMouseState({leave: true})
        }
    }

    /**
     * Forwards mouse coordinates to the Shared Worker for interaction effects.
     * Coordinates are normalized relative to the canvas top-left corner using the cached `canvasRect`.
     * @param {Object} data
     */
    onMouseMove(data) {
        let me = this;
        if (me.isCanvasReady && me.canvasRect) {
            Portal.canvas.ServicesCanvas.updateMouseState({
                x: data.clientX - me.canvasRect.left,
                y: data.clientY - me.canvasRect.top
            })
        }
    }

    /**
     * Updates the canvas size in the Shared Worker when the DOM element resizes.
     * @param {Object} data
     */
    async onResize(data) {
        await this.updateSize(data.contentRect)
    }

    /**
     * Pushes the new dimensions to the Shared Worker and caches the bounding rect.
     * @param {Object|null} rect
     */
    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.getDomRect(me.id)
        }

        if (rect) {
            me.canvasRect = rect;
            await Portal.canvas.ServicesCanvas.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(Canvas);
