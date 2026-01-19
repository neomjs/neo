import NeoBase from '../../../src/core/Base.mjs';

/**
 * Abstract base class for Portal Canvas Workers.
 * Provides standardized lifecycle management, context initialization, and render loop control.
 *
 * @class Portal.canvas.Base
 * @extends Neo.core.Base
 */
class Base extends NeoBase {
    static config = {
        /**
         * @member {String} className='Portal.canvas.Base'
         * @protected
         */
        className: 'Portal.canvas.Base',
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
     * Flag to pause the render loop.
     * @member {Boolean} isPaused=false
     */
    isPaused = false

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
     * Clears the graph state and stops the render loop.
     */
    clearGraph() {
        let me = this;
        me.context     = null;
        me.canvasId    = null;
        me.canvasSize  = null;
        me.animationId = null;
        me.isPaused    = false
    }

    /**
     * Initializes the canvas context.
     * Polling mechanism to wait for the OffscreenCanvas transfer.
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
     * Pauses the simulation.
     */
    pause() {
        this.isPaused = true
    }

    /**
     * Abstract render method
     */
    render() {}

    /**
     * Resumes the simulation.
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
     * Polls for the OffscreenCanvas until it is available.
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
