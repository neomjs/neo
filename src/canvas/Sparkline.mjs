import Base from '../../src/core/Base.mjs';

const hasRaf = typeof requestAnimationFrame === 'function';

/**
 * @summary SharedWorker renderer for the DevIndex "Living Sparklines".
 *
 * Implements a high-performance, canvas-based visualization for activity trends.
 * Unlike standard charts, these sparklines are designed to feel "alive" without consuming excessive resources.
 *
 * **Visual Architecture:**
 * 1.  **Living Sparklines:** The grid is not static. A "Pulse" effect randomly travels through different
 *     charts, creating the impression of a busy, active system ("The Server Room Effect").
 * 2.  **Sparse Animation Strategy:** Instead of animating all 50+ visible charts simultaneously (which would
 *     kill performance), a single **Master Loop** randomly selects *one* chart to animate every few seconds.
 *     This reduces the GPU load to that of a single active chart while maintaining a dynamic atmosphere.
 * 3.  **Data Packets:** The pulse is visualized as a glowing data packet traversing the timeline.
 * 4.  **Physics & Visuals:**
 *     - **Speed Normalization:** The pulse travels at constant speed along the path (Euclidean distance),
 *       regardless of slope steepness.
 *     - **Trend Coloring:** The pulse color dynamically shifts based on the local trend (Green for up, Red for down).
 *     - **Peak Flash:** A subtle halo expands when the pulse hits the all-time maximum value.
 *
 * **Interaction:**
 * -   **Mouse Scanning:** Hovering overrides the idle animation, creating a "Scanner" effect that snaps
 *     to the nearest data point and displays precise values.
 *
 * @class Neo.canvas.Sparkline
 * @extends Neo.core.Base
 * @singleton
 */
class Sparkline extends Base {
    static colors = {
        dark: {
            fillStart : 'rgba(62, 99, 221, 0.4)',
            fillEnd   : 'rgba(62, 99, 221, 0.0)',
            line      : '#3E63DD',
            marker    : '#3E63DD',
            pulseRGB  : '255, 255, 255',
            scanner   : '#FFFFFF',
            textYear  : '#AAAAAA',
            textValue : '#FFFFFF'
        },
        light: {
            fillStart : 'rgba(62, 99, 221, 0.4)',
            fillEnd   : 'rgba(62, 99, 221, 0.0)',
            line      : '#3E63DD',
            marker    : '#3E63DD',
            pulseRGB  : '62, 99, 221',
            scanner   : '#000000',
            textYear  : '#666666',
            textValue : '#000000'
        }
    }

    static config = {
        /**
         * @member {String} className='Neo.canvas.Sparkline'
         * @protected
         */
        className: 'Neo.canvas.Sparkline',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'onMouseLeave',
                'onMouseMove',
                'register',
                'unregister',
                'updateConfig',
                'updateData',
                'updateSize'
            ]
        },
        /**
         * Max concurrent data transitions allowed before snapping.
         * @member {Number} maxConcurrentTransitions=30
         */
        maxConcurrentTransitions: 30,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Set of currently animating items (the "Pulse" candidates).
     * @member {Set} activeItems=new Set()
     */
    activeItems = new Set()
    /**
     * Smoothed average frame time (ms).
     * @member {Number} avgFrameTime=16
     */
    avgFrameTime = 16
    /**
     * Map of registered canvas items.
     * Key: canvasId, Value: {canvas, ctx, values, points...}
     * @member {Map<String, Object>} items=new Map()
     */
    items = new Map()
    /**
     * Timestamp of the last frame.
     * @member {Number} lastFrameTime=0
     */
    lastFrameTime = 0
    /**
     * Timestamp of the last pulse spawn.
     * @member {Number} lastPulseSpawn=0
     */
    lastPulseSpawn = 0
    /**
     * Calculated stress level (avgFrameTime / 16).
     * > 1.0 means we are dropping frames.
     * @member {Number} stressLevel=0
     */
    stressLevel = 0

    /**
     * Clears the interaction overlay when mouse leaves the canvas.
     * @param {Object} data
     * @param {String} data.canvasId
     */
    onMouseLeave(data) {
        let item = this.items.get(data.canvasId);
        if (item) {
            item.mouseActive = false;
            this.draw(item) // Redraw to clear overlay
        }
    }

    /**
     * Handles mouse movement to update the "Scanner" overlay.
     * @param {Object} data
     * @param {String} data.canvasId
     * @param {Number} data.x
     * @param {Number} data.y
     */
    onMouseMove(data) {
        let item = this.items.get(data.canvasId);
        if (item) {
            item.mouseActive = true;
            item.mouseX      = data.x;
            this.draw(item)
        }
    }

    /**
     * Registers a new offscreen canvas for rendering.
     * @param {Object} data
     * @param {String} data.canvasId
     * @param {Number} [data.devicePixelRatio=1]
     * @param {String} [data.theme='light']
     * @param {Boolean} [data.usePulse=true]
     * @param {Boolean} [data.useTransition=true]
     * @param {String} data.windowId
     */
    register(data) {
        let me         = this,
            {canvasId} = data,
            canvas     = Neo.worker.Canvas.map[canvasId];

        if (canvas) {
            me.items.set(canvasId, {
                canvas,
                ctx             : canvas.getContext('2d'),
                devicePixelRatio: data.devicePixelRatio || 1,
                height          : canvas.height,
                id              : canvasId,
                mouseActive     : false,
                mouseX          : 0,
                pulseProgress   : 0,
                theme           : data.theme || 'light',
                usePulse        : data.usePulse !== false,
                useTransition   : data.useTransition !== false,
                width           : canvas.width
            });

            if (!me.animationId) {
                me.renderLoop()
            }
        }
    }

    /**
     * Unregisters a canvas.
     * @param {Object} data
     * @param {String} data.canvasId
     */
    unregister(data) {
        let me   = this,
            item = me.items.get(data.canvasId);

        if (item) {
            me.activeItems.delete(item);
            me.items.delete(data.canvasId)
        }
    }

    /**
     * Main animation loop for the "Living Sparklines" effect.
     * Implements a "Sparse Animation" strategy:
     * - Only animates a few items at a time to save performance.
     * - Randomly picks an item to "pulse" every 200ms-1.2s.
     * - Updates the animation state of active items.
     */
    renderLoop() {
        let me  = this,
            now = performance.now(); // High precision timer for frame budget

        // 0. Performance Monitoring (Adaptive Backpressure)
        if (me.lastFrameTime > 0) {
            let delta = now - me.lastFrameTime;

            // Only update average if delta is sanity-checked (ignore tab suspension pauses)
            if (delta < 500) {
                // Exponential Moving Average (alpha = 0.05 for smooth stability)
                me.avgFrameTime = (me.avgFrameTime * 0.95) + (delta * 0.05);
                me.stressLevel  = me.avgFrameTime / 16;
            }
        }
        me.lastFrameTime = now;

        // 1. Spawn new pulse?
        // Random interval between 200ms and 1.2s
        if (now - me.lastPulseSpawn > (Math.random() * 1000 + 200)) {
            let candidates = Array.from(me.items.values()).filter(item => !me.activeItems.has(item) && item.usePulse);

            if (candidates.length > 0) {
                // Pick random candidate
                let winner = candidates[Math.floor(Math.random() * candidates.length)];
                winner.pulseProgress = 0;
                me.activeItems.add(winner);
                me.lastPulseSpawn = now
            }
        }

        // 2. Animate active items
        if (me.activeItems.size > 0) {
            me.activeItems.forEach(item => {
                let needsDraw = false;

                // Handle Data Transition
                if (item.isTransitioning) {
                    let progress = (now - item.transitionStartTime) / item.transitionDuration;

                    if (progress >= 1) {
                        item.values          = item.targetValues;
                        item.isTransitioning = false;
                        progress             = 1
                    } else {
                        // Cubic Ease Out
                        progress = 1 - Math.pow(1 - progress, 3);

                        item.values = item.startValues.map((val, i) => {
                            return val + (item.targetValues[i] - val) * progress
                        })
                    }

                    item.points = null; // Force geometry recalc
                    needsDraw   = true
                }

                // Handle Pulse Animation
                // Remove from active set if usePulse got disabled mid-animation
                if (!item.usePulse && !item.isTransitioning) {
                    me.activeItems.delete(item);
                    me.draw(item); // Force redraw to clear artifacts
                    return
                }

                if (item.usePulse && !item.mouseActive) { // Pause pulse on hover? No, just render
                    // Speed: Full crossing in ~1.5s
                    item.pulseProgress += 0.015;

                    if (item.pulseProgress >= 1) {
                        item.pulseProgress = 0;
                        // Only remove if not transitioning
                        if (!item.isTransitioning) {
                            me.activeItems.delete(item);
                            me.draw(item); // Final clean draw
                            return
                        }
                    } else {
                        needsDraw = true
                    }
                }

                if (needsDraw) {
                    me.draw(item, {
                        pulseProgress: item.usePulse ? item.pulseProgress : undefined
                    })
                }
            });
        }

        if (hasRaf) {
            me.animationId = requestAnimationFrame(me.renderLoop.bind(me))
        } else {
            me.animationId = setTimeout(me.renderLoop.bind(me), 16)
        }
    }

    /**
     * Updates the configuration for a specific canvas.
     * @param {Object} data
     * @param {String} data.canvasId
     * @param {String} [data.theme]
     * @param {Boolean} [data.usePulse]
     * @param {Boolean} [data.useTransition]
     */
    updateConfig(data) {
        let me   = this,
            item = me.items.get(data.canvasId);

        if (item) {
            if (data.theme !== undefined) {
                item.theme = data.theme;
                me.draw(item)
            }
            if (data.usePulse !== undefined) {
                item.usePulse = data.usePulse
            }
            if (data.useTransition !== undefined) {
                item.useTransition = data.useTransition
            }
        }
    }

    /**
     * Updates the data values for a specific chart.
     * Invalidates the geometry cache to force a recalculation on next draw.
     * @param {Object} data
     * @param {String} data.canvasId
     * @param {Number[]} data.values
     */
    updateData(data) {
        let me   = this,
            item = me.items.get(data.canvasId);

        if (item) {
            // Adaptive Backpressure:
            // If the worker is stressed (> 16ms/frame) OR we have too many active transitions,
            // we force a "Snap" update (skip transition) to recover performance.
            let isStressed    = me.stressLevel > 1.1, // Allow small jitter (55fps)
                isOverloaded  = me.activeItems.size >= me.maxConcurrentTransitions,
                canTransition = item.useTransition && !isStressed && !isOverloaded;

            // Initial load or invalid data: snap instantly
            // Or if transitions are disabled/throttled
            if (!canTransition || !item.values || !Array.isArray(data.values) || item.values.length !== data.values.length) {
                item.values = data.values;
                item.points = null; // Invalidate cache
                me.draw(item)
            } else {
                // Start transition
                item.targetValues = data.values;
                item.startValues  = [...item.values];
                item.transitionStartTime = performance.now();
                item.transitionDuration  = 300; // ms

                if (!item.isTransitioning) {
                    item.isTransitioning = true;
                    me.activeItems.add(item);

                    if (!me.animationId) {
                        me.renderLoop()
                    }
                }
            }
        }
    }

    /**
     * Handles resize events from the main thread.
     * Updates dimensions and triggers a redraw.
     * @param {Object} data
     * @param {String} data.canvasId
     * @param {Number} [data.devicePixelRatio]
     * @param {Number} data.height
     * @param {Number} data.width
     */
    updateSize(data) {
        let me   = this,
            item = me.items.get(data.canvasId);

        if (item) {
            item.devicePixelRatio = data.devicePixelRatio || item.devicePixelRatio || 1;
            item.height           = data.height;
            item.width            = data.width;
            item.points           = null; // Invalidate cache
            me.draw(item)
        }
    }

    /**
     * The core rendering method.
     * Handles:
     * 1. **Geometry Calculation:** Caches point coordinates and path lengths for consistent speed.
     * 2. **Base Chart:** Draws the gradient area and the line stroke.
     * 3. **Scanner Overlay:** Draws the interactive cursor if `mouseActive` is true.
     * 4. **Pulse Effect:** Draws the "Data Packet" if `pulseProgress` is active.
     *
     * @param {Object} item - The canvas item state
     * @param {Object} [config] - Optional render config
     * @param {Number} [config.pulseProgress] - 0 to 1 progress for the pulse animation
     */
    draw(item, config) {
        let me            = this,
            {ctx, devicePixelRatio, height, values, width, theme} = item,
            colors        = me.constructor.colors[theme] || me.constructor.colors.light,
            pulseProgress = config?.pulseProgress;

        // Handle DPR Scaling & Clearing
        if (pulseProgress === undefined) {
            let pixelWidth  = width  * devicePixelRatio,
                pixelHeight = height * devicePixelRatio;

            // Only resize if dimensions changed (avoids context reset)
            if (item.canvas.width !== pixelWidth || item.canvas.height !== pixelHeight) {
                item.canvas.width  = pixelWidth;
                item.canvas.height = pixelHeight;
                ctx.scale(devicePixelRatio, devicePixelRatio)
            } else {
                ctx.clearRect(0, 0, width, height)
            }
        } else {
            // For pulse, we clear the canvas to redraw this frame
            ctx.clearRect(0, 0, width, height)
        }

        if (!Array.isArray(values) || values.length < 2) {
            return
        }

        let len      = values.length,
            max      = Math.max(...values),
            min      = Math.min(...values),
            range    = max - min || 1,
            paddingY = 6,
            paddingX = 4,
            h        = height - (paddingY * 2),
            w        = width  - (paddingX * 2),
            stepX    = w / (len - 1);

        // Calculate or retrieve cached points
        if (!item.points) {
            item.points = [];
            item.totalLength = 0;

            values.forEach((val, index) => {
                let normalized = (val - min) / range,
                    x = paddingX + index * stepX,
                    y = height - paddingY - (normalized * h),
                    point = {
                        x        : x,
                        y        : y,
                        val      : val,
                        year     : 2010 + index,
                        dist     : 0,
                        accumDist: 0
                    };

                if (index > 0) {
                    let prev = item.points[index - 1],
                        dx = x - prev.x,
                        dy = y - prev.y;

                    point.dist = Math.sqrt(dx * dx + dy * dy);
                    item.totalLength += point.dist;
                    point.accumDist = item.totalLength;

                    // Trend Color
                    // Up (y decreases) -> Green, Down (y increases) -> Red
                    point.color = (y < prev.y) ? '#3E63DD' : (y > prev.y) ? '#FF4444' : '#3E63DD';
                }

                item.points.push(point);
            });

            // Normalize distances
            item.points.forEach(p => {
                p.normalizedPos = p.accumDist / (item.totalLength || 1)
            });
        }

        let points = item.points;

        // 1. Draw Base Chart
        // Gradient
        let gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, colors.fillStart);
        gradient.addColorStop(1, colors.fillEnd);

        ctx.beginPath();
        ctx.moveTo(points[0].x, height);
        ctx.lineTo(points[0].x, points[0].y);

        for (let i = 0; i < len - 1; i++) {
            let p0   = points[i],
                p1   = points[i + 1],
                midX = (p0.x + p1.x) / 2,
                midY = (p0.y + p1.y) / 2;

            if (i === len - 2) {
                ctx.quadraticCurveTo(p0.x, p0.y, p1.x, p1.y)
            } else {
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY)
            }
        }

        ctx.lineTo(points[len - 1].x, height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < len - 1; i++) {
            let p0   = points[i],
                p1   = points[i + 1],
                midX = (p0.x + p1.x) / 2,
                midY = (p0.y + p1.y) / 2;

            if (i === len - 2) {
                ctx.quadraticCurveTo(p0.x, p0.y, p1.x, p1.y)
            } else {
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY)
            }
        }

        ctx.strokeStyle = colors.line;
        ctx.lineWidth   = 1;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.stroke();

        // 2. Draw Interaction Overlay
        if (item.mouseActive) {
            // Find nearest point
            let nearestDist = Infinity,
                nearestPoint = null;

            points.forEach(p => {
                let dist = Math.abs(p.x - item.mouseX);
                if (dist < nearestDist) {
                    nearestDist  = dist;
                    nearestPoint = p
                }
            });

            if (nearestPoint) {
                // Scanner Line
                ctx.beginPath();
                ctx.moveTo(nearestPoint.x, 0);
                ctx.lineTo(nearestPoint.x, height);
                ctx.strokeStyle = colors.scanner;
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Intersection Dot
                ctx.beginPath();
                ctx.arc(nearestPoint.x, nearestPoint.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = colors.scanner;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(nearestPoint.x, nearestPoint.y, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = colors.line;
                ctx.fill();

                // Text Label
                ctx.font = 'bold 10px sans-serif';
                let textY = 10;
                let x = nearestPoint.x;

                // Always align left (text on right) unless near right edge
                if (x > width - 50) {
                    ctx.textAlign = 'right';
                    x -= 6
                } else {
                    ctx.textAlign = 'left';
                    x += 6
                }

                // Draw Year
                ctx.fillStyle = colors.textYear;
                ctx.fillText(String(nearestPoint.year), x, textY);

                // Draw Value
                let valueText = new Intl.NumberFormat().format(nearestPoint.val);
                ctx.fillStyle = colors.textValue;
                ctx.fillText(valueText, x, textY + 12)
            }
        } else if (pulseProgress !== undefined) {
             // 3. Draw Pulse Effect ("Data Packet")

             // A. Speed Normalization
             // Find the segment based on distance traveled (normalizedPos)
             let segmentIndex = 0;
             for (let i = 1; i < points.length; i++) {
                 if (pulseProgress <= points[i].normalizedPos) {
                     segmentIndex = i - 1;
                     break
                 }
             }

             // Interpolate within the segment
             let p0 = points[segmentIndex];
             let p1 = points[segmentIndex + 1];

             // Handle edge case where totalLength might be 0 or pulseProgress > 1
             if (!p1) {
                 p0 = points[points.length - 2];
                 p1 = points[points.length - 1]
             }

             let segmentDist = p1.normalizedPos - p0.normalizedPos;
             let segmentProgress = (segmentDist === 0) ? 0 : (pulseProgress - p0.normalizedPos) / segmentDist;

             let x = p0.x + (p1.x - p0.x) * segmentProgress;
             let y = p0.y + (p1.y - p0.y) * segmentProgress;

             // B. Trend Coloring
             // Use the color of the target point (p1)
             let pulseColor = p1.color || '#FFFFFF';

             // C. Peak Flash
             // Check if we are near the absolute max
             if (p0.val === max || p1.val === max) {
                 // Check distance to peak
                 let peak = (p0.val === max) ? p0 : p1;
                 let dx = x - peak.x;
                 let dy = y - peak.y;
                 let dist = Math.sqrt(dx*dx + dy*dy);

                 if (dist < 10) {
                     let alpha = 1 - (dist / 10);
                     ctx.beginPath();
                     ctx.arc(peak.x, peak.y, 10, 0, Math.PI * 2);
                     ctx.fillStyle = `rgba(${colors.pulseRGB}, ${alpha * 0.5})`;
                     ctx.fill()
                 }
             }

             // Draw Glow
             let gradient = ctx.createRadialGradient(x, y, 0, x, y, 6);
             gradient.addColorStop(0, `rgba(${colors.pulseRGB}, 1)`);
             gradient.addColorStop(0.4, `rgba(${colors.pulseRGB}, 0.4)`);
             gradient.addColorStop(1, `rgba(${colors.pulseRGB}, 0)`);

             ctx.beginPath();
             ctx.arc(x, y, 6, 0, Math.PI * 2);
             ctx.fillStyle = gradient;
             ctx.fill();

             // Draw Core
             ctx.beginPath();
             ctx.arc(x, y, 1.5, 0, Math.PI * 2);
             ctx.fillStyle = pulseColor; // Trend Color
             ctx.fill()
        }
    }
}

export default Neo.setupClass(Sparkline);
