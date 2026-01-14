import Base from '../../../src/core/Base.mjs';

const
    TWO_PI = Math.PI * 2,
    WAVE_COLOR = 'rgba(64, 196, 255, 0.8)'; // Neo Blue

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

        // 1. Draw "Auras" (Hover Effects)
        me.drawAuras(ctx, width, height);

        // 2. Draw "Shockwaves" (Click Effects)
        me.drawShockwaves(ctx, width);

        // Keep loop running if there's activity or just always for ambient?
        // Let's keep it running for ambient wave effects.
        // We use setTimeout for SharedWorker compatibility (no rAF).
        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * Draws interactive frequency waves under/around hovered items.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawAuras(ctx, width, height) {
        let me = this;

        if (!Array.isArray(me.navRects)) {
            return
        }

        me.navRects.forEach(rect => {
            // Check if mouse is interacting with this rect (with some padding)
            let dx = me.mouse.x - (rect.x + rect.width / 2),
                dy = me.mouse.y - (rect.y + rect.height / 2),
                dist = Math.sqrt(dx * dx + dy * dy),
                maxDist = Math.max(rect.width, rect.height) * 1.5;

            if (dist < maxDist) {
                // Calculate intensity based on proximity
                let intensity = 1 - (dist / maxDist);
                intensity = Math.max(0, intensity);

                // Draw Sonic Wave Underline
                ctx.beginPath();
                ctx.strokeStyle = WAVE_COLOR;
                ctx.lineWidth = 2;

                let startX = rect.x,
                    endX   = rect.x + rect.width,
                    y      = rect.y + rect.height, // Bottom of the button
                    steps  = 20,
                    stepX  = (endX - startX) / steps;

                ctx.moveTo(startX, y);

                for (let i = 0; i <= steps; i++) {
                    let cx = startX + (i * stepX);
                    // Sine wave logic
                    // Frequency increases with intensity
                    // Amplitude increases with intensity
                    // Phase shifts with time
                    let waveY = y + Math.sin((i * 0.5) + (me.time * 2)) * (5 * intensity);
                    
                    // Add some noise/jitter for "Sonic" feel?
                    // waveY += (Math.random() - 0.5) * 2 * intensity;

                    ctx.lineTo(cx, waveY);
                }
                
                // Fade out at edges
                ctx.globalAlpha = intensity;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        })
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
            ctx.strokeStyle = `rgba(64, 196, 255, ${alpha})`;
            ctx.lineWidth = 4 * (1 - progress); // Thins out
            
            // Draw a vertical "sonic boom" line? Or a circle?
            // "Sonic waves" -> vertical curved lines traveling outwards
            
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
     * @param {Object[]} rects
     */
    updateNavRects(rects) {
        if (Array.isArray(rects)) {
            this.navRects = rects
        } else {
            // console.warn('HeaderCanvas.updateNavRects: Invalid input', rects);
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