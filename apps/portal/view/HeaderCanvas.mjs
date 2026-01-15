import Canvas           from '../../../src/component/Canvas.mjs';
import ComponentManager from '../../../src/manager/Component.mjs';

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
 * The actual rendering loop and physics simulation happen in `Portal.canvas.HeaderCanvas` (SharedWorker),
 * ensuring the main thread and App Worker remain unblocked.
 *
 * @class Portal.view.HeaderCanvas
 * @extends Neo.component.Canvas
 * @see Portal.canvas.HeaderCanvas
 */
class HeaderCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='Portal.view.HeaderCanvas'
         * @protected
         */
        className: 'Portal.view.HeaderCanvas',
        /**
         * @member {String|null} activeId_=null
         * @reactive
         */
        activeId_: null,
        /**
         * @member {String[]} cls=['portal-header-canvas']
         */
        cls: ['portal-header-canvas'],
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
        {tag: 'canvas'}
    }

    /**
     * @member {String|null} canvasId=null
     */
    canvasId = null
    /**
     * @member {Boolean} isCanvasReady=false
     */
    isCanvasReady = false
    /**
     * @member {Object[]} navRects=null
     */
    navRects = null

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
            await Portal.canvas.Helper.importHeaderCanvas();
            await Portal.canvas.HeaderCanvas.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            Neo.main.addon.ResizeObserver.register({
                id      : me.id,
                windowId: me.windowId
            });

            await me.updateSize();
            await me.updateNavRects();

            if (me.activeId) {
                await Portal.canvas.HeaderCanvas.updateActiveId({id: me.activeId})
            }
        } else if (oldValue) {
            me.isCanvasReady = false;
            await Portal.canvas.HeaderCanvas.clearGraph()
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    async afterSetActiveId(value, oldValue) {
        if (this.isCanvasReady) {
            await Portal.canvas.HeaderCanvas.updateActiveId({id: value})
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
     * Captures click events and forwards them to the Shared Worker to trigger shockwaves.
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        if (me.isCanvasReady && me.canvasRect) {
            Portal.canvas.HeaderCanvas.updateMouseState({
                click: true,
                x    : data.clientX - me.canvasRect.left,
                y    : data.clientY - me.canvasRect.top
            })
        }
    }

    /**
     * Resets the mouse state in the Shared Worker when the cursor leaves the canvas.
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            Portal.canvas.HeaderCanvas.updateMouseState({leave: true})
        }
    }

    /**
     * Forwards mouse coordinates to the Shared Worker for interaction effects.
     * Coordinates are normalized relative to the canvas top-left corner.
     *
     * @param {Object} data
     */
    onMouseMove(data) {
        let me = this;

        if (me.isCanvasReady) {
            // We use the cached canvasRect to calculate relative coordinates
            // without needing an async DOM read on every frame.
            if (me.canvasRect) {
                Portal.canvas.HeaderCanvas.updateMouseState({
                    x: data.clientX - me.canvasRect.left,
                    y: data.clientY - me.canvasRect.top
                })
            }
        }
    }

    /**
     * Updates the canvas size and re-calculates navigation rects on resize.
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;
        await me.updateSize(data.contentRect);
        await me.updateNavRects()
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

                Portal.canvas.HeaderCanvas.updateNavRects({rects: me.navRects})
            }
        }
    }

    /**
     * Updates the canvas size in the Shared Worker.
     * @param {Object|null} rect
     */
    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.getDomRect(me.id)
        }

        if (rect) {
            me.canvasRect = rect; // Cache for mouse events
            await Portal.canvas.HeaderCanvas.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(HeaderCanvas);
