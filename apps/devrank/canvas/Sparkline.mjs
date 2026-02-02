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
     * @member {Map<String, Object>} items=new Map()
     */
    items = new Map()

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
                mouseActive     : false,
                mouseX          : 0,
                theme           : data.theme || 'light',
                width           : canvas.width
            });
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
            me.draw(item);
        }
    }

    /**
     * @param {Object} item
     */
    draw(item) {
        let me = this,
            {ctx, devicePixelRatio, height, values, width, theme} = item,
            colors = me.constructor.colors[theme] || me.constructor.colors.light;

        // Handle DPR Scaling
        item.canvas.width  = width * devicePixelRatio;
        item.canvas.height = height * devicePixelRatio;
        ctx.scale(devicePixelRatio, devicePixelRatio);

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
            stepX   = width / (len - 1),
            points  = [];

        // Pre-calculate points
        values.forEach((val, index) => {
            let normalized = (val - min) / range;
            points.push({
                x: index * stepX,
                y: height - padding - (normalized * h),
                val: val,
                year: 2010 + index
            });
        });

        ctx.clearRect(0, 0, width, height);

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