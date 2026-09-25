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
 * - **Context Management:** Robust handling of `OffscreenCanvas` transfer and context acquisition via `waitForCanvas`,
 *   for the context a subclass declares with `contextType` and `contextAttributes`.
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
         * The second `getContext()` argument: `WebGLContextAttributes` for the WebGL types (`alpha`, `antialias`,
         * `powerPreference`, `preserveDrawingBuffer`, …) or `CanvasRenderingContext2DSettings` for `'2d'`.
         * Read once, together with `contextType`, when the canvas arrives; `null` passes no second argument.
         * @member {Object|null} contextAttributes=null
         */
        contextAttributes: null,
        /**
         * The `OffscreenCanvas#getContext()` type this renderer draws with: `'2d'`, `'webgl'`, `'webgl2'` or
         * `'bitmaprenderer'`. Read once when the canvas arrives: an `OffscreenCanvas` stays bound to its first
         * context, so the config is not reactive and a later change cannot re-acquire.
         * @member {String} contextType='2d'
         */
        contextType: '2d',
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
     * The pointer state of a renderer nobody is pointing at: off-canvas, no button held, no movement, no modifier.
     * The position starts off-screen so a first frame never reacts to a cursor at (0, 0). A subclass that tracks
     * more per pointer extends the shape here.
     * @returns {Object}
     */
    static idleMouseState() {
        return {x: -1000, y: -1000, dx: 0, dy: 0, buttons: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false}
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
     * The context `waitForCanvas` acquired for `contextType`, or `null` before the canvas arrives and after a
     * `getContext()` that returned nothing.
     * @member {OffscreenCanvasRenderingContext2D|WebGLRenderingContext|WebGL2RenderingContext|ImageBitmapRenderingContext|null} context=null
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
     * The pointer as the host last reported it: the canvas-relative position, the movement since the previous
     * report (`dx`, `dy`, both 0 on the first report after a leave), the held buttons (`MouseEvent.buttons`) and the
     * four modifier keys. Off-screen with nothing held until the first report, and again after a leave.
     * @member {Object} mouse={x: -1000, y: -1000, dx: 0, dy: 0, buttons: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false}
     */
    mouse = this.constructor.idleMouseState()
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
        me.mouse       = me.constructor.idleMouseState();
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
     * Hook for subclasses: a button went down on the canvas. `mouse.buttons` already holds the new state, so a
     * drag gesture starts here and reads `mouse.dx` / `mouse.dy` on the moves that follow.
     * @param {Object} data The forwarded payload (`x`, `y`, `button`, `buttons`, the modifiers)
     */
    onMouseDown(data) {}

    /**
     * Hook for subclasses: a button was released on the canvas. A pointer that leaves the canvas with a button held
     * reaches no hook — the leave resets `mouse` to idle, so a drag ends when `mouse.buttons` reads 0 on the next
     * frame, not through this hook.
     * @param {Object} data The forwarded payload (`x`, `y`, `button`, `buttons`, the modifiers)
     */
    onMouseUp(data) {}

    /**
     * Hook for subclasses: a wheel event over the canvas. `data.wheel` carries `deltaX`, `deltaY`, `deltaZ` and
     * `deltaMode`; the modifiers ride beside it (`ctrlKey` marks a trackpad pinch on macOS).
     * @param {Object} data The forwarded payload (`x`, `y`, `wheel`, the modifiers)
     */
    onWheel(data) {}

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
     * Exposed method for Remote Access to trigger the reactive config setter. The object form carries the calling
     * window's `windowId`, which routes the call to that window's canvas group; the 13.1 scalar form still works
     * while only one group is known, and is refused as ambiguous across several.
     * @param {Object|String} data `{theme, windowId}`, or the theme itself
     * @param {String} [data.theme]
     * @param {String} [data.windowId]
     */
    setTheme(data) {
        this.theme = Neo.isObject(data) ? data.theme : data
    }

    /**
     * The one remote entry for pointer input. Every report updates `mouse` first (position, movement, held buttons,
     * modifiers), then reaches the matching hook: `click` → `onMouseClick`, `down` → `onMouseDown`, `up` → `onMouseUp`,
     * `wheel` → `onWheel`. A leave resets `mouse` to idle and reaches no hook.
     * @param {Object} data
     * @param {Boolean} [data.altKey]
     * @param {Number} [data.button]
     * @param {Number} [data.buttons]
     * @param {Boolean} [data.click]
     * @param {Boolean} [data.ctrlKey]
     * @param {Boolean} [data.down]
     * @param {Boolean} [data.leave]
     * @param {Boolean} [data.metaKey]
     * @param {Boolean} [data.shiftKey]
     * @param {Boolean} [data.up]
     * @param {Object} [data.wheel] `{deltaX, deltaY, deltaZ, deltaMode}`
     * @param {Number} [data.x]
     * @param {Number} [data.y]
     */
    updateMouseState(data) {
        let me      = this,
            {mouse} = me;

        if (data.leave) {
            me.mouse = me.constructor.idleMouseState();
            return
        }

        // Each axis updates on its own, as it always has; the first report after a leave (or ever) has no
        // previous position to move from, and an axis a report leaves out keeps its position and moves by nothing.
        if (data.x !== undefined) {
            mouse.dx = mouse.x === -1000 ? 0 : data.x - mouse.x;
            mouse.x  = data.x
        } else {
            mouse.dx = 0
        }

        if (data.y !== undefined) {
            mouse.dy = mouse.y === -1000 ? 0 : data.y - mouse.y;
            mouse.y  = data.y
        } else {
            mouse.dy = 0
        }

        for (const key of ['buttons', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
            if (data[key] !== undefined) {
                mouse[key] = data[key]
            }
        }

        data.down  && me.onMouseDown(data);
        data.up    && me.onMouseUp(data);
        data.wheel && me.onWheel(data);
        data.click && me.onMouseClick(data)
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
     * Once found, it acquires the `contextType` context with `contextAttributes` and starts the render loop.
     * A `null` context (the type is unsupported on this host) is reported once and leaves the renderer idle:
     * no size update, no mounted hook, no loop.
     * @param {String} canvasId
     * @param {String} windowId
     * @param {Boolean} hasChange
     * @protected
     */
    waitForCanvas(canvasId, windowId, hasChange) {
        let me                               = this,
            canvas                           = Neo.currentWorker.canvasWindowMap[canvasId]?.[windowId],
            {contextAttributes, contextType} = me;

        if (canvas) {
            me.context = contextAttributes ? canvas.getContext(contextType, contextAttributes) : canvas.getContext(contextType);

            if (!me.context) {
                console.error(`${me.className}: getContext('${contextType}') returned null for canvas ${canvasId}`);
                return
            }

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
