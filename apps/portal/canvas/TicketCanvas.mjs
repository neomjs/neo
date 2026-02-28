import Base from '../../../src/canvas/Base.mjs';

const
    hasRaf         = typeof requestAnimationFrame === 'function',
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
 * 3. **Dual-Point Physics**: The pulse Head and Tail are simulated as independent particles moving through the
 *    speed field. This creates organic "Squash and Stretch" behavior: compressing when entering a node (Head slows, Tail fast)
 *    and stretching when leaving (Head fast, Tail slow), without requiring complex constraints or causing visual artifacts.
 * 4. **Chameleon Effect**: The pulse dynamically changes its color to match the semantic color of the
 *    nearest node (e.g., Red for Bugs, Green for Features) as it passes by.
 *
 * @class Portal.canvas.TicketCanvas
 * @extends Portal.canvas.Base
 * @singleton
 */
class TicketCanvas extends Base {
    static colors = {
        dark : {
            spine: ['rgba(62, 99, 221, 0.2)', 'rgba(64, 196, 255, 0.4)', 'rgba(62, 99, 221, 0.2)']
        },
        light: {
            spine: ['rgba(150, 150, 150, 0.1)', 'rgba(150, 150, 150, 0.3)', 'rgba(150, 150, 150, 0.1)']
        }
    }

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
                'setTheme',
                'updateGraphData',
                'updateSize'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} theme='light'
         */
        theme: 'light'
    }

    /**
     * @member {Number} baseSpeed=0.5
     */
    baseSpeed = 0.5
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
     * @member {Number} pulseBottom=100
     */
    pulseBottom = 100
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
        super.clearGraph();
        me.nodes         = [];
        me.lastFrameTime = 0;
        me.pulseBottom   = 0
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
     * Calculates the physics state (speed, nearest node) for a given Y position.
     * This acts as the "Traffic Model" engine, determining the local speed limit based on proximity
     * to nodes. Particles slow down near nodes (observation) and accelerate in empty space (travel).
     *
     * @param {Number} y
     * @returns {Object} {speedModifier, nearNode, minDist}
     */
    getPhysics(y) {
        let me       = this,
            minDist  = Infinity,
            nearNode = null;

        me.nodes.forEach(node => {
            let dist = Math.abs(y - node.y);
            if (dist < minDist) {
                minDist  = dist;
                nearNode = node;
            }
        });

        const {influenceRange, minMod, maxMod} = PHYSICS;
        let speedModifier = maxMod;

        if (minDist < influenceRange) {
            let ratio = minDist / influenceRange;
            speedModifier = minMod + (maxMod - minMod) * (ratio * ratio);
        }

        return {speedModifier, nearNode, minDist}
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
     * Updates the graph with new timeline nodes.
     * When `reset` is true, it hard-resets the physics simulation (positions and time) to prevent
     * visual artifacts (jumping/flashing) when switching between different ticket contexts.
     *
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
            me.pulseY      = PHYSICS.pulseBounds;
            me.pulseBottom = PHYSICS.pulseBounds + 100;
            me.lastFrameTime = 0
        }

        // Ensure animation loop is running if we have data
        if (me.nodes.length > 0 && !me.animationId && me.context) {
            me.renderLoop()
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

        if (!me.canRender) {
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
        // "Dual-Point Physics": We simulate the Head and Tail of the pulse as independent particles
        // moving through the "Traffic Model" speed field.
        // - When Head hits a node (slow zone), it slows down. Tail (in fast zone) catches up. -> Squash.
        // - When Head leaves a node, it speeds up. Tail (in slow zone) lags behind. -> Stretch.
        // This creates organic, physically correct deformation without "retraction" glitches or artificial stalls.

        const
            physicsTop    = me.getPhysics(me.pulseY),
            physicsBottom = me.getPhysics(me.pulseBottom),
            {nearNode, minDist} = physicsTop; // Use Top for color/proximity logic to match original feel

        // Apply Independent Velocities
        me.pulseY      += me.baseSpeed * physicsTop.speedModifier    * dt;
        me.pulseBottom += me.baseSpeed * physicsBottom.speedModifier * dt;

        // Constraint: Minimum Length (e.g. 15px).
        // While Dual-Point Physics naturally handles compression, extreme deceleration can theoretically
        // cause the Head to move slower than the Tail for too long, inverting the pulse.
        // This hard constraint preserves physical plausibility (matter cannot have negative length).
        if (me.pulseBottom < me.pulseY + 15) {
            me.pulseBottom = me.pulseY + 15
        }

        // Wrap Around
        if (me.pulseY > maxY - PHYSICS.pulseBounds) {
            me.pulseY      = PHYSICS.pulseBounds;
            me.pulseBottom = PHYSICS.pulseBounds + 100 // Reset length on loop
        }

        const pulseLength = me.pulseBottom - me.pulseY;

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

        // 2. Clear
        ctx.clearRect(0, 0, width, height);

        // 3. Draw Neural Connections (The "Spine")
        const
            themeColors = me.constructor.colors[me.theme],
            gradient    = ctx.createLinearGradient(0, 0, 0, height);

        gradient.addColorStop(0,   themeColors.spine[0]);
        gradient.addColorStop(0.5, themeColors.spine[1]);
        gradient.addColorStop(1,   themeColors.spine[2]);

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
                const getAngle = (val) => {
                    let dy = val - y;
                    // Clamp to radius to avoid NaN in asin
                    dy = Math.max(-radius, Math.min(radius, dy));
                    return Math.asin(dy / radius)
                };

                const
                    angleTail = getAngle(pTop),
                    angleHead = getAngle(pBottom);

                // Use the DYNAMIC color here too!
                ctx.strokeStyle = `${pulseColorStr}, 1)`;
                ctx.lineWidth   = 2;

                // Right Arc
                ctx.beginPath();
                ctx.arc(x, y, radius + 2, angleTail, angleHead, false);
                ctx.stroke();

                // Left Arc
                const
                    leftTail = Math.PI - angleTail,
                    leftHead = Math.PI - angleHead;

                ctx.beginPath();
                ctx.arc(x, y, radius + 2, leftTail, leftHead, true);
                ctx.stroke()
            }
        });

        if (hasRaf) {
            me.animationId = requestAnimationFrame(me.renderLoop)
        } else {
            me.animationId = setTimeout(me.renderLoop, 1000 / 60)
        }
    }
}

export default Neo.setupClass(TicketCanvas);