import Base from '../../../src/core/Base.mjs';

const
    TWO_PI     = Math.PI * 2,
    PRIMARY    = '#3E63DD',
    SECONDARY  = '#8BA6FF',
    HIGHLIGHT  = '#40C4FF';

/**
 * @summary SharedWorker renderer for the HeaderToolbar overlay.
 * @class Portal.canvas.HeaderCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class HeaderCanvas extends Base {
    static config = {
        /**
         * @member {String} className='Portal.canvas.HeaderCanvas'
         * @protected
         */
        className: 'Portal.canvas.HeaderCanvas',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'clearGraph',
                'initGraph',
                'updateGraphData',
                'updateMouseState',
                'updateNavRects',
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
     * @member {Object[]} navRects=[]
     */
    navRects = []
    /**
     * @member {Object[]} shockwaves=[]
     */
    shockwaves = []
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
        me.navRects   = [];
        me.shockwaves = []
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
                hasChange && me.renderLoop()
            } else {
                setTimeout(checkCanvas, 50)
            }
        };
        checkCanvas()
    }

    /**
     * @member {Function} renderLoop=this.render.bind(this)
     */
    renderLoop = this.render.bind(this)

    /**
     * Main render loop
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

        me.time += 0.05;

        ctx.clearRect(0, 0, width, height);

        // 1. Draw Ambient Background
        me.drawAmbientBackground(ctx, width, height);

        // 2. Draw "Auras" (Hover Effects)
        me.drawAuras(ctx, width, height);

        // 3. Draw "Shockwaves" (Click Effects)
        me.drawShockwaves(ctx, width);

        // Keep loop running if there's activity or just always for ambient?
        // Let's keep it running for ambient wave effects.
        // We use setTimeout for SharedWorker compatibility (no rAF).
        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * Draws a subtle, large-scale background Helix pattern.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawAmbientBackground(ctx, width, height) {
        let me = this,
            t  = me.time * 0.5, // Slower movement for background
            centerY = height / 2,
            amp     = height * 0.4; // Large amplitude

        // Create Gradients for the background strands
        const grad1 = ctx.createLinearGradient(0, 0, width, 0);
        grad1.addColorStop(0,   'rgba(62, 99, 221, 0.1)');  // Primary low alpha
        grad1.addColorStop(0.5, 'rgba(64, 196, 255, 0.2)'); // Highlight low alpha
        grad1.addColorStop(1,   'rgba(62, 99, 221, 0.1)');

        const grad2 = ctx.createLinearGradient(0, 0, width, 0);
        grad2.addColorStop(0,   'rgba(139, 166, 255, 0.1)'); // Secondary low alpha
        grad2.addColorStop(0.5, 'rgba(64, 196, 255, 0.2)'); // Highlight low alpha
        grad2.addColorStop(1,   'rgba(139, 166, 255, 0.1)');

        ctx.lineWidth = 15; // Wide, soft lines
        ctx.lineCap   = 'round';

        // --- Background Helix 1 ---
        ctx.strokeStyle = grad1;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 10) {
            let y = centerY + Math.sin((x * 0.01) + t) * amp;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // --- Background Helix 2 ---
        ctx.strokeStyle = grad2;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 10) {
            let y = centerY + Math.sin((x * 0.01) + t + Math.PI) * amp; // Inverted phase
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    /**
     * Draws a continuous "Split Stream" that flows across the header,
     * diverting around buttons and reacting to hover.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawAuras(ctx, width, height) {
        let me = this;

        if (!Array.isArray(me.navRects)) {
            return
        }

        const
            padding  = 10,
            maxH     = (height - (padding * 2)) / 2, // Max amplitude allowed
            centerY  = height / 2,
            step     = 2, // px - smoother
            baseAmp  = Math.min(5, maxH), // Idle amplitude
            hoverAmp = 4; // Additional noise amp

        // Create Gradients
        const grad1 = ctx.createLinearGradient(0, 0, width, 0);
        grad1.addColorStop(0,   PRIMARY);
        grad1.addColorStop(0.5, HIGHLIGHT);
        grad1.addColorStop(1,   PRIMARY);

        const grad2 = ctx.createLinearGradient(0, 0, width, 0);
        grad2.addColorStop(0,   SECONDARY);
        grad2.addColorStop(0.5, HIGHLIGHT);
        grad2.addColorStop(1,   SECONDARY);

        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.shadowBlur  = 10;

        // --- Strand A (Top / Sine) ---
        ctx.strokeStyle = grad1;
        ctx.shadowColor = PRIMARY;
        ctx.beginPath();

        for (let x = 0; x <= width; x += step) {
            let {offsetY, intensity} = me.getStreamOffset(x, height);

            // Helix motion: sin(x - time)
            let timeShift = me.time * 2,
                sine      = Math.sin((x * 0.04) - timeShift) * baseAmp,
                noise     = (Math.random() - 0.5) * hoverAmp * intensity;

            // When offsetting (diverting), we subtract offsetY to go UP
            let y = centerY + sine - offsetY + noise;

            if (x === 0) ctx.moveTo(x, y);
            else         ctx.lineTo(x, y);
        }
        ctx.stroke();

        // --- Strand B (Bottom / Cosine or Inverted Sine) ---
        ctx.strokeStyle = grad2;
        ctx.shadowColor = SECONDARY;
        ctx.beginPath();

        for (let x = 0; x <= width; x += step) {
            let {offsetY, intensity} = me.getStreamOffset(x, height);

            // Inverted Helix: sin(x - time + PI)
            let timeShift = me.time * 2,
                sine      = Math.sin((x * 0.04) - timeShift + Math.PI) * baseAmp,
                noise     = (Math.random() - 0.5) * hoverAmp * intensity;

            // When offsetting, we add offsetY to go DOWN
            let y = centerY + sine + offsetY + noise;

            if (x === 0) ctx.moveTo(x, y);
            else         ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.shadowBlur = 0;
    }

    /**
     * Calculates the vertical diversion needed at a given X to avoid buttons.
     * @param {Number} x
     * @param {Number} height (Canvas height)
     * @returns {Object} {offsetY, intensity}
     */
    getStreamOffset(x, height) {
        let me        = this,
            offsetY   = 0,
            intensity = 0; // 0 to 1 (Hover magnitude)

        const
            verticalPadding = 10,
            maxSafeOffset   = (height / 2) - verticalPadding;

        // Check against all buttons
        // Optimization: In a real app with many items, we'd use a spatial map/grid.
        // For a header with < 20 items, loop is fine.

        for (const rect of me.navRects) {
            // Buffer zone for smooth transition
            const buffer = 40;

            if (x >= rect.x - buffer && x <= rect.x + rect.width + buffer) {
                // We are inside the influence zone of this button

                // 1. Calculate Envelope (0 at edges, 1 at center)
                // Use cosine or parabola for smooth "bubble" shape
                const
                    centerX = rect.x + rect.width / 2,
                    span    = (rect.width / 2) + buffer,
                    distX   = Math.abs(x - centerX);

                if (distX < span) {
                    // Smooth envelope: (1 + cos(pi * dist / span)) / 2
                    // This creates a bell curve from 0 to 1 to 0
                    let envelope = (1 + Math.cos(Math.PI * distX / span)) / 2;

                    // Target diversion: Half button height + padding
                    // CLAMP: We cap the target offset to what is physically safe
                    let targetOffset = Math.min((rect.height / 2) + 4, maxSafeOffset);

                    // Add to total offset (using max to handle overlaps cleanly)
                    offsetY = Math.max(offsetY, targetOffset * envelope);

                    // 2. Check Mouse Intensity
                    // Is mouse hovering THIS button?
                    // Or is mouse near this X?
                    // Let's rely on button proximity.

                    // Distance from mouse to button center
                    let dx = me.mouse.x - centerX,
                        dy = me.mouse.y - (rect.y + rect.height/2),
                        distMouse = Math.sqrt(dx*dx + dy*dy);

                    // If mouse is near this button, boost intensity
                    if (distMouse < Math.max(rect.width, rect.height)) {
                        intensity = Math.max(intensity, 1 - (distMouse / 150));
                    }
                }
            }
        }

        // Ensure baseline separation (Helix effect in empty space)
        // Let's say we always want *some* separation or keep them crossing?
        // Let's keep offsetY=0 in empty space for crossing strands.

        return {offsetY, intensity};
    }

    /**
     * Draws expanding shockwaves from clicks.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     */
    drawShockwaves(ctx, width) {
        let me = this;

        for (let i = me.shockwaves.length - 1; i >= 0; i--) {
            let wave = me.shockwaves[i];

            wave.age += 1;

            let progress = wave.age / wave.life;

            if (progress >= 1) {
                me.shockwaves.splice(i, 1);
                continue;
            }

            // Draw two lines propagating out from the click point
            let xLeft  = wave.x - (wave.speed * wave.age),
                xRight = wave.x + (wave.speed * wave.age),
                alpha  = 1 - progress;

            ctx.beginPath();
            ctx.strokeStyle = HIGHLIGHT; // Use constant
            ctx.globalAlpha = alpha;     // Fade out via globalAlpha
            ctx.lineWidth   = 4 * (1 - progress);

            // Left Wave
            if (xLeft > 0) {
                ctx.moveTo(xLeft, 0);
                ctx.quadraticCurveTo(xLeft - 20, me.canvasSize.height / 2, xLeft, me.canvasSize.height);
            }

            // Right Wave
            if (xRight < width) {
                ctx.moveTo(xRight, 0);
                ctx.quadraticCurveTo(xRight + 20, me.canvasSize.height / 2, xRight, me.canvasSize.height);
            }

            ctx.stroke();
            ctx.globalAlpha = 1; // Reset
        }
    }

    /**
     * @param {Object} data
     */
    updateGraphData(data) {
        // Not used yet, but kept for interface consistency
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
                    life : 60, // frames
                    speed: 15  // px per frame
                })
            }
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.rects
     */
    updateNavRects(data) {
        let rects = data?.rects;

        if (Array.isArray(rects)) {
            this.navRects = rects
        } else {
            this.navRects = []
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
            me.context.canvas.height = size.height
        }
    }
}

export default Neo.setupClass(HeaderCanvas);