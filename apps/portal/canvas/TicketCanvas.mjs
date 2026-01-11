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

        // 2. Draw Neural Connections (The "Spine")
        // We connect each node to the next one.
        
        // Gradient for the spine - refined to Gray/Subtle
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0,   'rgba(150, 150, 150, 0.1)');
        gradient.addColorStop(0.5, 'rgba(150, 150, 150, 0.3)');
        gradient.addColorStop(1,   'rgba(150, 150, 150, 0.1)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth   = 2;
        ctx.beginPath();

        if (me.nodes.length > 0) {
            let first = me.nodes[0];
            ctx.moveTo(first.x, first.y);

            for (let i = 1; i < me.nodes.length; i++) {
                let node = me.nodes[i];
                ctx.lineTo(node.x, node.y);
            }
            // Extend to bottom from last node
            let last = me.nodes[me.nodes.length - 1];
            ctx.lineTo(last.x, height);
        }
        ctx.stroke();

        // 3. Draw "Pulse" Effect
        const pulseSpeed  = 0.15; // px per ms
        const pulseY      = (now * pulseSpeed) % height;
        const pulseLength = 100;

        // Find which segment the pulse is in
        const getXAtY = (y) => {
            if (me.nodes.length < 2) return me.nodes[0]?.x || 38;
            
            // Before first node
            if (y < me.nodes[0].y) return me.nodes[0].x;

            for (let i = 0; i < me.nodes.length - 1; i++) {
                let curr = me.nodes[i];
                let next = me.nodes[i+1];
                if (y >= curr.y && y <= next.y) {
                    let ratio = (y - curr.y) / (next.y - curr.y);
                    return curr.x + (next.x - curr.x) * ratio;
                }
            }
            
            // After last node
            return me.nodes[me.nodes.length - 1].x;
        };

        if (me.nodes.length > 0 && pulseY > me.nodes[0].y) {
            const pulseGrad = ctx.createLinearGradient(0, pulseY, 0, pulseY + pulseLength);
            pulseGrad.addColorStop(0,   'rgba(64, 196, 255, 0)');
            pulseGrad.addColorStop(0.5, 'rgba(64, 196, 255, 1)');
            pulseGrad.addColorStop(1,   'rgba(64, 196, 255, 0)');

            ctx.strokeStyle = pulseGrad;
            ctx.lineWidth   = 4;
            ctx.beginPath();
            
            let pulseX = getXAtY(pulseY);
            ctx.moveTo(pulseX, pulseY);
            ctx.lineTo(getXAtY(pulseY + pulseLength), Math.min(pulseY + pulseLength, height));
            ctx.stroke();
        }

        // 4. "The Gap": Cut out holes for the DOM Nodes
        // This ensures the line never visually crosses the Avatar/Badge
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000'; // Color irrelevant for erase

        me.nodes.forEach(node => {
            if (node.radius) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
                ctx.fill();
            }
        });

        // 5. Draw Orbit/Glow Effects
        // Switch back to drawing on top
        ctx.globalCompositeOperation = 'source-over';

        me.nodes.forEach(node => {
            const radius = node.radius || 20;
            const x      = node.x;
            const y      = node.y;
            
            // Interaction: If pulse is near node, activate orbit
            const dist     = Math.abs((pulseY + pulseLength/2) - y);
            const isActive = dist < 60;

            if (isActive) {
                // Calculate intensity based on proximity
                const alpha = Math.max(0, 1 - (dist / 60));
                
                // Outer Orbit Ring
                ctx.strokeStyle = `rgba(64, 196, 255, ${alpha})`;
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
                ctx.stroke();

                // Inner Glow (Subtle)
                ctx.fillStyle = `rgba(64, 196, 255, ${alpha * 0.1})`;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                // Idle state: Subtle gray ring to define the track (Optional)
                // Looks cleaner without it, letting the gap be the definition.
                // Uncomment to add a static ring:
                /*
                ctx.strokeStyle = `rgba(150, 150, 150, 0.1)`;
                ctx.lineWidth   = 1;
                ctx.beginPath();
                ctx.arc(x, y, radius + 1, 0, 2 * Math.PI);
                ctx.stroke();
                */
            }
        });

        // Loop
        setTimeout(me.render.bind(me), 1000 / 60);
    }
}

export default Neo.setupClass(TicketCanvas);