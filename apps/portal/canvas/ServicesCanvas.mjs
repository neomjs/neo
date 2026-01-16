import Base from '../../../src/core/Base.mjs';

const
    hasRaf    = typeof requestAnimationFrame === 'function',
    PRIMARY   = '#3E63DD', // Neo Blue
    SECONDARY = '#8BA6FF',
    HIGHLIGHT = '#00BFFF', // Deep Sky Blue
    HEX_SIZE  = 30,
    STRIDE    = 7,  // q, r, x, y, scale, energy, buildCharge
    RUNNER_COUNT = 30,
    RUNNER_STRIDE = 7,
    SUPER_HEX_MAX = 5,
    KERNEL_HEX_SIZE = 120,
    DEBRIS_COUNT = 200,
    DEBRIS_STRIDE = 5; // x, y, vx, vy, life

/**
 * @summary SharedWorker renderer for the Portal Services "Neural Lattice" background.
 *
 * Implements a **Hexagonal Lattice** representing the engineered, structured nature of the Neo.mjs runtime.
 * The grid acts as a living "Motherboard" or "VDOM Registry" where cells (Components) can be inspected
 * and mutated.
 *
 * **Visual Architecture:**
 * 1. **Kernel Layer (Parallax):** A deep, slow-moving background grid representing the framework core.
 * 2. **Application Layer (Lattice):** The main efficient structure (The App Engine).
 * 3. **Data Runners:** High-speed packets visualizing throughput and velocity.
 * 4. **Runtime Permutation:** Dynamic fusion of cells into "Super Modules".
 * 5. **Digital Debris:** Particle effects visualizing memory allocation (implosion) and garbage collection (fragmentation).
 *
 * @class Portal.canvas.ServicesCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class ServicesCanvas extends Base {
    static colors = {
        dark: {
            background: ['rgba(30, 30, 35, 1)', 'rgba(20, 20, 25, 1)'],
            debris    : '#FFFFFF',
            hexLine   : 'rgba(139, 166, 255, 0.05)',
            hexActive : 'rgba(0, 191, 255, 0.15)',
            kernel    : 'rgba(62, 99, 221, 0.03)',
            runner    : '#00BFFF',
            superHex  : 'rgba(255, 255, 255, 0.03)'
        },
        light: {
            background: ['rgba(255, 255, 255, 1)', 'rgba(245, 247, 255, 1)'],
            debris    : '#3E63DD',
            hexLine   : 'rgba(139, 166, 255, 0.15)',
            hexActive : 'rgba(0, 191, 255, 0.2)',
            kernel    : 'rgba(62, 99, 221, 0.04)',
            runner    : '#00BFFF',
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
    
    cellBuffer   = null
    runnerBuffer = null
    kernelBuffer = null
    
    /**
     * Buffer for Particle Debris.
     * Stride: [x, y, vx, vy, life]
     * @member {Float32Array|null} debrisBuffer
     */
    debrisBuffer = null

    superHexes = []
    scale      = 1
    time       = 0
    rotation   = {x: -0.4, y: 0} // Base tilt (radians) - Floor Perspective

    clearGraph() {
        let me = this;
        me.context      = null;
        me.canvasId     = null;
        me.canvasSize   = null;
        me.cellBuffer   = null;
        me.runnerBuffer = null;
        me.kernelBuffer = null;
        me.debrisBuffer = null;
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

    drawHex(ctx, x, y, z, size, projection) {
        ctx.beginPath();
        let first = true;

        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i + 30;
            const angle_rad = Math.PI / 180 * angle_deg;
            
            const px = x + size * Math.cos(angle_rad);
            const py = y + size * Math.sin(angle_rad);

            let p = projection.project(px, py, z);

            if (first) {
                ctx.moveTo(p.x, p.y);
                first = false;
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
        ctx.closePath();
    }

    drawKernel(ctx, width, height, projection) {
        let me = this;
        if (!me.kernelBuffer) return;

        const 
            buffer = me.kernelBuffer,
            count  = buffer.length / 2,
            s      = me.scale,
            size   = KERNEL_HEX_SIZE * s,
            themeColors = me.constructor.colors[me.theme];

        ctx.strokeStyle = themeColors.kernel;
        ctx.lineWidth   = 2 * s;
        ctx.lineJoin    = 'round';
        
        let panX = Math.sin(me.time * 0.2) * 20 * s,
            panY = Math.cos(me.time * 0.2) * 20 * s;

        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            let x = buffer[i * 2] + panX,
                y = buffer[i * 2 + 1] + panY;
            me.drawHex(ctx, x, y, 400, size, projection);
        }
        ctx.stroke();
    }

    drawGraph(ctx, width, height, projection) {
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

        // Batch 1: Idle Hexes
        ctx.beginPath();
        ctx.strokeStyle = themeColors.hexLine;
        
        for (let i = 0; i < count; i++) {
            let idx    = i * STRIDE,
                x      = buffer[idx + 2],
                y      = buffer[idx + 3],
                scale  = buffer[idx + 4], 
                energy = buffer[idx + 5];

            if (energy <= 0.01 && scale > 0.1) {
                let size = baseSize * 0.95 * scale;
                me.drawHex(ctx, x, y, 0, size, projection); 
            }
        }
        ctx.stroke();

        // Batch 2: Super Hexes
        ctx.lineWidth = 2 * s;
        for (let sh of me.superHexes) {
            let idx = sh.centerIdx,
                x   = buffer[idx + 2],
                y   = buffer[idx + 3],
                progress = 0;

            if (sh.state === 0) progress = sh.age / 30; 
            else if (sh.state === 1) progress = 1;      
            else progress = 1 - (sh.age / 30);          

            if (progress > 0) {
                ctx.beginPath();
                me.drawHex(ctx, x, y, 0, baseSize * 2.5 * progress, projection); 
                
                ctx.strokeStyle = HIGHLIGHT;
                ctx.globalAlpha = 0.3 * progress;
                ctx.stroke();
                
                ctx.fillStyle = themeColors.superHex;
                ctx.fill();
                
                let p = projection.project(x, y, 0);

                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * s * progress * p.scale, 0, Math.PI * 2);
                ctx.fillStyle = HIGHLIGHT;
                ctx.globalAlpha = 0.8 * progress;
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1 * s;

        // Batch 3: Active / Energized Hexes
        for (let i = 0; i < count; i++) {
            let idx    = i * STRIDE,
                x      = buffer[idx + 2],
                y      = buffer[idx + 3],
                scale  = buffer[idx + 4],
                energy = buffer[idx + 5];

            if (energy > 0.01 && scale > 0.5) {
                let currentSize = baseSize * (0.95 + (energy * 0.1)); 

                ctx.beginPath();
                me.drawHex(ctx, x, y, 0, currentSize, projection);
                
                ctx.fillStyle = themeColors.hexActive;
                ctx.globalAlpha = energy * 0.4; 
                ctx.fill();

                ctx.strokeStyle = HIGHLIGHT;
                ctx.lineWidth = (1 + energy) * s;
                ctx.globalAlpha = energy * 0.8;
                ctx.stroke();
                
                ctx.globalAlpha = 1;
                ctx.lineWidth = 1 * s; 
            }
        }
    }

    drawRunners(ctx, projection) {
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
                sp  = buffer[idx + 5]; 

            let dx = tx - x,
                dy = ty - y,
                dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist > 0) {
                let tailLen = sp * 12 * s; 
                let dirX = dx / dist,
                    dirY = dy / dist;

                let tailX = x - dirX * tailLen,
                    tailY = y - dirY * tailLen;

                let p1 = projection.project(tailX, tailY, 0);
                let p2 = projection.project(x, y, 0);

                if (!p1.visible || !p2.visible) continue;

                let g = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                g.addColorStop(0, 'rgba(0,0,0,0)');
                g.addColorStop(0.5, PRIMARY); 
                g.addColorStop(1, '#FFFFFF'); 
                
                ctx.beginPath();
                ctx.strokeStyle = g;
                ctx.lineWidth = 3 * s * p2.scale; // Scale thickness
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }

    /**
     * Draws particle debris (squares).
     */
    drawDebris(ctx, projection) {
        let me = this;
        if (!me.debrisBuffer) return;

        const
            buffer = me.debrisBuffer,
            count  = DEBRIS_COUNT,
            themeColors = me.constructor.colors[me.theme],
            s      = me.scale;

        ctx.fillStyle = themeColors.debris;

        for (let i = 0; i < count; i++) {
            let idx  = i * DEBRIS_STRIDE,
                life = buffer[idx + 4];

            if (life > 0) {
                let x = buffer[idx],
                    y = buffer[idx + 1],
                    size = 3 * s * life; // Shrink as it dies

                let p = projection.project(x, y, 0);
                if (p.visible) {
                    let scaledSize = size * p.scale;
                    ctx.globalAlpha = life;
                    ctx.fillRect(p.x - scaledSize/2, p.y - scaledSize/2, scaledSize, scaledSize);
                }
            }
        }
        ctx.globalAlpha = 1;
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

    initDebris() {
        let me = this;
        if (!me.debrisBuffer) {
            me.debrisBuffer = new Float32Array(DEBRIS_COUNT * DEBRIS_STRIDE);
        }
    }

    initKernel(width, height) {
        let me = this;
        const
            s        = me.scale,
            size     = KERNEL_HEX_SIZE * s,
            colStep  = size * 1.5,
            rowStep  = size * Math.sqrt(3),
            cols     = Math.ceil(width / colStep) + 4,
            rows     = Math.ceil(height / rowStep) + 4,
            count    = cols * rows;

        me.kernelBuffer = new Float32Array(count * 2);
        
        let i = 0;
        let startX = -(colStep * 2),
            startY = -(rowStep * 2);

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                let x = startX + c * colStep;
                let y = startY + r * rowStep;
                if (c % 2 === 1) {
                    y += rowStep / 2;
                }
                me.kernelBuffer[i * 2]     = x;
                me.kernelBuffer[i * 2 + 1] = y;
                i++;
            }
        }
    }

    initNodes(width, height) {
        let me = this;

        const
            s        = me.scale,
            size     = HEX_SIZE * s,
            colStep  = size * 1.5,
            rowStep  = size * Math.sqrt(3),
            cols     = Math.ceil(width / colStep) + 2,
            // Extend rows upwards for perspective (Horizon Buffer)
            rows     = Math.ceil(height / rowStep) + 12, 
            count    = cols * rows;

        if (!me.cellBuffer || me.cellBuffer.length !== count * STRIDE) {
            me.cellBuffer = new Float32Array(count * STRIDE);
        }

        const buffer = me.cellBuffer;
        
        let i = 0;
        // Start 10 rows higher up to fill the distance
        for (let c = -1; c < cols; c++) {
            for (let r = -10; r < rows - 10; r++) {
                let x = c * colStep;
                let y = r * rowStep;
                if (c % 2 === 1) {
                    y += rowStep / 2;
                }

                let idx = i * STRIDE;
                buffer[idx]     = c; 
                buffer[idx + 1] = r; 
                buffer[idx + 2] = x;
                buffer[idx + 3] = y;
                buffer[idx + 4] = 1; 
                buffer[idx + 5] = 0; 
                buffer[idx + 6] = 0; 

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
        
        buffer[idx]     = nodes[nIdx + 2]; 
        buffer[idx + 1] = nodes[nIdx + 3]; 
        
        buffer[idx + 2] = buffer[idx]; 
        buffer[idx + 3] = buffer[idx + 1];
        buffer[idx + 4] = 1; 
        buffer[idx + 5] = (Math.random() * 4 + 5) * me.scale; 
        buffer[idx + 6] = nIdx; 
    }

    /**
     * Spawns debris particles at a location.
     * @param {Number} x
     * @param {Number} y
     * @param {Number} count
     * @param {String} type 'implode' or 'explode'
     */
    spawnDebris(x, y, count, type) {
        let me = this;
        if (!me.debrisBuffer) return;

        const 
            buffer = me.debrisBuffer,
            total  = DEBRIS_COUNT,
            s      = me.scale;

        // Find empty slots
        let spawned = 0;
        for (let i = 0; i < total; i++) {
            let idx = i * DEBRIS_STRIDE;
            
            // If slot is empty (life <= 0)
            if (buffer[idx + 4] <= 0) {
                let angle = Math.random() * Math.PI * 2,
                    speed = (Math.random() * 3 + 2) * s;

                if (type === 'implode') {
                    // Start OUTSIDE, move IN
                    let radius = 60 * s;
                    buffer[idx]     = x + Math.cos(angle) * radius;
                    buffer[idx + 1] = y + Math.sin(angle) * radius;
                    buffer[idx + 2] = -Math.cos(angle) * speed; // Towards center
                    buffer[idx + 3] = -Math.sin(angle) * speed;
                } else {
                    // Start INSIDE, move OUT
                    buffer[idx]     = x;
                    buffer[idx + 1] = y;
                    buffer[idx + 2] = Math.cos(angle) * speed;
                    buffer[idx + 3] = Math.sin(angle) * speed;
                }
                
                buffer[idx + 4] = 1.0; // Life
                
                spawned++;
                if (spawned >= count) break;
            }
        }
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
        if (!me.kernelBuffer) me.initKernel(width, height);
        if (!me.runnerBuffer) me.initRunners(width, height);
        if (!me.debrisBuffer) me.initDebris();

        me.updatePhysics(width, height);
        me.updateRotation(width, height);
        me.updateSuperHexes(width, height);
        me.updateRunners(width, height);
        me.updateDebris();

        ctx.clearRect(0, 0, width, height);

        if (me.gradients.bgGradient) {
            ctx.fillStyle = me.gradients.bgGradient;
            ctx.fillRect(0, 0, width, height)
        }

        let projection = me.getProjection(width, height);

        me.drawKernel(ctx, width, height, projection); 
        me.drawGraph(ctx, width, height, projection);
        me.drawRunners(ctx, projection);
        me.drawDebris(ctx, projection); // Render particles on top

        if (hasRaf) {
            requestAnimationFrame(me.renderLoop)
        } else {
            setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    updateDebris() {
        let me = this;
        if (!me.debrisBuffer) return;

        const buffer = me.debrisBuffer,
              count  = DEBRIS_COUNT;

        for (let i = 0; i < count; i++) {
            let idx = i * DEBRIS_STRIDE;
            if (buffer[idx + 4] > 0) {
                // Move
                buffer[idx]     += buffer[idx + 2];
                buffer[idx + 1] += buffer[idx + 3];
                // Decay
                buffer[idx + 4] -= 0.03;
            }
        }
    }

    updateSuperHexes(width, height) {
        let me = this;
        if (!me.cellBuffer) return;

        if (me.superHexes.length < SUPER_HEX_MAX) {
            const buffer = me.cellBuffer,
                  count  = buffer.length / STRIDE;
            
            for (let i=0; i<20; i++) {
                let idx = Math.floor(Math.random() * count) * STRIDE,
                    charge = buffer[idx + 6];
                
                if (charge > 3) { 
                    me.superHexes.push({
                        centerIdx: idx,
                        age: 0,
                        state: 0, 
                        neighbors: me.findNeighbors(idx) 
                    });
                    
                    // Trigger Implosion!
                    let x = buffer[idx + 2],
                        y = buffer[idx + 3];
                    me.spawnDebris(x, y, 12, 'implode');

                    buffer[idx + 6] = 0;
                    break; 
                }
            }
        }

        for (let i = me.superHexes.length - 1; i >= 0; i--) {
            let sh = me.superHexes[i];
            sh.age++;

            if (sh.state === 0 && sh.age > 30) {
                sh.state = 1; 
                sh.age = 0;
            } else if (sh.state === 1 && sh.age > 120) { 
                sh.state = 2; 
                sh.age = 0;
            } else if (sh.state === 2 && sh.age > 30) {
                // Done - Trigger Explosion (Fragmentation)
                let idx = sh.centerIdx,
                    x   = me.cellBuffer[idx + 2],
                    y   = me.cellBuffer[idx + 3];
                
                me.spawnDebris(x, y, 12, 'explode');

                sh.neighbors.forEach(nIdx => {
                    me.cellBuffer[nIdx + 4] = 1; 
                });
                me.superHexes.splice(i, 1);
                continue;
            }

            let targetScale = 1;
            if (sh.state === 0) targetScale = 1 - (sh.age / 30); 
            else if (sh.state === 1) targetScale = 0;            
            else targetScale = sh.age / 30;                      

            sh.neighbors.forEach(nIdx => {
                me.cellBuffer[nIdx + 4] = targetScale;
            });
        }
    }

    findNeighbors(centerIdx) {
        let me = this,
            buffer = me.cellBuffer,
            cx = buffer[centerIdx + 2],
            cy = buffer[centerIdx + 3],
            neighbors = [centerIdx],
            count = buffer.length / STRIDE,
            s = me.scale,
            radius = HEX_SIZE * s * 2.1; 

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
            
            // Speed up hover reaction (0.1 -> 0.3)
            if (currentEnergy > targetEnergy) {
                 buffer[idx + 5] *= 0.9; 
            } else {
                 buffer[idx + 5] += (targetEnergy - currentEnergy) * 0.3;
            }
            
            if (buffer[idx + 5] < 0.001) buffer[idx + 5] = 0;
            
            if (buffer[idx + 6] > 0) {
                buffer[idx + 6] -= 0.05; 
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
                    
                    // Allow runners to exist further up (negative Y) for the horizon effect
                    // Expanded bounds: -500 (top) to height+50 (bottom)
                    if (tx < -50 || tx > width + 50 || ty < -500 || ty > height + 50) {
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

    updateRotation(width, height) {
        let me = this,
            mx = me.mouse.x,
            my = me.mouse.y,
            tx = -0.4, // Base tilt X (pitch)
            ty = 0;   // Base yaw

        if (mx !== -1000) {
            // Map mouse X to Yaw (+/- 0.2 rad)
            ty = ((mx / width) - 0.5) * 0.4;
            // Map mouse Y to Pitch (-0.6 to -0.2 rad)
            tx = -0.4 + ((my / height) - 0.5) * 0.4;
        }

        // Smooth interpolate
        me.rotation.x += (tx - me.rotation.x) * 0.05;
        me.rotation.y += (ty - me.rotation.y) * 0.05;
    }

    getProjection(width, height) {
        let me = this,
            fov = 1000,
            cx  = width / 2,
            cy  = height / 2,
            cosX = Math.cos(me.rotation.x),
            sinX = Math.sin(me.rotation.x),
            cosY = Math.cos(me.rotation.y),
            sinY = Math.sin(me.rotation.y);

        return {
            project(x, y, z) {
                let dx = x - cx,
                    dy = y - cy,
                    dz = z;

                // Rotate Y
                let x1 = dx * cosY - dz * sinY;
                let z1 = dz * cosY + dx * sinY;

                // Rotate X
                let y2 = dy * cosX - z1 * sinX;
                let z2 = z1 * cosX + dy * sinX;

                // Project
                let scale = fov / (fov + z2);

                return {
                    x: x1 * scale + cx,
                    y: y2 * scale + cy,
                    scale: scale,
                    visible: z2 > -fov // Clip if behind camera
                };
            }
        };
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
            me.kernelBuffer = null;
            me.debrisBuffer = null;
            me.initNodes(size.width, size.height);
            me.updateResources(size.width, size.height)
        }
    }
}

export default Neo.setupClass(ServicesCanvas);
