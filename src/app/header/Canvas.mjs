import SharedCanvas     from '../SharedCanvas.mjs';
import ComponentManager from '../../manager/Component.mjs';

/**
 * @summary The App Worker component for the HeaderToolbar canvas overlay.
 *
 * This component coordinates the OffscreenCanvas transfer and lifecycle management.
 * It serves as the App Worker's handle for the visual effect, responsible for:
 *
 * 1. **Lifecycle Management:** Instantiating and destroying the rendering graph in the `Canvas SharedWorker`.
 * 2. **DOM Synchronization:** Tracking the size/position of the canvas and navigation buttons, forwarding these to the renderer.
 * 3. **Input Bridging:** Capturing user interactions (mouse move, click) and forwarding coordinates to the renderer.
 *
 * The actual rendering loop and physics simulation happen in `Neo.canvas.Header` (SharedWorker),
 * ensuring the main thread and App Worker remain unblocked.
 *
 * @class Neo.app.header.Canvas
 * @extends Neo.app.SharedCanvas
 * @see Neo.canvas.Header
 */
class Canvas extends SharedCanvas {
    static config = {
        /**
         * @member {String} className='Neo.app.header.Canvas'
         * @protected
         */
        className: 'Neo.app.header.Canvas',
        /**
         * @member {String|null} activeId_=null
         * @reactive
         */
        activeId_: null,
        /**
         * @member {String[]} cls=['neo-header-canvas']
         */
        cls: ['neo-header-canvas'],
        /**
         * @member {String|null} hoverId_=null
         * @reactive
         */
        hoverId_: null,
        /**
         * @member {String} rendererClassName='Neo.canvas.Header'
         */
        rendererClassName: 'Neo.canvas.Header',
        /**
         * @member {String} rendererImportPath='src/canvas/Header.mjs'
         */
        rendererImportPath: 'src/canvas/Header.mjs'
    }

    /**
     * @member {Object[]} navRects=null
     */
    navRects = null

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetIsCanvasReady(value, oldValue) {
        super.afterSetIsCanvasReady(value, oldValue);

        if (value && this.activeId) {
            this.renderer.updateActiveId({id: this.activeId})
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
        await super.afterSetOffscreenRegistered(value, oldValue);

        if (value) {
            await this.updateNavRects()
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    async afterSetActiveId(value, oldValue) {
        if (this.isCanvasReady) {
            await this.renderer.updateActiveId({id: value})
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    async afterSetHoverId(value, oldValue) {
        if (this.isCanvasReady) {
            await this.renderer.updateHoverId({id: value})
        }
    }

    /**
     * Updates the canvas size and re-calculates navigation rects on resize.
     * @param {Object} data
     */
    async onResize(data) {
        await super.onResize(data);
        await this.updateNavRects()
    }

    /**
     * Synchronizes the positions of the navigation buttons with the Shared Worker.
     * This allows the physics engine to "divert" the energy streams around the buttons.
     *
     * @returns {Promise<void>}
     */
    async updateNavRects() {
        let me = this;

        if (!me.isCanvasReady) return;

        let parent  = Neo.get(me.parentId),
            buttons = ComponentManager.down(parent, 'button', false),
            ids     = buttons.map(button => button.id);

        if (ids.length > 0) {
            let rects      = await me.getDomRect(ids),
                canvasRect = await me.getDomRect(me.id);

            me.canvasRect = canvasRect; // Cache for mouse events

            if (rects && canvasRect) {
                // Normalize button rects to be relative to the canvas
                me.navRects = rects.map((r, index) => {
                    if (!r) return null;
                    return {
                        id    : ids[index],
                        x     : r.x - canvasRect.x,
                        y     : r.y - canvasRect.y,
                        width : r.width,
                        height: r.height
                    }
                }).filter(Boolean);

                me.renderer.updateNavRects({rects: me.navRects})
            }
        }
    }
}

export default Neo.setupClass(Canvas);
