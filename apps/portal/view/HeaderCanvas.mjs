import Canvas from '../../../src/component/Canvas.mjs';

/**
 * @summary Canvas overlay for the HeaderToolbar.
 * @class Portal.view.HeaderCanvas
 * @extends Neo.component.Canvas
 */
class HeaderCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='Portal.view.HeaderCanvas'
         * @protected
         */
        className: 'Portal.view.HeaderCanvas',
        /**
         * @member {Object} listeners
         */
        listeners: {
            resize: 'onResize'
        },
        /**
         * @member {Object} style
         */
        style: {
            height       : '100%',
            left         : '0',
            pointerEvents: 'none',
            position     : 'absolute',
            top          : '0',
            width        : '100%',
            zIndex       : 1 // Ensure it is above the background but below/above items as needed?
                             // If it's an overlay for effects *on* items, it might need to be on top.
                             // But buttons need to be clickable. pointerEvents: 'none' handles clicks.
        }
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

            await me.updateSize()
        } else if (oldValue) {
            me.isCanvasReady = false;
            await Portal.canvas.HeaderCanvas.clearGraph()
        }
    }

    /**
     * @returns {String}
     */
    getCanvasId() {
        let me = this;

        if (!me.canvasId) {
            // The Canvas component creates a canvas tag.
            // Depending on implementation, we might need to find it.
            // But base component usually handles getting the canvas node or id.
            // Actually, Canvas.mjs transfers the *first child* if configured?
            // Let's look at TicketCanvas implementation.
            // It has `_vdom: {tag: 'div', cn: [{tag: 'canvas'}]}`.
            // So it finds cn[0].id.
            // Neo.component.Canvas by default *is* a canvas tag if not customized?
            // Let's check Canvas.mjs.
            // "src/component/Canvas.mjs" => _vdom is {tag: 'canvas'}.
            me.canvasId = me.id
        }
        return me.canvasId
    }

    /**
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;
        await me.updateSize(data.contentRect)
    }

    /**
     * @param {Object|null} rect
     */
    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.getDomRect(me.id)
        }

        if (rect) {
            await Portal.canvas.HeaderCanvas.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(HeaderCanvas);
