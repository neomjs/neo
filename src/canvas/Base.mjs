import NeoBase from '../core/Base.mjs';

/**
 * @summary Abstract base class for Canvas Renderers.
 *
 * This class serves as the foundation for the specialized canvas visualizations (Header, Home, Services, Ticket)
 * that run within the **Neo.mjs Canvas SharedWorker**.
 *
 * It creates helper singletons that manage their own `OffscreenCanvas` instances, providing a standardized
 * architecture for:
 * - **Lifecycle Management:** Initialization (`initGraph`), destruction (`clearGraph`), and resource cleanup.
 * - **Render Loop Control:** Unified `render` loop with pause/resume capabilities and frame scheduling.
 * - **Context Management:** Robust handling of `OffscreenCanvas` transfer and context acquisition via `waitForCanvas`.
 * - **Shared State:** Common state management for mouse interaction, time, and theming.
 *
 * These renderers operate off the main thread to ensure high-performance, 60fps animations without
 * blocking the UI.
 *
 * @class Neo.canvas.Base
 * @extends Neo.core.Base
 */
class Base extends NeoBase {
    static config = {
        /**
         * @member {String} className='Neo.canvas.Base'
         * @protected
         */
        className: 'Neo.canvas.Base',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'clearGraph',
                'initGraph',
                'pause',
                'resume',
                'setTheme',
                'updateMouseState',
                'updateSize'
            ]
        },
        /**
         * The active color theme ('light' or 'dark').
         * @member {String} theme_='light'
         * @reactive
         */
        theme_: 'light'
    }

    /**
     * @member {Number|null} animationId=null
     */
    animationId = null
    /**
     * @member {String|null} canvasId=null
     */
    canvasId = null
    /**
     * @member {Object|null} canvasSize=null
     */
    canvasSize = null
    /**
     * @member {OffscreenCanvasRenderingContext2D|null} context=null
     */
    context = null
    /**
     * Cache for reusable gradients to prevent GC.
     * @member {Object} gradients={}
     */
    gradients = {}
    /**
     * Flag to pause the render loop.
     * @member {Boolean} isPaused=false
     */
    isPaused = false
    /**
     * Tracked mouse position for interactive physics.
     * Initialize off-screen to prevent startup jitters.
     * @member {Object} mouse={x: -1000, y: -1000}
     */
    mouse = {x: -1000, y: -1000}
    /**
     * Global simulation time.
     * @member {Number} time=0
     */
    time = 0

    /**
     * @member {Function} renderLoop=this.render.bind(this)
     */
    renderLoop = this.render.bind(this)

    /**
     * Triggered after the `theme` config is changed.
     * Updates the resource cache (gradients, colors) to reflect the new theme immediately.
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetTheme(value, oldValue) {
        if (value && this.canvasSize) {
            this.updateResources?.(this.canvasSize.width, this.canvasSize.height)
        }
    }

    /**
     * Checks if the canvas is ready to render.
     * Returns true only if the context exists and the simulation is not paused.
     * Subclasses should call this at the start of their `render` loop.
     * @returns {Boolean}
     */
    get canRender() {
        let me = this;
        return !!(me.context && !me.isPaused)
    }

    /**
     * Clears the graph state and stops the render loop.
     * Use this to cleanup resources when the component is destroyed or unmounted.
     */
    clearGraph() {
        let me = this;
        me.context     = null;
        me.canvasId    = null;
        me.canvasSize  = null;
        me.animationId = null;
        me.isPaused    = false;
        me.gradients   = {};
        me.mouse       = {x: -1000, y: -1000};
        me.time        = 0
    }

    /**
     * Initializes the canvas context.
     * Starts the polling mechanism to wait for the OffscreenCanvas transfer from the Main Thread.
     * @param {Object} opts
     * @param {String} opts.canvasId
     * @param {String} opts.windowId
     */
    initGraph({canvasId, windowId}) {
        let me        = this,
            hasChange = me.canvasId !== canvasId;

        me.canvasId = canvasId;

        me.waitForCanvas(canvasId, windowId, hasChange)
    }

    /**
     * Hook for subclasses to handle mouse clicks.
     * Called by `updateMouseState` when a click event is received.
     * @param {Object} data
     */
    onMouseClick(data) {}

    /**
     * Pauses the simulation.
     * The render loop will exit early while `isPaused` is true.
     */
    pause() {
        this.isPaused = true
    }

    /**
     * Abstract render method.
     * Subclasses must implement this method to draw the frame.
     */
    render() {}

    /**
     * Resumes the simulation.
     * If the simulation was paused, this restarts the render loop.
     */
    resume() {
        let me = this;

        if (me.isPaused) {
            me.isPaused = false;
            me.renderLoop()
        }
    }

    /**
     * Exposed method for Remote Access to trigger the reactive config setter.
     * @param {String} value
     */
    setTheme(value) {
        this.theme = value
    }

    /**
     * Updates the local mouse state from main thread events.
     * Delegates click events to `onMouseClick`.
     * @param {Object} data
     * @param {Boolean} [data.click]
     * @param {Boolean} [data.leave]
     * @param {Number} [data.x]
     * @param {Number} [data.y]
     */
    updateMouseState(data) {
        let me = this;

        if (data.leave) {
            me.mouse.x = -1000;
            me.mouse.y = -1000
        } else {
            if (data.x !== undefined) me.mouse.x = data.x;
            if (data.y !== undefined) me.mouse.y = data.y;

            if (data.click) {
                me.onMouseClick(data)
            }
        }
    }

    /**
     * Updates the canvas size and resizes the internal context.
     * Triggers `updateResources` hook to allow subclasses to regenerate buffers/gradients.
     * @param {Object} size
     * @param {Number} size.height
     * @param {Number} size.width
     */
    updateSize(size) {
        let me = this;

        me.canvasSize = size;

        if (me.context) {
            me.context.canvas.width  = size.width;
            me.context.canvas.height = size.height;
            // Calls the hook to re-generate resources if implemented
            me.updateResources?.(size.width, size.height)
        }
    }

    /**
     * Polls for the OffscreenCanvas until it is available in the Worker's `canvasWindowMap`.
     * Once found, it initializes the context and starts the render loop.
     * @param {String} canvasId
     * @param {String} windowId
     * @param {Boolean} hasChange
     * @protected
     */
    waitForCanvas(canvasId, windowId, hasChange) {
        let me     = this,
            canvas = Neo.currentWorker.canvasWindowMap[canvasId]?.[windowId];

        if (canvas) {
            me.context = canvas.getContext('2d');

            // Standardize size update
            me.updateSize({width: canvas.width, height: canvas.height});

            // Optional hook for subclasses
            me.onGraphMounted?.(canvas.width, canvas.height);

            if (hasChange && !me.animationId) {
                me.renderLoop()
            }
        } else {
            setTimeout(me.waitForCanvas.bind(me, canvasId, windowId, hasChange), 50)
        }
    }
}

export default Neo.setupClass(Base);
