import Canvas from '../../../../src/component/Canvas.mjs';

/**
 * @summary Abstract base class for App Worker Canvas components.
 *
 * This class abstracts the common logic for connecting an App Worker component to a
 * SharedWorker canvas renderer. It handles:
 * 1.  **Lifecycle**: Initializing the graph when offscreen canvas is ready.
 * 2.  **Sizing**: Syncing DOM size to the worker via ResizeObserver.
 * 3.  **Interaction**: Bridging mouse events (move, click, leave) to the worker.
 * 4.  **Theming**: Syncing the component's theme to the worker.
 *
 * Subclasses must define:
 * - `rendererClassName`: String name of the SharedWorker singleton (e.g. 'Portal.canvas.HomeCanvas')
 * - `importMethodName`: String name of the helper import method (e.g. 'importHomeCanvas')
 *
 * @class Portal.view.shared.Canvas
 * @extends Neo.component.Canvas
 */
class SharedCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='Portal.view.shared.Canvas'
         * @protected
         */
        className: 'Portal.view.shared.Canvas',
        /**
         * The name of the method on Portal.canvas.Helper to call for importing the worker code.
         * @member {String|null} importMethodName=null
         */
        importMethodName: null,
        /**
         * @member {Boolean} isCanvasReady_=false
         */
        isCanvasReady_: false,
        /**
         * @member {Object} listeners
         */
        listeners: {
            resize: 'onResize'
        },
        /**
         * The full class name of the SharedWorker singleton.
         * @member {String|null} rendererClassName=null
         */
        rendererClassName: null,
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
            let mode = this.theme?.includes('dark') ? 'dark' : 'light';
            this.renderer.setTheme(mode)
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
            if (!me.importMethodName) {
                throw new Error('Canvas component missing importMethodName config')
            }

            await Portal.canvas.Helper[me.importMethodName]();
            await me.renderer.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            Neo.main.addon.ResizeObserver.register({
                id      : me.id,
                windowId: me.windowId
            });

            await me.updateSize()
        } else if (oldValue) {
            me.isCanvasReady = false;
            await me.renderer.clearGraph()
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
            this.renderer.setTheme(mode)
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
        if (!this.rendererClassName) {
            throw new Error('Canvas component missing rendererClassName config')
        }
        return Neo.ns(this.rendererClassName)
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.renderer.clearGraph();
        super.destroy(...args)
    }

    /**
     * Forwards click events to the Shared Worker.
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        if (me.isCanvasReady && me.canvasRect) {
            me.renderer.updateMouseState({
                click: true,
                x    : data.clientX - me.canvasRect.left,
                y    : data.clientY - me.canvasRect.top
            })
        }
    }

    /**
     * Pauses the Shared Worker render loop.
     */
    pause() {
        if (this.isCanvasReady) {
            this.renderer.pause()
        }
    }

    /**
     * Resets the mouse state in the Shared Worker when the cursor leaves the canvas.
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            this.renderer.updateMouseState({leave: true})
        }
    }

    /**
     * Forwards mouse coordinates to the Shared Worker.
     * @param {Object} data
     */
    onMouseMove(data) {
        let me = this;

        if (me.isCanvasReady) {
            if (me.canvasRect) {
                me.renderer.updateMouseState({
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
        await this.updateSize(data.contentRect)
    }

    /**
     * Resumes the Shared Worker render loop.
     */
    resume() {
        if (this.isCanvasReady) {
            this.renderer.resume()
        }
    }

    /**
     * Pushes the new dimensions to the Shared Worker and caches the bounding rect.
     * @param {Object|null} [rect]
     */
    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.getDomRect(me.id)
        }

        if (rect) {
            me.canvasRect = rect;
            await me.renderer.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(SharedCanvas);
