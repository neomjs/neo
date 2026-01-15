import Base from '../../../src/core/Base.mjs';

const
    PRIMARY    = '#3E63DD',
    SECONDARY  = '#8BA6FF',
    HIGHLIGHT  = '#40C4FF',
    NODE_COUNT = 150,
    STRIDE     = 6; // x, y, vx, vy, radius, layer

/**
 * @summary SharedWorker renderer for the Portal Home "Neural Connectome" background.
 *
 * Handles the physics simulation and rendering loop for the 2.5D network visualization.
 * Uses a Zero-Allocation strategy (pre-allocated buffers) for high performance.
 *
 * **Buffer Layout (Float32Array):**
 * [x, y, vx, vy, radius, layer, ...]
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
        me.context    = null;
        me.canvasId   = null;
        me.canvasSize = null;
        me.nodeBuffer = null;
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
            count  = NODE_COUNT;

        ctx.lineWidth = 1;

        // 1. Draw Connections (behind nodes)
        // We only connect nodes within the same layer or adjacent layers to reduce visual noise.
        // Optimization: Double loop, but limited by distance check.
        for (let i = 0; i < count; i++) {
            let idx = i * STRIDE,
                x1  = buffer[idx],
                y1  = buffer[idx + 1],
                l1  = buffer[idx + 5];

            for (let j = i + 1; j < count; j++) {
                let idx2 = j * STRIDE,
                    x2   = buffer[idx2],
                    y2   = buffer[idx2 + 1],
                    l2   = buffer[idx2 + 5];

                // Only connect if layers are close
                if (Math.abs(l1 - l2) > 1) continue;

                let dx = x1 - x2,
                    dy = y1 - y2,
                    distSq = dx*dx + dy*dy;

                // Max connection distance squared (e.g., 150px)
                if (distSq < 22500) {
                    let alpha = 1 - (Math.sqrt(distSq) / 150);

                    // Fade out connections based on layer depth
                    alpha *= (0.2 + (l1 * 0.1));

                    ctx.beginPath();
                    ctx.strokeStyle = l1 === 2 ? PRIMARY : SECONDARY; // Front layer is darker/bolder
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }
        }

        // 2. Draw Nodes
        for (let i = 0; i < count; i++) {
            let idx    = i * STRIDE,
                x      = buffer[idx],
                y      = buffer[idx + 1],
                radius = buffer[idx + 4],
                layer  = buffer[idx + 5];

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);

            // Color based on layer
            if (layer === 2) {
                ctx.fillStyle = PRIMARY;
                ctx.globalAlpha = 0.8;
            } else if (layer === 1) {
                ctx.fillStyle = SECONDARY;
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
     * Initializes or resets the node buffer.
     * @param {Number} width
     * @param {Number} height
     */
    initNodes(width, height) {
        let me = this;

        if (!me.nodeBuffer) {
            me.nodeBuffer = new Float32Array(NODE_COUNT * STRIDE);
        }

        const buffer = me.nodeBuffer;

        for (let i = 0; i < NODE_COUNT; i++) {
            let idx = i * STRIDE,
                layer = Math.floor(Math.random() * 3); // 0, 1, 2

            buffer[idx]     = Math.random() * width;  // x
            buffer[idx + 1] = Math.random() * height; // y
            buffer[idx + 2] = (Math.random() - 0.5) * 0.5; // vx
            buffer[idx + 3] = (Math.random() - 0.5) * 0.5; // vy
            buffer[idx + 4] = 2 + (layer * 1.5); // radius: bigger for front layers
            buffer[idx + 5] = layer; // layer
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

        if (!me.context) {
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

        // Physics Step
        me.updatePhysics(width, height);

        ctx.clearRect(0, 0, width, height);

        // Draw Network
        me.drawNetwork(ctx, width, height);

        setTimeout(me.renderLoop, 1000 / 60)
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
     * Updates node positions and handles boundary collisions.
     * @param {Number} width
     * @param {Number} height
     */
    updatePhysics(width, height) {
        let me = this;

        if (!me.nodeBuffer) return;

        const buffer = me.nodeBuffer;

        for (let i = 0; i < NODE_COUNT; i++) {
            let idx = i * STRIDE;

            // Move
            buffer[idx]     += buffer[idx + 2]; // x += vx
            buffer[idx + 1] += buffer[idx + 3]; // y += vy

            // Bounce
            if (buffer[idx] < 0 || buffer[idx] > width)  buffer[idx + 2] *= -1;
            if (buffer[idx + 1] < 0 || buffer[idx + 1] > height) buffer[idx + 3] *= -1;
        }
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
        }
    }
}

export default Neo.setupClass(HomeCanvas);
