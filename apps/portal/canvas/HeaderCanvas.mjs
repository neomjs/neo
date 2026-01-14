import Base from '../../../src/core/Base.mjs';

/**
 * @summary SharedWorker renderer for the HeaderToolbar overlay.
 * @class Portal.canvas.HeaderCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class HeaderCanvas extends Base {
    static config = {
        /**
         * @member {String} className='Portal.canvas.HeaderCanvas'
         * @protected
         */
        className: 'Portal.canvas.HeaderCanvas',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'clearGraph',
                'initGraph',
                'updateGraphData',
                'updateSize'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
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
     * @member {Object|null} context=null
     */
    context = null

    /**
     * Clears the graph state and stops the render loop.
     */
    clearGraph() {
        let me = this;
        me.context    = null;
        me.canvasId   = null;
        me.canvasSize = null
    }

    /**
     * Initializes the canvas context.
     * @param {Object} opts
     * @param {String} opts.canvasId
     * @param {String} opts.windowId
     */
    initGraph({canvasId, windowId}) {
        let me        = this,
            hasChange = me.canvasId !== canvasId;

        me.canvasId = canvasId;

        const checkCanvas = () => {
            const canvas = Neo.currentWorker.canvasWindowMap[canvasId]?.[windowId];

            if (canvas) {
                me.context = canvas.getContext('2d');
                hasChange && me.renderLoop()
            } else {
                setTimeout(checkCanvas, 50)
            }
        };
        checkCanvas()
    }

    /**
     * @member {Function} renderLoop=this.render.bind(this)
     */
    renderLoop = this.render.bind(this)

    /**
     * Main render loop
     */
    render() {
        let me = this;

        if (!me.context) {
            return
        }

        const
            ctx    = me.context,
            width  = me.canvasSize?.width  || 100,
            height = me.canvasSize?.height || 50;

        ctx.clearRect(0, 0, width, height);

        // Placeholder debug circle to verify it works
        ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(width/2, height/2, 20, 0, Math.PI * 2);
        ctx.fill();

        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * @param {Object} data
     */
    updateGraphData(data) {
        // Todo: implement
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
            me.context.canvas.height = size.height
        }
    }
}

export default Neo.setupClass(HeaderCanvas);
