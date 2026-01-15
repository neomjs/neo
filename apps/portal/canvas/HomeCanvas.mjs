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
        // We only connect nodes within the same layer or adjacent layers to reduce visual noise.
        for (let i = 0; i < count; i++) {
            let idx = i * STRIDE,
                l1  = buffer[idx + 5],
                p1  = getPos(idx, l1);

            for (let j = i + 1; j < count; j++) {
                let idx2 = j * STRIDE,
                    l2   = buffer[idx2 + 5];

                // Only connect if layers are close
                if (Math.abs(l1 - l2) > 1) continue;

                let p2     = getPos(idx2, l2),
                    dx     = p1.x - p2.x,
                    dy     = p1.y - p2.y,
                    distSq = dx*dx + dy*dy;

                // Max connection distance squared (e.g., 150px)
                if (distSq < 22500) {
                    let alpha = 1 - (Math.sqrt(distSq) / 150);

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
            let idx    = i * STRIDE,
                radius = buffer[idx + 4],
                layer  = buffer[idx + 5],
                pos    = getPos(idx, layer);

            // Mouse Repulsion Visualization (Highlight)
            let dx = pos.x - mx,
                dy = pos.y - my,
                dist = Math.sqrt(dx*dx + dy*dy),
                isHover = dist < 50;

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, isHover ? radius * 1.5 : radius, 0, Math.PI * 2);

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

        const
            buffer = me.nodeBuffer,
            mx     = me.mouse.x,
            my     = me.mouse.y;

        for (let i = 0; i < NODE_COUNT; i++) {
            let idx = i * STRIDE;

            // Mouse Repulsion
            if (mx !== -1000) {
                // Since we apply parallax in draw, we must estimate the node's VISUAL position
                // to apply the force correctly? No, physics should act on absolute position
                // relative to the "world". The mouse is in "screen" space.
                // For simplicity, we assume world == screen for physics interactions
                // (ignoring parallax for physics, or applying inverse parallax to mouse).
                // Let's just use raw coords for now, it's "close enough" for a background effect.

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

            // Drag / Friction (prevent infinite acceleration)
            buffer[idx + 2] *= 0.98;
            buffer[idx + 3] *= 0.98;

            // Ensure min velocity (ambient drift)
            if (Math.abs(buffer[idx + 2]) < 0.2) buffer[idx + 2] += (Math.random() - 0.5) * 0.05;
            if (Math.abs(buffer[idx + 3]) < 0.2) buffer[idx + 3] += (Math.random() - 0.5) * 0.05;

            // Move
            buffer[idx]     += buffer[idx + 2]; // x += vx
            buffer[idx + 1] += buffer[idx + 3]; // y += vy

            // Bounce
            if (buffer[idx] < 0) { buffer[idx] = 0; buffer[idx + 2] *= -1; }
            if (buffer[idx] > width) { buffer[idx] = width; buffer[idx + 2] *= -1; }
            if (buffer[idx + 1] < 0) { buffer[idx + 1] = 0; buffer[idx + 3] *= -1; }
            if (buffer[idx + 1] > height) { buffer[idx + 1] = height; buffer[idx + 3] *= -1; }
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
