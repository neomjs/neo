import Base from './Base.mjs';

const
    hasRaf = typeof requestAnimationFrame === 'function';

/**
 * @summary SharedWorker renderer for the Footer "Neural Mesh" overlay.
 *
 * Implements a "Neural Mesh" visualization representing the Neo.mjs Application Engine and Agent OS architecture.
 *
 * **Visual Metaphor:**
 * - **Nodes:** Represent Workers and Agents in the distributed system.
 * - **Connections:** Dynamic links representing threads and the Neural Link communication.
 * - **Motion:** Slow, deliberate drift indicating a persistent, living system.
 *
 * **Performance:**
 * Uses a **Zero-Allocation** strategy with `Float32Array` buffers for particle state to ensure
 * smooth 60fps performance on the background thread.
 *
 * @class Portal.canvas.FooterCanvas
 * @extends Portal.canvas.Base
 * @singleton
 */
class FooterCanvas extends Base {
    static colors = {
        dark: {
            node      : 'rgba(64, 196, 255, 0.4)',
            link      : 'rgba(64, 196, 255, 0.1)',
            linkActive: 'rgba(64, 196, 255, 0.3)',
            highlight : '#40c4ff'
        },
        light: {
            node      : 'rgba(62, 99, 221, 0.4)',
            link      : 'rgba(62, 99, 221, 0.1)',
            linkActive: 'rgba(62, 99, 221, 0.3)',
            highlight : '#3e63dd'
        }
    }

    static config = {
        /**
         * @member {String} className='Portal.canvas.FooterCanvas'
         * @protected
         */
        className: 'Portal.canvas.FooterCanvas',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Particle Data Buffer
     * Layout per particle (5 floats):
     * [0] x
     * [1] y
     * [2] vx (velocity x)
     * [3] vy (velocity y)
     * [4] baseSize
     *
     * @member {Float32Array|null} particleBuffer=null
     */
    particleBuffer = null
    /**
     * Number of particles
     * @member {Number} particleCount=0
     */
    particleCount = 0

    /**
     * Clears the graph state.
     */
    clearGraph() {
        let me = this;
        super.clearGraph();
        me.particleBuffer = null;
        me.particleCount  = 0
    }

    /**
     * Initializes the particle mesh.
     * @param {Number} width
     * @param {Number} height
     */
    onGraphMounted(width, height) {
        this.initMesh(width, height)
    }

    /**
     * Creates the particle buffer based on canvas area.
     * @param {Number} width
     * @param {Number} height
     */
    initMesh(width, height) {
        let me = this,
            area = width * height,
            // Density: 1 particle per 9000px^2 (approx 100px x 90px grid equivalent)
            count = Math.floor(area / 9000);

        // Cap count for performance on huge screens
        count = Math.min(count, 150);
        // Ensure minimum density
        count = Math.max(count, 30);

        me.particleCount  = count;
        me.particleBuffer = new Float32Array(count * 5);

        for (let i = 0; i < count; i++) {
            let idx = i * 5;
            me.particleBuffer[idx]     = Math.random() * width;        // x
            me.particleBuffer[idx + 1] = Math.random() * height;       // y
            me.particleBuffer[idx + 2] = (Math.random() - 0.5) * 0.3;  // vx (Slow drift)
            me.particleBuffer[idx + 3] = (Math.random() - 0.5) * 0.3;  // vy
            me.particleBuffer[idx + 4] = Math.random() * 2 + 1;        // baseSize (1-3px)
        }
    }

    /**
     * Main render loop.
     */
    render() {
        let me = this;

        if (!me.canRender) return;

        const
            ctx    = me.context,
            width  = me.canvasSize?.width  || 100,
            height = me.canvasSize?.height || 50,
            buffer = me.particleBuffer,
            count  = me.particleCount,
            colors = me.constructor.colors[me.theme],
            mouse  = me.mouse;

        // Auto-reinit if buffer missing (e.g. rapid resize edge case)
        if (!buffer) {
            me.initMesh(width, height);
            return
        }

        ctx.clearRect(0, 0, width, height);

        // Constants for interaction
        const
            connectionDist    = 120, // Max distance to draw a line
            connectionDistSq  = connectionDist * connectionDist,
            mouseThreshold    = 150, // Mouse interaction radius
            mouseThresholdSq  = mouseThreshold * mouseThreshold;

        ctx.lineWidth = 1;

        // 1. Update Positions & Draw Nodes
        for (let i = 0; i < count; i++) {
            let idx = i * 5,
                x   = buffer[idx],
                y   = buffer[idx + 1],
                vx  = buffer[idx + 2],
                vy  = buffer[idx + 3],
                s   = buffer[idx + 4];

            // Update
            x += vx;
            y += vy;

            // Bounce / Wrap
            if (x < 0 || x > width)  vx *= -1;
            if (y < 0 || y > height) vy *= -1;

            // Store updated
            buffer[idx]     = x;
            buffer[idx + 1] = y;
            buffer[idx + 2] = vx;
            buffer[idx + 3] = vy;

            // Interaction: Mouse Proximity
            let dx = x - mouse.x,
                dy = y - mouse.y,
                d2 = dx*dx + dy*dy,
                isActive = d2 < mouseThresholdSq,
                scale = isActive ? 1.5 : 1;

            // Draw Node
            ctx.fillStyle = isActive ? colors.highlight : colors.node;
            ctx.beginPath();
            ctx.arc(x, y, s * scale, 0, Math.PI * 2);
            ctx.fill();

            // 2. Connections (Nested Loop - Optimized)
            // Only check particles with higher index to avoid double drawing
            for (let j = i + 1; j < count; j++) {
                let jdx = j * 5,
                    jx  = buffer[jdx],
                    jy  = buffer[jdx + 1],
                    dx2 = x - jx,
                    dy2 = y - jy,
                    distSq = dx2*dx2 + dy2*dy2;

                if (distSq < connectionDistSq) {
                    let alpha = 1 - (distSq / connectionDistSq);

                    // Boost alpha if either node is active
                    if (isActive) alpha = Math.min(alpha + 0.2, 1);

                    ctx.strokeStyle = isActive ? colors.linkActive : colors.link;
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(jx, jy);
                    ctx.stroke();
                }
            }
        }
        
        ctx.globalAlpha = 1;

        if (hasRaf) {
            me.animationId = requestAnimationFrame(me.renderLoop)
        } else {
            me.animationId = setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    /**
     * Re-init mesh on resize to maintain density.
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        this.initMesh(width, height)
    }
}

export default Neo.setupClass(FooterCanvas);
