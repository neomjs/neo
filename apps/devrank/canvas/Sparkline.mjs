import Base from '../../../src/core/Base.mjs';
import Neo  from '../../../src/Neo.mjs';

const hasRaf = typeof requestAnimationFrame === 'function';

/**
 * @class DevRank.canvas.Sparkline
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
            scanner   : '#FFFFFF',
            textYear  : '#AAAAAA',
            textValue : '#FFFFFF'
        },
        light: {
            fillStart : 'rgba(62, 99, 221, 0.4)',
            fillEnd   : 'rgba(62, 99, 221, 0.0)',
            line      : '#3E63DD',
            marker    : '#3E63DD',
            scanner   : '#000000',
            textYear  : '#666666',
            textValue : '#000000'
        }
    }

    static config = {
        /**
         * @member {String} className='DevRank.canvas.Sparkline'
         * @protected
         */
        className: 'DevRank.canvas.Sparkline',
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: ['onMouseLeave', 'onMouseMove', 'register', 'updateData', 'updateSize']
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Set} activeItems=new Set()
     */
    activeItems = new Set()
    /**
     * @member {Map<String, Object>} items=new Map()
     */
    items = new Map()
    /**
     * @member {Number} lastPulseSpawn=0
     */
    lastPulseSpawn = 0

    /**
     * @param {Object} data
     * @param {String} data.canvasId
     */
    onMouseLeave(data) {
        let item = this.items.get(data.canvasId);
        if (item) {
            item.mouseActive = false;
            this.draw(item); // Redraw to clear overlay
        }
    }

    /**
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
            this.draw(item);
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.canvasId
     * @param {Number} [data.devicePixelRatio=1]
     * @param {String} [data.theme='light']
     * @param {String} data.windowId
     */
    register(data) {
        let me = this,
            {canvasId} = data,
            canvas = Neo.worker.Canvas.map[canvasId];

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
                width           : canvas.width
            });

            if (!me.animationId) {
                me.renderLoop()
            }
        }
    }

    /**
     * Main animation loop for the "Living Sparklines" effect.
     * Implements a "Sparse Animation" strategy:
     * - Only animates a few items at a time to save performance.
     * - Randomly picks an item to "pulse" every 1-4 seconds.
     */
    renderLoop() {
        let me  = this,
            now = Date.now();

        // 1. Spawn new pulse?
        // Random interval between 1s and 4s
        if (now - me.lastPulseSpawn > (Math.random() * 3000 + 1000)) {
            let candidates = Array.from(me.items.values()).filter(item => !me.activeItems.has(item));
            
            if (candidates.length > 0) {
                // Pick random candidate
                let winner = candidates[Math.floor(Math.random() * candidates.length)];
                winner.pulseProgress = 0;
                me.activeItems.add(winner);
                me.lastPulseSpawn = now;
            }
        }

        // 2. Animate active items
        if (me.activeItems.size > 0) {
            me.activeItems.forEach(item => {
                // Speed: Full crossing in ~1.5s
                item.pulseProgress += 0.015;

                if (item.pulseProgress >= 1) {
                    item.pulseProgress = 0;
                    me.activeItems.delete(item);
                    me.draw(item); // Final clean draw
                } else {
                    me.draw(item, {pulseProgress: item.pulseProgress});
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
     * @param {Object} data
     * @param {String} data.canvasId
     * @param {Number[]} data.values
     */
    updateData(data) {
        let me = this,
            item = me.items.get(data.canvasId);

        if (item) {
            item.values = data.values;
            item.points = null; // Invalidate cache
            me.draw(item);
        }
    }

    /**
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
            me.draw(item);
        }
    }

    /**
     * @param {Object} item
     * @param {Object} [config]
     * @param {Number} [config.pulseProgress] 0 to 1
     */
    draw(item, config) {
        let me = this,
            {ctx, devicePixelRatio, height, values, width, theme} = item,
            colors = me.constructor.colors[theme] || me.constructor.colors.light,
            pulseProgress = config?.pulseProgress;

        // Handle DPR Scaling
        // Only reset transform if we are doing a full redraw (no pulse config)
        if (pulseProgress === undefined) {
            item.canvas.width  = width * devicePixelRatio;
            item.canvas.height = height * devicePixelRatio;
            ctx.scale(devicePixelRatio, devicePixelRatio);
        } else {
            // For pulse, we clear the canvas to redraw this frame
            ctx.clearRect(0, 0, width, height);
        }

        if (!Array.isArray(values) || values.length < 2) {
            ctx.clearRect(0, 0, width, height);
            return
        }

        let len     = values.length,
            max     = Math.max(...values),
            min     = Math.min(...values),
            range   = max - min || 1,
            padding = 4,
            h       = height - (padding * 2),
            stepX   = width / (len - 1);

        // Calculate or retrieve cached points
        if (!item.points || pulseProgress === undefined) {
            item.points = [];
            values.forEach((val, index) => {
                let normalized = (val - min) / range;
                item.points.push({
                    x: index * stepX,
                    y: height - padding - (normalized * h),
                    val: val,
                    year: 2010 + index
                });
            });
        }

        let points = item.points;

        // Note: For pulse animation, we might want to optimize by NOT clearing/redrawing the base chart
        // if we could draw on a layer, but since we are single-canvas per item, we must redraw the scene.
        // Fortunately, simple paths are cheap.

        if (pulseProgress === undefined) {
             ctx.clearRect(0, 0, width, height);
        }

        // 1. Draw Base Chart
        // Gradient
        let gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, colors.fillStart);
        gradient.addColorStop(1, colors.fillEnd);

        ctx.beginPath();
        ctx.moveTo(points[0].x, height);
        ctx.lineTo(points[0].x, points[0].y);

        for (let i = 0; i < len - 1; i++) {
            let p0 = points[i],
                p1 = points[i + 1],
                midX = (p0.x + p1.x) / 2,
                midY = (p0.y + p1.y) / 2;
            
            if (i === len - 2) {
                ctx.quadraticCurveTo(p0.x, p0.y, p1.x, p1.y);
            } else {
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
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
            let p0 = points[i],
                p1 = points[i + 1],
                midX = (p0.x + p1.x) / 2,
                midY = (p0.y + p1.y) / 2;

            if (i === len - 2) {
                ctx.quadraticCurveTo(p0.x, p0.y, p1.x, p1.y);
            } else {
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
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
                    nearestDist = dist;
                    nearestPoint = p;
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
                ctx.textAlign = 'center';
                
                let textY = 10;
                let x = nearestPoint.x;

                // Adjust text alignment if near edges
                if (x < 30) {
                    ctx.textAlign = 'left';
                    x += 5;
                } else if (x > width - 30) {
                    ctx.textAlign = 'right';
                    x -= 5;
                }

                // Draw Year
                ctx.fillStyle = colors.textYear;
                ctx.fillText(String(nearestPoint.year), x, textY);

                // Draw Value
                let valueText = new Intl.NumberFormat().format(nearestPoint.val);
                ctx.fillStyle = colors.textValue;
                ctx.fillText(valueText, x, textY + 12);
            }
        } else if (pulseProgress !== undefined) {
             // 3. Draw Pulse Effect ("Data Packet")
             // Interpolate position along the path
             let totalSegments  = len - 1,
                 currentSegment = Math.floor(pulseProgress * totalSegments),
                 segmentProgress = (pulseProgress * totalSegments) - currentSegment;

             // Safety clamp
             if (currentSegment >= totalSegments) {
                 currentSegment = totalSegments - 1;
                 segmentProgress = 1;
             }

             let p0 = points[currentSegment],
                 p1 = points[currentSegment + 1],
                 x  = p0.x + (p1.x - p0.x) * segmentProgress,
                 y  = p0.y + (p1.y - p0.y) * segmentProgress;

             // Draw Glow
             let gradient = ctx.createRadialGradient(x, y, 0, x, y, 6);
             gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
             gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
             gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

             ctx.beginPath();
             ctx.arc(x, y, 6, 0, Math.PI * 2);
             ctx.fillStyle = gradient;
             ctx.fill();

             // Draw Core
             ctx.beginPath();
             ctx.arc(x, y, 1.5, 0, Math.PI * 2);
             ctx.fillStyle = '#FFFFFF';
             ctx.fill();
        } else {
            // Only draw End Point
            let lastPoint = points[len - 1];
            ctx.beginPath();
            ctx.arc(lastPoint.x, lastPoint.y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = colors.marker;
            ctx.fill();
        }
    }
}

export default Neo.setupClass(Sparkline);