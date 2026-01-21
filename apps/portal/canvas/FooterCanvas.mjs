import Base from './Base.mjs';

const
    hasRaf = typeof requestAnimationFrame === 'function',
    PARTICLE_COUNT = 800, // High density for the "Well"
    STRIDE         = 6;   // x, y, angle, radius, speed, size

/**
 * @summary SharedWorker renderer for the Footer "Event Horizon" overlay with Gravity Interaction.
 *
 * Implements the **"Event Horizon"** visual theme: A radial gravity well representing the core engine.
 *
 * **Visual Metaphor:**
 * - **The Source:** A central singularity that draws everything in.
 * - **Data Stream:** Particles spiral inward, accelerating as they approach the event horizon.
 * - **Gravity Interaction:** Hovered buttons become local "Gravity Wells", pulling particles out of the
 *   main stream into temporary orbit.
 *
 * @class Portal.canvas.FooterCanvas
 * @extends Portal.canvas.Base
 * @singleton
 */
class FooterCanvas extends Base {
    static colors = {
        dark: {
            core  : '#FFFFFF',
            inner : '#00BFFF', // Cyan
            outer : '#3E63DD', // Neo Blue
            void  : 'rgba(0,0,0,0)'
        },
        light: {
            core  : '#3E63DD', // Neo Blue
            inner : '#536DFE', // Indigo
            outer : '#8BA6FF', // Light Blue
            void  : 'rgba(255,255,255,0)'
        }
    }

    static config = {
        /**
         * @member {String} className='Portal.canvas.FooterCanvas'
         * @protected
         */
        className: 'Portal.canvas.FooterCanvas',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'updateActiveId',
                'updateHoverId',
                'updateNavRects'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Particle Buffer
     * @member {Float32Array|null} buffer=null
     */
    buffer = null
    /**
     * @member {String|null} hoverId=null
     */
    hoverId = null
    /**
     * @member {Object[]} navRects=[]
     */
    navRects = []
    /**
     * Transient gravity multiplier for snappy interactions.
     * @member {Number} gravityBoost=1
     */
    gravityBoost = 1

    /**
     * Clears the graph state.
     */
    clearGraph() {
        let me = this;
        super.clearGraph();
        me.buffer       = null;
        me.hoverId      = null;
        me.navRects     = [];
        me.gravityBoost = 1
    }

    /**
     * Initializes the grid.
     * @param {Number} width
     * @param {Number} height
     */
    onGraphMounted(width, height) {
        this.initParticles(width, height)
    }

    /**
     * Creates the particle buffer.
     * @param {Number} width
     * @param {Number} height
     */
    initParticles(width, height) {
        let me = this,
            count = PARTICLE_COUNT;

        me.buffer = new Float32Array(count * STRIDE);

        for (let i = 0; i < count; i++) {
            me.resetParticle(i, width, height, true)
        }
    }

    /**
     * Resets a particle to the outer rim.
     * @param {Number} i Index
     * @param {Number} w Width
     * @param {Number} h Height
     * @param {Boolean} randomRad Random radius (for initial fill)
     */
    resetParticle(i, w, h, randomRad=false) {
        let me = this,
            idx = i * STRIDE,
            maxR = Math.max(w, h) * 0.7;

        me.buffer[idx + 2] = Math.random() * Math.PI * 2; // Angle
        me.buffer[idx + 3] = randomRad ? Math.random() * maxR : maxR; // Radius
        me.buffer[idx + 4] = 0.5 + Math.random() * 1.5; // Base Speed
        me.buffer[idx + 5] = Math.random() * 2 + 0.5; // Size
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
            buffer = me.buffer,
            count  = PARTICLE_COUNT,
            colors = me.constructor.colors[me.theme];

        // Auto-reinit
        if (!buffer) {
            me.initParticles(width, height);
            return
        }

        // Decay Boost
        if (me.gravityBoost > 1) {
            me.gravityBoost *= 0.9;
        }

        ctx.clearRect(0, 0, width, height);

        const
            cx = width / 2,
            cy = height * 0.8; // Center low

        // 1. Draw "The Core" (Glow)
        // Global Engine Rev: Pulse the core radius based on gravityBoost
        let coreRadius = 200 * (1 + (me.gravityBoost - 1) * 0.1);
        let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
        g.addColorStop(0, colors.inner);
        g.addColorStop(1, colors.void);

        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Identify Attractor
        let attractor = null;
        if (me.hoverId && me.navRects.length > 0) {
            // Find rect
            for (const r of me.navRects) {
                if (r.id === me.hoverId) {
                    attractor = {
                        x: r.x + r.width / 2,
                        y: r.y + r.height / 2,
                        r: Math.max(r.width, r.height) / 2
                    };
                    break;
                }
            }
        }

        // 3. Draw Particles
        for (let i = 0; i < count; i++) {
            let idx   = i * STRIDE,
                angle = buffer[idx + 2],
                rad   = buffer[idx + 3],
                spd   = buffer[idx + 4],
                size  = buffer[idx + 5];

            // --- PHYSICS ---

            // Base State: Polar -> Cartesian
            let x = cx + Math.cos(angle) * rad;
            let y = cy + Math.sin(angle) * (rad * 0.4);

            let isCaptured = false;

            // GRAVITY INTERACTION
            if (attractor) {
                let dx = attractor.x - x,
                    dy = attractor.y - y,
                    dist = Math.sqrt(dx*dx + dy*dy);

                // Boosted capture radius
                const captureRadius = 150 * (1 + (me.gravityBoost - 1) * 0.5);

                // Partial Capture: Capture 33% of particles (indices divisible by 3)
                // Balance between maintaining core structure and creating a visible swarm.
                if (dist < captureRadius && i % 3 === 0) {
                    isCaptured = true;
                    // Move towards button center
                    // Boosted pull force
                    let force = (captureRadius - dist) / captureRadius;
                    force *= me.gravityBoost; // Apply boost to velocity

                    x += dx * force * 0.1;
                    y += dy * force * 0.1;
                }
            }

            if (!isCaptured) {
                // Normal Spiral Physics
                let velocity = spd * (1 + (500 / (rad + 10)));
                
                // Global Engine Rev: Accelerate spiral based on gravityBoost
                velocity *= (1 + (me.gravityBoost - 1) * 0.2);

                rad   -= velocity * 0.5;
                angle += velocity * 0.005;

                // Reset
                if (rad < 10) {
                    let maxR = Math.max(width, height) * 0.7;
                    rad = maxR;
                    angle = Math.random() * Math.PI * 2;
                }

                // Update Cartesian from new Polar
                x = cx + Math.cos(angle) * rad;
                y = cy + Math.sin(angle) * (rad * 0.4);
            }

            // Save Polar State
            buffer[idx + 2] = angle;
            buffer[idx + 3] = rad;

            // --- DRAW ---
            let distRatio = rad / (Math.max(width, height) * 0.6);
            let alpha = 1 - distRatio;

            ctx.beginPath();
            // Use 'inner' (Cyan/Indigo) for captured particles instead of 'core' (White)
            if (isCaptured) {
                ctx.fillStyle = colors.inner;
                ctx.globalAlpha = 0.6;
            } else {
                ctx.fillStyle = distRatio < 0.3 ? colors.core : colors.outer;
                ctx.globalAlpha = alpha;
            }

            if (rad < 100 && !isCaptured) {
                // Spaghettification
                let tailX = cx + Math.cos(angle - 0.2) * (rad + 20);
                let tailY = cy + Math.sin(angle - 0.2) * ((rad + 20) * 0.4);

                ctx.strokeStyle = colors.core;
                ctx.lineWidth = size;
                ctx.moveTo(x, y);
                ctx.lineTo(tailX, tailY);
                ctx.stroke();
            } else {
                // No size increase for captured particles
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        if (hasRaf) {
            me.animationId = requestAnimationFrame(me.renderLoop)
        } else {
            me.animationId = setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    /**
     * @param {Object} data
     */
    updateActiveId(data) {}

    /**
     * @param {Object} data
     * @param {String} [data.id]
     */
    updateHoverId(data) {
        let me = this;
        if (me.hoverId !== data?.id) {
            me.gravityBoost = 5; // Trigger Boost on change
        }
        me.hoverId = data?.id || null
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.rects
     */
    updateNavRects(data) {
        let rects = data?.rects;
        this.navRects = Array.isArray(rects) ? rects : []
    }

    /**
     * Re-init on resize.
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        this.initParticles(width, height)
    }
}

export default Neo.setupClass(FooterCanvas);