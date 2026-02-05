import Base from '../../../src/canvas/Base.mjs';

const
    hasRaf           = typeof requestAnimationFrame === 'function',
    PRIMARY          = '#3E63DD',
    SECONDARY        = '#536DFE',
    HIGHLIGHT        = '#00BFFF', // Deep Sky Blue (High Contrast)
    CONNECTION_COLOR = '#808080',
    NODE_COUNT       = 150,
    NODE_STRIDE      = 9, // x, y, vx, vy, radius, layer, parentId, phase, energy
    AGENT_COUNT      = 20,
    AGENT_STRIDE     = 6, // x, y, vx, vy, targetIdx, state
    PACKET_COUNT     = 20,
    PACKET_STRIDE    = 5; // x, y, vx, vy, life (0-1)

/**
 * @summary SharedWorker renderer for the Portal Home "Neural Swarm" background.
 *
 * Implements the **"Neural Swarm"** visual theme, a dynamic, mutable network simulation that
 * visualizes the Neo.mjs Application Engine as a living ecosystem.
 *
 * **Visual Architecture:**
 * 1. **Living Topology (The Graph):** Nodes are not static; they form hierarchical clusters representing
 *    Components within Containers. The topology is mutable, with sub-clusters occasionally detaching,
 * *    drifting, and re-parenting (Visualizing "Atomic Moves").
 * 2. **Autonomous Agents (The Neural Link):** "Seeker Drones" roam the graph using Boid behavior
 *    (Separation, Alignment, Cohesion). They "scan" nodes, transferring energy and triggering
 *    visual highlights, representing the active intelligence of the framework.
 * 3. **Data Flow (Signal Packets):** Pulses of light travel along connections from child to parent,
 *    visualizing the flow of events and data upstream.
 * 4. **Atmosphere (Parallax):** A multi-layered depth system creates a volumetric feel, distinguishing
 *    foreground "active" nodes from background "context" nodes.
 *
 * **Responsive Architecture (Reference Viewport):**
 * To ensure a consistent experience across devices (from Mobile to 4K), the simulation uses a **Reference Viewport Strategy**.
 * - **Baseline:** 1920x1080 is defined as scale `1.0`.
 * - **Dynamic Scaling:** On resize, a `scale` factor is calculated: `sqrt((width * height) / (1920 * 1080))`.
 * - **Normalization:** All physics constants (velocity, force), spatial dimensions (distances, radii), and
 *   visual properties (stroke width) are multiplied by this `scale`.
 * - **Density Control:** On small screens (`scale < 0.5`), the background layer is culled to prevent visual noise.
 *
 * **Theme System:**
 * Supports dynamic `light` and `dark` modes via the `theme` config.
 * - **Palette:** A static `colors` map defines semantic color slots (agentHead, spark, etc.) for each mode.
 * - **Hot-Swapping:** Changing the `theme` config triggers `updateResources` to regenerate gradients and
 *   immediately alters rendering colors in the next frame without re-initializing buffers.
 *
 * **Performance Architecture (Zero-Allocation):**
 * To maintain 60fps on high-refresh displays without GC stutters, this class employs a **Zero-Allocation** strategy during the render loop.
 * 1. **TypedArray Buffers:** All entity data (Nodes, Agents, Packets) is stored in pre-allocated `Float32Array` buffers.
 * 2. **Inlined Physics:** Vector calculations are performed inline without creating temporary Objects.
 * 3. **Gradient Caching:** CanvasGradients are created only on resize (`updateResources`) and cached.
 *
 * **Node Buffer Layout (Float32Array):**
 * - 0: x (Position X)
 * - 1: y (Position Y)
 * - 2: vx (Velocity X)
 * - 3: vy (Velocity Y)
 * - 4: radius (Visual size)
 * - 5: layer (Parallax depth: 0=back, 1=mid, 2=front)
 * - 6: parentId (Index of parent node, -1 if parent, -2 if drifting)
 * - 7: phase (Animation offset for breathing)
 * - 8: energy (Interaction state, 0-1)
 *
 * **Agent Buffer Layout (Float32Array):**
 * - 0: x
 * - 1: y
 * - 2: vx
 * - 3: vy
 * - 4: targetIdx (Index of target node, -1 if wandering)
 * - 5: state (0=moving, 1=scanning)
 *
 * **Packet Buffer Layout (Float32Array):**
 * - 0: x
 * - 1: y
 * - 2: vx
 * - 3: vy
 * - 4: life (Frames remaining, 0-1 normalized for alpha)
 *
 * @class Portal.canvas.HomeCanvas
 * @extends Portal.canvas.Base
 * @singleton
 */
class HomeCanvas extends Base {
    static colors = {
        dark: {
            agentHead : '#FFFFFF',
            background: ['rgba(62, 99, 221, 0.15)', 'rgba(139, 166, 255, 0.15)'],
            nodeHigh  : '#FFFFFF',
            packet    : '#FFFFFF',
            shockwave : '#FFFFFF',
            spark     : '#4B0082'
        },
        light: {
            agentHead : '#3E63DD', // PRIMARY
            background: ['rgba(62, 99, 221, 0.05)', 'rgba(139, 166, 255, 0.05)'],
            nodeHigh  : '#3E63DD', // PRIMARY
            packet    : '#3E63DD', // PRIMARY
            shockwave : '#3E63DD', // PRIMARY
            spark     : '#4B0082'
        }
    }

    static config = {
        /**
         * @member {String} className='Portal.canvas.HomeCanvas'
         * @protected
         */
        className: 'Portal.canvas.HomeCanvas',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Pre-allocated buffer for agent data (Seeker Drones).
     * @member {Float32Array|null} agentBuffer=null
     */
    agentBuffer = null
    /**
     * Pre-allocated buffer for node data (The Graph).
     * @member {Float32Array|null} nodeBuffer=null
     */
    nodeBuffer = null
    /**
     * Pre-allocated buffer for data packets (Signal Pulses).
     * @member {Float32Array|null} packetBuffer=null
     */
    packetBuffer = null
    /**
     * Active shockwave effects.
     * @member {Object[]} shockwaves=[]
     */
    shockwaves = []
    /**
     * Active spark particles (Data Debris).
     * @member {Object[]} sparks=[]
     */
    sparks = []
    /**
     * Scaling factor relative to a 1920x1080 reference viewport.
     * Used to ensure consistent physics and visuals across resolutions.
     * @member {Number} scale=1
     */
    scale = 1

    /**
     * Clears the graph state and stops the render loop.
     * Used when the component is destroyed or the route changes.
     */
    clearGraph() {
        let me = this;
        super.clearGraph();
        me.nodeBuffer   = null;
        me.agentBuffer  = null;
        me.packetBuffer = null;
        me.shockwaves   = [];
        me.sparks       = [];
        me.scale        = 1
    }

    /**
     * Hook to initialize nodes and agents after context is ready
     * @param {Number} width
     * @param {Number} height
     */
    onGraphMounted(width, height) {
        this.updateSize({width, height})
    }

    /**
     * Draws the autonomous agents (Seeker Drones).
     *
     * **Visuals:**
     * - **Head:** A solid circle indicating current position.
     * - **Trail:** A fading line drawn opposite to velocity, simulating motion blur.
     * - **Scan Effect:** A pulsing ring when the agent reaches a node (state=1).
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    drawAgents(ctx) {
        let me = this;

        if (!me.agentBuffer) return;

        const
            buffer      = me.agentBuffer,
            count       = AGENT_COUNT,
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale; // Get scale factor

        ctx.strokeStyle = HIGHLIGHT;
        ctx.fillStyle   = themeColors.agentHead;
        ctx.lineCap     = 'round';

        for (let i = 0; i < count; i++) {
            let idx   = i * AGENT_STRIDE,
                x     = buffer[idx],
                y     = buffer[idx + 1],
                vx    = buffer[idx + 2],
                vy    = buffer[idx + 3],
                state = buffer[idx + 5];

            // 1. Draw Trail (Motion Blur)
            let speed = Math.sqrt(vx*vx + vy*vy);

            if (speed > 0.1 * s) { // Scaled threshold
                ctx.beginPath();
                ctx.lineWidth = 2 * s; // Scaled line width
                ctx.globalAlpha = 0.6;
                ctx.moveTo(x, y);
                ctx.lineTo(x - vx * 4, y - vy * 4);
                ctx.stroke()
            }

            // 2. Draw Head
            ctx.beginPath();
            ctx.globalAlpha = state === 1 ? 1 : 0.8;
            let radius = (state === 1 ? 3 : 2) * s; // Scaled radius
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // 3. Scan Effect
            if (state === 1) {
                ctx.beginPath();
                ctx.lineWidth = 1 * s; // Scaled width
                ctx.globalAlpha = 0.3;
                // Scaled ring radius
                ctx.arc(x, y, (8 + Math.sin(me.time * 10) * 2) * s, 0, Math.PI * 2);
                ctx.stroke()
            }
        }

        ctx.globalAlpha = 1
    }

    /**
     * Draws the neural network (nodes and connections).
     *
     * **Intent:**
     * Visualizes the "Application Graph".
     * - **Parallax:** Applies depth-based displacement based on mouse position.
     * - **Connections:** Lines are drawn only between related nodes (Parent-Child or Siblings).
     *   Lines thicken and brighten when near the mouse.
     * - **Nodes:** Circles breathing in size. Colors indicate depth (Layer) and energy state.
     *
     * **Optimization:**
     * Uses inlined math for parallax calculations to avoid allocating thousands of `{x,y}` objects per frame.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawNetwork(ctx, width, height) {
        let me = this;

        if (!me.nodeBuffer) return;

        const
            buffer      = me.nodeBuffer,
            count       = NODE_COUNT,
            mx          = me.mouse.x,
            my          = me.mouse.y,
            cx          = width / 2,
            cy          = height / 2,
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale; // Get scale factor

        ctx.lineWidth = 1 * s; // Scaled line width

        // 1. Draw Connections
        // Iterates all unique pairs to draw lines between connected nodes.
        // Connections are drawn if nodes share a parent (siblings) or are parent-child.
        for (let i = 0; i < count; i++) {
            let idx  = i * NODE_STRIDE,
                l1   = buffer[idx + 5],
                pid1 = buffer[idx + 6],
                // Inline getPos logic for p1 to avoid GC
                f1   = l1 === 2 ? 0.05 : (l1 === 1 ? 0.02 : 0.01),
                dx1  = (mx !== -1000 ? mx - cx : 0) * f1,
                dy1  = (my !== -1000 ? my - cy : 0) * f1,
                p1x  = buffer[idx] + dx1,
                p1y  = buffer[idx + 1] + dy1;

            for (let j = i + 1; j < count; j++) {
                let idx2 = j * NODE_STRIDE,
                    l2   = buffer[idx2 + 5],
                    pid2 = buffer[idx2 + 6];

                const
                    sameCluster   = pid1 === pid2 && pid1 !== -1,
                    isParentChild = (pid1 === j) || (pid2 === i),
                    isClusterLink = (pid1 === -1 && pid2 === -1);

                if (!sameCluster && !isParentChild && !isClusterLink) continue;

                let f2   = l2 === 2 ? 0.05 : (l2 === 1 ? 0.02 : 0.01),
                    dx2  = (mx !== -1000 ? mx - cx : 0) * f2,
                    dy2  = (my !== -1000 ? my - cy : 0) * f2,
                    p2x  = buffer[idx2] + dx2,
                    p2y  = buffer[idx2 + 1] + dy2,
                    dx   = p1x - p2x,
                    dy   = p1y - p2y,
                    distSq = dx*dx + dy*dy;

                // Culling: Only draw connections within a certain distance
                if (distSq < 40000 * s * s) { // Scaled distance squared
                    let dist  = Math.sqrt(distSq),
                        alpha = 1 - (dist / (200 * s)); // Scaled distance factor

                    alpha *= (0.2 + (l1 * 0.1));

                    let mDx = (p1x + p2x)/2 - mx,
                        mDy = (p1y + p2y)/2 - my,
                        mDistSq = mDx*mDx + mDy*mDy;

                    // Mouse Interaction: Highlight connections near cursor
                    if (mDistSq < 10000 * s * s) { // Scaled mouse distance
                        alpha = Math.min(alpha + 0.5, 1);
                        ctx.strokeStyle = HIGHLIGHT;
                        ctx.lineWidth   = 1.5 * s // Scaled
                    } else {
                        ctx.strokeStyle = l1 === 2 ? PRIMARY : SECONDARY;
                        // Elasticity: Thicker when closer (Tension/Slack visualization)
                        ctx.lineWidth = (0.5 + (1 - (dist / (200 * s)))) * s // Scaled
                    }

                    ctx.beginPath();
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.moveTo(p1x, p1y);
                    ctx.lineTo(p2x, p2y);
                    ctx.stroke()
                }
            }
        }

        // 2. Draw Nodes
        for (let i = 0; i < count; i++) {
            let idx      = i * NODE_STRIDE,
                radius   = buffer[idx + 4],
                layer    = buffer[idx + 5],
                parentId = buffer[idx + 6],
                phase    = buffer[idx + 7],
                energy   = buffer[idx + 8];

            // Culling: Skip background layer on very small screens to reduce noise
            if (s < 0.5 && layer === 0) continue;

            let
                // Inline getPos logic for pos
                f        = layer === 2 ? 0.05 : (layer === 1 ? 0.02 : 0.01),
                pDx      = (mx !== -1000 ? mx - cx : 0) * f,
                pDy      = (my !== -1000 ? my - cy : 0) * f,
                posX     = buffer[idx] + pDx,
                posY     = buffer[idx + 1] + pDy,
                dx       = posX - mx,
                dy       = posY - my,
                dist     = Math.sqrt(dx * dx + dy * dy),
                isHover  = dist < 50 * s; // Scaled hover distance

            // Shockwave Interaction
            if (me.shockwaves.length > 0) {
                me.shockwaves.forEach(wave => {
                    let wDist = Math.sqrt((posX - wave.x)**2 + (posY - wave.y)**2),
                        wRad  = wave.age * wave.speed;
                    if (Math.abs(wDist - wRad) < 20 * s) { // Scaled wave width
                        isHover = true;
                    }
                });
            }

            ctx.beginPath();
            let r = parentId === -1 ? radius * 1.5 : radius;

            // Breathing + Energy
            r *= 1 + Math.sin(me.time * 2 + phase) * 0.15 + energy;

            if (isHover) {
                r *= 1.5;
            }

            ctx.arc(posX, posY, r, 0, Math.PI * 2);

            if (energy > 0.1) {
                // Energetic Node (Agent Scanned)
                ctx.fillStyle = HIGHLIGHT;
                ctx.globalAlpha = Math.min(1, 0.5 + energy)
            } else if (layer === 2) {
                ctx.fillStyle = isHover ? themeColors.nodeHigh : PRIMARY;
                ctx.globalAlpha = isHover ? 1 : 0.8
            } else if (parentId === -2) {
                // Drifting Node Visual
                ctx.fillStyle = HIGHLIGHT;
                ctx.globalAlpha = 0.6 + Math.sin(me.time * 10 + phase) * 0.3
            } else if (layer === 1) {
                ctx.fillStyle = isHover ? HIGHLIGHT : SECONDARY;
                ctx.globalAlpha = 0.5
            } else {
                ctx.fillStyle = CONNECTION_COLOR;
                ctx.globalAlpha = 0.2
            }

            ctx.fill();
        }

        ctx.globalAlpha = 1
    }

    /**
     * Draws the data packets traveling along connections.
     * Packets represent signal flow between nodes.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     */
    drawPackets(ctx) {
        let me = this;

        if (!me.packetBuffer) return;

        const
            buffer      = me.packetBuffer,
            count       = PACKET_COUNT,
            themeColors = me.constructor.colors[me.theme];

        ctx.fillStyle   = themeColors.packet;
        ctx.shadowBlur  = 5;
        ctx.shadowColor = HIGHLIGHT;

        for (let i = 0; i < count; i++) {
            let idx  = i * PACKET_STRIDE,
                life = buffer[idx + 4];

            if (life > 0) {
                let x = buffer[idx],
                    y = buffer[idx + 1];

                ctx.beginPath();
                ctx.globalAlpha = Math.min(life * 2, 1); // Fade out at end
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill()
            }
        }

        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 1
    }

    /**
     * Draws expanding shockwaves from clicks with Chromatic Aberration and Composite Rings.
     * Uses optimized RGBA composition to reduce GC pressure.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     */
    drawShockwaves(ctx) {
        let me = this;

        if (me.shockwaves.length === 0) return;

        const
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale;

        ctx.lineCap = 'round';

        for (let i = me.shockwaves.length - 1; i >= 0; i--) {
            let wave = me.shockwaves[i];
            wave.age++;

            let progress = wave.age / wave.maxAge;

            if (progress >= 1) {
                me.shockwaves.splice(i, 1);
                continue;
            }

            // Non-Linear Expansion (Explosive start, slow finish)
            let eased = 1 - Math.pow(1 - progress, 3),
                radius = eased * wave.maxRadius,
                alpha  = 1 - progress;

            // Chromatic Aberration (Shifted to Neon Blue/Cyan theme)

            // 1. Cyan Channel (Lagging Fringe) - Replaces Red
            ctx.beginPath();
            ctx.strokeStyle = HIGHLIGHT;
            ctx.globalAlpha = alpha * 0.8;
            ctx.lineWidth   = 4 * (1 - progress) * s; // Scaled
            ctx.shadowBlur  = 10 * s; // Scaled
            ctx.shadowColor = HIGHLIGHT;
            ctx.arc(wave.x, wave.y, radius * 0.99, 0, Math.PI * 2);
            ctx.stroke();

            // 2. Blue Channel (Leading Fringe)
            ctx.beginPath();
            ctx.strokeStyle = PRIMARY;
            ctx.globalAlpha = alpha * 0.8;
            ctx.lineWidth   = 4 * (1 - progress) * s; // Scaled
            ctx.shadowBlur  = 10 * s; // Scaled
            ctx.shadowColor = PRIMARY;
            ctx.arc(wave.x, wave.y, radius * 1.01, 0, Math.PI * 2);
            ctx.stroke();

            // 3. Primary Wave (White Hot Center)
            ctx.beginPath();
            ctx.strokeStyle = themeColors.shockwave;
            ctx.globalAlpha = alpha;
            ctx.lineWidth   = 6 * (1 - progress) * s; // Scaled
            ctx.shadowBlur  = 20 * s; // Scaled
            ctx.shadowColor = themeColors.shockwave;
            ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            // 4. Pressure Fill (Refraction Fake)
            ctx.fillStyle = PRIMARY;
            ctx.globalAlpha = alpha * 0.05;
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1
    }

    /**
     * Draws temporary spark particles (Data Debris).
     * @param {OffscreenCanvasRenderingContext2D} ctx
     */
    drawSparks(ctx) {
        let me = this;

        if (me.sparks.length === 0) return;

        const
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale;

        ctx.strokeStyle = themeColors.spark;
        ctx.shadowBlur = 0; // Crisp lines on white
        ctx.lineWidth = 2 * s; // Scaled width

        for (let s of me.sparks) {
            ctx.globalAlpha = s.life;
            ctx.beginPath();
            // Draw Trail based on velocity
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
            ctx.stroke()
        }

        ctx.globalAlpha = 1
    }

    /**
     * Initializes the autonomous agents.
     * Agents start at random positions with random high-velocity vectors.
     * @param {Number} width
     * @param {Number} height
     */
    initAgents(width, height) {
        let me = this;

        if (!me.agentBuffer) {
            me.agentBuffer = new Float32Array(AGENT_COUNT * AGENT_STRIDE);
        }

        const
            buffer = me.agentBuffer,
            s      = me.scale;

        for (let i = 0; i < AGENT_COUNT; i++) {
            let idx = i * AGENT_STRIDE;

            buffer[idx]     = Math.random() * width;  // x
            buffer[idx + 1] = Math.random() * height; // y
            buffer[idx + 2] = (Math.random() - 0.5) * 4 * s; // vx (Fast!)
            buffer[idx + 3] = (Math.random() - 0.5) * 4 * s; // vy
            buffer[idx + 4] = -1; // targetIdx (none)
            buffer[idx + 5] = 0   // state (moving)
        }
    }

    /**
     * Initializes the node buffer using **Golden Spiral** distribution.
     * This ensures a uniform but organic-looking distribution of nodes across the screen,
     * preventing the "clumping" seen with random placement.
     * @param {Number} width
     * @param {Number} height
     */
    initNodes(width, height) {
        let me = this;

        if (!me.nodeBuffer) {
            me.nodeBuffer = new Float32Array(NODE_COUNT * NODE_STRIDE);
        }

        const
            buffer        = me.nodeBuffer,
            cx            = width / 2,
            cy            = height / 2,
            phi           = (1 + Math.sqrt(5)) / 2,
            scale         = Math.sqrt(width * height / NODE_COUNT) * 0.8,
            parentCount   = Math.floor(NODE_COUNT * 0.1),
            s             = me.scale; // Use the calculated scale factor

        let parentIndices = [];

        for (let i = 0; i < NODE_COUNT; i++) {
            let idx = i * NODE_STRIDE,
                isParent = i < parentCount;

            if (isParent) parentIndices.push(i);

            let theta = i * 2 * Math.PI * phi,
                r     = Math.sqrt(i) * scale;

            // Simple wrap to keep initial spiral inside reasonable bounds
            let x = cx + r * Math.cos(theta),
                y = cy + r * Math.sin(theta);

            // If the spiral is larger than screen, wrap it
            x = ((x % width) + width) % width;
            y = ((y % height) + height) % height;

            buffer[idx]     = x;
            buffer[idx + 1] = y;
            buffer[idx + 2] = (Math.random() - 0.5) * 0.2 * s; // Scale velocity
            buffer[idx + 3] = (Math.random() - 0.5) * 0.2 * s;

            let layer = Math.floor(Math.random() * 3);
            buffer[idx + 5] = layer; // layer

            // Radius based on layer & role (Scaled)
            buffer[idx + 4] = (isParent ? 4 + (layer * 2) : 2 + (layer * 1.5)) * s;

            // Parent ID (-1 for parents, assigned later for children)
            buffer[idx + 6] = isParent ? -1 : -2;

            // Phase (Breathing offset)
            buffer[idx + 7] = Math.random() * Math.PI * 2;

            // Energy
            buffer[idx + 8] = 0;
        }

        // 2. Assign Children to nearest Parent
        for (let i = parentCount; i < NODE_COUNT; i++) {
            let idx        = i * NODE_STRIDE,
                x          = buffer[idx],
                y          = buffer[idx + 1],
                bestDist   = Infinity,
                bestParent = -1;

            for (let pid of parentIndices) {
                let pIdx = pid * NODE_STRIDE,
                    px   = buffer[pIdx],
                    py   = buffer[pIdx + 1],
                    dx   = x - px,
                    dy   = y - py,
                    dSq  = dx*dx + dy*dy;

                if (dSq < bestDist) {
                    bestDist = dSq;
                    bestParent = pid;
                }
            }

            buffer[idx + 6] = bestParent
        }
    }

    /**
     * Initializes the packet buffer.
     */
    initPackets() {
        let me = this;
        if (!me.packetBuffer) {
            me.packetBuffer = new Float32Array(PACKET_COUNT * PACKET_STRIDE)
        }
    }

    /**
     * @member {Function} renderLoop=this.render.bind(this)
     */
    renderLoop = this.render.bind(this)

    /**
     * Main simulation and render loop.
     * Executed ~60 times per second.
     */
    render() {
        let me = this;

        if (!me.canRender) {
            return
        }

        const
            ctx    = me.context,
            width  = me.canvasSize?.width  || 100,
            height = me.canvasSize?.height || 50;

        me.time += 0.01;

        if (!me.nodeBuffer) me.initNodes(width, height);
        if (!me.agentBuffer) me.initAgents(width, height);
        if (!me.packetBuffer) me.initPackets();

        // Physics Update Steps
        me.updatePhysics(width, height);
        me.updateAgents(width, height);
        me.updatePackets();
        me.updateSparks();

        // Rendering Steps
        ctx.clearRect(0, 0, width, height);

        if (me.gradients.bgGradient) {
            ctx.fillStyle = me.gradients.bgGradient;
            ctx.fillRect(0, 0, width, height)
        }

        me.drawNetwork(ctx, width, height);
        me.drawPackets(ctx);
        me.drawAgents(ctx);
        me.drawShockwaves(ctx);
        me.drawSparks(ctx);

        if (hasRaf) {
            me.animationId = requestAnimationFrame(me.renderLoop)
        } else {
            me.animationId = setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    /**
     * Triggers shockwaves on click.
     * @param {Object} data
     */
    onMouseClick(data) {
        let me = this,
            s  = me.scale;

        me.shockwaves.push({
            x        : data.x,
            y        : data.y,
            age      : 0,
            maxAge   : 40, // Faster, punchier wave
            maxRadius: 300 * s // Scaled radius
        });

        // Spawn Sparks (Data Debris)
        for(let i=0; i<40; i++) {
            let angle = Math.random() * Math.PI * 2,
                speed = (Math.random() * 15 + 5) * s; // Scaled speed
            me.sparks.push({
                x    : data.x,
                y    : data.y,
                vx   : Math.cos(angle) * speed,
                vy   : Math.sin(angle) * speed,
                life : 1.0,
                decay: 0.02 + Math.random() * 0.03
            })
        }
    }

    /**
     * Updates packet logic (Data Flow).
     * Packets spawn randomly at child nodes and travel to their parent nodes,
     * representing data reporting upstream.
     */
    updatePackets() {
        let me = this;
        if (!me.packetBuffer || !me.nodeBuffer) return;

        const
            packets = me.packetBuffer,
            nodes   = me.nodeBuffer,
            pCount  = PACKET_COUNT,
            nCount  = NODE_COUNT,
            s       = me.scale; // Get scale factor

        for (let i = 0; i < pCount; i++) {
            let idx = i * PACKET_STRIDE,
                life = packets[idx + 4];

            if (life <= 0) {
                // Spawn new packet? (Random chance)
                if (Math.random() < 0.02) {
                    // Pick random node (source)
                    let n1 = Math.floor(Math.random() * nCount),
                        idx1 = n1 * NODE_STRIDE,
                        pid = nodes[idx1 + 6]; // Parent ID

                    // Valid targets: Parent (if child), or Child (if parent)
                    // Simplified: Just go Child -> Parent for now (Data reporting)
                    if (pid !== -1) { // If it's a child
                        let idx2 = pid * NODE_STRIDE,
                            x1   = nodes[idx1], y1 = nodes[idx1 + 1],
                            x2   = nodes[idx2], y2 = nodes[idx2 + 1],
                            dx   = x2 - x1,
                            dy   = y2 - y1,
                            dist = Math.sqrt(dx * dx + dy * dy);

                        // Only spawn if connected and close
                        if (dist < 200 * s) { // Scaled distance check
                            packets[idx]     = x1;
                            packets[idx + 1] = y1;
                            let speed        = 4 * s; // Scaled speed
                            packets[idx + 2] = (dx / dist) * speed;
                            packets[idx + 3] = (dy / dist) * speed;
                            packets[idx + 4] = dist / speed // Life = frames to reach target (stays same)
                        }
                    }
                }
            } else {
                // Move
                packets[idx]     += packets[idx + 2];
                packets[idx + 1] += packets[idx + 3];
                packets[idx + 4]-- // Decrease life
            }
        }
    }

    /**
     * Updates spark particles with friction and decay.
     */
    updateSparks() {
        let me = this;
        for (let i = me.sparks.length - 1; i >= 0; i--) {
            let s = me.sparks[i];
            s.x += s.vx;
            s.y += s.vy;
            // Friction (Drag)
            s.vx *= 0.9;
            s.vy *= 0.9;
            s.life -= s.decay;
            if (s.life <= 0) {
                me.sparks.splice(i, 1)
            }
        }
    }

    /**
     * Updates agent positions using **Boid** logic (Seek, Separate).
     * Agents randomly pick a target node, seek it, scan it (transferring energy),
     * and then pick a new target. They also avoid the mouse cursor.
     * @param {Number} width
     * @param {Number} height
     */
    updateAgents(width, height) {
        let me = this;

        if (!me.agentBuffer || !me.nodeBuffer) return;

        const
            agents = me.agentBuffer,
            nodes  = me.nodeBuffer,
            count  = AGENT_COUNT,
            mx     = me.mouse.x,
            my     = me.mouse.y,
            s      = me.scale; // Get scale factor

        for (let i = 0; i < count; i++) {
            let idx = i * AGENT_STRIDE,
                targetIdx = agents[idx + 4],
                state = agents[idx + 5];

            // Behavior 1: Pick a Target
            if (targetIdx === -1 || Math.random() < 0.005) {
                const parentCount = Math.floor(NODE_COUNT * 0.1);
                agents[idx + 4] = Math.floor(Math.random() * parentCount);
                targetIdx = agents[idx + 4];
                agents[idx + 5] = 0;
            }

            // Behavior 2: Seek Target
            if (targetIdx !== -1 && state === 0) {
                let nIdx = targetIdx * NODE_STRIDE,
                    tx   = nodes[nIdx],
                    ty   = nodes[nIdx + 1],
                    dx   = tx - agents[idx],
                    dy   = ty - agents[idx + 1],
                    dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < 10 * s) { // Scaled arrival distance
                    // Arrived! Scan.
                    agents[idx + 5] = 1; // Scan state
                    agents[idx + 2] *= 0.1; // Slow down
                    agents[idx + 3] *= 0.1;

                    // Transfer Energy to Node
                    nodes[nIdx + 8] = 1.0;
                } else {
                    // Steer towards target
                    let force = 0.05 * s; // Scaled steering force
                    agents[idx + 2] += (dx / dist) * force;
                    agents[idx + 3] += (dy / dist) * force;
                }
            } else if (state === 1) {
                if (Math.random() < 0.02) {
                    agents[idx + 4] = -1;
                    agents[idx + 5] = 0;
                    agents[idx + 2] += (Math.random() - 0.5) * 4 * s; // Scaled random burst
                    agents[idx + 3] += (Math.random() - 0.5) * 4 * s;
                }
            }

            // Behavior 3: Mouse Repulsion
            if (mx !== -1000) {
                let dx = agents[idx] - mx,
                    dy = agents[idx + 1] - my,
                    distSq = dx*dx + dy*dy;

                if (distSq < 10000 * s * s) { // Scaled interaction radius squared
                    let dist  = Math.sqrt(distSq),
                        force = (100 * s - dist) / (100 * s); // Scaled force calculation
                    agents[idx + 2] += (dx / dist) * force * 1.5 * s;
                    agents[idx + 3] += (dy / dist) * force * 1.5 * s;
                    agents[idx + 5] = 0
                }
            }

            // Speed Limit & Move
            let speed = Math.sqrt(agents[idx + 2]**2 + agents[idx + 3]**2);
            if (speed > 4 * s) { // Scaled speed limit
                agents[idx + 2] *= (4 * s) / speed;
                agents[idx + 3] *= (4 * s) / speed
            }

            agents[idx]     += agents[idx + 2];
            agents[idx + 1] += agents[idx + 3];

            if (agents[idx] < 0) agents[idx] = width;
            if (agents[idx] > width) agents[idx] = 0;
            if (agents[idx + 1] < 0) agents[idx + 1] = height;
            if (agents[idx + 1] > height) agents[idx + 1] = 0;
        }
    }

    /**
     * Updates node positions using **Cluster Physics**.
     * Handles:
     * 1.  **Cohesion:** Children stick to parents.
     * 2.  **Flow Fields:** Parents drift in organic patterns.
     * 3.  **Topology Mutation:** Nodes can detach and re-parent.
     * 4.  **Interaction:** Mouse repulsion and shockwave explosion.
     * @param {Number} width
     * @param {Number} height
     */
    updatePhysics(width, height) {
        let me = this;

        if (!me.nodeBuffer) return;

        const
            buffer      = me.nodeBuffer,
            mx          = me.mouse.x,
            my          = me.mouse.y,
            parentCount = Math.floor(NODE_COUNT * 0.1),
            s           = me.scale; // Get scale factor

        for (let i = 0; i < NODE_COUNT; i++) {
            let idx = i * NODE_STRIDE,
                parentId = buffer[idx + 6],
                isParent = parentId === -1;

            // --- MUTATION LOGIC (Re-Parenting) ---
            if (!isParent) {
                // 1. Chance to detach (becomes Drifting: -2)
                if (parentId !== -2 && Math.random() < 0.0005) { // Rare event
                    buffer[idx + 6] = -2;
                    // Boost velocity to escape
                    buffer[idx + 2] += (Math.random() - 0.5) * 2 * s;
                    buffer[idx + 3] += (Math.random() - 0.5) * 2 * s
                }

                // 2. Re-attach Logic (if Drifting)
                if (parentId === -2) {
                    // Wander behavior
                    buffer[idx + 2] += (Math.random() - 0.5) * 0.1 * s;
                    buffer[idx + 3] += (Math.random() - 0.5) * 0.1 * s;

                    // Check for new parent
                    for (let p = 0; p < parentCount; p++) {
                        let pIdx = p * NODE_STRIDE,
                            px   = buffer[pIdx],
                            py   = buffer[pIdx + 1],
                            dist = Math.sqrt((px - buffer[idx])**2 + (py - buffer[idx + 1])**2);

                        if (dist < 60 * s) {
                            buffer[idx + 6] = p; // Snap to new parent
                            break
                        }
                    }
                }
            }

            // 1. Cluster Cohesion (Children stick to Parent)
            if (!isParent && buffer[idx + 6] !== -2) { // Normal Child
                let pIdx = parentId * NODE_STRIDE,
                    px   = buffer[pIdx],
                    py   = buffer[pIdx + 1],
                    dx   = px - buffer[idx],
                    dy   = py - buffer[idx + 1],
                    dist = Math.sqrt(dx*dx + dy*dy);

                // Spring force towards parent
                if (dist > 50 * s) { // Ideal distance
                    let force = (dist - 50 * s) * 0.0005; // Constant spring factor is fine
                    buffer[idx + 2] += dx * force;
                    buffer[idx + 3] += dy * force
                }
            }

            // 2. Mouse Repulsion (All nodes)
            if (mx !== -1000) {
                let dx     = buffer[idx] - mx,
                    dy     = buffer[idx + 1] - my,
                    distSq = dx * dx + dy * dy;

                if (distSq < 22500 * s * s) { // 150*s squared
                    let dist  = Math.sqrt(distSq),
                        force = (150 * s - dist) / (150 * s);
                    buffer[idx + 2] += (dx / dist) * force * 0.5 * s;
                    buffer[idx + 3] += (dy / dist) * force * 0.5 * s
                }
            }

            // 3. Shockwave Repulsion (Explosive Force)
            if (me.shockwaves.length > 0) {
                me.shockwaves.forEach(wave => {
                    let progress = wave.age / wave.maxAge;

                    if (progress < 1) {
                        let eased = 1 - Math.pow(1 - progress, 3),
                            wRad  = eased * wave.maxRadius,
                            dx    = buffer[idx] - wave.x,
                            dy    = buffer[idx + 1] - wave.y,
                            dist  = Math.sqrt(dx*dx + dy*dy);

                        // Hit the "Wave Front" (Width matches visual ring ~20px * scale)
                        if (Math.abs(dist - wRad) < 20 * s) {
                            let force = (1 - progress);
                            // Massive Impulse (Throwing)
                            buffer[idx + 2] += (dx / dist) * force * 10 * s;
                            buffer[idx + 3] += (dy / dist) * force * 10 * s
                        }
                    }
                });
            }

            // 4. Physics
            buffer[idx + 2] *= 0.95; // Friction
            buffer[idx + 3] *= 0.95;

            // Energy Decay
            buffer[idx + 8] *= 0.99;

            let drift = isParent ? 0.02 : 0.01;

            // 4. Ambient Drift / Flow Field
            if (isParent) {
                // FLOW FIELD for Parents: Create organic currents
                // Combine Sine/Cosine based on position and time
                let angle = (Math.cos(buffer[idx]     * 0.002 / s + me.time * 0.5) +
                             Math.sin(buffer[idx + 1] * 0.002 / s + me.time * 0.5)) * Math.PI;

                // Accelerate in flow direction
                buffer[idx + 2] += Math.cos(angle) * 0.05 * s;
                buffer[idx + 3] += Math.sin(angle) * 0.05 * s;

                // CONTAINMENT FIELD (Fix for Drift Bias)
                // Gently push nodes back to center if they wander too far
                let cx    = width / 2,
                    cy    = height / 2,
                    dx    = cx - buffer[idx],
                    dy    = cy - buffer[idx + 1],
                    dist  = Math.sqrt(dx * dx + dy * dy),
                    limit = Math.min(width, height) * 0.4; // Keep within 80% of screen center

                if (dist > limit) {
                    let force = (dist - limit) * 0.001; // Soft spring
                    buffer[idx + 2] += (dx / dist) * force;
                    buffer[idx + 3] += (dy / dist) * force
                }
            } else {
                // Random wander for children
                if (Math.abs(buffer[idx + 2]) < 0.2 * s) buffer[idx + 2] += (Math.random() - 0.5) * 0.02 * s;
                if (Math.abs(buffer[idx + 3]) < 0.2 * s) buffer[idx + 3] += (Math.random() - 0.5) * 0.02 * s
            }

            buffer[idx]     += buffer[idx + 2];
            buffer[idx + 1] += buffer[idx + 3];

            // Bounce
            const pad = 20 * s;
            if (buffer[idx] < pad)              { buffer[idx] = pad; buffer[idx + 2] *= -1; }
            if (buffer[idx] > width - pad)      { buffer[idx] = width - pad; buffer[idx + 2] *= -1; }
            if (buffer[idx + 1] < pad)          { buffer[idx + 1] = pad; buffer[idx + 3] *= -1; }
            if (buffer[idx + 1] > height - pad) { buffer[idx + 1] = height - pad; buffer[idx + 3] *= -1; }
        }
    }

    /**
     * Creates and caches gradients.
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        let me  = this,
            ctx = me.context;

        if (!ctx) return;

        const
            themeColors = me.constructor.colors[me.theme],
            gradient    = ctx.createLinearGradient(0, 0, width, height);

        gradient.addColorStop(0, themeColors.background[0]);
        gradient.addColorStop(1, themeColors.background[1]);

        me.gradients.bgGradient = gradient
    }

    /**
     * @param {Object} size
     * @param {Number} size.height
     * @param {Number} size.width
     */
    updateSize(size) {
        let me = this;

        me.canvasSize = size;
        // Reference resolution: 1920x1080.
        // Square root of area ratio gives a balanced linear scale factor.
        me.scale = Math.sqrt((size.width * size.height) / 2073600);

        if (me.context) {
            me.context.canvas.width  = size.width;
            me.context.canvas.height = size.height;
            // FIX: Always re-init nodes on resize to fix "top-left blob" issue
            me.initNodes(size.width, size.height);
            me.initAgents(size.width, size.height);
            me.updateResources(size.width, size.height)
        }
    }
}

export default Neo.setupClass(HomeCanvas);
