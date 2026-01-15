import Base from '../../../src/core/Base.mjs';

const
    PRIMARY      = '#3E63DD',
    SECONDARY    = '#8BA6FF',
    HIGHLIGHT    = '#40C4FF',
    NODE_COUNT   = 150,
    NODE_STRIDE  = 7, // x, y, vx, vy, radius, layer, parentId
    AGENT_COUNT  = 20,
    AGENT_STRIDE = 6; // x, y, vx, vy, targetIdx, state (0=seek, 1=scan)

/**
 * @summary SharedWorker renderer for the Portal Home "Neural Swarm" background.
 *
 * Handles the physics simulation and rendering loop for the 2.5D network visualization.
 * Uses a Zero-Allocation strategy (pre-allocated buffers) for high performance.
 *
 * **Node Buffer Layout (Float32Array):**
 * [x, y, vx, vy, radius, layer, parentId, ...]
 *
 * **Agent Buffer Layout (Float32Array):**
 * [x, y, vx, vy, targetIdx, state, ...]
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
                'pause',
                'resume',
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
     * Pre-allocated buffer for agent data.
     * @member {Float32Array|null} agentBuffer=null
     */
    agentBuffer = null
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
     * @member {Object} gradients={}
     */
    gradients = {}
    /**
     * @member {Boolean} isPaused=false
     */
    isPaused = false
    /**
     * @member {Object} mouse={x: -1000, y: -1000}
     */
    mouse = {x: -1000, y: -1000}
    /**
     * Pre-allocated buffer for node data.
     * @member {Float32Array|null} nodeBuffer=null
     */
    nodeBuffer = null
    /**
     * @member {Number} time=0
     */
    time = 0

    /**
     * Clears the graph state and stops the render loop.
     */
    clearGraph() {
        let me = this;
        me.context     = null;
        me.canvasId    = null;
        me.canvasSize  = null;
        me.nodeBuffer  = null;
        me.agentBuffer = null;
        me.isPaused    = false;
        me.gradients   = {};
    }

    /**
     * Draws the autonomous agents (Seeker Drones).
     * @param {CanvasRenderingContext2D} ctx
     */
    drawAgents(ctx) {
        let me = this;

        if (!me.agentBuffer) return;

        const
            buffer = me.agentBuffer,
            count  = AGENT_COUNT;

        ctx.strokeStyle = HIGHLIGHT;
        ctx.fillStyle   = '#FFFFFF';
        ctx.lineCap     = 'round';

        for (let i = 0; i < count; i++) {
            let idx = i * AGENT_STRIDE,
                x   = buffer[idx],
                y   = buffer[idx + 1],
                vx  = buffer[idx + 2],
                vy  = buffer[idx + 3],
                state = buffer[idx + 5];

            // 1. Draw Trail (Motion Blur)
            // Length depends on speed
            let speed = Math.sqrt(vx*vx + vy*vy);
            
            if (speed > 0.1) {
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.6;
                // Trail extends opposite to velocity
                ctx.moveTo(x, y);
                ctx.lineTo(x - vx * 4, y - vy * 4); 
                ctx.stroke();
            }

            // 2. Draw Head
            ctx.beginPath();
            ctx.globalAlpha = state === 1 ? 1 : 0.8; // Brighten when scanning
            let radius = state === 1 ? 3 : 2;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // 3. Scan Effect (Ring)
            if (state === 1) {
                ctx.beginPath();
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.3;
                ctx.arc(x, y, 8 + Math.sin(me.time * 10) * 2, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1;
    }

    /**
     * Draws the neural network (nodes and connections).
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawNetwork(ctx, width, height) {
        let me = this;

        if (!me.nodeBuffer) return;

        const
            buffer = me.nodeBuffer,
            count  = NODE_COUNT,
            mx     = me.mouse.x,
            my     = me.mouse.y,
            cx     = width / 2,
            cy     = height / 2;

        ctx.lineWidth = 1;

        // Helper to get parallaxed position
        const getPos = (idx, layer) => {
            // Parallax Factor:
            // Layer 2 (Front) => 0.05
            // Layer 1 (Mid)   => 0.02
            // Layer 0 (Back)  => 0.01
            let factor = layer === 2 ? 0.05 : (layer === 1 ? 0.02 : 0.01),
                dx     = (mx - cx) * factor,
                dy     = (my - cy) * factor;

            // Only apply parallax if mouse is in view
            if (mx === -1000) {
                dx = 0;
                dy = 0;
            }

            return {
                x: buffer[idx] + dx,
                y: buffer[idx + 1] + dy
            }
        };

        // 1. Draw Connections (behind nodes)
        // Optimization: Double loop, but limited by distance check.
        for (let i = 0; i < count; i++) {
            let idx = i * NODE_STRIDE,
                l1  = buffer[idx + 5],
                pid1 = buffer[idx + 6],
                p1  = getPos(idx, l1);

            for (let j = i + 1; j < count; j++) {
                let idx2 = j * NODE_STRIDE,
                    l2   = buffer[idx2 + 5],
                    pid2 = buffer[idx2 + 6];

                // Only connect if:
                // 1. Same cluster (Parent ID matches)
                // 2. Or one is the parent of the other
                // 3. Or both are parents (Cluster Links)
                const sameCluster = pid1 === pid2 && pid1 !== -1;
                const isParentChild = (pid1 === j) || (pid2 === i);
                const isClusterLink = (pid1 === -1 && pid2 === -1);

                if (!sameCluster && !isParentChild && !isClusterLink) continue;

                let p2     = getPos(idx2, l2),
                    dx     = p1.x - p2.x,
                    dy     = p1.y - p2.y,
                    distSq = dx*dx + dy*dy;

                // Max connection distance squared (e.g., 200px)
                if (distSq < 40000) {
                    let alpha = 1 - (Math.sqrt(distSq) / 200);

                    // Fade out connections based on layer depth
                    alpha *= (0.2 + (l1 * 0.1));

                    // Interaction: Boost alpha if near mouse
                    let mDx = (p1.x + p2.x)/2 - mx,
                        mDy = (p1.y + p2.y)/2 - my,
                        mDistSq = mDx*mDx + mDy*mDy;

                    if (mDistSq < 10000) {
                        alpha = Math.min(alpha + 0.5, 1);
                        ctx.strokeStyle = HIGHLIGHT;
                    } else {
                        ctx.strokeStyle = l1 === 2 ? PRIMARY : SECONDARY; // Front layer is darker/bolder
                    }

                    ctx.beginPath();
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }

        // 2. Draw Nodes
        for (let i = 0; i < count; i++) {
            let idx    = i * NODE_STRIDE,
                radius = buffer[idx + 4],
                layer  = buffer[idx + 5],
                parentId = buffer[idx + 6],
                pos    = getPos(idx, layer);

            // Mouse Repulsion Visualization (Highlight)
            let dx = pos.x - mx,
                dy = pos.y - my,
                dist = Math.sqrt(dx*dx + dy*dy),
                isHover = dist < 50;

            ctx.beginPath();
            
            // Cluster Centers (Parents) are bigger
            let r = parentId === -1 ? radius * 1.5 : radius;
            if (isHover) r *= 1.5;

            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);

            // Color based on layer
            if (layer === 2) {
                ctx.fillStyle = isHover ? '#FFFFFF' : PRIMARY;
                ctx.globalAlpha = isHover ? 1 : 0.8;
            } else if (layer === 1) {
                ctx.fillStyle = isHover ? HIGHLIGHT : SECONDARY;
                ctx.globalAlpha = 0.5;
            } else {
                ctx.fillStyle = '#A0A0A0';
                ctx.globalAlpha = 0.2;
            }

            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }

    /**
     * Initializes the autonomous agents.
     * @param {Number} width
     * @param {Number} height
     */
    initAgents(width, height) {
        let me = this;

        if (!me.agentBuffer) {
            me.agentBuffer = new Float32Array(AGENT_COUNT * AGENT_STRIDE);
        }

        const buffer = me.agentBuffer;

        for (let i = 0; i < AGENT_COUNT; i++) {
            let idx = i * AGENT_STRIDE;

            buffer[idx]     = Math.random() * width;  // x
            buffer[idx + 1] = Math.random() * height; // y
            buffer[idx + 2] = (Math.random() - 0.5) * 4; // vx (Fast!)
            buffer[idx + 3] = (Math.random() - 0.5) * 4; // vy
            buffer[idx + 4] = -1; // targetIdx (none)
            buffer[idx + 5] = 0;  // state (moving)
        }
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
     * Initializes or resets the node buffer using Golden Spiral distribution.
     * This ensures uniform screen coverage without clumping.
     * @param {Number} width
     * @param {Number} height
     */
    initNodes(width, height) {
        let me = this;

        if (!me.nodeBuffer) {
            me.nodeBuffer = new Float32Array(NODE_COUNT * NODE_STRIDE);
        }

        const
            buffer = me.nodeBuffer,
            cx     = width / 2,
            cy     = height / 2,
            phi    = (1 + Math.sqrt(5)) / 2, // Golden Ratio
            scale  = Math.sqrt(width * height / NODE_COUNT) * 0.8; // Uniform density scaling

        // 1. Create Cluster Centers (Parent Nodes) - 10% of nodes
        const parentCount = Math.floor(NODE_COUNT * 0.1);
        let parentIndices = [];

        for (let i = 0; i < NODE_COUNT; i++) {
            let idx = i * NODE_STRIDE,
                isParent = i < parentCount;

            if (isParent) parentIndices.push(i);

            // Golden Spiral Placement
            let theta = i * 2 * Math.PI * phi, // Angle
                r     = Math.sqrt(i) * scale;  // Radius

            // Convert polar to cartesian + center offset
            let x = cx + r * Math.cos(theta),
                y = cy + r * Math.sin(theta);

            // Wrap to screen bounds (if spiral exceeds screen)
            x = (x + width) % width;
            y = (y + height) % height;

            buffer[idx]     = x;  // x
            buffer[idx + 1] = y; // y
            buffer[idx + 2] = (Math.random() - 0.5) * 0.2; // vx
            buffer[idx + 3] = (Math.random() - 0.5) * 0.2; // vy
            
            let layer = Math.floor(Math.random() * 3);
            buffer[idx + 5] = layer; // layer

            // Radius based on layer & role
            buffer[idx + 4] = isParent ? 4 + (layer * 2) : 2 + (layer * 1.5); 
            
            // Parent ID (-1 for parents, assigned later for children)
            buffer[idx + 6] = isParent ? -1 : -2; 
        }

        // 2. Assign Children to nearest Parent
        for (let i = parentCount; i < NODE_COUNT; i++) {
            let idx = i * NODE_STRIDE,
                x   = buffer[idx],
                y   = buffer[idx + 1],
                bestDist = Infinity,
                bestParent = -1;

            // Find nearest parent
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
            
            buffer[idx + 6] = bestParent;
        }
    }

    /**
     *
     */
    pause() {
        this.isPaused = true
    }

    /**
     *
     */
    resume() {
        let me = this;

        if (me.isPaused) {
            me.isPaused = false;
            me.renderLoop()
        }
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

        if (!me.context || me.isPaused) {
            return
        }

        const
            ctx    = me.context,
            width  = me.canvasSize?.width  || 100,
            height = me.canvasSize?.height || 50;

        me.time += 0.01;

        // Auto-init nodes if missing
        if (!me.nodeBuffer) {
            me.initNodes(width, height);
        }
        
        // Auto-init agents if missing
        if (!me.agentBuffer) {
            me.initAgents(width, height);
        }

        // Physics Steps
        me.updatePhysics(width, height);
        me.updateAgents(width, height);

        ctx.clearRect(0, 0, width, height);

        // Use cached gradient
        if (me.gradients.bgGradient) {
            ctx.fillStyle = me.gradients.bgGradient;
            ctx.fillRect(0, 0, width, height);
        }

        // Draw Network
        me.drawNetwork(ctx, width, height);
        
        // Draw Agents
        me.drawAgents(ctx);

        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * Updates agent positions (Boids + Seek).
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
            my     = me.mouse.y;

        for (let i = 0; i < count; i++) {
            let idx = i * AGENT_STRIDE,
                targetIdx = agents[idx + 4],
                state = agents[idx + 5];

            // --- Behavior 1: Pick a Target ---
            if (targetIdx === -1 || Math.random() < 0.005) { // 0.5% chance to retarget randomly
                // Pick a random Cluster Center (Parent)
                const parentCount = Math.floor(NODE_COUNT * 0.1);
                agents[idx + 4] = Math.floor(Math.random() * parentCount);
                targetIdx = agents[idx + 4];
                agents[idx + 5] = 0; // Set to moving
            }

            // --- Behavior 2: Seek Target ---
            if (targetIdx !== -1 && state === 0) {
                let nIdx = targetIdx * NODE_STRIDE,
                    tx   = nodes[nIdx],
                    ty   = nodes[nIdx + 1],
                    dx   = tx - agents[idx],
                    dy   = ty - agents[idx + 1],
                    dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < 10) {
                    // Arrived! Scan.
                    agents[idx + 5] = 1; // Scan state
                    agents[idx + 2] *= 0.1; // Slow down
                    agents[idx + 3] *= 0.1;
                } else {
                    // Steer towards target
                    let force = 0.05; // Steering force
                    agents[idx + 2] += (dx / dist) * force;
                    agents[idx + 3] += (dy / dist) * force;
                }
            } else if (state === 1) {
                // Scanning (hovering)
                // Randomly leave after a while
                if (Math.random() < 0.02) {
                    agents[idx + 4] = -1; // Reset target
                    agents[idx + 5] = 0;  // Move
                    // Boost speed
                    agents[idx + 2] += (Math.random() - 0.5) * 4;
                    agents[idx + 3] += (Math.random() - 0.5) * 4;
                }
            }

            // --- Behavior 3: Mouse Repulsion (High Priority) ---
            if (mx !== -1000) {
                let dx = agents[idx] - mx,
                    dy = agents[idx + 1] - my,
                    distSq = dx*dx + dy*dy;

                if (distSq < 10000) { // 100px radius
                    let dist = Math.sqrt(distSq),
                        force = (100 - dist) / 100;
                    
                    // Strong push
                    agents[idx + 2] += (dx / dist) * force * 1.5;
                    agents[idx + 3] += (dy / dist) * force * 1.5;
                    agents[idx + 5] = 0; // Stop scanning if scared
                }
            }

            // --- Physics Update ---
            // Speed Limit
            let speed = Math.sqrt(agents[idx + 2]**2 + agents[idx + 3]**2);
            if (speed > 4) {
                agents[idx + 2] *= 4 / speed;
                agents[idx + 3] *= 4 / speed;
            }

            // Move
            agents[idx]     += agents[idx + 2];
            agents[idx + 1] += agents[idx + 3];

            // Wrap around
            if (agents[idx] < 0) agents[idx] = width;
            if (agents[idx] > width) agents[idx] = 0;
            if (agents[idx + 1] < 0) agents[idx + 1] = height;
            if (agents[idx + 1] > height) agents[idx + 1] = 0;
        }
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
     * Updates node positions using Cluster Physics.
     * @param {Number} width
     * @param {Number} height
     */
    updatePhysics(width, height) {
        let me = this;

        if (!me.nodeBuffer) return;

        const
            buffer = me.nodeBuffer,
            mx     = me.mouse.x,
            my     = me.mouse.y;

        for (let i = 0; i < NODE_COUNT; i++) {
            let idx = i * NODE_STRIDE,
                parentId = buffer[idx + 6],
                isParent = parentId === -1;

            // 1. Cluster Cohesion (Children stick to Parent)
            if (!isParent) {
                let pIdx = parentId * NODE_STRIDE,
                    px   = buffer[pIdx],
                    py   = buffer[pIdx + 1],
                    dx   = px - buffer[idx],
                    dy   = py - buffer[idx + 1],
                    dist = Math.sqrt(dx*dx + dy*dy);

                // Spring force towards parent
                if (dist > 50) { // Ideal distance
                    let force = (dist - 50) * 0.0005;
                    buffer[idx + 2] += dx * force;
                    buffer[idx + 3] += dy * force;
                }
            }

            // 2. Mouse Repulsion (All nodes)
            if (mx !== -1000) {
                let dx = buffer[idx] - mx,
                    dy = buffer[idx + 1] - my,
                    distSq = dx*dx + dy*dy;

                if (distSq < 22500) { // 150px radius
                    let dist = Math.sqrt(distSq),
                        force = (150 - dist) / 150; // 0 to 1

                    // Push away
                    buffer[idx + 2] += (dx / dist) * force * 0.5;
                    buffer[idx + 3] += (dy / dist) * force * 0.5;
                }
            }

            // 3. Drag / Friction
            buffer[idx + 2] *= 0.95;
            buffer[idx + 3] *= 0.95;

            // 4. Ambient Drift
            // Parents drift more independently, children follow
            let drift = isParent ? 0.02 : 0.01;
            if (Math.abs(buffer[idx + 2]) < 0.2) buffer[idx + 2] += (Math.random() - 0.5) * drift;
            if (Math.abs(buffer[idx + 3]) < 0.2) buffer[idx + 3] += (Math.random() - 0.5) * drift;

            // 5. Move
            buffer[idx]     += buffer[idx + 2];
            buffer[idx + 1] += buffer[idx + 3];

            // 6. Soft Boundary (Bounce)
            const pad = 20;
            if (buffer[idx] < pad) { buffer[idx] = pad; buffer[idx + 2] *= -1; }
            if (buffer[idx] > width - pad) { buffer[idx] = width - pad; buffer[idx + 2] *= -1; }
            if (buffer[idx + 1] < pad) { buffer[idx + 1] = pad; buffer[idx + 3] *= -1; }
            if (buffer[idx + 1] > height - pad) { buffer[idx + 1] = height - pad; buffer[idx + 3] *= -1; }
        }
    }

    /**
     * Creates and caches gradients.
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        let me = this,
            ctx = me.context;

        if (!ctx) return;

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, 'rgba(62, 99, 221, 0.05)'); // PRIMARY low alpha
        gradient.addColorStop(1, 'rgba(139, 166, 255, 0.05)'); // SECONDARY low alpha

        me.gradients.bgGradient = gradient;
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
            me.context.canvas.height = size.height;
            // Re-distribute nodes on significant resize to fill space?
            // For now, let them drift naturally or re-init if 0
            if (!me.nodeBuffer) {
                me.initNodes(size.width, size.height);
            }
            me.updateResources(size.width, size.height);
        }
    }
}

export default Neo.setupClass(HomeCanvas);