import Base from '../../../src/core/Base.mjs';

const
    PRIMARY   = '#3E63DD',
    SECONDARY = '#8BA6FF',
    HIGHLIGHT = '#40C4FF';

/**
 * @summary SharedWorker renderer for the Portal Home "Neural Connectome" background.
 *
 * Handles the physics simulation and rendering loop for the 2.5D network visualization.
 * Uses a Zero-Allocation strategy (pre-allocated buffers) for high performance.
 *
 * @class Portal.canvas.HomeCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class HomeCanvas extends Base {
    static config = {
        /**
         * @member {String} className='Portal.canvas.HomeCanvas'
         * @protected
         */
        className: 'Portal.canvas.HomeCanvas',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'clearGraph',
                'initGraph',
                'updateMouseState',
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
     * @member {Object} mouse={x: -1000, y: -1000}
     */
    mouse = {x: -1000, y: -1000}
    /**
     * @member {Number} time=0
     */
    time = 0

    /**
     * Clears the graph state and stops the render loop.
     */
    clearGraph() {
        let me = this;
        me.context    = null;
        me.canvasId   = null;
        me.canvasSize = null;
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
                me.updateSize({width: canvas.width, height: canvas.height});
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
     * Main render loop.
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

        me.time += 0.01;

        ctx.clearRect(0, 0, width, height);

        // Placeholder: Draw a subtle gradient background
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, 'rgba(62, 99, 221, 0.05)'); // PRIMARY low alpha
        gradient.addColorStop(1, 'rgba(139, 166, 255, 0.05)'); // SECONDARY low alpha

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Placeholder: Debug Circle
        ctx.beginPath();
        ctx.arc(width/2 + Math.sin(me.time) * 50, height/2, 20, 0, Math.PI * 2);
        ctx.fillStyle = HIGHLIGHT;
        ctx.fill();

        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * @param {Object} data
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
        }
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

export default Neo.setupClass(HomeCanvas);
