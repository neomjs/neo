import Base from '../../../src/core/Base.mjs';

const
    // Matches full hex codes (e.g., "#0033FF" or "0033FF")
    hexToRgbRegex  = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
    // Matches shorthand hex codes (e.g., "#03F" or "03F") for expansion
    shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;

const BASE_COLOR = {r: 64, g: 196, b: 255}; // Neo Blue

const PHYSICS = {
    influenceRange: 150,
    minMod        : 0.2,
    maxMod        : 1.5,
    pulseBounds   : -200
};

/**
 * @summary Renders the "Neural Timeline" visualization for the Portal's Ticket view.
 *
 * This class runs inside a SharedWorker (via `CanvasWorker`) to provide a high-performance,
 * main-thread-blocking-free animation. It visualizes the flow of time and activity connecting
 * timeline nodes (tickets/events).
 *
 * Key Visual Concepts:
 * 1. **The Spine**: A continuous, gradient-stroked line connecting all nodes.
 * 2. **The Pulse**: A "data packet" that travels along the spine.
 * 3. **Traffic Model Physics**: The pulse does not move at constant speed. It accelerates in empty space
 *    and decelerates when approaching nodes ("interest points"), creating a sense of "observing" the data.
 * 4. **Chameleon Effect**: The pulse dynamically changes its color to match the semantic color of the
 *    nearest node (e.g., Red for Bugs, Green for Features) as it passes by.
 *
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
     * @member {Function} renderLoop=this.render.bind(this)
     */
    renderLoop = this.render.bind(this)
    /**
     * @member {Number} startY=0
     */
    startY = 0

    /**
     * Clears the graph state and stops the render loop.
     * This is called when the view unmounts to prevent "Zombie Loops".
     */
    clearGraph() {
        let me = this;
        me.nodes      = [];
        me.context    = null; // This stops the render loop (see render() check)
        me.canvasId   = null;
        me.canvasSize = null
    }

    /**
     * Calculates the horizontal (X) position on the spine for a given vertical (Y) position.
     *
     * Since the nodes are not vertically aligned (they weave left/right), the spine is a polyline.
     * This method performs linear interpolation between the two nearest nodes to ensure the
     * "Pulse" stays perfectly centered on the spine path as it travels.
     *
     * @param {Number} y - The vertical position
     * @returns {Number} x - The calculated horizontal position on the spine
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
     * Initializes the canvas context for the graph.
     *
     * **Async Initialization Pattern:**
     * The `OffscreenCanvas` is transferred from the main thread to the `CanvasWorker` asynchronously.
     * We cannot guarantee it exists in `Neo.currentWorker.canvasWindowMap` at the moment this method is called.
     * Therefore, we use a polling mechanism (`checkCanvas`) to wait for the transfer to complete before
     * starting the render loop.
     *
     * @param {Object} opts
     * @param {String} opts.canvasId
     * @param {String} opts.windowId
     */
    initGraph({canvasId, windowId}) {
        let me        = this,
            hasChange = me.canvasId !== canvasId;

        me.canvasId = canvasId;

        // Wait for the canvas to be available in the worker map.
        // The OffscreenCanvas is transferred asynchronously to the CanvasWorker,
        // so we need to poll until it arrives.
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
     * @param {Object} data
     * @param {Array}  data.nodes
     * @param {Boolean} [data.reset]
     * @param {Number} [data.startY]
     */
    updateGraphData(data) {
        let me = this;
        me.nodes = data.nodes || [];
        if (data.startY !== undefined) {
            me.startY = data.startY;
        }

        if (data.reset) {
            me.pulseY = PHYSICS.pulseBounds
        }

        // Ensure animation loop is running if we have data
        if (me.nodes.length > 0 && !me.animationId && me.context) {
            me.renderLoop()
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
     * The Main Animation Loop (60fps).
     *
     * This method is responsible for:
     * 1. **Physics Calculation**: Determining the pulse's speed based on proximity to nodes ("Traffic Model").
     * 2. **State Updates**: Updating the pulse's position (`pulseY`) and color (`Chameleon Effect`).
     * 3. **Drawing**: Rendering the spine, the pulse, and the node glows to the `OffscreenCanvas`.
     *
     * It uses `setTimeout` instead of `requestAnimationFrame` because SharedWorkers do not generally support rAF.
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

        // Calculate the bottom-most boundary (last item's Y or default height)
        let maxY = height;

        if (me.nodes.length > 0) {
            maxY = me.nodes[me.nodes.length - 1].y
        }

        // Time delta in ms
        let dt = now - (me.lastFrameTime || now);
        me.lastFrameTime = now;

        // Cap dt to prevent huge jumps
        if (dt > 100) dt = 16;

        // 1. Calculate Physics
        // "Traffic Model": We want the pulse to slow down when it passes "interesting" things (nodes)
        // so the user has time to see the connection. It accelerates in the empty space between nodes.
        let minDist   = Infinity,
            nearNode  = null;

        me.nodes.forEach(node => {
            let dist = Math.abs(me.pulseY - node.y);
            if (dist < minDist) {
                minDist  = dist;
                nearNode = node;
            }
        });

        // Speed Modifier logic
        const {influenceRange, minMod, maxMod, pulseBounds} = PHYSICS;

        let speedModifier = maxMod;

        if (minDist < influenceRange) {
            // Parabolic easing for smooth deceleration/acceleration
            let ratio = minDist / influenceRange;
            speedModifier = minMod + (maxMod - minMod) * (ratio * ratio);
        }

        // Color Interpolation (Chameleon Effect)
        // The pulse "absorbs" the color of the node it is currently passing.
        let {r, g, b} = BASE_COLOR;

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
        if (me.pulseY > maxY - pulseBounds) {
            me.pulseY = pulseBounds; // Restart above
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
        }
        ctx.stroke();

        // 4. Draw "Pulse" Effect
        const pulseY = me.pulseY;

        if (me.nodes.length > 0 && pulseY > me.nodes[0].y - pulseLength && pulseY < maxY) {
            const pulseGrad = ctx.createLinearGradient(0, pulseY, 0, pulseY + pulseLength);
            pulseGrad.addColorStop(0,   `${pulseColorStr}, 0)`);
            pulseGrad.addColorStop(0.5, `${pulseColorStr}, 1)`);
            pulseGrad.addColorStop(1,   `${pulseColorStr}, 0)`);

            ctx.strokeStyle = pulseGrad;
            ctx.lineWidth   = 4;
            ctx.beginPath();

            let pulseX = me.getXAtY(pulseY);
            ctx.moveTo(pulseX, pulseY);
            ctx.lineTo(me.getXAtY(pulseY + pulseLength), Math.min(pulseY + pulseLength, maxY));
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
        setTimeout(me.renderLoop, 1000 / 60)
    }
}

export default Neo.setupClass(TicketCanvas);
