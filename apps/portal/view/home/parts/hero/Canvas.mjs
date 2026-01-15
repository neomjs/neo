import Canvas           from '../../../../../../src/component/Canvas.mjs';
import ComponentManager from '../../../../../../src/manager/Component.mjs';

/**
 * @summary The App Worker component for the Home Hero "Neural Swarm" canvas.
 *
 * This component acts as the **Controller** and **Bridge** for the visual effect.
 * It does not perform any rendering itself. Instead, it coordinates the lifecycle and
 * data transfer to the `Portal.canvas.HomeCanvas` (SharedWorker) which handles the physics and drawing.
 *
 * **Responsibilities:**
 * 1. **Lifecycle Management:** Imports and initializes the SharedWorker graph when the canvas
 *    becomes available offscreen.
 * 2. **Resize Observation:** Tracks the DOM element's size via `ResizeObserver` and pushes
 *    dimensions to the worker to ensure the simulation matches the viewport.
 * 3. **Input Bridging:** Captures high-frequency mouse events (move, click, leave) and
 *    forwards normalized coordinates to the worker for interactive physics.
 *
 * @class Portal.view.home.parts.hero.Canvas
 * @extends Neo.component.Canvas
 * @see Portal.canvas.HomeCanvas
 */
class CanvasComponent extends Canvas {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.hero.Canvas'
         * @protected
         */
        className: 'Portal.view.home.parts.hero.Canvas',
        /**
         * @member {String[]} cls=['portal-home-hero-canvas']
         */
        cls: ['portal-home-hero-canvas'],
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
            await Portal.canvas.Helper.importHomeCanvas();
            await Portal.canvas.HomeCanvas.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            Neo.main.addon.ResizeObserver.register({
                id      : me.id,
                windowId: me.windowId
            });

            await me.updateSize();
        } else if (oldValue) {
            me.isCanvasReady = false;
            await Portal.canvas.HomeCanvas.clearGraph()
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
     * Forwards click events to the Shared Worker to trigger visual Shockwaves.
     * Calculates coordinates relative to the canvas bounding box.
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        if (me.isCanvasReady && me.canvasRect) {
            Portal.canvas.HomeCanvas.updateMouseState({
                click: true,
                x    : data.clientX - me.canvasRect.left,
                y    : data.clientY - me.canvasRect.top
            })
        }
    }

    /**
     * Pauses the Shared Worker render loop to save battery/CPU when not visible.
     */
    pause() {
        if (this.isCanvasReady) {
            Portal.canvas.HomeCanvas.pause()
        }
    }

    /**
     * Resumes the Shared Worker render loop.
     */
    resume() {
        if (this.isCanvasReady) {
            Portal.canvas.HomeCanvas.resume()
        }
    }

    /**
     * Resets the mouse state in the Shared Worker when the cursor leaves the canvas.
     * This prevents nodes from being "stuck" in a repulsion state.
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            Portal.canvas.HomeCanvas.updateMouseState({leave: true})
        }
    }

    /**
     * Forwards mouse coordinates to the Shared Worker for interaction effects.
     * Coordinates are normalized relative to the canvas top-left corner using the cached `canvasRect`.
     *
     * @param {Object} data
     */
    onMouseMove(data) {
        let me = this;

        if (me.isCanvasReady) {
            // We use the cached canvasRect to calculate relative coordinates
            // without needing an async DOM read on every frame.
            if (me.canvasRect) {
                Portal.canvas.HomeCanvas.updateMouseState({
                    x: data.clientX - me.canvasRect.left,
                    y: data.clientY - me.canvasRect.top
                })
            }
        }
    }

    /**
     * Updates the canvas size in the Shared Worker when the DOM element resizes.
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;
        await me.updateSize(data.contentRect)
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
            me.canvasRect = rect; // Cache for mouse events
            await Portal.canvas.HomeCanvas.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(CanvasComponent);
