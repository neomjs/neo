import Base from '../../../src/core/Base.mjs';

const
    hasRaf    = typeof requestAnimationFrame === 'function',
    PRIMARY   = '#3E63DD', // Neo Blue
    SECONDARY = '#8BA6FF',
    HIGHLIGHT = '#00BFFF',
    HEX_SIZE  = 30, // Radius of a hex
    STRIDE    = 7,  // q, r, x, y, scale, energy, buildCharge
    RUNNER_COUNT = 30,
    RUNNER_STRIDE = 7,
    SUPER_HEX_MAX = 5; // Max number of active super-structures

/**
 * @summary SharedWorker renderer for the Portal Services "Neural Lattice" background.
 *
 * Implements a **Hexagonal Lattice** representing the engineered, structured nature of the Neo.mjs runtime.
 * The grid acts as a living "Motherboard" or "VDOM Registry" where cells (Components) can be inspected
 * and mutated.
 *
 * **Visual Architecture:**
 * 1. **Hexagonal Grid:** Represents efficient, tiling structure (The App Engine).
 * 2. **Reactive Surface:** Cells react to proximity (Mouse/Touch) by energizing (Governance/Inspection).
 * 3. **Data Runners:** High-speed packets traversing the grid edges, visualizing throughput and velocity.
 * 4. **Runtime Permutation:** When Runners congregate, they trigger a "Compilation" event, fusing 
 *    cells into larger "Super Modules" (Rosettes) which then dissolve back. This visualizes the 
 *    cause-and-effect of data flow driving structural change.
 *
 * @class Portal.canvas.ServicesCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class ServicesCanvas extends Base {
    static colors = {
        dark: {
            background: ['rgba(30, 30, 35, 1)', 'rgba(20, 20, 25, 1)'],
            hexLine   : 'rgba(255, 255, 255, 0.05)',
            hexActive : 'rgba(255, 255, 255, 0.15)',
            highlight : '#FFFFFF',
            runner    : '#FFFFFF',
            superHex  : 'rgba(255, 255, 255, 0.03)'
        },
        light: {
            background: ['rgba(255, 255, 255, 1)', 'rgba(245, 247, 255, 1)'],
            hexLine   : 'rgba(62, 99, 221, 0.08)',
            hexActive : 'rgba(62, 99, 221, 0.2)',
            highlight : '#3E63DD',
            runner    : '#3E63DD',
            superHex  : 'rgba(62, 99, 221, 0.03)'
        }
    }

    static config = {
        className: 'Portal.canvas.ServicesCanvas',
        remote: {
            app: [
                'clearGraph',
                'initGraph',
                'pause',
                'resume',
                'setTheme',
                'updateMouseState',
                'updateSize'
            ]
        },
        singleton: true,
        theme: 'light'
    }

    canvasId   = null
    canvasSize = null
    context    = null
    gradients  = {}
    isPaused   = false
    mouse      = {x: -1000, y: -1000}
    
    /**
     * Buffer for Hex Cell Data.
     * Stride: [q, r, x, y, scale, energy, buildCharge]
     * @member {Float32Array|null} cellBuffer
     */
    cellBuffer = null
    
    /**
     * Buffer for Runner Data.
     * Stride: [x, y, targetX, targetY, progress, speed, currentHexIdx]
     * @member {Float32Array|null} runnerBuffer
     */
    runnerBuffer = null

    /**
     * Active Super Hexagons (Merged Clusters).
     * Objects: { centerIdx, age, maxAge, state (0=forming, 1=active, 2=dissolving) }
     * @member {Object[]} superHexes=[]
     */
    superHexes = []

    scale      = 1
    time       = 0

    clearGraph() {
        let me = this;
        me.context      = null;
        me.canvasId     = null;
        me.canvasSize   = null;
        me.cellBuffer   = null;
        me.runnerBuffer = null;
        me.superHexes   = [];
        me.isPaused     = false;
        me.gradients    = {};
        me.scale        = 1
    }

    afterSetTheme(value, oldValue) {
        let me = this;
        if (value && me.canvasSize) {
            me.updateResources(me.canvasSize.width, me.canvasSize.height)
        }
    }

    setTheme(value) {
        this.theme = value
    }

    /**
     * Draw a single hexagon path
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} x center x
     * @param {Number} y center y
     * @param {Number} size radius
     */
    drawHex(ctx, x, y, size) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i + 30; // Rotate 30deg for Pointy Top
            const angle_rad = Math.PI / 180 * angle_deg;
            const px = x + size * Math.cos(angle_rad);
            const py = y + size * Math.sin(angle_rad);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    drawGraph(ctx, width, height) {
        let me = this;

        if (!me.cellBuffer) return;

        const
            buffer      = me.cellBuffer,
            count       = buffer.length / STRIDE,
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale,
            baseSize    = HEX_SIZE * s;

        ctx.lineWidth = 1 * s;
        ctx.lineJoin  = 'round';

        // Batch 1: Idle Hexes (Background Structure)
        ctx.beginPath();
        ctx.strokeStyle = themeColors.hexLine;
        
        for (let i = 0; i < count; i++) {
            let idx    = i * STRIDE,
                x      = buffer[idx + 2],
                y      = buffer[idx + 3],
                scale  = buffer[idx + 4], // Used for hiding merged cells
                energy = buffer[idx + 5];

            // Only draw if visible (scale > 0)
            if (energy <= 0.01 && scale > 0.1) {
                // If scale < 1, we are merging/dissolving
                let size = baseSize * 0.95 * scale;
                me.drawHex(ctx, x, y, size); 
            }
        }
        ctx.stroke();

        // Batch 2: Super Hexes (Merged Modules)
        ctx.lineWidth = 2 * s;
        for (let sh of me.superHexes) {
            let idx = sh.centerIdx,
                x   = buffer[idx + 2],
                y   = buffer[idx + 3],
                progress = 0;

            if (sh.state === 0) progress = sh.age / 30; // Forming
            else if (sh.state === 1) progress = 1;      // Active
            else progress = 1 - (sh.age / 30);          // Dissolving

            if (progress > 0) {
                ctx.beginPath();
                // Draw large "Module" shape
                // We use a simplified large Hex for the "Fused" look
                me.drawHex(ctx, x, y, baseSize * 2.5 * progress); // Grow/Shrink
                
                ctx.strokeStyle = themeColors.highlight;
                ctx.globalAlpha = 0.3 * progress;
                ctx.stroke();
                
                ctx.fillStyle = themeColors.superHex;
                ctx.fill();
                
                // Tech marker in center?
                ctx.beginPath();
                ctx.arc(x, y, 4 * s * progress, 0, Math.PI * 2);
                ctx.fillStyle = themeColors.highlight;
                ctx.globalAlpha = 0.8 * progress;
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1 * s;

        // Batch 3: Active / Energized Hexes (Overlay)
        for (let i = 0; i < count; i++) {
            let idx    = i * STRIDE,
                x      = buffer[idx + 2],
                y      = buffer[idx + 3],
                scale  = buffer[idx + 4],
                energy = buffer[idx + 5];

            // Don't draw energy on hidden cells
            if (energy > 0.01 && scale > 0.5) {
                let currentSize = baseSize * (0.95 + (energy * 0.1)); 

                ctx.beginPath();
                me.drawHex(ctx, x, y, currentSize);
                
                ctx.fillStyle = themeColors.hexActive;
                ctx.globalAlpha = energy * 0.4; 
                ctx.fill();

                ctx.strokeStyle = themeColors.highlight;
                ctx.lineWidth = (1 + energy) * s;
                ctx.globalAlpha = energy * 0.8;
                ctx.stroke();
                
                ctx.globalAlpha = 1;
                ctx.lineWidth = 1 * s; 
            }
        }
    }

    /**
     * Draws the data runners traversing the grid.
     * @param {CanvasRenderingContext2D} ctx 
     */
    drawRunners(ctx) {
        let me = this;
        if (!me.runnerBuffer) return;

        const 
            buffer = me.runnerBuffer,
            count  = RUNNER_COUNT,
            themeColors = me.constructor.colors[me.theme],
            s = me.scale;

        ctx.lineCap = 'round';
        
        for (let i = 0; i < count; i++) {
            let idx = i * RUNNER_STRIDE,
                x   = buffer[idx],
                y   = buffer[idx + 1],
                tx  = buffer[idx + 2],
                ty  = buffer[idx + 3],
                sp  = buffer[idx + 5]; // Speed

            let dx = tx - x,
                dy = ty - y,
                dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist > 0) {
                // Tuned Speed: 70% of previous
                // Trail: Still long for velocity feel
                let tailLen = sp * 12 * s; 
                let dirX = dx / dist,
                    dirY = dy / dist;

                let tailX = x - dirX * tailLen,
                    tailY = y - dirY * tailLen;

                let g = ctx.createLinearGradient(tailX, tailY, x, y);
                g.addColorStop(0, 'rgba(0,0,0,0)');
                g.addColorStop(0.5, themeColors.runner); 
                g.addColorStop(1, '#FFFFFF'); 
                
                ctx.beginPath();
                ctx.strokeStyle = g;
                ctx.lineWidth = 3 * s; 
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
        }
    }

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

    initNodes(width, height) {
        let me = this;

        const
            s        = me.scale,
            size     = HEX_SIZE * s,
            colStep  = size * 1.5,
            rowStep  = size * Math.sqrt(3),
            cols     = Math.ceil(width / colStep) + 2,
            rows     = Math.ceil(height / rowStep) + 2,
            count    = cols * rows;

        if (!me.cellBuffer || me.cellBuffer.length !== count * STRIDE) {
            me.cellBuffer = new Float32Array(count * STRIDE);
        }

        const buffer = me.cellBuffer;
        
        let i = 0;
        for (let c = -1; c < cols; c++) {
            for (let r = -1; r < rows; r++) {
                let x = c * colStep;
                let y = r * rowStep;
                if (c % 2 === 1) {
                    y += rowStep / 2;
                }

                let idx = i * STRIDE;
                buffer[idx]     = c; // q
                buffer[idx + 1] = r; // r
                buffer[idx + 2] = x;
                buffer[idx + 3] = y;
                buffer[idx + 4] = 1; // Scale
                buffer[idx + 5] = 0; // Energy
                buffer[idx + 6] = 0; // Build Charge

                i++;
                if (i >= count) break;
            }
        }
    }

    initRunners(width, height) {
        let me = this;
        if (!me.runnerBuffer) {
            me.runnerBuffer = new Float32Array(RUNNER_COUNT * RUNNER_STRIDE);
        }
        
        const 
            buffer = me.runnerBuffer;

        for (let i = 0; i < RUNNER_COUNT; i++) {
            me.resetRunner(i, width, height);
            let idx = i * RUNNER_STRIDE;
            buffer[idx + 4] = Math.random(); 
        }
    }

    findNearestNode(x, y) {
        let me = this,
            buffer = me.cellBuffer,
            count = buffer.length / STRIDE,
            minDist = Infinity,
            bestIdx = -1;

        for (let i = 0; i < count; i++) {
            let idx = i * STRIDE,
                nx = buffer[idx + 2],
                ny = buffer[idx + 3],
                dist = (nx - x)**2 + (ny - y)**2;

            if (dist < minDist) {
                minDist = dist;
                bestIdx = idx;
            }
        }
        return bestIdx;
    }

    resetRunner(index, width, height) {
        let me = this,
            buffer = me.runnerBuffer,
            nodes  = me.cellBuffer,
            idx    = index * RUNNER_STRIDE,
            nodeCount = nodes.length / STRIDE;

        let nIdx = Math.floor(Math.random() * nodeCount) * STRIDE;
        
        buffer[idx]     = nodes[nIdx + 2]; // x
        buffer[idx + 1] = nodes[nIdx + 3]; // y
        
        buffer[idx + 2] = buffer[idx]; 
        buffer[idx + 3] = buffer[idx + 1];
        buffer[idx + 4] = 1; // Force new target
        buffer[idx + 5] = (Math.random() * 4 + 5) * me.scale; 
        buffer[idx + 6] = nIdx; 
    }

    pause() {
        this.isPaused = true
    }

    resume() {
        let me = this;
        if (me.isPaused) {
            me.isPaused = false;
            me.renderLoop()
        }
    }

    renderLoop = this.render.bind(this)

    render() {
        let me = this;

        if (!me.context || me.isPaused) return;

        const
            ctx    = me.context,
            width  = me.canvasSize?.width  || 100,
            height = me.canvasSize?.height || 50;

        me.time += 0.01;

        if (!me.cellBuffer) me.initNodes(width, height);
        if (!me.runnerBuffer) me.initRunners(width, height);

        me.updatePhysics(width, height);
        me.updateSuperHexes(width, height); // Logic for Mergers (Now charge-based)
        me.updateRunners(width, height);

        ctx.clearRect(0, 0, width, height);

        if (me.gradients.bgGradient) {
            ctx.fillStyle = me.gradients.bgGradient;
            ctx.fillRect(0, 0, width, height)
        }

        me.drawGraph(ctx, width, height);
        me.drawRunners(ctx);

        if (hasRaf) {
            requestAnimationFrame(me.renderLoop)
        } else {
            setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    /**
     * Manages the lifecycle of Super Hexagons (Mergers).
     * Now driven by 'Build Charge' from Runners.
     */
    updateSuperHexes(width, height) {
        let me = this;
        if (!me.cellBuffer) return;

        // 1. Check for Charge Triggers (Triggered by Runners)
        // We only scan if we have slots open
        if (me.superHexes.length < SUPER_HEX_MAX) {
            const buffer = me.cellBuffer,
                  count  = buffer.length / STRIDE;
            
            // Random sample check to avoid full scan every frame?
            // Or just scan 50 random nodes?
            for (let i=0; i<20; i++) {
                let idx = Math.floor(Math.random() * count) * STRIDE,
                    charge = buffer[idx + 6];
                
                if (charge > 3) { // Threshold: 3 runner hits recently
                    // Spawn Merger!
                    me.superHexes.push({
                        centerIdx: idx,
                        age: 0,
                        state: 0, // forming
                        neighbors: me.findNeighbors(idx) 
                    });
                    
                    // Consume Charge
                    buffer[idx + 6] = 0;
                    break; // One spawn per frame max
                }
            }
        }

        // 2. Update Logic
        for (let i = me.superHexes.length - 1; i >= 0; i--) {
            let sh = me.superHexes[i];
            
            sh.age++;

            // State Machine
            if (sh.state === 0 && sh.age > 30) {
                sh.state = 1; // Active
                sh.age = 0;
            } else if (sh.state === 1 && sh.age > 120) { // Hold for 2 seconds
                sh.state = 2; // Dissolving
                sh.age = 0;
            } else if (sh.state === 2 && sh.age > 30) {
                // Done
                // Restore cells
                sh.neighbors.forEach(nIdx => {
                    me.cellBuffer[nIdx + 4] = 1; // Reset scale
                });
                me.superHexes.splice(i, 1);
                continue;
            }

            // Animate Underlying Cells (Hide them)
            let targetScale = 1;
            if (sh.state === 0) targetScale = 1 - (sh.age / 30); // Shrink to 0
            else if (sh.state === 1) targetScale = 0;            // Stay hidden
            else targetScale = sh.age / 30;                      // Grow back to 1

            sh.neighbors.forEach(nIdx => {
                me.cellBuffer[nIdx + 4] = targetScale;
            });
        }
    }

    /**
     * Find 6 neighbors + center for a given node index.
     * Simple geometric search.
     */
    findNeighbors(centerIdx) {
        let me = this,
            buffer = me.cellBuffer,
            cx = buffer[centerIdx + 2],
            cy = buffer[centerIdx + 3],
            neighbors = [centerIdx],
            count = buffer.length / STRIDE,
            s = me.scale,
            radius = HEX_SIZE * s * 2.1; // Search radius (slightly larger than 2 hex widths)

        for (let i = 0; i < count; i++) {
            let idx = i * STRIDE;
            if (idx === centerIdx) continue;

            let x = buffer[idx + 2],
                y = buffer[idx + 3],
                dist = Math.sqrt((x-cx)**2 + (y-cy)**2);

            if (dist < radius) {
                neighbors.push(idx);
            }
        }
        return neighbors;
    }

    updatePhysics(width, height) {
        let me = this;
        if (!me.cellBuffer) return;

        const
            buffer = me.cellBuffer,
            count  = buffer.length / STRIDE,
            mx     = me.mouse.x,
            my     = me.mouse.y,
            s      = me.scale;

        for (let i = 0; i < count; i++) {
            let idx    = i * STRIDE,
                x      = buffer[idx + 2],
                y      = buffer[idx + 3],
                active = 0;

            if (mx !== -1000) {
                let dx     = x - mx,
                    dy     = y - my,
                    distSq = dx*dx + dy*dy,
                    radius = 250 * s;

                if (distSq < radius * radius) {
                    let dist = Math.sqrt(distSq);
                    active = (radius - dist) / radius; 
                    active = Math.pow(active, 2); 
                }
            }

            let currentEnergy = buffer[idx + 5];
            let targetEnergy = active * 0.8;
            
            if (currentEnergy > targetEnergy) {
                 buffer[idx + 5] *= 0.95; 
            } else {
                 buffer[idx + 5] += (targetEnergy - currentEnergy) * 0.1;
            }
            
            if (buffer[idx + 5] < 0.001) buffer[idx + 5] = 0;
            
            // Build Charge Decay
            if (buffer[idx + 6] > 0) {
                buffer[idx + 6] -= 0.05; // Decays over ~20 frames
                if (buffer[idx + 6] < 0) buffer[idx + 6] = 0;
            }
        }
    }

    updateRunners(width, height) {
        let me = this;
        if (!me.runnerBuffer) return;

        const 
            runners = me.runnerBuffer,
            nodes   = me.cellBuffer,
            count   = RUNNER_COUNT,
            s       = me.scale;

        for (let i = 0; i < count; i++) {
            let idx = i * RUNNER_STRIDE,
                progress = runners[idx + 4],
                speed    = runners[idx + 5];

            if (progress < 1) {
                let x = runners[idx],
                    y = runners[idx + 1],
                    tx = runners[idx + 2],
                    ty = runners[idx + 3];
                
                let dx = tx - x,
                    dy = ty - y,
                    dist = Math.sqrt(dx*dx + dy*dy);
                    
                if (dist < speed) { 
                    runners[idx] = tx;
                    runners[idx + 1] = ty;
                    runners[idx + 4] = 1; 
                    
                    let nodeIdx = me.findNearestNode(tx, ty);
                    if (nodeIdx !== -1) {
                        nodes[nodeIdx + 5] = 1.0; 
                        
                        // Increment Build Charge!
                        nodes[nodeIdx + 6] += 1; 
                        
                        runners[idx + 6] = nodeIdx; 
                    }
                } else {
                    runners[idx] += (dx / dist) * speed;
                    runners[idx + 1] += (dy / dist) * speed;
                }

            } else {
                let currentHexIdx = runners[idx + 6];
                
                if (currentHexIdx !== undefined && currentHexIdx !== -1) {
                    let dir = Math.floor(Math.random() * 6),
                        deg = 30 + (dir * 60),
                        rad = deg * Math.PI / 180,
                        jump = HEX_SIZE * s * Math.sqrt(3),
                        cx   = runners[idx],
                        cy   = runners[idx + 1],
                        tx   = cx + Math.cos(rad) * jump,
                        ty   = cy + Math.sin(rad) * jump;
                        
                    if (tx < -50 || tx > width + 50 || ty < -50 || ty > height + 50) {
                        me.resetRunner(i, width, height);
                        continue;
                    }
                    
                    runners[idx + 2] = tx;
                    runners[idx + 3] = ty;
                    runners[idx + 4] = 0; 
                } else {
                    me.resetRunner(i, width, height);
                }
            }
        }
    }

    updateMouseState(data) {
        let me = this;
        if (data.leave) {
            me.mouse.x = -1000;
            me.mouse.y = -1000
        } else {
            if (data.x !== undefined) me.mouse.x = data.x;
            if (data.y !== undefined) me.mouse.y = data.y
        }
    }

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

    updateSize(size) {
        let me = this;
        me.canvasSize = size;
        me.scale = Math.sqrt((size.width * size.height) / 2073600);

        if (me.context) {
            me.context.canvas.width  = size.width;
            me.context.canvas.height = size.height;
            me.cellBuffer = null; 
            me.runnerBuffer = null;
            me.initNodes(size.width, size.height);
            me.updateResources(size.width, size.height)
        }
    }
}

export default Neo.setupClass(ServicesCanvas);
