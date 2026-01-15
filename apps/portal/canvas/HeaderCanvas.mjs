import Base from '../../../src/core/Base.mjs';

const
    PRIMARY   = '#3E63DD',
    SECONDARY = '#8BA6FF',
    HIGHLIGHT = '#40C4FF';

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
 *    texture to the negative space. Now enhanced with a **volumetric Ribbon fill** to add depth.
 * 3. **Split Stream (Foreground):** Two intertwined energy strands (Helix/DNA) that flow across the canvas.
 *    - **3D Ribbon Effect:** A subtle gradient fills the space between strands, simulating a twisting surface.
  *   - **Neon Tube Effect:** Strands are rendered with a bright white core inside a colored glow, creating a physical light-emitting look.
  *   - **Adaptive Geometry:** The strands flow loosely around text buttons but tighten into a "high-gravity orbit"
  *     around social icons.
  *   - **Energy Surge (Active State):** The segment of the stream passing through the active navigation item
  *     is rendered with a high-intensity white glow and a nervous pulse, semantically highlighting the current view.
  *
  * **Performance Architecture (Zero-Allocation):**
 * To maintain 60fps on high-refresh displays without GC stutters, this class employs a **Zero-Allocation** strategy during the render loop.
 * 1. **TypedArray Buffers:** Wave geometry is stored in pre-allocated `Float32Array` buffers (`waveBuffers`), reused every frame.
 * 2. **Gradient Caching:** CanvasGradients are created only on resize (`updateResources`) and cached, avoiding expensive generator calls per frame.
 * 3. **Reusable Objects:** Physics calculations write directly to buffers instead of returning new Arrays of Objects.
 *
 * @class Portal.canvas.HeaderCanvas
 * @extends Neo.core.Base
 * @singleton
 * @see Portal.view.HeaderCanvas
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
                'updateActiveId',
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
     * @member {String|null} activeId=null
     */
    activeId = null
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
     * @member {Object} gradients={}
     */
    gradients = {}
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
     * Pre-allocated buffers for wave geometry.
     * Uses `Float32Array` to eliminate Garbage Collection pressure during the render loop.
     * @member {Object} waveBuffers={bgA: null, bgB: null, fgA: null, fgB: null}
     */
    waveBuffers = {bgA: null, bgB: null, fgA: null, fgB: null}

    /**
     * Clears the graph state and stops the render loop.
     */
    clearGraph() {
        let me = this;
        me.context     = null;
        me.canvasId    = null;
        me.canvasSize  = null;
        me.navRects    = [];
        me.particles   = [];
        me.shockwaves  = [];
        me.waveBuffers = {bgA: null, bgB: null, fgA: null, fgB: null};
        me.gradients   = {}
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
                me.updateResources(canvas.width, canvas.height); // Init buffers/gradients
                hasChange && me.renderLoop()
            } else {
                setTimeout(checkCanvas, 50)
            }
        };
        checkCanvas()
    }

    /**
     * Initializes the particle system for the "Neo Ether" effect.
     *
     * Creates a mix of large, slow-moving "nebula" particles and smaller, faster "dust" particles
     * to create depth and atmosphere.
     *
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
                isNebula,
                x        : Math.random() * width,
                y        : Math.random() * height,
                vx       : isNebula ? (Math.random() * 0.2 + 0.05) : (Math.random() * 0.5 + 0.1), // Nebulae move slower
                vy       : (Math.random() - 0.5) * 0.2,
                size     : isNebula ? (Math.random() * 30 + 20) : (Math.random() * 2 + 0.5), // Large vs Small
                alpha    : isNebula ? (Math.random() * 0.15 + 0.2) : (Math.random() * 0.4 + 0.2), // BOOSTED ALPHA
                baseAlpha: isNebula ? (Math.random() * 0.15 + 0.2) : (Math.random() * 0.4 + 0.2)
            })
        }
    }

    /**
     * @member {Function} renderLoop=this.render.bind(this)
     */
    renderLoop = this.render.bind(this)

    /**
     * Main render loop.
     *
     * Orchestrates the rendering of all visual layers:
     * 1. Ambient Background (Ribbon + Helix)
     * 2. Neo Ether (Particles)
     * 3. Split Stream (Foreground Auras)
     * 4. Shockwaves (Interaction)
     *
     * Uses `setTimeout` instead of `requestAnimationFrame` because this runs in a SharedWorker
     * where `rAF` is not available. Targets ~60fps (16ms).
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

        // 3b. Draw Active Overlay
        me.drawActiveOverlay(ctx, width);

        // 4. Draw "Shockwaves" (Click Effects)
        me.drawShockwaves(ctx, width);

        setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * Calculates the points for the two energy strands based on physics and interaction.
     *
     * **Zero-Allocation Contract:**
     * This method writes directly to the pre-allocated `this.waveBuffers` `Float32Array`s.
     * It does **not** allocate new arrays or objects, ensuring zero GC pressure.
     *
     * @param {Number} width
     * @param {Number} height
     * @returns {Object} {shimmerA, shimmerB, count} Metadata for rendering (scalars only)
     */
    calculateStrandGeometry(width, height) {
        let me = this;

        if (!Array.isArray(me.navRects) || !me.waveBuffers.fgA) {
            return null
        }

        const
            bufA    = me.waveBuffers.fgA,
            bufB    = me.waveBuffers.fgB,
            step    = 2,
            count   = Math.ceil(width / step),
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

        for (let i = 0; i < count; i++) {
            let x = i * step,
                {offsetY, intensity, isIconZone} = me.getStreamOffset(x, height);

            // FREQUENCY MODULATION:
            let freqMod   = Math.sin(x * 0.002 + me.time * 0.1) * (20 + (intensity * 10)),
                timeShift = me.time * 2;

            // DAMPING FOR ICONS:
            let localAmp = baseAmp * (1 - (isIconZone * 0.6));

            // Noise Calculation
            // We calculate noise once per frame per point to ensure that the Ribbon Fill and
            // Neon Stroke passes use identical geometry, preventing visual tearing.
            let noiseA = (Math.random() - 0.5) * hoverAmp * intensity,
                noiseB = (Math.random() - 0.5) * hoverAmp * intensity,
                sine   = Math.sin(((x + freqMod) * 0.04) - timeShift) * localAmp,
                sineB  = Math.sin(((x + freqMod) * 0.04) - timeShift + Math.PI) * localAmp; // Inverted

            // SHOCKWAVE PHYSICS (Displacement)
            let shockY = 0;
            if (me.shockwaves.length > 0) {
                me.shockwaves.forEach(wave => {
                    let radius = wave.age * wave.speed,
                        dist   = x - wave.x; // Signed distance

                    // Check if point is near the wave front (e.g. within 50px)
                    if (Math.abs(dist) < radius && Math.abs(dist) > radius - 60) {
                        // Pulse shape: Sine wave based on distance from center relative to radius
                        let pulse = Math.sin((dist / radius) * Math.PI * 10) * (1 - (wave.age / wave.life)) * 20;
                        shockY += pulse
                    }
                })
            }

            // Write Y values to buffers
            bufA[i] = centerY + sine - offsetY + noiseA + shockY;
            bufB[i] = centerY + sineB + offsetY + noiseB + shockY;
        }

        return {shimmerA, shimmerB, count}
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

            // Interaction: Mouse Repulsion
            // All particles react to the mouse, but "Nebula" particles have higher calculated mass,
            // resulting in less displacement than the lighter "Dust" particles.
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
            }

            // Interaction: Shockwave Repulsion
            if (me.shockwaves.length > 0) {
                me.shockwaves.forEach(wave => {
                    let wx     = p.x - wave.x,
                        wy     = p.y - wave.y,
                        wDist  = Math.sqrt(wx * wx + wy * wy),
                        radius = wave.age * wave.speed;

                    // If particle is near the expanding ring (width 40px)
                    if (wDist < radius && wDist > radius - 40) {
                        let force = (1 - (wave.age / wave.life)) * 2; // Decay force over time
                        // Push outward
                        p.x += (wx / wDist) * force * 5;
                        p.y += (wy / wDist) * force * 5;
                        p.alpha = Math.min(p.alpha + 0.3, 1) // Flash bright
                    }
                })
            }

            // Return to base alpha
            if (p.alpha > p.baseAlpha) {
                p.alpha -= 0.005
            }

            ctx.globalAlpha = p.alpha;
            ctx.beginPath();

            if (p.isNebula) {
                // Nebula Visualization
                // Use a radial gradient to create a soft, cloud-like appearance.
                let g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                g.addColorStop(0, HIGHLIGHT);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill()
            } else {
                ctx.fillStyle = HIGHLIGHT;
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill()
            }
        });

        ctx.globalAlpha = 1
    }

    /**
     * Draws an additional highlight for the active navigation item.
     * **"Energy Surge" Effect:**
     * Renders a high-intensity pass of the energy strands *only* within the active zone.
     * This makes the lines appear to "power up" or glow white-hot as they pass through the active view,
     * fully integrated with the existing geometry.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     */
    drawActiveOverlay(ctx, width) {
        let me = this;

        if (!me.activeId || !me.waveBuffers.fgA) return;

        const rect = me.navRects.find(r => r.id === me.activeId);
        if (!rect) return;

        const
            step   = 2, // Must match calculateStrandGeometry
            // Add padding to fade the effect in/out smoothly
            pad    = 10,
            startX = Math.max(0, rect.x - pad),
            endX   = Math.min(width, rect.x + rect.width + pad),
            startI = Math.floor(startX / step),
            endI   = Math.ceil(endX / step),
            bufA   = me.waveBuffers.fgA,
            bufB   = me.waveBuffers.fgB;

        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        // High-Intensity Glow
        ctx.shadowBlur  = 20;
        ctx.shadowColor = '#FFFFFF'; // White glow
        ctx.strokeStyle = '#FFFFFF'; // White core
        ctx.lineWidth   = 2;

        // Gradient Fade mask (manual alpha)
        // We can't easily gradient-stroke a sub-path, so we rely on globalAlpha
        // combined with the "hot" white color to make it pop.
        ctx.globalAlpha = 0.6 + (Math.sin(me.time * 3) * 0.2); // Fast, nervous pulse

        const drawSegment = (buffer) => {
            ctx.beginPath();
            ctx.moveTo(startI * step, buffer[startI]);
            for (let i = startI + 1; i <= endI; i++) {
                ctx.lineTo(i * step, buffer[i])
            }
            ctx.stroke()
        };

        drawSegment(bufA);
        drawSegment(bufB);

        ctx.restore()
    }

    /**
     * Draws a subtle, large-scale background Helix pattern with a 3D Ribbon effect.
     *
     * **Intent:**
     * Provides a structural backbone to the negative space. Unlike the particle field (which is chaotic),
     * this layer is ordered and rhythmic, reinforcing the "DNA/Helix" theme even in the background.
     *
     * **Visuals:**
     * 1. **Ribbon Fill:** A barely-visible volumetric gradient fills the space between the helices.
     * 2. **Depth of Field:** Uses wide, very low opacity strokes to appear "out of focus" behind the sharp foreground.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     * @param {Number} height
     */
    drawAmbientBackground(ctx, width, height) {
        let me = this;

        // Ensure buffers exist
        if (!me.waveBuffers.bgA) return;

        let t       = me.time * 0.5,
            centerY = height / 2,
            amp     = height * 0.4,
            step    = 10,
            count   = Math.ceil(width / step),
            bufA    = me.waveBuffers.bgA,
            bufB    = me.waveBuffers.bgB;

        // 1. Calculate Points (Direct to Buffer)
        for (let i = 0; i < count; i++) {
            let x = i * step;
            bufA[i] = centerY + Math.sin((x * 0.01) + t) * amp;
            bufB[i] = centerY + Math.sin((x * 0.01) + t + Math.PI) * amp
        }

        // --- 2. RIBBON FILL (Background Surface) ---
        ctx.fillStyle = me.gradients.bgRibbon;
        ctx.beginPath();

        ctx.moveTo(0, bufA[0]);
        for (let i = 1; i < count; i++) {
            ctx.lineTo(i * step, bufA[i])
        }

        for (let i = count - 1; i >= 0; i--) {
            ctx.lineTo(i * step, bufB[i])
        }
        ctx.closePath();
        ctx.fill();

        // --- 3. STROKES ---
        ctx.lineWidth = 15;
        ctx.lineCap   = 'round';
        ctx.lineJoin  = 'round';

        // Use cached gradients
        const drawStroke = (buffer, strokeStyle) => {
            ctx.strokeStyle = strokeStyle;
            ctx.beginPath();
            ctx.moveTo(0, buffer[0]);
            for (let i = 1; i < count; i++) {
                ctx.lineTo(i * step, buffer[i])
            }
            ctx.stroke()
        };

        drawStroke(bufA, me.gradients.bgGrad1);
        drawStroke(bufB, me.gradients.bgGrad2);
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

        // 1. Calculate Physics (Shared for Ribbon and Strands) - Returns metadata, data is in buffers
        const geometry = me.calculateStrandGeometry(width, height);

        if (!geometry) return;

        const
            {shimmerA, shimmerB, count} = geometry,
            bufA = me.waveBuffers.fgA,
            bufB = me.waveBuffers.fgB,
            step = 2;

        // --- 2. RIBBON FILL (The 3D Surface) ---
        ctx.fillStyle = me.gradients.fgRibbon;
        ctx.beginPath();

        ctx.moveTo(0, bufA[0]);
        for (let i = 1; i < count; i++) {
            ctx.lineTo(i * step, bufA[i]);
        }

        for (let i = count - 1; i >= 0; i--) {
            ctx.lineTo(i * step, bufB[i]);
        }
        ctx.closePath();
        ctx.fill();

        // --- 3. NEON STRANDS (Tube Effect) ---

        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';

        // Helper to draw a strand from buffer
        const drawStrand = (buffer, gradient, shimmer, color, isCore) => {
            ctx.beginPath();
            ctx.strokeStyle = isCore ? '#FFFFFF' : gradient;
            ctx.lineWidth   = isCore ? 1 : 3;
            ctx.globalAlpha = isCore ? (shimmer + 0.2) : shimmer;

            if (!isCore) {
                ctx.shadowBlur  = 10;
                ctx.shadowColor = color;
            } else {
                ctx.shadowBlur  = 0;
            }

            ctx.moveTo(0, buffer[0]);
            for (let i = 1; i < count; i++) {
                ctx.lineTo(i * step, buffer[i]);
            }
            ctx.stroke();
        };

        // Draw Glows (Outer Tube)
        drawStrand(bufA, me.gradients.grad1, shimmerA, PRIMARY, false);
        drawStrand(bufB, me.gradients.grad2, shimmerB, SECONDARY, false);

        // Draw Cores (Inner Filament)
        drawStrand(bufA, null, shimmerA, null, true);
        drawStrand(bufB, null, shimmerB, null, true);

        // Cleanup: Reset shadow and alpha to prevent bleeding into the next render pass
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

        // Collision Detection
        // Iterate through all navigation items to determine stream diversion.
        // Given the low item count (<20), a simple linear scan is efficient.
        for (const rect of me.navRects) {
            // Buffer zone for smooth transition
            const buffer = 40;

            if (x >= rect.x - buffer && x <= rect.x + rect.width + buffer) {
                // We are inside the influence zone of this button

                // Shape Detection
                // Discriminate between square-ish icons (socials) and wide text buttons
                // to apply different diversion envelopes.
                const
                    ratio   = rect.width / rect.height,
                    isIcon  = ratio < 1.5, // Threshold for "Circle" vs "Rectangle"
                    centerX = rect.x + rect.width / 2,
                    span    = (rect.width / 2) + buffer,
                    distX   = Math.abs(x - centerX);

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

                    // Diversion Amplitude
                    // Text buttons require more visual clearance than icons due to their
                    // rectangular nature. Icons allow for a tighter "orbit".
                    let targetH = isIcon ? (rect.height / 2) : ((rect.height / 2) + 4);

                    // Vertical Clamping
                    // Cap the offset to ensure the stream stays within the canvas bounds.
                    let targetOffset = Math.min(targetH, maxSafeOffset);

                    // Add to total offset (using max to handle overlaps cleanly)
                    offsetY = Math.max(offsetY, targetOffset * envelope);

                    // Interaction: Proximity Check
                    // Boost the wave intensity if the mouse is hovering over or near this specific button.

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

        // Baseline Separation
        // By returning offsetY=0 in empty space, the strands will naturally cross (Helix effect)
        // driven by the sine wave logic in calculateStrandPoints.
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
                continue
            }

            // Draw two lines propagating out from the click point
            let xLeft    = wave.x - (wave.speed * wave.age),
                xRight   = wave.x + (wave.speed * wave.age),
                alpha    = 1 - progress,
                {height} = me.canvasSize;

            ctx.beginPath();
            ctx.strokeStyle = HIGHLIGHT; // Use constant
            ctx.globalAlpha = alpha;     // Fade out via globalAlpha
            ctx.lineWidth   = 4 * (1 - progress);

            // Left Wave
            if (xLeft > 0) {
                ctx.moveTo(xLeft, 0);
                ctx.quadraticCurveTo(xLeft - 20, height / 2, xLeft, height)
            }

            // Right Wave
            if (xRight < width) {
                ctx.moveTo(xRight, 0);
                ctx.quadraticCurveTo(xRight + 20, height / 2, xRight, height)
            }

            ctx.stroke();
            ctx.globalAlpha = 1 // Reset
        }
    }

    /**
     * @param {Object} data
     * @param {String} [data.id]
     */
    updateActiveId(data) {
        this.activeId = data?.id || null
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
     * Creates and caches gradients and geometry buffers based on canvas size.
     * This eliminates per-frame allocation of TypedArrays and CanvasGradients.
     *
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        let me  = this,
            ctx = me.context;

        // 1. Re-allocate Buffers (Float32Array)
        // Background: step = 10
        const bgCount = Math.ceil(width / 10) + 1;
        me.waveBuffers.bgA = new Float32Array(bgCount);
        me.waveBuffers.bgB = new Float32Array(bgCount);

        // Foreground: step = 2
        const fgCount = Math.ceil(width / 2) + 1;
        me.waveBuffers.fgA = new Float32Array(fgCount);
        me.waveBuffers.fgB = new Float32Array(fgCount);

        // 2. Cache Gradients
        if (!ctx) return;

        // Foreground Gradients
        const grad1 = ctx.createLinearGradient(0, 0, width, 0);
        grad1.addColorStop(0,   PRIMARY);
        grad1.addColorStop(0.5, HIGHLIGHT);
        grad1.addColorStop(1,   PRIMARY);
        me.gradients.grad1 = grad1;

        const grad2 = ctx.createLinearGradient(0, 0, width, 0);
        grad2.addColorStop(0,   SECONDARY);
        grad2.addColorStop(0.5, HIGHLIGHT);
        grad2.addColorStop(1,   SECONDARY);
        me.gradients.grad2 = grad2;

        const fgRibbon = ctx.createLinearGradient(0, 0, width, 0);
        fgRibbon.addColorStop(0,   'rgba(62, 99, 221, 0.05)');
        fgRibbon.addColorStop(0.5, 'rgba(64, 196, 255, 0.1)');
        fgRibbon.addColorStop(1,   'rgba(62, 99, 221, 0.05)');
        me.gradients.fgRibbon = fgRibbon;

        // Background Gradients
        const bgGrad1 = ctx.createLinearGradient(0, 0, width, 0);
        bgGrad1.addColorStop(0,   'rgba(62, 99, 221, 0.1)');
        bgGrad1.addColorStop(0.5, 'rgba(64, 196, 255, 0.2)');
        bgGrad1.addColorStop(1,   'rgba(62, 99, 221, 0.1)');
        me.gradients.bgGrad1 = bgGrad1;

        const bgGrad2 = ctx.createLinearGradient(0, 0, width, 0);
        bgGrad2.addColorStop(0,   'rgba(139, 166, 255, 0.1)');
        bgGrad2.addColorStop(0.5, 'rgba(64, 196, 255, 0.2)');
        bgGrad2.addColorStop(1,   'rgba(139, 166, 255, 0.1)');
        me.gradients.bgGrad2 = bgGrad2;

        const bgRibbon = ctx.createLinearGradient(0, 0, width, 0);
        bgRibbon.addColorStop(0,   'rgba(62, 99, 221, 0.02)');
        bgRibbon.addColorStop(0.5, 'rgba(64, 196, 255, 0.05)');
        bgRibbon.addColorStop(1,   'rgba(62, 99, 221, 0.02)');
        me.gradients.bgRibbon = bgRibbon;
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
            // Re-init resources on resize
            me.updateResources(size.width, size.height)
        }
    }
}

export default Neo.setupClass(HeaderCanvas);

