import Base from '../../../src/core/Base.mjs';

const
    PRIMARY       = '#3E63DD',
    SECONDARY     = '#8BA6FF',
    HIGHLIGHT     = '#40C4FF',
    NODE_COUNT    = 150,
    NODE_STRIDE   = 9, // x, y, vx, vy, radius, layer, parentId, phase, energy
    AGENT_COUNT   = 20,
    AGENT_STRIDE  = 6, // x, y, vx, vy, targetIdx, state
    PACKET_COUNT  = 20,
    PACKET_STRIDE = 5; // x, y, vx, vy, life (0-1)

/**
 * @summary SharedWorker renderer for the Portal Home "Neural Swarm" background.
 *
 * Handles the physics simulation and rendering loop for the 2.5D network visualization.
 * Uses a Zero-Allocation strategy (pre-allocated buffers) for high performance.
 *
 * **Node Buffer Layout (Float32Array):**
 * [x, y, vx, vy, radius, layer, parentId, phase, energy]
 *
 * **Agent Buffer Layout (Float32Array):**
 * [x, y, vx, vy, targetIdx, state, ...]
 *
 * **Packet Buffer Layout (Float32Array):**
 * [x, y, vx, vy, life, ...]
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
     * Pre-allocated buffer for data packets.
     * @member {Float32Array|null} packetBuffer=null
     */
    packetBuffer = null
    /**
     * @member {Object[]} shockwaves=[]
     */
    shockwaves = []
    /**
     * @member {Object[]} sparks=[]
     */
    sparks = []
    /**
     * @member {Number} time=0
     */
    time = 0

    /**
     * Clears the graph state and stops the render loop.
     */
    clearGraph() {
        let me = this;
        me.context      = null;
        me.canvasId     = null;
        me.canvasSize   = null;
        me.nodeBuffer   = null;
        me.agentBuffer  = null;
        me.packetBuffer = null;
        me.shockwaves   = [];
        me.sparks       = [];
        me.isPaused     = false;
        me.gradients    = {};
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
            let speed = Math.sqrt(vx*vx + vy*vy);
            
            if (speed > 0.1) {
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.6;
                ctx.moveTo(x, y);
                ctx.lineTo(x - vx * 4, y - vy * 4); 
                ctx.stroke();
            }

            // 2. Draw Head
            ctx.beginPath();
            ctx.globalAlpha = state === 1 ? 1 : 0.8; 
            let radius = state === 1 ? 3 : 2;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // 3. Scan Effect
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
            let factor = layer === 2 ? 0.05 : (layer === 1 ? 0.02 : 0.01),
                dx     = (mx - cx) * factor,
                dy     = (my - cy) * factor;

            if (mx === -1000) { dx = 0; dy = 0; }

            return {
                x: buffer[idx] + dx,
                y: buffer[idx + 1] + dy
            }
        };

        // 1. Draw Connections
        for (let i = 0; i < count; i++) {
            let idx = i * NODE_STRIDE,
                l1  = buffer[idx + 5],
                pid1 = buffer[idx + 6],
                p1  = getPos(idx, l1);

            for (let j = i + 1; j < count; j++) {
                let idx2 = j * NODE_STRIDE,
                    l2   = buffer[idx2 + 5],
                    pid2 = buffer[idx2 + 6];

                const sameCluster = pid1 === pid2 && pid1 !== -1;
                const isParentChild = (pid1 === j) || (pid2 === i);
                const isClusterLink = (pid1 === -1 && pid2 === -1);

                if (!sameCluster && !isParentChild && !isClusterLink) continue;

                let p2     = getPos(idx2, l2),
                    dx     = p1.x - p2.x,
                    dy     = p1.y - p2.y,
                    distSq = dx*dx + dy*dy;

                if (distSq < 40000) {
                    let dist  = Math.sqrt(distSq),
                        alpha = 1 - (dist / 200);
                    
                    alpha *= (0.2 + (l1 * 0.1));

                    let mDx = (p1.x + p2.x)/2 - mx,
                        mDy = (p1.y + p2.y)/2 - my,
                        mDistSq = mDx*mDx + mDy*mDy;

                    if (mDistSq < 10000) {
                        alpha = Math.min(alpha + 0.5, 1);
                        ctx.strokeStyle = HIGHLIGHT;
                        ctx.lineWidth = 1.5; // Thicker near mouse
                    } else {
                        ctx.strokeStyle = l1 === 2 ? PRIMARY : SECONDARY;
                        // Elasticity: Thicker when closer (Tension/Slack visualization)
                        ctx.lineWidth = 0.5 + (1 - (dist / 200)); 
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
                phase  = buffer[idx + 7],
                energy = buffer[idx + 8],
                pos    = getPos(idx, layer);

            let dx = pos.x - mx,
                dy = pos.y - my,
                dist = Math.sqrt(dx*dx + dy*dy),
                isHover = dist < 50;

            // Shockwave Interaction
            if (me.shockwaves.length > 0) {
                me.shockwaves.forEach(wave => {
                    let wDist = Math.sqrt((pos.x - wave.x)**2 + (pos.y - wave.y)**2),
                        wRad  = wave.age * wave.speed;
                    if (Math.abs(wDist - wRad) < 20) isHover = true;
                });
            }

            ctx.beginPath();
            let r = parentId === -1 ? radius * 1.5 : radius;
            
            // Breathing + Energy
            r *= 1 + Math.sin(me.time * 2 + phase) * 0.15 + energy;

            if (isHover) r *= 1.5;

            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);

            if (energy > 0.1) {
                // Energetic Node (Agent Scanned)
                ctx.fillStyle = HIGHLIGHT;
                ctx.globalAlpha = Math.min(1, 0.5 + energy);
            } else if (layer === 2) {
                ctx.fillStyle = isHover ? '#FFFFFF' : PRIMARY;
                ctx.globalAlpha = isHover ? 1 : 0.8;
            } else if (parentId === -2) {
                // Drifting Node Visual
                ctx.fillStyle = HIGHLIGHT;
                ctx.globalAlpha = 0.6 + Math.sin(me.time * 10 + phase) * 0.3; 
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
     * Draws the data packets traveling along connections.
     * @param {CanvasRenderingContext2D} ctx
     */
    drawPackets(ctx) {
        let me = this;

        if (!me.packetBuffer) return;

        const
            buffer = me.packetBuffer,
            count  = PACKET_COUNT;

        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 5;
        ctx.shadowColor = HIGHLIGHT;

        for (let i = 0; i < count; i++) {
            let idx = i * PACKET_STRIDE,
                life = buffer[idx + 4];

            if (life > 0) {
                let x = buffer[idx],
                    y = buffer[idx + 1];

                ctx.beginPath();
                ctx.globalAlpha = Math.min(life * 2, 1); // Fade out at end
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    /**
     * Draws expanding shockwaves from clicks with Chromatic Aberration and Composite Rings.
     * @param {CanvasRenderingContext2D} ctx
     */
    drawShockwaves(ctx) {
        let me = this;

        if (me.shockwaves.length === 0) return;

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

            // Chromatic Aberration (RGB Shift)
            ctx.globalCompositeOperation = 'screen'; 
            
            // 1. Red Channel (Lagging Fringe)
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 50, 50, ${alpha * 0.8})`;
            ctx.lineWidth   = 4 * (1 - progress);
            ctx.shadowBlur  = 10;
            ctx.shadowColor = '#FF0000';
            ctx.arc(wave.x, wave.y, radius * 0.99, 0, Math.PI * 2);
            ctx.stroke();

            // 2. Blue Channel (Leading Fringe)
            ctx.beginPath();
            ctx.strokeStyle = `rgba(50, 50, 255, ${alpha * 0.8})`;
            ctx.lineWidth   = 4 * (1 - progress);
            ctx.shadowBlur  = 10;
            ctx.shadowColor = '#0000FF';
            ctx.arc(wave.x, wave.y, radius * 1.01, 0, Math.PI * 2);
            ctx.stroke();

            // 3. Primary Wave (White Hot Center)
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth   = 6 * (1 - progress); 
            ctx.shadowBlur  = 20;
            ctx.shadowColor = '#FFFFFF';
            ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // 4. Pressure Fill (Refraction Fake)
            // Faint white fill that fades out quickly
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.1})`;
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over'; // Reset
        ctx.globalAlpha = 1;
    }

    /**
     * Draws temporary spark particles (Data Debris).
     * @param {CanvasRenderingContext2D} ctx
     */
    drawSparks(ctx) {
        let me = this;

        if (me.sparks.length === 0) return;

        ctx.strokeStyle = '#40C4FF';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#40C4FF';
        ctx.lineWidth = 1.5;
        
        for (let s of me.sparks) {
            ctx.globalAlpha = s.life;
            ctx.beginPath();
            // Draw Trail based on velocity
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
            ctx.stroke();
        }

        ctx.shadowBlur = 0;
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
     * Initializes the node buffer using Golden Spiral distribution.
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
            phi    = (1 + Math.sqrt(5)) / 2,
            scale  = Math.sqrt(width * height / NODE_COUNT) * 0.8;

        const parentCount = Math.floor(NODE_COUNT * 0.1);
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
            buffer[idx + 2] = (Math.random() - 0.5) * 0.2;
            buffer[idx + 3] = (Math.random() - 0.5) * 0.2;
            
            let layer = Math.floor(Math.random() * 3);
            buffer[idx + 5] = layer; // layer

            // Radius based on layer & role
            buffer[idx + 4] = isParent ? 4 + (layer * 2) : 2 + (layer * 1.5); 
            
            // Parent ID (-1 for parents, assigned later for children)
            buffer[idx + 6] = isParent ? -1 : -2; 
            
            // Phase (Breathing offset)
            buffer[idx + 7] = Math.random() * Math.PI * 2;
            
            // Energy
            buffer[idx + 8] = 0;
        }

        // 2. Assign Children to nearest Parent
        for (let i = parentCount; i < NODE_COUNT; i++) {
            let idx = i * NODE_STRIDE,
                x   = buffer[idx],
                y   = buffer[idx + 1],
                bestDist = Infinity,
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
            
            buffer[idx + 6] = bestParent;
        }
    }

    /**
     * Initializes the packet buffer.
     */
    initPackets() {
        let me = this;
        if (!me.packetBuffer) {
            me.packetBuffer = new Float32Array(PACKET_COUNT * PACKET_STRIDE);
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

        if (!me.nodeBuffer) me.initNodes(width, height);
        if (!me.agentBuffer) me.initAgents(width, height);
        if (!me.packetBuffer) me.initPackets();

        // Physics
        me.updatePhysics(width, height);
        me.updateAgents(width, height);
        me.updatePackets();
        me.updateSparks();

        ctx.clearRect(0, 0, width, height);

        if (me.gradients.bgGradient) {
            ctx.fillStyle = me.gradients.bgGradient;
            ctx.fillRect(0, 0, width, height);
        }

        me.drawNetwork(ctx, width, height);
        me.drawPackets(ctx);
        me.drawAgents(ctx);
        me.drawShockwaves(ctx);
        me.drawSparks(ctx);

        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * @param {Object} data
     * @param {Boolean} [data.click]
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

            if (data.click) {
                me.shockwaves.push({
                    x    : data.x,
                    y    : data.y,
                    age  : 0,
                    maxAge: 40, // Faster, punchier wave
                    maxRadius: 300
                });

                // Spawn Sparks (Data Debris)
                for(let i=0; i<40; i++) {
                    let angle = Math.random() * Math.PI * 2,
                        speed = Math.random() * 15 + 5; // Fast burst
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
        }
    }

    /**
     * Updates packet logic (Data Flow).
     */
    updatePackets() {
        let me = this;
        if (!me.packetBuffer || !me.nodeBuffer) return;

        const
            packets = me.packetBuffer,
            nodes   = me.nodeBuffer,
            pCount  = PACKET_COUNT,
            nCount  = NODE_COUNT;

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
                            x1 = nodes[idx1], y1 = nodes[idx1 + 1],
                            x2 = nodes[idx2], y2 = nodes[idx2 + 1],
                            dx = x2 - x1,
                            dy = y2 - y1,
                            dist = Math.sqrt(dx*dx + dy*dy);

                        // Only spawn if connected and close
                        if (dist < 200) {
                            packets[idx]     = x1;
                            packets[idx + 1] = y1;
                            let speed = 4;
                            packets[idx + 2] = (dx / dist) * speed;
                            packets[idx + 3] = (dy / dist) * speed;
                            packets[idx + 4] = dist / speed; // Life = frames to reach target
                        }
                    }
                }
            } else {
                // Move
                packets[idx]     += packets[idx + 2];
                packets[idx + 1] += packets[idx + 3];
                packets[idx + 4]--; // Decrease life
            }
        }
    }

    /**
     * Updates spark particles with friction.
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

                if (dist < 10) {
                    // Arrived! Scan.
                    agents[idx + 5] = 1; // Scan state
                    agents[idx + 2] *= 0.1; // Slow down
                    agents[idx + 3] *= 0.1;
                    
                    // Transfer Energy to Node
                    nodes[nIdx + 8] = 1.0;
                } else {
                    // Steer towards target
                    let force = 0.05;
                    agents[idx + 2] += (dx / dist) * force;
                    agents[idx + 3] += (dy / dist) * force;
                }
            } else if (state === 1) {
                if (Math.random() < 0.02) {
                    agents[idx + 4] = -1; 
                    agents[idx + 5] = 0;
                    agents[idx + 2] += (Math.random() - 0.5) * 4;
                    agents[idx + 3] += (Math.random() - 0.5) * 4;
                }
            }

            // Behavior 3: Mouse Repulsion
            if (mx !== -1000) {
                let dx = agents[idx] - mx,
                    dy = agents[idx + 1] - my,
                    distSq = dx*dx + dy*dy;

                if (distSq < 10000) {
                    let dist = Math.sqrt(distSq),
                        force = (100 - dist) / 100;
                    agents[idx + 2] += (dx / dist) * force * 1.5;
                    agents[idx + 3] += (dy / dist) * force * 1.5;
                    agents[idx + 5] = 0; 
                }
            }

            // Speed Limit & Move
            let speed = Math.sqrt(agents[idx + 2]**2 + agents[idx + 3]**2);
            if (speed > 4) {
                agents[idx + 2] *= 4 / speed;
                agents[idx + 3] *= 4 / speed;
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
            my     = me.mouse.y,
            parentCount = Math.floor(NODE_COUNT * 0.1);

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
                    buffer[idx + 2] += (Math.random() - 0.5) * 2;
                    buffer[idx + 3] += (Math.random() - 0.5) * 2;
                }

                // 2. Re-attach Logic (if Drifting)
                if (parentId === -2) {
                    // Wander behavior
                    buffer[idx + 2] += (Math.random() - 0.5) * 0.1;
                    buffer[idx + 3] += (Math.random() - 0.5) * 0.1;

                    // Check for new parent
                    for (let p = 0; p < parentCount; p++) {
                        let pIdx = p * NODE_STRIDE,
                            px   = buffer[pIdx],
                            py   = buffer[pIdx + 1],
                            dist = Math.sqrt((px - buffer[idx])**2 + (py - buffer[idx + 1])**2);

                        if (dist < 60) {
                            buffer[idx + 6] = p; // Snap to new parent
                            break;
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

                if (distSq < 22500) {
                    let dist = Math.sqrt(distSq),
                        force = (150 - dist) / 150;
                    buffer[idx + 2] += (dx / dist) * force * 0.5;
                    buffer[idx + 3] += (dy / dist) * force * 0.5;
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
                        
                        // Hit the "Wave Front" (Width matches visual ring ~20px)
                        if (Math.abs(dist - wRad) < 20) {
                            let force = (1 - progress); 
                            // Massive Impulse (Throwing)
                            buffer[idx + 2] += (dx / dist) * force * 10;
                            buffer[idx + 3] += (dy / dist) * force * 10;
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
                let angle = (Math.cos(buffer[idx] * 0.002 + me.time * 0.5) + 
                             Math.sin(buffer[idx + 1] * 0.002 + me.time * 0.5)) * Math.PI;
                
                // Accelerate in flow direction
                buffer[idx + 2] += Math.cos(angle) * 0.05;
                buffer[idx + 3] += Math.sin(angle) * 0.05;

                // CONTAINMENT FIELD (Fix for Drift Bias)
                // Gently push nodes back to center if they wander too far
                let cx   = width / 2,
                    cy   = height / 2,
                    dx   = cx - buffer[idx],
                    dy   = cy - buffer[idx + 1],
                    dist = Math.sqrt(dx*dx + dy*dy),
                    limit = Math.min(width, height) * 0.4; // Keep within 80% of screen center

                if (dist > limit) {
                    let force = (dist - limit) * 0.001; // Soft spring
                    buffer[idx + 2] += (dx / dist) * force;
                    buffer[idx + 3] += (dy / dist) * force;
                }
            } else {
                // Random wander for children
                if (Math.abs(buffer[idx + 2]) < 0.2) buffer[idx + 2] += (Math.random() - 0.5) * 0.02;
                if (Math.abs(buffer[idx + 3]) < 0.2) buffer[idx + 3] += (Math.random() - 0.5) * 0.02;
            }

            buffer[idx]     += buffer[idx + 2];
            buffer[idx + 1] += buffer[idx + 3];

            // Bounce
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
            // FIX: Always re-init nodes on resize to fix "top-left blob" issue
            me.initNodes(size.width, size.height);
            me.initAgents(size.width, size.height);
            me.updateResources(size.width, size.height);
        }
    }
}

export default Neo.setupClass(HomeCanvas);
