import Base from '../../../src/core/Base.mjs';

/**
 * @class Portal.canvas.TicketCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class TicketCanvas extends Base {
    static config = {
        /**
         * @member {String} className='Portal.canvas.TicketCanvas'
         * @protected
         */
        className: 'Portal.canvas.TicketCanvas',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'updateGraphData',
                'updateSize',
                'initGraph'
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
     * @member {Object} canvasSize=null
     */
    canvasSize = null
    /**
     * @member {Object} context=null
     */
    context = null
    /**
     * @member {Array} nodes=[]
     */
    nodes = []

    /**
     * Initialize the graph with a canvas ID
     * @param {Object} opts
     * @param {String} opts.canvasId
     * @param {String} opts.windowId
     */
    initGraph({canvasId, windowId}) {
        let me        = this,
            hasChange = me.canvasId !== canvasId;

        me.canvasId = canvasId;

        // Wait for the canvas to be available in the worker map
        const checkCanvas = () => {
            const canvas = Neo.currentWorker.canvasWindowMap[canvasId]?.[windowId];

            if (canvas) {
                me.context = canvas.getContext('2d');
                hasChange && me.render()
            } else {
                setTimeout(checkCanvas, 50)
            }
        };
        checkCanvas()
    }

    /**
     * @member {Number} startY=0
     */
    startY = 0

    /**
     * @param {Object} data
     * @param {Array}  data.nodes
     * @param {Number} [data.startY]
     */
    updateGraphData(data) {
        this.nodes = data.nodes || [];
        if (data.startY !== undefined) {
            this.startY = data.startY;
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

    /**
     * Main Render Loop
     */
    render() {
        let me = this;

        if (!me.context) {
            return;
        }

        const
            ctx    = me.context,
            width  = me.canvasSize?.width || 800,
            height = me.canvasSize?.height || 600,
            now    = Date.now();

        // 1. Clear
        ctx.clearRect(0, 0, width, height);

        // 2. Draw Vertical Neural Line (The "Spine")
        // Positioned relative to the first node.
        // CSS: Timeline padding-left 60px. Line at 30px. Item content starts at 60px.
        // So line is 30px to the left of the item content.
        // We assume nodes[0].x is the item content left edge.
        let spineX = 38,
            startY = me.startY;

        if (me.nodes.length > 0) {
            spineX = me.nodes[0].x - 30; // Shift left to center in the gutter
        }

        // Gradient for the spine
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(64, 196, 255, 0.1)');
        gradient.addColorStop(0.5, 'rgba(64, 196, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(64, 196, 255, 0.1)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(spineX, startY);
        ctx.lineTo(spineX, height);
        ctx.stroke();

        // 3. Draw "Pulse" Effect
        // A glowing segment moving down
        const pulseSpeed = 0.15; // px per ms
        const pulseY = (now * pulseSpeed) % height;
        const pulseLength = 100;

        // Only draw pulse if it's within the spine range
        if (pulseY > startY) {
            const pulseGrad = ctx.createLinearGradient(0, pulseY, 0, pulseY + pulseLength);
            pulseGrad.addColorStop(0, 'rgba(64, 196, 255, 0)');
            pulseGrad.addColorStop(0.5, 'rgba(64, 196, 255, 1)');
            pulseGrad.addColorStop(1, 'rgba(64, 196, 255, 0)');

            ctx.strokeStyle = pulseGrad;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(spineX, pulseY);
            ctx.lineTo(spineX, Math.min(pulseY + pulseLength, height));
            ctx.stroke();
        }
        
        // Wrap around pulse (if at bottom)
        if (pulseY + pulseLength > height) {
             // Draw the remainder at top? Or just let it flow out.
        }

        // 4. Draw Nodes (Event Markers)
        me.nodes.forEach(node => {
            const y = node.y;
            
            // Interaction: If pulse is near node, glow up
            const dist = Math.abs((pulseY + pulseLength/2) - y);
            const isActive = dist < 50;
            const radius = isActive ? 6 : 4;
            const alpha = isActive ? 1 : 0.5;

            ctx.beginPath();
            ctx.arc(spineX, y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(64, 196, 255, ${alpha})`;
            ctx.fill();
            
            if (isActive) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });

        // Loop
        setTimeout(me.render.bind(me), 1000 / 60);
    }
}

export default Neo.setupClass(TicketCanvas);