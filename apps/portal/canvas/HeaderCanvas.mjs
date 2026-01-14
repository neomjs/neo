import Base from '../../../src/core/Base.mjs';

const
    TWO_PI     = Math.PI * 2,
    PRIMARY    = '#3E63DD',
    SECONDARY  = '#8BA6FF',
    HIGHLIGHT  = '#40C4FF';

/**
 * @summary SharedWorker renderer for the HeaderToolbar overlay.
 *
 * Implements the **"Luminous Flux"** visual theme, an ambient, interactive energy simulation that
 * serves as the backdrop for the Portal header.
 *
 * **Visual Architecture:**
 * 1. **Neo Ether (Background):** A volumetric particle field composed of faint "dust" and larger "nebula" orbs.
 *    This provides atmospheric depth, fluid interactivity (mouse repulsion), and bridges the contrast gap
 *    between the white background and the foreground elements.
 * 2. **Ambient Helix (Midground):** A large-scale, slow-moving sine wave pattern that provides structural
 *    texture to the negative space.
 * 3. **Split Stream (Foreground):** Two intertwined energy strands (Helix/DNA) that flow across the canvas.
 *    - **Adaptive Geometry:** The strands flow loosely around text buttons but tighten into a "high-gravity orbit"
 *      around social icons (circular buttons).
 *    - **Dynamic Life:** The strands "breathe" (amplitude modulation) and "shimmer" (opacity pulse) to feel alive.
 *    - **Interactive Warp:** The frequency modulates (bunches up) around user interaction points.
 *
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
     * @member {Object[]} particles=[]
     */
    particles = []
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
        me.particles  = [];
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
                me.initParticles(canvas.width, canvas.height); // Init particles
                hasChange && me.renderLoop()
            } else {
                setTimeout(checkCanvas, 50)
            }
        };
        checkCanvas()
    }

    /**
     * @param {Number} width
     * @param {Number} height
     */
    initParticles(width, height) {
        let me = this;
        me.particles = [];
        const count = 60;

        for (let i = 0; i < count; i++) {
            let isNebula = Math.random() > 0.8; // 20% are large nebula orbs

            me.particles.push({
                isNebula : isNebula,
                x        : Math.random() * width,
                y        : Math.random() * height,
                vx       : isNebula ? (Math.random() * 0.2 + 0.05) : (Math.random() * 0.5 + 0.1), // Nebulae move slower
                vy       : (Math.random() - 0.5) * 0.2,
                size     : isNebula ? (Math.random() * 30 + 20) : (Math.random() * 2 + 0.5), // Large vs Small
                alpha    : isNebula ? (Math.random() * 0.15 + 0.1) : (Math.random() * 0.3 + 0.1), // BOOSTED ALPHA
                baseAlpha: isNebula ? (Math.random() * 0.15 + 0.1) : (Math.random() * 0.3 + 0.1)
            })
        }
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

        // Auto-reinit particles if size changes significantly or empty OR count mismatch (config update)
        if (me.particles.length !== 60) {
            me.initParticles(width, height)
        }

        ctx.clearRect(0, 0, width, height);

        // 1. Draw Ambient Background
        me.drawAmbientBackground(ctx, width, height);

        // 2. Draw Ether Particles (Background Layer)
        me.drawParticles(ctx, width, height);

        // 3. Draw "Auras" (Hover Effects) => 3D Ribbon + Neon Tube
        me.drawAuras(ctx, width, height);

        // 4. Draw "Shockwaves" (Click Effects)
        me.drawShockwaves(ctx, width);

        // Keep loop running if there's activity or just always for ambient?
        // Let's keep it running for ambient wave effects.
        // We use setTimeout for SharedWorker compatibility (no rAF).
        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * Calculates the points for the two energy strands based on physics and interaction.
     * Separating this from drawing allows us to use the same points for both the
     * Ribbon fill (between strands) and the Neon stroke (on top of strands).
     *
     * @param {Number} width
     * @param {Number} height
     * @returns {Object} {pointsA: [], pointsB: [], shimmerA: Number, shimmerB: Number}
     */
    calculateStrandPoints(width, height) {
        let me = this;

        if (!Array.isArray(me.navRects)) {
            return {pointsA: [], pointsB: [], shimmerA: 0, shimmerB: 0}
        }

        const
            pointsA = [],
            pointsB = [],
            step    = 2,
            centerY = height / 2,
            padding = 10,
            maxH    = (height - (padding * 2)) / 2,
            // BREATHING: Modulate base amplitude over time (slow pulse)
            breath   = Math.sin(me.time * 0.5) * 2,
            baseAmp  = Math.min(6 + breath, maxH),
            hoverAmp = 4;

        // REF 1: Linked Phase - Shimmer leads Breath by 90deg ("Charging up")
        let baseShimmer = 0.75 + (Math.sin(me.time * 0.5 + Math.PI / 2) * 0.25);

        // REF 2: Independent Strand Shimmer
        let shimmerA = baseShimmer,
            shimmerB = 0.75 + (Math.sin(me.time * 0.5 + Math.PI / 2 + Math.PI / 3) * 0.25);

        for (let x = 0; x <= width; x += step) {
            let {offsetY, intensity, isIconZone} = me.getStreamOffset(x, height);

            // FREQUENCY MODULATION:
            let freqMod   = Math.sin(x * 0.002 + me.time * 0.1) * (20 + (intensity * 10)),
                timeShift = me.time * 2;

            // DAMPING FOR ICONS:
            let localAmp = baseAmp * (1 - (isIconZone * 0.6));

            // Noise (Randomness) needs to be consistent for this x if we want smooth
            // but since we clear canvas every frame, random is fine as long as
            // Fill and Stroke use the SAME random value.
            // That's why we calculate points once.
            let noiseA = (Math.random() - 0.5) * hoverAmp * intensity,
                noiseB = (Math.random() - 0.5) * hoverAmp * intensity;

            let sine  = Math.sin(((x + freqMod) * 0.04) - timeShift) * localAmp,
                sineB = Math.sin(((x + freqMod) * 0.04) - timeShift + Math.PI) * localAmp; // Inverted

            pointsA.push({x, y: centerY + sine - offsetY + noiseA});
            pointsB.push({x, y: centerY + sineB + offsetY + noiseB});
        }

        return {pointsA, pointsB, shimmerA, shimmerB}
    }

    /**
     * Draws the "Ether" particle field to add volumetric depth and interactivity.
     *
     * **Intent:**
     * Creates a living, breathing atmosphere ("Neo Ether") that fills the negative space.
     * This bridges the visual gap between the stark white background and the high-contrast foreground lines.
     *
     * **Physics:**
     * - **Drift:** Particles move with a constant `vx` to simulate data flow or wind.
     * - **Repulsion:** The mouse cursor acts as a "repulsor field," pushing particles away and brightening them
     *   to create a "hole" in the fog.
     * - **Nebulae:** Large, faint particles create a "fog" effect, while small, bright particles act as "dust."
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawParticles(ctx, width, height) {
        let me = this;

        me.particles.forEach(p => {
            // Update Position
            p.x += p.vx;
            p.y += p.vy;

            // Wrap around
            if (p.x > width + p.size) p.x = -p.size;
            if (p.x < -p.size)        p.x = width + p.size;
            if (p.y > height + p.size) p.y = -p.size;
            if (p.y < -p.size)         p.y = height + p.size;

            // Mouse Interaction (Repulsion)
            let dx = p.x - me.mouse.x,
                dy = p.y - me.mouse.y,
                dist = Math.sqrt(dx*dx + dy*dy),
                maxDist = p.isNebula ? 150 : 100;

            if (dist < maxDist && dist > 0) {
                let force = (maxDist - dist) / maxDist;
                // Push away
                let mass = p.isNebula ? 5 : 1;
                p.x += (dx / dist) * force * (2 / mass);
                p.y += (dy / dist) * force * (2 / mass);
                // Brighten slightly
                p.alpha = Math.min(p.baseAlpha + force * (p.isNebula ? 0.05 : 0.5), 0.8);
            } else {
                // Return to base alpha
                if (p.alpha > p.baseAlpha) {
                    p.alpha -= 0.005
                }
            }

            ctx.globalAlpha = p.alpha;
            ctx.beginPath();

            if (p.isNebula) {
                // Soft gradient for nebula
                let g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                g.addColorStop(0, HIGHLIGHT);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = HIGHLIGHT;
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        ctx.globalAlpha = 1;
    }

    /**
     * Draws a subtle, large-scale background Helix pattern.
     *
     * **Intent:**
     * Provides a structural backbone to the negative space. Unlike the particle field (which is chaotic),
     * this layer is ordered and rhythmic, reinforcing the "DNA/Helix" theme even in the background.
     *
     * **Visuals:**
     * Uses wide, very low opacity strokes to create a "depth of field" effect, appearing to be
     * far behind the sharp foreground strands.
     *
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
     * Draws the main foreground "Split Stream" energy strands with 3D effects.
     *
     * **3D Architecture:**
     * 1. **Ribbon Fill:** Draws a low-opacity gradient between Strand A and Strand B, creating a twisting surface.
     * 2. **Neon Tube (Outer):** The colored glow of the strands.
     * 3. **Neon Tube (Core):** A bright white inner core to simulate volumetric light.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawAuras(ctx, width, height) {
        let me = this;

        if (!Array.isArray(me.navRects)) return;

        // 1. Calculate Physics (Shared for Ribbon and Strands)
        const {pointsA, pointsB, shimmerA, shimmerB} = me.calculateStrandPoints(width, height);

        if (pointsA.length === 0) return;

        // Create Gradients
        const grad1 = ctx.createLinearGradient(0, 0, width, 0);
        grad1.addColorStop(0,   PRIMARY);
        grad1.addColorStop(0.5, HIGHLIGHT);
        grad1.addColorStop(1,   PRIMARY);

        const grad2 = ctx.createLinearGradient(0, 0, width, 0);
        grad2.addColorStop(0,   SECONDARY);
        grad2.addColorStop(0.5, HIGHLIGHT);
        grad2.addColorStop(1,   SECONDARY);

        // --- 2. RIBBON FILL (The 3D Surface) ---
        // We construct a shape that connects Strand A and Strand B
        const ribbonGrad = ctx.createLinearGradient(0, 0, width, 0);
        ribbonGrad.addColorStop(0,   'rgba(62, 99, 221, 0.05)'); // Very faint
        ribbonGrad.addColorStop(0.5, 'rgba(64, 196, 255, 0.1)'); // Slightly visible in center
        ribbonGrad.addColorStop(1,   'rgba(62, 99, 221, 0.05)');

        ctx.fillStyle = ribbonGrad;
        ctx.beginPath();
        // Move along Strand A forward
        ctx.moveTo(pointsA[0].x, pointsA[0].y);
        for (let i = 1; i < pointsA.length; i++) {
            ctx.lineTo(pointsA[i].x, pointsA[i].y);
        }
        // Move along Strand B backward
        for (let i = pointsB.length - 1; i >= 0; i--) {
            ctx.lineTo(pointsB[i].x, pointsB[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // --- 3. NEON STRANDS (Tube Effect) ---

        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';

        // Helper to draw a strand
        const drawStrand = (points, gradient, shimmer, color, isCore) => {
            ctx.beginPath();
            ctx.strokeStyle = isCore ? '#FFFFFF' : gradient;
            ctx.lineWidth   = isCore ? 1 : 3; // Core is thin, Glow is wide
            ctx.globalAlpha = isCore ? (shimmer + 0.2) : shimmer; // Core is brighter
            
            // Core doesn't need shadow, Glow does
            if (!isCore) {
                ctx.shadowBlur  = 10;
                ctx.shadowColor = color;
            } else {
                ctx.shadowBlur  = 0;
            }

            if (points.length > 0) {
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
            }
            ctx.stroke();
        };

        // Draw Glows (Outer Tube)
        drawStrand(pointsA, grad1, shimmerA, PRIMARY, false);
        drawStrand(pointsB, grad2, shimmerB, SECONDARY, false);

        // Draw Cores (Inner Filament) - The "3D Pop"
        // We draw these ON TOP of the glows for maximum contrast
        drawStrand(pointsA, null, shimmerA, null, true);
        drawStrand(pointsB, null, shimmerB, null, true);

        // Reset
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 1;
    }

    /**
     * Calculates the physics for diverting the stream around UI elements.
     *
     * **Logic:**
     * 1. **Detection:** Iterates through `navRects` to find if the current `x` is near a button.
     * 2. **Adaptive Geometry:**
     *    - **Text Buttons:** Uses a wide Cosine envelope for smooth flow.
     *    - **Icon Buttons:** Uses a sharp Cubed envelope (`Math.pow(x, 3)`) to create a "Tight Orbit" effect.
     * 3. **Vertical Clamping:** Ensures the diversion never pushes the wave off-canvas.
     *
     * @param {Number} x
     * @param {Number} height (Canvas height)
     * @returns {Object} {offsetY, intensity, isIconZone}
     */
    getStreamOffset(x, height) {
        let me        = this,
            offsetY   = 0,
            intensity = 0, // 0 to 1 (Hover magnitude)
            isIconZone = 0; // 0 to 1 (Proximity to an Icon Button)

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

                // DETECT SHAPE: Is this a square-ish icon or a wide text button?
                // Icons (Socials) are approx square. Text buttons are wide.
                const
                    ratio     = rect.width / rect.height,
                    isIcon    = ratio < 1.5, // Threshold for "Circle" vs "Rectangle"
                    centerX   = rect.x + rect.width / 2,
                    span      = (rect.width / 2) + buffer,
                    distX     = Math.abs(x - centerX);

                if (distX < span) {
                    let envelope;

                    if (isIcon) {
                        // TIGHT ORBIT (Sharper curve for icons)
                        let normDist = distX / span; // 0 to 1
                        envelope = Math.pow((1 + Math.cos(Math.PI * normDist)) / 2, 3); // Cubed for sharper falloff
                        isIconZone = Math.max(isIconZone, envelope); // Track if we are in an icon zone
                    } else {
                        // WIDE FLOW (Standard smooth curve for text)
                        envelope = (1 + Math.cos(Math.PI * distX / span)) / 2;
                    }

                    // Target diversion:
                    // For icons, we might want to go slightly CLOSER to the edge (less padding)
                    // Text buttons need more clearance.
                    let targetH = isIcon ? (rect.height / 2) : ((rect.height / 2) + 4);

                    // CLAMP: We cap the target offset to what is physically safe
                    let targetOffset = Math.min(targetH, maxSafeOffset);

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

        return {offsetY, intensity, isIconZone};
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
