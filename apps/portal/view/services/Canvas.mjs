import BaseCanvas from '../../../../src/component/Canvas.mjs';

/**
 * @class Portal.view.services.Canvas
 * @extends Neo.component.Canvas
 */
class Canvas extends BaseCanvas {
    static config = {
        /**
         * @member {String} className='Portal.view.services.Canvas'
         * @protected
         */
        className: 'Portal.view.services.Canvas',
        /**
         * @member {String[]} cls=['portal-services-canvas']
         * @reactive
         */
        cls: ['portal-services-canvas'],
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
     * @member {Object|null} canvasRect=null
     */
    canvasRect = null
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
            await Portal.canvas.Helper.importServicesCanvas();
            await Portal.canvas.ServicesCanvas.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            Neo.main.addon.ResizeObserver.register({
                id      : me.id,
                windowId: me.windowId
            });

            await me.updateSize()
        } else if (oldValue) {
            me.isCanvasReady = false;
            await Portal.canvas.ServicesCanvas.clearGraph()
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
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            Portal.canvas.ServicesCanvas.updateMouseState({leave: true})
        }
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        let me = this;
        if (me.isCanvasReady && me.canvasRect) {
            Portal.canvas.ServicesCanvas.updateMouseState({
                x: data.clientX - me.canvasRect.left,
                y: data.clientY - me.canvasRect.top
            })
        }
    }

    /**
     * @param {Object} data
     */
    async onResize(data) {
        await this.updateSize(data.contentRect)
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
            me.canvasRect = rect;
            await Portal.canvas.ServicesCanvas.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(Canvas);
