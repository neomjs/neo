import Canvas           from '../../../../src/component/Canvas.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';

/**
 * @summary The App Worker component for the Home Hero "Neural Connectome" canvas.
 *
 * Coordinates the OffscreenCanvas transfer and lifecycle management for the
 * Neural Network background visualization.
 *
 * @class Portal.view.home.HomeCanvas
 * @extends Neo.component.Canvas
 */
class HomeCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='Portal.view.home.HomeCanvas'
         * @protected
         */
        className: 'Portal.view.home.HomeCanvas',
        /**
         * @member {String[]} cls=['portal-home-canvas']
         */
        cls: ['portal-home-canvas'],
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
     * Pauses the Shared Worker render loop.
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
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            Portal.canvas.HomeCanvas.updateMouseState({leave: true})
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
                Portal.canvas.HomeCanvas.updateMouseState({
                    x: data.clientX - me.canvasRect.left,
                    y: data.clientY - me.canvasRect.top
                })
            }
        }
    }

    /**
     * Updates the canvas size in the Shared Worker.
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;
        await me.updateSize(data.contentRect)
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
            await Portal.canvas.HomeCanvas.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(HomeCanvas);
