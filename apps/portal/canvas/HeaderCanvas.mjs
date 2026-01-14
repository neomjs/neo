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
            centerY   = height / 2,
            step      = 3, // px
            baseAmp   = 3, // Idle amplitude
            hoverAmp  = 6; // Active amplitude noise

        ctx.strokeStyle = WAVE_COLOR;
        ctx.lineWidth   = 2;
        ctx.shadowBlur  = 5;
        ctx.shadowColor = WAVE_COLOR;

        ctx.beginPath();

        // We will draw TWO paths: Top Strand and Bottom Strand
        // To do this efficiently in one pass, we can store points or just draw twice?
        // Drawing twice is easier to read.

        // --- Top Strand ---
        for (let x = 0; x <= width; x += step) {
            let {offsetY, intensity} = me.getStreamOffset(x, height);
            
            // Base Sine Wave
            // If near button (offsetY > 0), the wave separates up.
            // If in open space (offsetY ~ 0), it flows near center.
            
            let timeShift = me.time * 2,
                sine      = Math.sin((x * 0.05) + timeShift) * baseAmp,
                noise     = (Math.random() - 0.5) * hoverAmp * intensity;
                
            let y = centerY + sine - offsetY + noise;
            
            if (x === 0) ctx.moveTo(x, y);
            else         ctx.lineTo(x, y);
        }
        ctx.stroke();

        // --- Bottom Strand ---
        ctx.beginPath();
        for (let x = 0; x <= width; x += step) {
            let {offsetY, intensity} = me.getStreamOffset(x, height);
            
            // Invert sine phase for "Helix" look in empty space?
            // Or same phase? Let's try offset phase.
            let timeShift = me.time * 2,
                sine      = Math.sin((x * 0.05) + timeShift + Math.PI) * baseAmp,
                noise     = (Math.random() - 0.5) * hoverAmp * intensity;

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
                    let targetOffset = (rect.height / 2) + 4;
                    
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