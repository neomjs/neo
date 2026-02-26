import ComponentManager from '../../manager/Component.mjs';
import SharedCanvas     from '../SharedCanvas.mjs';

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
         * @member {String[]} cls=['app-header-canvas']
         */
        cls: ['app-header-canvas'],
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
     * @member {Number|null} navRectsTimeoutId=null
     */
    navRectsTimeoutId = null

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetIsCanvasReady(value, oldValue) {
        super.afterSetIsCanvasReady(value, oldValue);

        let me = this;

        if (value && me.activeId) {
            me.renderer.updateActiveId({id: me.activeId})
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

        let me = this;

        if (value) {
            let parent  = Neo.get(me.parentId),
                buttons = ComponentManager.down(parent, 'button', false);

            buttons.forEach(button => {
                button.addDomListeners({
                    resize: me.onButtonResize,
                    scope : me
                })
            });

            await me.updateNavRects()
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
     * @returns {String}
     */
    getMonitorTargetId() {
        return this.parentId
    }

    /**
     * @param {Object} data
     */
    onButtonResize(data) {
        this.updateNavRects()
    }

    /**
     * Updates the canvas size and re-calculates navigation rects on resize.
     * @param {Object} data
     */
    async onDomResize(data) {
        this.fire('resize', data);
        await this.updateNavRects()
    }

    /**
     * @member {Boolean} isUpdatingNavRects=false
     * @protected
     */
    isUpdatingNavRects = false
    /**
     * @member {Boolean} pendingNavRectsUpdate=false
     * @protected
     */
    pendingNavRectsUpdate = false

    /**
     * Synchronizes the positions of the navigation buttons with the Shared Worker.
     * This allows the physics engine to "divert" the energy streams around the buttons.
     *
     * @param {Boolean} [isFallback=false]
     * @returns {Promise<void>}
     */
    async updateNavRects(isFallback=false) {
        let me = this;

        if (!me.isCanvasReady) return;

        if (!isFallback) {
            if (me.navRectsTimeoutId) {
                clearTimeout(me.navRectsTimeoutId)
            }

            me.navRectsTimeoutId = setTimeout(() => {
                me.navRectsTimeoutId = null;
                me.updateNavRects(true)
            }, 1000)
        }

        if (me.isUpdatingNavRects) {
            me.pendingNavRectsUpdate = true;
            return
        }

        me.isUpdatingNavRects = true;
        me.pendingNavRectsUpdate = false;

        let parent  = Neo.get(me.parentId),
            buttons = ComponentManager.down(parent, 'button', false),
            ids     = buttons.map(button => button.id);

        if (ids.length > 0) {
            let allIds = [...ids, me.id],
                rects  = await me.getDomRect(allIds);

            if (rects) {
                let canvasRect = rects.pop();

                me.canvasRect = canvasRect; // Cache for mouse events

                if (canvasRect) {
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

                    me.renderer.updateNavRects({
                        height: canvasRect.height,
                        rects : me.navRects,
                        width : canvasRect.width
                    })
                }
            }
        }

        me.isUpdatingNavRects = false;

        if (me.pendingNavRectsUpdate) {
            me.updateNavRects()
        }
    }
}

export default Neo.setupClass(Canvas);
