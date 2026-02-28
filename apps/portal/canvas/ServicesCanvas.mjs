import Base from '../../../src/canvas/Base.mjs';

const
    hasRaf          = typeof requestAnimationFrame === 'function',
    HEX_SIZE        = 30,
    STRIDE          = 8,  // q, r, x, y, scale, energy, buildCharge, colorIdx
    RUNNER_COUNT    = 30,
    /**
     * Agent Buffer Layout (Float32Array):
     * - 0: x (Current X)
     * - 1: y (Current Y)
     * - 2: tx (Target X)
     * - 3: ty (Target Y)
     * - 4: progress (Animation progress, 0-1)
     * - 5: speed (Movement speed)
     * - 6: currentHexIdx (Index of occupied node)
     * - 7: colorIdx (Palette index)
     * - 8: state (0 = Moving, 1 = Scanning)
     * - 9: scanTime (0-1 progress of the scan action)
     */
    RUNNER_STRIDE   = 10,
    SUPER_HEX_MAX   = 5,
    KERNEL_HEX_SIZE = 120,
    PARTICLE_COUNT  = 200,
    PARTICLE_STRIDE = 8, // x, y, z, vx, vy, vz, life, colorIdx
    STRATA_COUNT    = 15,
    STRATA_STRIDE   = 4; // x, y, z, size

/**
 * @summary SharedWorker renderer for the Portal Services "Neural Fabric" background.
 *
 * Implements a **Hexagonal Fabric** representing the engineered, structured nature of the Neo.mjs runtime.
 * The grid acts as a living "Motherboard" or "VDOM Registry" where cells (Components) can be inspected
 * and mutated.
 *
 * **Visual Architecture:**
 * 1. **Kernel Layer (Parallax):** A deep, slow-moving background grid representing the framework core.
 * 2. **Data Strata (Mid-Ground):** Floating clusters bridging the depth gap.
 * 3. **Application Layer (Fabric):** The main efficient structure (The App Engine).
 * 4. **Neural Agents:** High-speed packets visualizing throughput and intelligent maintenance.
 * 5. **Runtime Permutation:** Dynamic fusion of cells into "Super Modules" (construction/upload effects).
 * 6. **Construction Particles:** Particle effects visualizing memory allocation and object assembly.
 *
 * **Performance Architecture (Zero-Allocation):**
 * To ensure 60fps performance on high-resolution displays, this class employs a strict **Zero-Allocation** strategy:
 * 1.  **TypedArray Buffers:** All entity data is stored in pre-allocated `Float32Array` buffers.
 * 2.  **Persistent Objects:** Reusable objects (like `projectionPoint`, `projectionMatrix`) are used
 *     instead of creating new objects per frame.
 * 3.  **Inlined Math:** Projection and vector calculations are performed in-place.
 *
 * **Node Buffer Layout (Float32Array):**
 * - 0: q (Axial Coord Q)
 * - 1: r (Axial Coord R)
 * - 2: x (Screen X)
 * - 3: y (Screen Y)
 * - 4: scale (Visual scale, 0-1)
 * - 5: energy (Interaction state, 0-1)
 * - 6: buildCharge (Accumulator for Super Hex formation)
 * - 7: colorIdx (Palette index)
 *
 * **Runner Buffer Layout (Float32Array):**
 * - 0: x (Current X)
 * - 1: y (Current Y)
 * - 2: tx (Target X)
 * - 3: ty (Target Y)
 * - 4: progress (Animation progress, 0-1)
 * - 5: speed (Movement speed)
 * - 6: currentHexIdx (Index of occupied node)
 * - 7: colorIdx (Palette index)
 *
 * @class Portal.canvas.ServicesCanvas
 * @extends Portal.canvas.Base
 * @singleton
 */
class ServicesCanvas extends Base {
    static colors = {
        dark : {
            background     : ['rgba(30, 30, 35, 1)', 'rgba(20, 20, 25, 1)'],
            particlePalette: ['#E0E0E0', '#00BFFF', '#3E63DD', '#8BA6FF'], // White, Cyan, Neo Blue, Light Blue
            hexLine        : 'rgba(139, 166, 255, 0.1)',
            hexActive      : 'rgba(0, 191, 255, 0.15)',
            activePalette  : ['#00BFFF', '#536DFE', '#3E63DD', '#00E5FF'], // Cyan, Indigo, Neo Blue, Turquoise
            kernel         : 'rgba(62, 99, 221, 0.08)',
            runner         : '#00BFFF',
            runnerPalette  : ['#00BFFF', '#536DFE', '#3E63DD', '#00E5FF'],
            agentHead      : '#FFFFFF',
            superHex       : 'rgba(62, 99, 221, 0.3)',
            strata         : 'rgba(139, 166, 255, 0.08)'
        },
        light: {
            background     : ['rgba(255, 255, 255, 1)', 'rgba(245, 247, 255, 1)'],
            particlePalette: ['#3E63DD', '#00BFFF', '#536DFE', '#283593'], // Neo Blue, Cyan, Indigo, Dark Blue
            hexLine        : 'rgba(62, 99, 221, 0.25)',
            hexActive      : 'rgba(0, 191, 255, 0.2)',
            activePalette  : ['#00BFFF', '#536DFE', '#3E63DD', '#00E5FF'],
            kernel         : 'rgba(62, 99, 221, 0.08)',
            runner         : '#00BFFF',
            runnerPalette  : ['#00BFFF', '#536DFE', '#3E63DD', '#00E5FF'],
            agentHead      : '#3E63DD',
            superHex       : 'rgba(62, 99, 221, 0.3)',
            strata         : 'rgba(62, 99, 221, 0.05)'
        }
    }

    static config = {
            /**
             * @member {String} className='Portal.canvas.ServicesCanvas'
             * @protected
             */
            className: 'Portal.canvas.ServicesCanvas',
            /**
             * Remote method access for the App Worker.
         * Allows the UI (Controller) to control the simulation state and input.
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
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
     * @member {Number|null} animationId=null
     */
    animationId = null
    /**
     * ID of the canvas element in the DOM.
     * @member {String|null} canvasId=null
     */
    canvasId = null
    /**
     * Current dimensions of the canvas.
     * @member {Object|null} canvasSize=null
     */
    canvasSize = null
    /**
     * The 2D rendering context.
     * @member {OffscreenCanvasRenderingContext2D|null} context=null
     */
    context = null

    /**
     * Buffer for the main Application Lattice (The Graph).
     * @member {Float32Array|null} cellBuffer
     */
    cellBuffer = null
    /**
     * Buffer for Data Runners (High-speed packets).
     * @member {Float32Array|null} runnerBuffer
     */
    runnerBuffer = null
    /**
     * Buffer for the Kernel Layer (Background Parallax).
     * @member {Float32Array|null} kernelBuffer
     */
    kernelBuffer = null
    /**
     * Buffer for Data Strata (Mid-ground Clusters).
     * @member {Float32Array|null} strataBuffer
     */
    strataBuffer = null

    /**
     * Buffer for Construction Particles.
     * Stride: [x, y, z, vx, vy, vz, life, colorIdx]
     * @member {Float32Array|null} particleBuffer
     */
    particleBuffer = null

    /**
     * Reusable object for projection calculations to avoid GC
     * @member {Object} projectionPoint
     * @protected
     */
    projectionPoint = {x: 0, y: 0, scale: 0, visible: false}

    /**
     * Projection matrix cache
     * @member {Object} projectionMatrix
     * @protected
     */
    projectionMatrix = {cx: 0, cy: 0, cosX: 0, sinX: 0, cosY: 0, sinY: 0}

    /**
     * List of active "Super Hexes" (Merged cells).
     * @member {Object[]} superHexes=[]
     */
    superHexes = []
    /**
     * Scaling factor relative to reference viewport.
     * @member {Number} scale=1
     */
    scale = 1
    /**
     * Current camera rotation in radians (Pitch, Yaw).
     * @member {Object} rotation={x: -0.4, y: 0}
     */
    rotation = {x: -0.4, y: 0} // Base tilt (radians) - Floor Perspective

    /**
     * Clears the graph state and stops the render loop.
     * Used when the component is destroyed or the route changes to release memory.
     */
    clearGraph() {
        let me = this;
        super.clearGraph();
        me.cellBuffer   = null;
        me.runnerBuffer = null;
        me.kernelBuffer = null;
        me.strataBuffer = null;
        me.particleBuffer = null;
        me.superHexes   = [];
        me.scale        = 1
    }

    /**
     * Hook to initialize nodes and buffers after context is ready
     * @param {Number} width
     * @param {Number} height
     */
    onGraphMounted(width, height) {
        this.updateSize({width, height})
    }

    /**
     * Draws a single Hexagon projected into 3D space.
     * Uses the reused `projectionPoint` to avoid allocations.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} x World X
     * @param {Number} y World Y
     * @param {Number} z World Z
     * @param {Number} size Radius in pixels
     */
    drawHex(ctx, x, y, z, size) {
        let me    = this,
            first = true,
            p;

        ctx.beginPath();

        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i + 30;
            const angle_rad = Math.PI / 180 * angle_deg;

            const px = x + size * Math.cos(angle_rad);
            const py = y + size * Math.sin(angle_rad);

            p = me.project(px, py, z);

            if (first) {
                ctx.moveTo(p.x, p.y);
                first = false;
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
        ctx.closePath();
    }

    /**
     * Draws the Kernel Layer (Background).
     * This layer moves slowly (Parallax) to create depth.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawKernel(ctx, width, height) {
        let me = this;
        if (!me.kernelBuffer) {
            return;
        }

        const
            buffer      = me.kernelBuffer,
            count       = buffer.length / 2,
            s           = me.scale,
            size        = KERNEL_HEX_SIZE * s,
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
            me.drawHex(ctx, x, y, 400, size);
        }
        ctx.stroke();
    }

    /**
     * Draws the Data Strata (Mid-ground floating clusters).
     * These elements sit between the background and the main lattice.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawStrata(ctx, width, height) {
        let me = this;
        if (!me.strataBuffer) {
            return;
        }

        const
            buffer      = me.strataBuffer,
            count       = STRATA_COUNT,
            s           = me.scale,
            themeColors = me.constructor.colors[me.theme];

        ctx.fillStyle = themeColors.strata;

        let panX = Math.sin(me.time * 0.15) * 30 * s,
            panY = Math.cos(me.time * 0.15) * 30 * s;

        for (let i = 0; i < count; i++) {
            let idx  = i * STRATA_STRIDE,
                x    = buffer[idx] + panX,
                y    = buffer[idx + 1] + panY,
                z    = buffer[idx + 2],
                size = buffer[idx + 3] * s;

            me.drawHex(ctx, x, y, z, size);
            ctx.fill();
        }
    }

    /**
     * Draws the main Application Lattice (Foreground).
     * Handles 3 batches:
     * 1. **Idle Hexes:** Faint outlines.
     * 2. **Super Hexes:** Large, merged modules with fill and center glow.
     * 3. **Active Hexes:** Energized nodes with "Holographic Pop" (3D extrusion).
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawGraph(ctx, width, height) {
        let me = this;

        if (!me.cellBuffer) {
            return;
        }

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
                me.drawHex(ctx, x, y, 0, size);
            }
        }
        ctx.stroke();

        // Batch 2: Super Hexes
        ctx.lineWidth = 2 * s;
        for (let sh of me.superHexes) {
            let idx      = sh.centerIdx,
                x        = buffer[idx + 2],
                y        = buffer[idx + 3],
                colorIdx = buffer[idx + 7],
                progress = 0;

            if (sh.state === 0) {
                progress = sh.age / 30;
            } else if (sh.state === 1) {
                progress = 1;
            } else {
                progress = 1 - (sh.age / 30);
            }

            if (progress > 0) {
                let color = themeColors.activePalette[colorIdx];

                ctx.beginPath();
                me.drawHex(ctx, x, y, 0, baseSize * 2.5 * progress);

                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.3 * progress;
                ctx.stroke();

                ctx.fillStyle = themeColors.superHex;
                ctx.fill();

                let p = me.project(x, y, 0);

                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * s * progress * p.scale, 0, Math.PI * 2);
                ctx.fillStyle   = color;
                ctx.globalAlpha = 0.8 * progress;
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth   = 1 * s;

        // Batch 3: Active / Energized Hexes
        for (let i = 0; i < count; i++) {
            let idx      = i * STRIDE,
                x        = buffer[idx + 2],
                y        = buffer[idx + 3],
                scale    = buffer[idx + 4],
                energy   = buffer[idx + 5],
                colorIdx = buffer[idx + 7];

            if (energy > 0.01 && scale > 0.5) {
                let currentSize = baseSize * (0.95 + (energy * 0.1)),
                    color       = themeColors.activePalette[colorIdx];

                ctx.beginPath();
                me.drawHex(ctx, x, y, 0, currentSize);

                ctx.fillStyle   = themeColors.hexActive;
                ctx.globalAlpha = energy * 0.4;
                ctx.fill();

                ctx.strokeStyle = color;
                ctx.lineWidth   = (1 + energy) * s;
                ctx.globalAlpha = energy * 0.8;
                ctx.stroke();

                // Holographic Pop (Ghost Hex)
                if (energy > 0.3) {
                    ctx.beginPath();
                    let popZ = -50 * energy; // Float up
                    me.drawHex(ctx, x, y, popZ, currentSize);
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = energy * 0.4;
                    ctx.lineWidth   = 1 * s;
                    ctx.stroke();
                }

                ctx.globalAlpha = 1;
                ctx.lineWidth   = 1 * s;
            }
        }
    }

    /**
     * Draws Data Runners (High-speed Packets).
     * Visualized as a gradient line (Trail) leading to a white head.
     * Uses optimized projection re-use.
     * @param {CanvasRenderingContext2D} ctx
     */
    drawRunners(ctx) {
        let me = this;
        if (!me.runnerBuffer) {
            return;
        }

        const
            buffer      = me.runnerBuffer,
            count       = RUNNER_COUNT,
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale,
            pp          = me.projectionPoint; // Shortcut

        ctx.lineCap = 'round';

        for (let i = 0; i < count; i++) {
            let idx      = i * RUNNER_STRIDE,
                x        = buffer[idx],
                y        = buffer[idx + 1],
                tx       = buffer[idx + 2],
                ty       = buffer[idx + 3],
                sp       = buffer[idx + 5],
                colorIdx = buffer[idx + 7],
                state    = buffer[idx + 8],
                scanTime = buffer[idx + 9];

            // Project Head (Always needed)
            me.project(x, y, 0);

            if (!pp.visible) {
                continue;
            }
            let headX = pp.x,
                headY = pp.y,
                headS = pp.scale;

            let color = themeColors.runnerPalette[colorIdx];

            // STATE 0: MOVING (Draw Trail)
            if (state === 0) {
                let dx   = tx - x,
                    dy   = ty - y,
                    dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 0) {
                    let tailLen = sp * 12 * s;
                    let dirX    = dx / dist,
                        dirY    = dy / dist;

                    let tailX = x - dirX * tailLen,
                        tailY = y - dirY * tailLen;

                    // Project Tail
                    me.project(tailX, tailY, 0);
                    let p1x   = pp.x,
                        p1y   = pp.y;

                    let g = ctx.createLinearGradient(p1x, p1y, headX, headY);
                    g.addColorStop(0, 'rgba(0,0,0,0)');
                    g.addColorStop(0.2, color);
                    g.addColorStop(0.6, color);
                    g.addColorStop(1, themeColors.agentHead);

                    ctx.beginPath();
                    ctx.strokeStyle = g;
                    ctx.lineWidth   = 3 * s * headS;
                    ctx.moveTo(p1x, p1y);
                    ctx.lineTo(headX, headY);
                    ctx.stroke();
                }
            }
            // STATE 1: SCANNING (Draw Pulse)
            else if (state === 1) {
                let radius = (HEX_SIZE * s * 1.5) * scanTime * headS;

                ctx.beginPath();
                ctx.arc(headX, headY, radius, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.lineWidth   = 2 * s * headS * (1 - scanTime); // Fade out
                ctx.stroke();

                // Scanning Beam (Vertical)
                ctx.beginPath();
                ctx.moveTo(headX, headY);
                ctx.lineTo(headX, headY - (30 * s * headS * Math.sin(scanTime * Math.PI)));
                ctx.strokeStyle = themeColors.agentHead;
                ctx.lineWidth   = 2 * s * headS;
                ctx.stroke();
            }

            // Draw Head (Diamond Shape)
            ctx.beginPath();
            ctx.fillStyle = themeColors.agentHead;
            let hs = 4 * s * headS; // Head Size
            ctx.moveTo(headX, headY - hs);
            ctx.lineTo(headX + hs, headY);
            ctx.lineTo(headX, headY + hs);
            ctx.lineTo(headX - hs, headY);
            ctx.closePath();
            ctx.fill();

            // Glow
            ctx.shadowBlur  = 10 * s;
            ctx.shadowColor = color;
            ctx.shadowBlur  = 0;
        }
    }

    /**
     * Draws construction particles.
     * @param {CanvasRenderingContext2D} ctx
     */
    drawParticles(ctx) {
        let me = this;
        if (!me.particleBuffer) {
            return;
        }

        const
            buffer      = me.particleBuffer,
            count       = PARTICLE_COUNT,
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale,
            pp          = me.projectionPoint;

        for (let i = 0; i < count; i++) {
            let idx  = i * PARTICLE_STRIDE,
                life = buffer[idx + 6]; // life is now at index 6

            if (life > 0) {
                let x    = buffer[idx],
                    y    = buffer[idx + 1],
                    z    = buffer[idx + 2],
                    size = 3 * s * life; // Shrink as it dies

                me.project(x, y, z);

                if (pp.visible) {
                    let scaledSize = size * pp.scale,
                        colorIdx   = buffer[idx + 7]; // colorIdx at index 7

                    ctx.fillStyle   = themeColors.particlePalette[colorIdx];
                    ctx.globalAlpha = life;
                    ctx.fillRect(pp.x - scaledSize / 2, pp.y - scaledSize / 2, scaledSize, scaledSize);
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Allocates the Particle Buffer (Construction Effects).
     */
    initParticles() {
        let me = this;
        if (!me.particleBuffer) {
            me.particleBuffer = new Float32Array(PARTICLE_COUNT * PARTICLE_STRIDE);
        }
    }

    /**
     * Initializes the Kernel Buffer (Background Grid).
     * Creates a large-scale Hex grid that extends beyond the viewport for parallax movement.
     * @param {Number} width
     * @param {Number} height
     */
    initKernel(width, height) {
        let me      = this;
        const
            s       = me.scale,
            size    = KERNEL_HEX_SIZE * s,
            colStep = size * 1.5,
            rowStep = size * Math.sqrt(3),
            cols    = Math.ceil(width / colStep) + 4,
            rows    = Math.ceil(height / rowStep) + 4,
            count   = cols * rows;

        me.kernelBuffer = new Float32Array(count * 2);

        let i      = 0;
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

    /**
     * Initializes the Main Lattice (Application Layer).
     * Creates a standard Hexagonal Grid covering the screen + margins.
     * @param {Number} width
     * @param {Number} height
     */
    initNodes(width, height) {
        let me = this;

        const
            s       = me.scale,
            size    = HEX_SIZE * s,
            colStep = size * 1.5,
            rowStep = size * Math.sqrt(3),
            cols    = Math.ceil(width / colStep) + 2,
            // Extend rows upwards for perspective (Horizon Buffer)
            rows    = Math.ceil(height / rowStep) + 12,
            count   = cols * rows;

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

                let idx         = i * STRIDE;
                buffer[idx]     = c;
                buffer[idx + 1] = r;
                buffer[idx + 2] = x;
                buffer[idx + 3] = y;
                buffer[idx + 4] = 1;
                buffer[idx + 5] = 0;
                buffer[idx + 6] = 0;
                buffer[idx + 7] = Math.floor(Math.random() * 4); // colorIdx

                i++;
                if (i >= count) {
                    break;
                }
            }
        }
    }

    /**
     * Initializes Data Runners (Traffic).
     * @param {Number} width
     * @param {Number} height
     */
    initRunners(width, height) {
        let me = this;
        if (!me.runnerBuffer) {
            me.runnerBuffer = new Float32Array(RUNNER_COUNT * RUNNER_STRIDE);
        }

        const
            buffer = me.runnerBuffer;

        for (let i = 0; i < RUNNER_COUNT; i++) {
            me.resetRunner(i, width, height);
            let idx         = i * RUNNER_STRIDE;
            buffer[idx + 4] = Math.random(); // Random start progress
            buffer[idx + 8] = 0; // State: Moving
            buffer[idx + 9] = 0; // ScanTime
        }
    }

    /**
     * Initializes Data Strata (Floating Mid-ground Clusters).
     * Randomly placed 3D coordinates.
     * @param {Number} width
     * @param {Number} height
     */
    initStrata(width, height) {
        let me = this;

        me.strataBuffer = new Float32Array(STRATA_COUNT * STRATA_STRIDE);
        const buffer    = me.strataBuffer;

        for (let i = 0; i < STRATA_COUNT; i++) {
            let idx         = i * STRATA_STRIDE;
            buffer[idx]     = (Math.random() - 0.5) * width * 2;
            buffer[idx + 1] = (Math.random() - 0.5) * height * 3;
            buffer[idx + 2] = 150 + Math.random() * 150; // Z depth 150-300
            buffer[idx + 3] = (HEX_SIZE * 3) + Math.random() * HEX_SIZE * 4; // Size
        }
    }

    /**
     * Finds the nearest hex node to a given screen position.
     * @param {Number} x
     * @param {Number} y
     * @returns {Number} Index of the nearest node or -1
     */
    findNearestNode(x, y) {
        let me      = this,
            buffer  = me.cellBuffer,
            count   = buffer.length / STRIDE,
            minDist = Infinity,
            bestIdx = -1;

        for (let i = 0; i < count; i++) {
            let idx  = i * STRIDE,
                nx   = buffer[idx + 2],
                ny   = buffer[idx + 3],
                dist = (nx - x) ** 2 + (ny - y) ** 2;

            if (dist < minDist) {
                minDist = dist;
                bestIdx = idx;
            }
        }
        return bestIdx;
    }

    /**
     * Resets a runner to a random position.
     * @param {Number} index
     * @param {Number} width
     * @param {Number} height
     */
    resetRunner(index, width, height) {
        let me        = this,
            buffer    = me.runnerBuffer,
            nodes     = me.cellBuffer,
            idx       = index * RUNNER_STRIDE,
            nodeCount = nodes.length / STRIDE;

        let nIdx = Math.floor(Math.random() * nodeCount) * STRIDE;

        buffer[idx]     = nodes[nIdx + 2];
        buffer[idx + 1] = nodes[nIdx + 3];

        buffer[idx + 2] = buffer[idx];
        buffer[idx + 3] = buffer[idx + 1];
        buffer[idx + 4] = 1;
        buffer[idx + 5] = (Math.random() * 4 + 5) * me.scale;
        buffer[idx + 6] = nIdx;
        buffer[idx + 7] = Math.floor(Math.random() * 4); // colorIdx
        buffer[idx + 8] = 0; // State: Moving
        buffer[idx + 9] = 0; // ScanTime
    }

    /**
     * Spawns construction particles.
     *
     * **Visual Metaphors:**
     * - **'implode'**: Particles fly *inward* from a radius to the center. Represents **Assembly**,
     *   **Memory Allocation**, or **Crystallization**. Used when a Super Hex is born.
     * - **'upload'**: Particles fly *upward* (Z-axis) and fade out. Represents **Data Transfer**,
     *   **Cloud Sync**, or **release**. Used when a Super Hex finishes its lifecycle.
     *
     * @param {Number} x World X
     * @param {Number} y World Y
     * @param {Number} count Number of particles to spawn
     * @param {String} type 'implode' or 'upload'
     */
    spawnParticles(x, y, count, type) {
        let me = this;
        if (!me.particleBuffer) {
            return;
        }

        const
            buffer = me.particleBuffer,
            total  = PARTICLE_COUNT,
            s      = me.scale;

        // Find empty slots
        let spawned = 0;
        for (let i = 0; i < total; i++) {
            let idx = i * PARTICLE_STRIDE;

            // If slot is empty (life <= 0)
            if (buffer[idx + 6] <= 0) {
                let angle = Math.random() * Math.PI * 2,
                    speed = (Math.random() * 3 + 2) * s;

                if (type === 'implode') {
                    // Start OUTSIDE, move IN
                    let radius      = 60 * s;
                    buffer[idx]     = x + Math.cos(angle) * radius;
                    buffer[idx + 1] = y + Math.sin(angle) * radius;
                    buffer[idx + 2] = 0; // z
                    buffer[idx + 3] = -Math.cos(angle) * speed; // vx
                    buffer[idx + 4] = -Math.sin(angle) * speed; // vy
                    buffer[idx + 5] = 0; // vz
                } else if (type === 'upload') {
                    // Start CENTER, move UP (Z-axis)
                    buffer[idx]     = x + (Math.random() - 0.5) * 20 * s;
                    buffer[idx + 1] = y + (Math.random() - 0.5) * 20 * s;
                    buffer[idx + 2] = 0; // z
                    buffer[idx + 3] = 0; // vx
                    buffer[idx + 4] = 0; // vy
                    buffer[idx + 5] = -speed * 1.5; // vz (Upwards in 3D space is negative Z in our projection usually, or handle in render)
                    // Let's assume negative Z is 'up/away' or just use Y for 'up'.
                    // Actually, 'Up' in 3D world space (if Y is down) is negative Y.
                    // But here we want a 'Holographic Upload' effect, which implies Z-axis lift.
                    // Let's try Negative Z (towards camera? or away?).
                    // In drawHex, Z is depth. Lower Z is closer?
                    // Let's make them float 'up' in World Y (-Y) and 'out' in Z (-Z).
                    buffer[idx + 4] = -1 * s; // Slow rise Y
                    buffer[idx + 5] = -5 * s; // Fast rise Z (towards camera)
                } else {
                    // Default explode
                     buffer[idx]     = x;
                     buffer[idx + 1] = y;
                     buffer[idx + 2] = 0;
                     buffer[idx + 3] = Math.cos(angle) * speed;
                     buffer[idx + 4] = Math.sin(angle) * speed;
                     buffer[idx + 5] = 0;
                }

                buffer[idx + 6] = 1.0; // Life
                buffer[idx + 7] = Math.floor(Math.random() * 4); // Color Index

                spawned++;
                if (spawned >= count) {
                    break;
                }
            }
        }
    }

    /**
     * Main Render Loop.
     * Updates physics, projects geometry, and draws all layers.
     */
    render() {
        let me = this;

        if (!me.canRender) {
            return
        }

        const
            ctx    = me.context,
            width  = me.canvasSize?.width || 100,
            height = me.canvasSize?.height || 50;

        me.time += 0.01;

        if (!me.cellBuffer) {
            me.initNodes(width, height);
        }
        if (!me.kernelBuffer) {
            me.initKernel(width, height);
        }
        if (!me.strataBuffer) {
            me.initStrata(width, height);
        }
        if (!me.runnerBuffer) {
            me.initRunners(width, height);
        }
        if (!me.particleBuffer) {
            me.initParticles();
        }

        me.updatePhysics(width, height);
        me.updateRotation(width, height);
        me.updateSuperHexes(width, height);
        me.updateRunners(width, height);
        me.updateParticles();
        me.updateProjection(width, height);

        ctx.clearRect(0, 0, width, height);

        if (me.gradients.bgGradient) {
            ctx.fillStyle = me.gradients.bgGradient;
            ctx.fillRect(0, 0, width, height)
        }

        me.drawKernel(ctx, width, height);
        me.drawStrata(ctx, width, height);
        me.drawGraph(ctx, width, height);
        me.drawRunners(ctx);
        me.drawParticles(ctx); // Render particles on top

        if (hasRaf) {
            me.animationId = requestAnimationFrame(me.renderLoop)
        } else {
            me.animationId = setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    /**
     * Updates particle physics (movement, decay).
     */
    updateParticles() {
        let me = this;
        if (!me.particleBuffer) {
            return;
        }

        const buffer = me.particleBuffer,
              count  = PARTICLE_COUNT;

        for (let i = 0; i < count; i++) {
            let idx = i * PARTICLE_STRIDE;
            if (buffer[idx + 6] > 0) { // Check life
                // Move x, y, z by vx, vy, vz
                buffer[idx]     += buffer[idx + 3];
                buffer[idx + 1] += buffer[idx + 4];
                buffer[idx + 2] += buffer[idx + 5];

                // Decay life
                buffer[idx + 6] -= 0.03;
            }
        }
    }

    /**
     * Manages the lifecycle of Super Hexes.
     * Detects highly charged cells, triggers implosions to form Super Hexes,
     * and manages their growth and final explosion.
     * @param {Number} width
     * @param {Number} height
     */
    updateSuperHexes(width, height) {
        let me = this;
        if (!me.cellBuffer) {
            return;
        }

        if (me.superHexes.length < SUPER_HEX_MAX) {
            const buffer = me.cellBuffer,
                  count  = buffer.length / STRIDE;

            for (let i = 0; i < 20; i++) {
                let idx    = Math.floor(Math.random() * count) * STRIDE,
                    charge = buffer[idx + 6];

                if (charge > 3) {
                    me.superHexes.push({
                        centerIdx: idx,
                        age      : 0,
                        state    : 0,
                        neighbors: me.findNeighbors(idx)
                    });

                    // Trigger Implosion!
                    let x = buffer[idx + 2],
                        y = buffer[idx + 3];
                    me.spawnParticles(x, y, 12, 'implode');

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
                sh.age   = 0;
            } else if (sh.state === 1 && sh.age > 120) {
                sh.state = 2;
                sh.age   = 0;
            } else if (sh.state === 2 && sh.age > 30) {
                // Done - Trigger Upload
                let idx = sh.centerIdx,
                    x   = me.cellBuffer[idx + 2],
                    y   = me.cellBuffer[idx + 3];

                me.spawnParticles(x, y, 12, 'upload');

                sh.neighbors.forEach(nIdx => {
                    me.cellBuffer[nIdx + 4] = 1;
                });
                me.superHexes.splice(i, 1);
                continue;
            }

            let targetScale = 1;
            if (sh.state === 0) {
                targetScale = 1 - (sh.age / 30);
            } else if (sh.state === 1) {
                targetScale = 0;
            } else {
                targetScale = sh.age / 30;
            }

            sh.neighbors.forEach(nIdx => {
                me.cellBuffer[nIdx + 4] = targetScale;
            });
        }
    }

    /**
     * Finds immediate neighbors for Super Hex formation.
     * @param {Number} centerIdx
     * @returns {Number[]} Array of neighbor indices
     */
    findNeighbors(centerIdx) {
        let me        = this,
            buffer    = me.cellBuffer,
            cx        = buffer[centerIdx + 2],
            cy        = buffer[centerIdx + 3],
            neighbors = [centerIdx],
            count     = buffer.length / STRIDE,
            s         = me.scale,
            radius    = HEX_SIZE * s * 2.1;

        for (let i = 0; i < count; i++) {
            let idx = i * STRIDE;
            if (idx === centerIdx) {
                continue;
            }

            let x    = buffer[idx + 2],
                y    = buffer[idx + 3],
                dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

            if (dist < radius) {
                neighbors.push(idx);
            }
        }
        return neighbors;
    }

    /**
     * Updates interaction physics for the main lattice.
     * Handles mouse hover energy transfer and decay.
     * @param {Number} width
     * @param {Number} height
     */
    updatePhysics(width, height) {
        let me = this;
        if (!me.cellBuffer) {
            return;
        }

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
                    distSq = dx * dx + dy * dy,
                    radius = 250 * s;

                if (distSq < radius * radius) {
                    let dist = Math.sqrt(distSq);
                    active   = (radius - dist) / radius;
                    active   = Math.pow(active, 2);
                }
            }

            let currentEnergy = buffer[idx + 5];
            let targetEnergy  = active * 0.8;

            // Speed up hover reaction (0.1 -> 0.3)
            if (currentEnergy > targetEnergy) {
                buffer[idx + 5] *= 0.9;
            } else {
                buffer[idx + 5] += (targetEnergy - currentEnergy) * 0.3;
            }

            if (buffer[idx + 5] < 0.001) {
                buffer[idx + 5] = 0;
            }

            if (buffer[idx + 6] > 0) {
                buffer[idx + 6] -= 0.05;
                if (buffer[idx + 6] < 0) {
                    buffer[idx + 6] = 0;
                }
            }
        }
    }

    /**
     * Updates Neural Agent logic (The "Intelligence" Layer).
     *
     * Implements a 2-State Machine for Agents:
     *
     * **State 0: Moving**
     * - Agents travel along grid edges to a target node.
     * - Uses "Magnetic Pathfinding" to bias movement towards the mouse cursor.
     * - Upon arrival, there is a **20% chance** to switch to "Scanning".
     *
     * **State 1: Scanning**
     * - The Agent locks onto a node and performs a "Deep Scan" (visualized as a pulse).
     * - **Construction Trigger:** When the scan completes, the Agent injects massive `BuildCharge` (+5)
     *   into the node. This deterministically triggers the formation of a **Super Hex**, creating
     *   a direct cause-and-effect relationship between "Agent Work" and "Structure Creation".
     *
     * @param {Number} width
     * @param {Number} height
     */
    updateRunners(width, height) {
        let me = this;
        if (!me.runnerBuffer) {
            return;
        }

        const
            runners = me.runnerBuffer,
            nodes   = me.cellBuffer,
            count   = RUNNER_COUNT,
            s       = me.scale;

        for (let i = 0; i < count; i++) {
            let idx      = i * RUNNER_STRIDE,
                state    = runners[idx + 8];

            // STATE 0: MOVING
            if (state === 0) {
                let progress = runners[idx + 4],
                    speed    = runners[idx + 5];

                if (progress < 1) {
                    let x  = runners[idx],
                        y  = runners[idx + 1],
                        tx = runners[idx + 2],
                        ty = runners[idx + 3];

                    let dx   = tx - x,
                        dy   = ty - y,
                        dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < speed) {
                        runners[idx]     = tx;
                        runners[idx + 1] = ty;
                        runners[idx + 4] = 1; // Arrived

                        // Decision Point: Scan or Move?
                        // 20% Chance to Scan, but only if on a valid node
                        let nodeIdx = me.findNearestNode(tx, ty);

                        if (nodeIdx !== -1 && Math.random() > 0.8) {
                            runners[idx + 8] = 1; // Switch to Scanning
                            runners[idx + 9] = 0; // Reset Scan Time
                            runners[idx + 6] = nodeIdx; // Lock to node
                        } else {
                            // Just passing through - Standard Energy Boost
                            if (nodeIdx !== -1) {
                                nodes[nodeIdx + 5] = 1.0; // Flash
                                nodes[nodeIdx + 6] += 0.5; // Small contribution
                                nodes[nodeIdx + 7] = runners[idx + 7];
                                runners[idx + 6]   = nodeIdx;
                            }
                        }
                    } else {
                        runners[idx]     += (dx / dist) * speed;
                        runners[idx + 1] += (dy / dist) * speed;
                    }
                } else {
                    // Pick Next Target
                    let currentHexIdx = runners[idx + 6];

                    if (currentHexIdx !== undefined && currentHexIdx !== -1) {
                        // Magnetic Logic: Bias direction towards mouse
                        let bestDir   = -1,
                            bestScore = -Infinity;

                        let weights = [1, 1, 1, 1, 1, 1];

                        if (me.mouse.x !== -1000) {
                            let cx = runners[idx],
                                cy = runners[idx + 1];

                            for (let d = 0; d < 6; d++) {
                                let deg  = 30 + (d * 60),
                                    rad  = deg * Math.PI / 180,
                                    jump = HEX_SIZE * s * Math.sqrt(3),
                                    tx   = cx + Math.cos(rad) * jump,
                                    ty   = cy + Math.sin(rad) * jump;

                                let distSq = (tx - me.mouse.x) ** 2 + (ty - me.mouse.y) ** 2;
                                weights[d] += (100000 / (distSq + 100)) * 5;
                            }
                        }

                        let totalWeight = weights.reduce((a, b) => a + b, 0),
                            random      = Math.random() * totalWeight,
                            sum         = 0,
                            dir         = 0;

                        for (let d = 0; d < 6; d++) {
                            sum += weights[d];
                            if (random <= sum) {
                                dir = d;
                                break;
                            }
                        }

                        let deg  = 30 + (dir * 60),
                            rad  = deg * Math.PI / 180,
                            jump = HEX_SIZE * s * Math.sqrt(3),
                            cx   = runners[idx],
                            cy   = runners[idx + 1],
                            tx   = cx + Math.cos(rad) * jump,
                            ty   = cy + Math.sin(rad) * jump;

                        if (tx < -50 || tx > width + 50 || ty < -500 || ty > height + 50) {
                            me.resetRunner(i, width, height);
                            continue;
                        }

                        runners[idx + 2] = tx;
                        runners[idx + 3] = ty;
                        runners[idx + 4] = 0; // Reset progress
                    } else {
                        me.resetRunner(i, width, height);
                    }
                }
            }
            // STATE 1: SCANNING
            else if (state === 1) {
                // Increment Scan Time
                runners[idx + 9] += 0.02; // Scan speed

                // Visual Effect on Node (Pulse)
                let nodeIdx = runners[idx + 6];
                if (nodeIdx !== -1) {
                     nodes[nodeIdx + 5] = 0.5 + (Math.sin(runners[idx + 9] * 10) * 0.5); // Pulse Energy
                }

                // Scan Complete?
                if (runners[idx + 9] >= 1) {
                    runners[idx + 8] = 0; // Resume Moving

                    // THE PAYOFF: Massive BuildCharge injection
                    if (nodeIdx !== -1) {
                        nodes[nodeIdx + 6] += 5; // Instant Super Hex Trigger (>3)
                        nodes[nodeIdx + 5] = 1.0; // Max Energy
                        nodes[nodeIdx + 7] = runners[idx + 7]; // Color
                    }
                }
            }
        }
    }

    /**
     * Updates camera rotation based on mouse position.
     * Creates a "Floor Perspective" tilt effect.
     * @param {Number} width
     * @param {Number} height
     */
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

    /**
     * Updates the projection matrix based on current rotation and size.
     * @param {Number} width
     * @param {Number} height
     */
    updateProjection(width, height) {
        let me = this,
            pm = me.projectionMatrix;

        pm.cx   = width / 2;
        pm.cy   = height / 2;
        pm.cosX = Math.cos(me.rotation.x);
        pm.sinX = Math.sin(me.rotation.x);
        pm.cosY = Math.cos(me.rotation.y);
        pm.sinY = Math.sin(me.rotation.y);
    }

    /**
     * Projects a 3D point to 2D screen space using the cached matrix.
     * writes result to this.projectionPoint to avoid allocation.
     * @param {Number} x
     * @param {Number} y
     * @param {Number} z
     * @returns {Object} this.projectionPoint
     */
    project(x, y, z) {
        let me  = this,
            pm  = me.projectionMatrix,
            pp  = me.projectionPoint,
            fov = 1000,
            dx  = x - pm.cx,
            dy  = y - pm.cy,
            dz  = z;

        // Rotate Y
        let x1 = dx * pm.cosY - dz * pm.sinY;
        let z1 = dz * pm.cosY + dx * pm.sinY;

        // Rotate X
        let y2 = dy * pm.cosX - z1 * pm.sinX;
        let z2 = z1 * pm.cosX + dy * pm.sinX;

        // Project
        let scale = fov / (fov + z2);

        pp.x       = x1 * scale + pm.cx;
        pp.y       = y2 * scale + pm.cy;
        pp.scale   = scale;
        pp.visible = z2 > -fov; // Clip if behind camera

        return pp;
    }

    /**
     * Creates and caches gradients.
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        let me  = this,
            ctx = me.context;

        if (!ctx) {
            return;
        }

        const
            themeColors = me.constructor.colors[me.theme],
            gradient    = ctx.createLinearGradient(0, 0, width, height);

        gradient.addColorStop(0, themeColors.background[0]);
        gradient.addColorStop(1, themeColors.background[1]);

        me.gradients.bgGradient = gradient
    }

    /**
     * Handles canvas resize.
     * Re-calculates scale and re-initializes buffers.
     * @param {Object} size
     * @param {Number} size.height
     * @param {Number} size.width
     */
    updateSize(size) {
        let me        = this;
        me.canvasSize = size;
        me.scale      = Math.sqrt((size.width * size.height) / 2073600);

        if (me.context) {
            me.context.canvas.width  = size.width;
            me.context.canvas.height = size.height;
            me.cellBuffer            = null;
            me.runnerBuffer          = null;
            me.kernelBuffer          = null;
            me.strataBuffer          = null;
            me.debrisBuffer          = null;
            me.initNodes(size.width, size.height);
            me.updateResources(size.width, size.height)
        }
    }
}

export default Neo.setupClass(ServicesCanvas);
