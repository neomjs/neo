import Canvas from '../component/Canvas.mjs';

/**
 * @summary Abstract base class for SharedWorker Canvas components.
 *
 * This class abstracts the common logic for connecting an App Worker component to a
 * SharedWorker canvas renderer. It handles:
 * 1.  **Lifecycle**: Initializing the graph when offscreen canvas is ready.
 * 2.  **Sizing**: Syncing DOM size to the worker via ResizeObserver.
 * 3.  **Interaction**: Bridging pointer input (move, click, leave, down, up, wheel) to the worker through one
 *     `updateMouseState` payload. The owner of the DOM listeners calls the forwarders: a container's `domListeners`
 *     delegating to its canvas item, or the host's own `addDomListeners`. Subscribe `wheel` as a local listener
 *     (`wheel: {fn, local: true, passive: false}`), which is how a node outside the main thread's global wheel
 *     target list receives deltas.
 * 4.  **Theming**: Syncing the component's theme to the worker.
 *
 * Subclasses must define:
 * - `rendererClassName`: String name of the SharedWorker singleton (e.g. 'Neo.canvas.Header')
 * - `rendererImportPath`: Import path for the renderer module (e.g. 'src/canvas/Header.mjs')
 *
 * @class Neo.app.SharedCanvas
 * @extends Neo.component.Canvas
 */
class SharedCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='Neo.app.SharedCanvas'
         * @protected
         */
        className: 'Neo.app.SharedCanvas',
        /**
         * @member {Boolean} isCanvasReady_=false
         */
        isCanvasReady_: false,
        /**
         * The full class name of the SharedWorker singleton.
         * @member {String|null} rendererClassName=null
         */
        rendererClassName: null,
        /**
         * The import path for the renderer module.
         * @member {String|null} rendererImportPath=null
         */
        rendererImportPath: null,
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
     * @member {Object|null} canvasRect=null
     */
    canvasRect = null

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetIsCanvasReady(value, oldValue) {
        if (value) {
            this.renderer?.setTheme({theme: this.resolveColorScheme(), windowId: this.windowId});
            this.fire('canvasReady')
        }
    }

    /**
     * Lifecycle hook triggered when the mounted config gets changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetMounted(value, oldValue) {
        let me = this;

        if (value) {
            await me.ready()
        } else if (me.offscreenRegistered) {
            me.renderer?.clearGraph({windowId: me.windowId})
        }

        super.afterSetMounted(value, oldValue)
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
            await me.ready();

            if (!me.rendererClassName) {
                throw new Error('Canvas component missing rendererClassName config')
            }

            await me.renderer.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            await me.updateSize()
        } else if (oldValue) {
            me.isCanvasReady = false;
            await me.renderer.clearGraph({windowId: me.windowId})
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        if (this.isCanvasReady) {
            this.renderer.setTheme({theme: this.resolveColorScheme(), windowId: this.windowId})
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
     * Resolves the SharedWorker singleton instance from the rendererClassName config.
     * @returns {Object} The renderer singleton
     */
    get renderer() {
        return this.rendererClassName ? Neo.ns(this.rendererClassName) : null
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.offscreenRegistered && this.renderer?.clearGraph({windowId: this.windowId});
        super.destroy(...args)
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        let me = this;

        if (me.rendererImportPath) {
            let {windowId} = me;

            // Starts this window's canvas worker, in this window's own main thread
            await Neo.worker.Manager.startWorker({name: 'canvas', windowId});

            try {
                await Neo.currentWorker.whenCanvasReady(windowId)
            } catch (error) {
                // A window leaving mid-boot is expected; any other failure is this group's worker not starting
                Neo.currentWorker.isDeparture(error, windowId) || console.error('Neo.app.SharedCanvas: canvas worker unavailable', error);
                return
            }

            // Load the specific renderer module for this component
            await Neo.worker.Canvas.loadModule({path: me.rendererImportPath, windowId});

            // Wait for the remote stub to be created
            let j = 0;
            while (!me.renderer && j < 40) {
                await me.timeout(50);
                j++
            }

            if (!me.renderer) {
                 console.error('Renderer Remote Stub not found:', me.rendererClassName)
            }
        }
    }

    /**
     * Forwards one pointer report to the renderer: the canvas-relative position, then the button and modifier facts
     * the DOM event carries (`button`, `buttons`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`), then what the caller
     * adds (`click`, `down`, `up`, `wheel`). Nothing leaves before the canvas is ready and measured.
     * @param {Object} data The DOM event data
     * @param {Object} [extra]
     * @protected
     */
    forwardPointer(data, extra) {
        let me           = this,
            {canvasRect} = me;

        if (me.isCanvasReady && canvasRect) {
            let facts = {x: data.clientX - canvasRect.left, y: data.clientY - canvasRect.top};

            // Only facts the event carries: a report without modifiers must not reset them in the worker.
            for (const key of ['altKey', 'button', 'buttons', 'ctrlKey', 'metaKey', 'shiftKey']) {
                if (data[key] !== undefined) {
                    facts[key] = data[key]
                }
            }

            me.renderer.updateMouseState({...facts, ...extra, windowId: me.windowId})
        }
    }

    /**
     * Forwards click events to the Shared Worker.
     * @param {Object} data
     */
    onClick(data) {
        this.forwardPointer(data, {click: true})
    }

    /**
     * Forwards a pressed button to the Shared Worker; the renderer's `onMouseDown` hook starts a drag from it.
     * @param {Object} data
     */
    onMouseDown(data) {
        this.forwardPointer(data, {down: true})
    }

    /**
     * Pauses the Shared Worker render loop.
     */
    pause() {
        if (this.isCanvasReady) {
            this.renderer.pause({windowId: this.windowId})
        }
    }

    /**
     * Resets the mouse state in the Shared Worker when the cursor leaves the canvas.
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            this.renderer.updateMouseState({leave: true, windowId: this.windowId})
        }
    }

    /**
     * Forwards mouse coordinates to the Shared Worker, with the held buttons and modifiers of the move.
     * @param {Object} data
     */
    onMouseMove(data) {
        this.forwardPointer(data)
    }

    /**
     * Forwards a released button to the Shared Worker; the renderer's `onMouseUp` hook ends a drag on it.
     * @param {Object} data
     */
    onMouseUp(data) {
        this.forwardPointer(data, {up: true})
    }

    /**
     * Forwards a wheel event to the Shared Worker: the deltas beside the position and modifiers, so a renderer can
     * zoom (`ctrlKey` marks a trackpad pinch on macOS).
     * @param {Object} data
     */
    onWheel(data) {
        let {deltaMode, deltaX, deltaY, deltaZ} = data;

        this.forwardPointer(data, {wheel: {deltaMode, deltaX, deltaY, deltaZ}})
    }

    /**
     * Updates the canvas size in the Shared Worker when the DOM element resizes.
     * @param {Object} data
     */
    async onDomResize(data) {
        super.onDomResize(data);
        await this.updateSize(data.contentRect)
    }

    /**
     * Resumes the Shared Worker render loop.
     */
    resume() {
        if (this.isCanvasReady) {
            this.renderer.resume({windowId: this.windowId})
        }
    }

    /**
     * Caches the bounding rect, and pushes the new dimensions to the renderer once this window's canvas worker
     * adopted the canvas: the app worker's renderer proxy exists as soon as ANY window's group registered it, even
     * while this window's group boots or failed.
     * @param {Object|null} [rect]
     */
    async updateSize(rect) {
        let me = this;

        await me.ready();

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.getDomRect(me.id)
        }

        if (rect) {
            me.canvasRect = rect;
            me.offscreenRegistered && await me.renderer?.updateSize({height: rect.height, width: rect.width, windowId: me.windowId})
        }
    }
}

export default Neo.setupClass(SharedCanvas);
