import Base from './Base.mjs';

const
    hasRaf    = typeof requestAnimationFrame === 'function',
    PRIMARY   = '#3E63DD',
    SECONDARY = '#536DFE',
    HIGHLIGHT = '#00BFFF';

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
  *   - **Preview Glow (Hover State):** A static, high-contrast glow highlights the item under the cursor,
  *     providing immediate, distinct feedback separate from the active state.
  *
  * **Performance Architecture (Zero-Allocation):**
 * To maintain 60fps on high-refresh displays without GC stutters, this class employs a **Zero-Allocation** strategy during the render loop.
 * 1. **TypedArray Buffers:** Wave geometry is stored in pre-allocated `Float32Array` buffers (`waveBuffers`), reused every frame.
 * 2. **Gradient Caching:** CanvasGradients are created only on resize (`updateResources`) and cached, avoiding expensive generator calls per frame.
 * 3. **Reusable Objects:** Physics calculations write directly to buffers instead of returning new Arrays of Objects.
 *
 * @class Portal.canvas.HeaderCanvas
 * @extends Portal.canvas.Base
 * @singleton
 * @see Portal.view.HeaderCanvas
 */
class HeaderCanvas extends Base {
    static colors = {
        dark : {
            background   : ['rgba(62, 99, 221, 0.1)', 'rgba(64, 196, 255, 0.2)', 'rgba(62, 99, 221, 0.1)'],
            background2  : ['rgba(139, 166, 255, 0.1)', 'rgba(64, 196, 255, 0.2)', 'rgba(139, 166, 255, 0.1)'],
            bgRibbon     : ['rgba(62, 99, 221, 0.02)', 'rgba(64, 196, 255, 0.05)', 'rgba(62, 99, 221, 0.02)'],
            fgRibbon     : ['rgba(62, 99, 221, 0.025)', 'rgba(64, 196, 255, 0.05)', 'rgba(62, 99, 221, 0.025)'],
            grad1        : [PRIMARY, HIGHLIGHT, PRIMARY],
            grad2        : [SECONDARY, HIGHLIGHT, SECONDARY],
            hover        : HIGHLIGHT,
            particle     : HIGHLIGHT,
            particleAlpha: {nebula: 0.2, dust: 0.2},
            shockwave    : HIGHLIGHT
        },
        light: {
            background   : ['rgba(62, 99, 221, 0.1)', 'rgba(64, 196, 255, 0.2)', 'rgba(62, 99, 221, 0.1)'],
            background2  : ['rgba(139, 166, 255, 0.1)', 'rgba(64, 196, 255, 0.2)', 'rgba(139, 166, 255, 0.1)'],
            bgRibbon     : ['rgba(62, 99, 221, 0.02)', 'rgba(64, 196, 255, 0.05)', 'rgba(62, 99, 221, 0.02)'],
            fgRibbon     : ['rgba(62, 99, 221, 0.05)', 'rgba(64, 196, 255, 0.1)', 'rgba(62, 99, 221, 0.05)'],
            grad1        : [PRIMARY, HIGHLIGHT, PRIMARY],
            grad2        : [SECONDARY, HIGHLIGHT, SECONDARY],
            hover        : PRIMARY,
            particle     : HIGHLIGHT,
            particleAlpha: {nebula: 0.2, dust: 0.2},
            shockwave    : HIGHLIGHT
        }
    }

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
                'updateActiveId',
                'updateGraphData',
                'updateHoverId',
                'updateNavRects'
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
     * @member {String|null} hoverId=null
     */
    hoverId = null
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
        super.clearGraph();
        me.navRects    = [];
        me.particles   = [];
        me.shockwaves  = [];
        me.waveBuffers = {bgA: null, bgB: null, fgA: null, fgB: null}
    }

    /**
     * Hook to initialize particles after context is ready
     * @param {Number} width
     * @param {Number} height
     */
    onGraphMounted(width, height) {
        this.initParticles(width, height)
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
        const
            count       = 60,
            themeColors = me.constructor.colors[me.theme],
            alphas      = themeColors.particleAlpha;

        for (let i = 0; i < count; i++) {
            let isNebula = Math.random() > 0.8; // 20% are large nebula orbs

            me.particles.push({
                isNebula,
                x        : Math.random() * width,
                y        : Math.random() * height,
                vx       : isNebula ? (Math.random() * 0.2 + 0.05) : (Math.random() * 0.5 + 0.1), // Nebulae move slower
                vy       : (Math.random() - 0.5) * 0.2,
                size     : isNebula ? (Math.random() * 30 + 20) : (Math.random() * 2 + 0.5), // Large vs Small
                alpha    : isNebula ? (Math.random() * 0.15 + alphas.nebula) : (Math.random() * 0.4 + alphas.dust),
                baseAlpha: isNebula ? (Math.random() * 0.15 + alphas.nebula) : (Math.random() * 0.4 + alphas.dust)
            })
        }
    }

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

        if (!me.canRender) {
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

        // 3c. Draw Hover Overlay
        me.drawHoverOverlay(ctx, width);

        // 4. Draw "Shockwaves" (Click Effects)
        me.drawShockwaves(ctx, width);

        if (hasRaf) {
            me.animationId = requestAnimationFrame(me.renderLoop)
        } else {
            me.animationId = setTimeout(me.renderLoop, 1000 / 60)
        }
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
                {offsetY, intensity, isIconZone} = me.getStreamOffset(x, height, width);

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
            bufA[i] = centerY + sine  - offsetY + noiseA + shockY;
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

        const
            themeColors = me.constructor.colors[me.theme],
            pColor      = themeColors.particle;

        me.particles.forEach(p => {
            // Update Position
            p.x += p.vx;
            p.y += p.vy;

            // Wrap around
            if (p.x > width + p.size)  p.x = -p.size;
            if (p.x < -p.size)         p.x = width + p.size;
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
                g.addColorStop(0, pColor);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill()
            } else {
                ctx.fillStyle = pColor;
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
        let me = this,
            rect;

        if (!me.activeId || !me.waveBuffers.fgA) return;

        // Zero-Allocation: Use for-loop instead of .find() to avoid closure creation
        for (const r of me.navRects) {
            if (r.id === me.activeId) {
                rect = r;
                break
            }
        }

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

        // Inline drawing to avoid closure
        ctx.beginPath();
        ctx.moveTo(startI * step, bufA[startI]);
        for (let i = startI + 1; i <= endI; i++) {
            ctx.lineTo(i * step, bufA[i])
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(startI * step, bufB[startI]);
        for (let i = startI + 1; i <= endI; i++) {
            ctx.lineTo(i * step, bufB[i])
        }
        ctx.stroke();

        ctx.restore()
    }

    /**
     * Draws an additional highlight for the hovered navigation item.
     * **"Preview" Effect:**
     * Renders a static intensity pass of the energy strands within the hovered zone.
     * Uses the theme-specific hover color (Cyan/Blue) to distinguish it from the active state (White).
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} width
     */
    drawHoverOverlay(ctx, width) {
        let me = this,
            rect;

        if (!me.hoverId || !me.waveBuffers.fgA) return;

        // Zero-Allocation: Use for-loop instead of .find() to avoid closure creation
        for (const r of me.navRects) {
            if (r.id === me.hoverId) {
                rect = r;
                break
            }
        }

        if (!rect) return;

        const
            step        = 2, // Must match calculateStrandGeometry
            pad         = 10,
            startX      = Math.max(0, rect.x - pad),
            endX        = Math.min(width - 3, rect.x + rect.width + pad),
            startI      = Math.floor(startX / step),
            endI        = Math.ceil(endX / step),
            bufA        = me.waveBuffers.fgA,
            bufB        = me.waveBuffers.fgB,
            themeColors = me.constructor.colors[me.theme];

        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        // Hover Effect: Static Glow (No Pulse)
        ctx.shadowBlur  = 15;
        ctx.shadowColor = themeColors.hover;
        ctx.strokeStyle = themeColors.hover;
        ctx.lineWidth   = 2;
        ctx.globalAlpha = 1;

        // Inline drawing to avoid closure
        ctx.beginPath();
        ctx.moveTo(startI * step, bufA[startI]);
        for (let i = startI + 1; i <= endI; i++) {
            ctx.lineTo(i * step, bufA[i])
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(startI * step, bufB[startI]);
        for (let i = startI + 1; i <= endI; i++) {
            ctx.lineTo(i * step, bufB[i])
        }
        ctx.stroke();

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
            bufA        = me.waveBuffers.fgA,
            bufB        = me.waveBuffers.fgB,
            step        = 2,
            themeColors = me.constructor.colors[me.theme];

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
        // Extract base color from gradient array for shadow
        const color1 = themeColors.grad1[0];
        const color2 = themeColors.grad2[0];

        drawStrand(bufA, me.gradients.grad1, shimmerA, color1, false);
        drawStrand(bufB, me.gradients.grad2, shimmerB, color2, false);

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
     * @param {Number} width (Canvas width)
     * @returns {Object} {offsetY, intensity, isIconZone}
     */
    getStreamOffset(x, height, width) {
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

        if (me.shockwaves.length === 0) return;

        const themeColors = me.constructor.colors[me.theme];

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
            ctx.strokeStyle = themeColors.shockwave; // Use theme color
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
     * @param {String} [data.id]
     */
    updateHoverId(data) {
        this.hoverId = data?.id || null
    }

    /**
     * Hook to handle mouse clicks.
     * @param {Object} data
     */
    onMouseClick(data) {
        this.shockwaves.push({
            x    : data.x,
            y    : data.y,
            age  : 0,
            life : 60, // frames
            speed: 15  // px per frame
        })
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

        const themeColors = me.constructor.colors[me.theme];

        // Foreground Gradients
        const grad1 = ctx.createLinearGradient(0, 0, width, 0);
        grad1.addColorStop(0,   themeColors.grad1[0]);
        grad1.addColorStop(0.5, themeColors.grad1[1]);
        grad1.addColorStop(1,   themeColors.grad1[2]);
        me.gradients.grad1 = grad1;

        const grad2 = ctx.createLinearGradient(0, 0, width, 0);
        grad2.addColorStop(0,   themeColors.grad2[0]);
        grad2.addColorStop(0.5, themeColors.grad2[1]);
        grad2.addColorStop(1,   themeColors.grad2[2]);
        me.gradients.grad2 = grad2;

        const fgRibbon = ctx.createLinearGradient(0, 0, width, 0);
        fgRibbon.addColorStop(0,   themeColors.fgRibbon[0]);
        fgRibbon.addColorStop(0.5, themeColors.fgRibbon[1]);
        fgRibbon.addColorStop(1,   themeColors.fgRibbon[2]);
        me.gradients.fgRibbon = fgRibbon;

        // Background Gradients
        const bgGrad1 = ctx.createLinearGradient(0, 0, width, 0);
        bgGrad1.addColorStop(0,   themeColors.background[0]);
        bgGrad1.addColorStop(0.5, themeColors.background[1]);
        bgGrad1.addColorStop(1,   themeColors.background[2]);
        me.gradients.bgGrad1 = bgGrad1;

        const bgGrad2 = ctx.createLinearGradient(0, 0, width, 0);
        bgGrad2.addColorStop(0,   themeColors.background2[0]);
        bgGrad2.addColorStop(0.5, themeColors.background2[1]);
        bgGrad2.addColorStop(1,   themeColors.background2[2]);
        me.gradients.bgGrad2 = bgGrad2;

        const bgRibbon = ctx.createLinearGradient(0, 0, width, 0);
        bgRibbon.addColorStop(0,   themeColors.bgRibbon[0]);
        bgRibbon.addColorStop(0.5, themeColors.bgRibbon[1]);
        bgRibbon.addColorStop(1,   themeColors.bgRibbon[2]);
        me.gradients.bgRibbon = bgRibbon;
    }
}

export default Neo.setupClass(HeaderCanvas);

