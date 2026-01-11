import Base from '../../../src/core/Base.mjs';

const
    hexToRgbRegex  = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
    shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i; // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")

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
     * @member {Number} animationId=null
     */
    animationId = null
    /**
     * @member {Number} baseSpeed=0.5
     */
    baseSpeed = 0.5
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
     * @member {Number} lastFrameTime=0
     */
    lastFrameTime = 0
    /**
     * @member {Array} nodes=[]
     */
    nodes = []
    /**
     * @member {Number} pulseY=0
     */
    pulseY = 0
    /**
     * @member {Number} startY=0
     */
    startY = 0

    /**
     *
     * @param {Number} y
     * @returns {Number}
     */
    getXAtY(y) {
        let me = this;

        if (me.nodes.length < 2) return me.nodes[0]?.x || 38;
        if (y < me.nodes[0].y)   return me.nodes[0].x;

        for (let i = 0; i < me.nodes.length - 1; i++) {
            let curr = me.nodes[i],
                next = me.nodes[i+1];

            if (y >= curr.y && y <= next.y) {
                let ratio = (y - curr.y) / (next.y - curr.y);
                return curr.x + (next.x - curr.x) * ratio;
            }
        }

        return me.nodes[me.nodes.length - 1].x
    }

    /**
     * Helper to parse hex to rgb
     * @param {String} hex
     * @returns {Object} {r,g,b}
     */
    hexToRgb(hex) {
        hex = hex.replace(shorthandRegex, function(m, r, g, b) {
            return r + r + g + g + b + b;
        });

        const result = hexToRgbRegex.exec(hex);

        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null
    }

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
     * @param {Object} data
     * @param {Array}  data.nodes
     * @param {Number} [data.startY]
     */
    updateGraphData(data) {
        let me = this;
        me.nodes = data.nodes || [];
        if (data.startY !== undefined) {
            me.startY = data.startY;
        }

        // Ensure animation loop is running if we have data
        if (me.nodes.length > 0 && !me.animationId && me.context) {
            me.render()
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
            return
        }

        const
            ctx    = me.context,
            width  = me.canvasSize?.width  || 800,
            height = me.canvasSize?.height || 600,
            now    = Date.now();

        // Time delta in ms
        let dt = now - (me.lastFrameTime || now);
        me.lastFrameTime = now;

        // Cap dt to prevent huge jumps
        if (dt > 100) dt = 16;

        // 1. Calculate Physics
        let minDist   = Infinity,
            nearNode  = null;

        me.nodes.forEach(node => {
            let dist = Math.abs(me.pulseY - node.y);
            if (dist < minDist) {
                minDist  = dist;
                nearNode = node;
            }
        });

        // Speed Modifier
        const
            influenceRange = 150,
            minMod         = 0.2,
            maxMod         = 1.5;

        let speedModifier = maxMod;

        if (minDist < influenceRange) {
            let ratio = minDist / influenceRange;
            speedModifier = minMod + (maxMod - minMod) * (ratio * ratio);
        }

        // Color Interpolation (Chameleon Effect)
        // Base Color: Neo Blue (64, 196, 255)
        let r = 64, g = 196, b = 255;

        // If near a colored node (within 100px), interpolate to its color
        if (nearNode && nearNode.color && minDist < 100) {
            let target = me.hexToRgb(nearNode.color);
            if (target) {
                let mix = 1 - (minDist / 100);
                r = r + (target.r - r) * mix;
                g = g + (target.g - g) * mix;
                b = b + (target.b - b) * mix
            }
        }

        const pulseColorStr = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`; // leaves alpha open

        // Apply Velocity
        me.pulseY += me.baseSpeed * speedModifier * dt;
        if (me.pulseY > height + 200) {
            me.pulseY = -200; // Restart above
        }

        // Dynamic Pulse Length
        const
            baseLength  = 100,
            pulseLength = baseLength * (speedModifier * 0.8);

        // 2. Clear
        ctx.clearRect(0, 0, width, height);

        // 3. Draw Neural Connections (The "Spine")
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
                ctx.lineTo(node.x, node.y)
            }
            let last = me.nodes[me.nodes.length - 1];
            ctx.lineTo(last.x, height)
        }
        ctx.stroke();

        // 4. Draw "Pulse" Effect
        const pulseY = me.pulseY;

        if (me.nodes.length > 0 && pulseY > me.nodes[0].y - pulseLength) {
            const pulseGrad = ctx.createLinearGradient(0, pulseY, 0, pulseY + pulseLength);
            pulseGrad.addColorStop(0,   `${pulseColorStr}, 0)`);
            pulseGrad.addColorStop(0.5, `${pulseColorStr}, 1)`);
            pulseGrad.addColorStop(1,   `${pulseColorStr}, 0)`);

            ctx.strokeStyle = pulseGrad;
            ctx.lineWidth   = 4;
            ctx.beginPath();

            let pulseX = me.getXAtY(pulseY);
            ctx.moveTo(pulseX, pulseY);
            ctx.lineTo(me.getXAtY(pulseY + pulseLength), Math.min(pulseY + pulseLength, height));
            ctx.stroke()
        }

        // 5. "The Gap"
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle                = '#000';

        me.nodes.forEach(node => {
            if (node.radius) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
                ctx.fill()
            }
        });

        // 5. Draw Orbit/Glow Effects
        ctx.globalCompositeOperation = 'source-over';

        me.nodes.forEach(node => {
            const
                radius  = node.radius || 20,
                x       = node.x,
                y       = node.y,
                pTop    = pulseY,
                pBottom = pulseY + pulseLength,
                nTop    = y - radius,
                nBottom = y + radius;

            if (pBottom > nTop && pTop < nBottom) {
                const getProgress = (val) => {
                    return Math.max(0, Math.min(1, (val - nTop) / (2 * radius)))
                };

                const
                    startP    = getProgress(pTop),
                    endP      = getProgress(pBottom),
                    angleTail = -Math.PI / 2 + (startP * Math.PI),
                    angleHead = -Math.PI / 2 + (endP * Math.PI);

                // Use the DYNAMIC color here too!
                ctx.strokeStyle = `${pulseColorStr}, 1)`;
                ctx.lineWidth   = 2;

                // Right Arc
                ctx.beginPath();
                ctx.arc(x, y, radius + 2, angleTail, angleHead, false);
                ctx.stroke();

                // Left Arc
                const
                    leftTail = -Math.PI/2 - (startP * Math.PI),
                    leftHead = -Math.PI/2 - (endP * Math.PI);

                ctx.beginPath();
                ctx.arc(x, y, radius + 2, leftTail, leftHead, true);
                ctx.stroke()
            }
        });

        // Loop using setTimeout (SharedWorkers do not support rAF)
        setTimeout(me.render.bind(me), 1000 / 60)
    }
}

export default Neo.setupClass(TicketCanvas);
