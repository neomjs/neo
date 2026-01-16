import Base from '../../../src/core/Base.mjs';

const
    hasRaf    = typeof requestAnimationFrame === 'function',
    PRIMARY   = '#3E63DD', // Neo Blue
    SECONDARY = '#8BA6FF',
    HIGHLIGHT = '#00BFFF',
    GRID_COLS = 20,
    GRID_ROWS = 12,
    STRIDE    = 6; // x, y, baseX, baseY, phase, active

/**
 * @summary SharedWorker renderer for the Portal Services "Architect's Grid" background.
 *
 * Implements a 3D-like oscillating geometric lattice representing Structure, Stability, and Engineering.
 *
 * **Visual Architecture:**
 * 1. **The Grid:** A structured triangular mesh that gently undulates, symbolizing the
 *    robust and predictable nature of Neo.mjs architecture.
 * 2. **Wave Motion:** A sine-wave propagation creating a calming, "breathing" effect.
 * 3. **Interaction:** Mouse proximity illuminates the connections and slightly disturbs the mesh,
 *    representing guidance and responsiveness.
 *
 * **Responsive Architecture:**
 * Uses the same **Reference Viewport Strategy** as HomeCanvas to ensure consistent density
 * and physics across all device sizes.
 *
 * @class Portal.canvas.ServicesCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class ServicesCanvas extends Base {
    static colors = {
        dark: {
            background: ['rgba(30, 30, 35, 1)', 'rgba(20, 20, 25, 1)'], // Deep dark
            line      : 'rgba(255, 255, 255, 0.05)',
            lineActive: 'rgba(255, 255, 255, 0.4)',
            node      : 'rgba(255, 255, 255, 0.1)',
            nodeActive: '#FFFFFF'
        },
        light: {
            background: ['rgba(255, 255, 255, 1)', 'rgba(245, 247, 255, 1)'],
            line      : 'rgba(62, 99, 221, 0.15)', // Increased from 0.08 for visibility
            lineActive: 'rgba(62, 99, 221, 0.6)',
            node      : 'rgba(62, 99, 221, 0.25)',
            nodeActive: '#3E63DD'
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
         * @member {Object} remote
         * @protected
         */
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
     * @member {String|null} canvasId=null
     */
    canvasId = null
    /**
     * @member {Object|null} canvasSize=null
     */
    canvasSize = null
    /**
     * @member {OffscreenCanvasRenderingContext2D|null} context=null
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
     * @member {Float32Array|null} nodeBuffer=null
     */
    nodeBuffer = null
    /**
     * @member {Number} scale=1
     */
    scale = 1
    /**
     * @member {Number} time=0
     */
    time = 0

    /**
     * Clears the graph state.
     */
    clearGraph() {
        let me = this;
        me.context    = null;
        me.canvasId   = null;
        me.canvasSize = null;
        me.nodeBuffer = null;
        me.isPaused   = false;
        me.gradients  = {};
        me.scale      = 1
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetTheme(value, oldValue) {
        let me = this;
        if (value && me.canvasSize) {
            me.updateResources(me.canvasSize.width, me.canvasSize.height)
        }
    }

    /**
     * @param {String} value
     */
    setTheme(value) {
        this.theme = value
    }

    /**
     * Draws the mesh.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawGraph(ctx, width, height) {
        let me = this;

        if (!me.nodeBuffer) return;

        const
            buffer      = me.nodeBuffer,
            cols        = GRID_COLS + 1,
            rows        = GRID_ROWS + 1,
            themeColors = me.constructor.colors[me.theme],
            s           = me.scale;

        ctx.lineWidth = 1 * s;
        ctx.lineCap   = 'round';

        // Draw connections
        // We iterate and draw lines to right neighbor and bottom neighbor
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let i   = r * cols + c,
                    idx = i * STRIDE,
                    x   = buffer[idx],
                    y   = buffer[idx + 1],
                    act = buffer[idx + 5];

                // Draw Node
                let radius = (act > 0 ? 3 : 1.5) * s;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = act > 0 ? themeColors.nodeActive : themeColors.node;
                ctx.fill();

                // Connect Right
                if (c < cols - 1) {
                    let nextIdx = (i + 1) * STRIDE,
                        nx      = buffer[nextIdx],
                        ny      = buffer[nextIdx + 1],
                        nAct    = buffer[nextIdx + 5];

                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(nx, ny);
                    // Light up line if either node is active
                    ctx.strokeStyle = (act > 0 || nAct > 0) ? themeColors.lineActive : themeColors.line;
                    ctx.stroke();
                }

                // Connect Bottom
                if (r < rows - 1) {
                    let nextIdx = (i + cols) * STRIDE,
                        nx      = buffer[nextIdx],
                        ny      = buffer[nextIdx + 1],
                        nAct    = buffer[nextIdx + 5];

                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(nx, ny);
                    ctx.strokeStyle = (act > 0 || nAct > 0) ? themeColors.lineActive : themeColors.line;
                    ctx.stroke();
                }

                // Connect Diagonal (Bottom Right) - for triangular mesh look
                if (r < rows - 1 && c < cols - 1) {
                     let nextIdx = ((r + 1) * cols + (c + 1)) * STRIDE,
                        nx      = buffer[nextIdx],
                        ny      = buffer[nextIdx + 1],
                        nAct    = buffer[nextIdx + 5];

                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(nx, ny);
                    ctx.strokeStyle = (act > 0 || nAct > 0) ? themeColors.lineActive : themeColors.line;
                    ctx.stroke();
                }
            }
        }
    }

    /**
     * @param {Object} opts
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
     * Initializes the grid nodes.
     * @param {Number} width
     * @param {Number} height
     */
    initNodes(width, height) {
        let me = this;

        const
            cols   = GRID_COLS + 1,
            rows   = GRID_ROWS + 1,
            count  = cols * rows;

        if (!me.nodeBuffer) {
            me.nodeBuffer = new Float32Array(count * STRIDE);
        }

        const
            buffer = me.nodeBuffer,
            s      = me.scale,
            // Calculate cell size to cover screen with some padding
            cellW  = (width * 1.2) / GRID_COLS,
            cellH  = (height * 1.2) / GRID_ROWS,
            offX   = -width * 0.1, // Start off-screen
            offY   = -height * 0.1;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let i   = r * cols + c,
                    idx = i * STRIDE,
                    bx  = offX + c * cellW,
                    by  = offY + r * cellH;

                buffer[idx]     = bx;
                buffer[idx + 1] = by;
                buffer[idx + 2] = bx; // Base X
                buffer[idx + 3] = by; // Base Y
                // Phase based on distance from center (Ripple)
                let cx = width / 2, cy = height / 2;
                let dist = Math.sqrt((bx - cx)**2 + (by - cy)**2);
                buffer[idx + 4] = dist * 0.005; // Phase
                buffer[idx + 5] = 0; // Active
            }
        }
    }

    /**
     * Pauses the simulation.
     */
    pause() {
        this.isPaused = true
    }

    /**
     * Resumes the simulation.
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

        if (!me.context || me.isPaused) return;

        const
            ctx    = me.context,
            width  = me.canvasSize?.width  || 100,
            height = me.canvasSize?.height || 50;

        me.time += 0.02;

        if (!me.nodeBuffer) me.initNodes(width, height);

        me.updatePhysics(width, height);

        ctx.clearRect(0, 0, width, height);

        // Draw Background
        if (me.gradients.bgGradient) {
            ctx.fillStyle = me.gradients.bgGradient;
            ctx.fillRect(0, 0, width, height)
        }

        me.drawGraph(ctx, width, height);

        if (hasRaf) {
            requestAnimationFrame(me.renderLoop)
        } else {
            setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    /**
     * Updates physics (Oscillation + Interaction).
     * @param {Number} width
     * @param {Number} height
     */
    updatePhysics(width, height) {
        let me = this;
        if (!me.nodeBuffer) return;

        const
            buffer = me.nodeBuffer,
            count  = buffer.length / STRIDE,
            mx     = me.mouse.x,
            my     = me.mouse.y,
            s      = me.scale;

        for (let i = 0; i < count; i++) {
            let idx   = i * STRIDE,
                baseX = buffer[idx + 2],
                baseY = buffer[idx + 3],
                phase = buffer[idx + 4];

            // 1. Vertical Oscillation (Breathing Wave)
            let waveY = Math.sin(me.time + phase) * 15 * s;
            let waveX = Math.cos(me.time * 0.5 + phase) * 10 * s;

            let targetX = baseX + waveX,
                targetY = baseY + waveY;

            // 2. Mouse Interaction (Repulsion/Attraction)
            let act = 0;
            if (mx !== -1000) {
                let dx     = targetX - mx,
                    dy     = targetY - my,
                    distSq = dx*dx + dy*dy;

                if (distSq < 40000 * s * s) { // 200px radius
                    let dist = Math.sqrt(distSq),
                        force = (200 * s - dist) / (200 * s);

                    // Gentle push away
                    targetX += (dx / dist) * force * 30 * s;
                    targetY += (dy / dist) * force * 30 * s;
                    act = force; // Activity level
                }
            }

            buffer[idx + 5] = act;

            // 3. Smooth Lerp to Target (Soft physics)
            buffer[idx]     += (targetX - buffer[idx]) * 0.1;
            buffer[idx + 1] += (targetY - buffer[idx + 1]) * 0.1;
        }
    }

    /**
     * @param {Object} data
     */
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

    /**
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
     */
    updateSize(size) {
        let me = this;
        me.canvasSize = size;
        me.scale = Math.sqrt((size.width * size.height) / 2073600);

        if (me.context) {
            me.context.canvas.width  = size.width;
            me.context.canvas.height = size.height;
            me.initNodes(size.width, size.height);
            me.updateResources(size.width, size.height)
        }
    }
}

export default Neo.setupClass(ServicesCanvas);
