import Base from '../../../src/core/Base.mjs';
import Neo  from '../../../src/Neo.mjs';

/**
 * @class DevRank.canvas.Sparkline
 * @extends Neo.core.Base
 * @singleton
 */
class Sparkline extends Base {
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
            app: ['register', 'updateData']
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
     * @param {String} data.windowId
     */
    register(data) {
        let me = this,
            {canvasId} = data,
            canvas = Neo.worker.Canvas.map[canvasId];

        if (canvas) {
            me.items.set(canvasId, {
                canvas,
                ctx   : canvas.getContext('2d'),
                height: canvas.height,
                width : canvas.width
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
     * @param {Object} item
     */
    draw(item) {
        let {ctx, height, values, width} = item;

        if (!Array.isArray(values) || values.length < 2) {
            ctx.clearRect(0, 0, width, height);
            return
        }

        let len     = values.length,
            max     = Math.max(...values),
            min     = Math.min(...values),
            range   = max - min || 1,
            padding = 4, // Increased padding for marker radius
            h       = height - (padding * 2),
            stepX   = width / (len - 1),
            points  = [];

        // Pre-calculate points
        values.forEach((val, index) => {
            let normalized = (val - min) / range;
            points.push({
                x: index * stepX,
                y: height - padding - (normalized * h),
                val: val
            });
        });

        ctx.clearRect(0, 0, width, height);

        // 1. Create Gradient
        let gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(62, 99, 221, 0.4)'); // Primary #3E63DD
        gradient.addColorStop(1, 'rgba(62, 99, 221, 0.0)');

        // 2. Draw Area (Fill)
        ctx.beginPath();
        ctx.moveTo(points[0].x, height); // Start bottom-left
        ctx.lineTo(points[0].x, points[0].y);

        // Smooth curve loop
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

        ctx.lineTo(points[len - 1].x, height); // Close to bottom-right
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // 3. Draw Line (Stroke)
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

        ctx.strokeStyle = '#3E63DD'; // Primary
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.stroke();

        // 4. Draw Max Value Marker (if distinct)
        if (max > min) {
            let maxIndex = values.indexOf(max),
                maxPoint = points[maxIndex];

            ctx.beginPath();
            ctx.arc(maxPoint.x, maxPoint.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#3E63DD';
            ctx.fill();
        }

        // 5. Draw End Point (Glowing)
        let lastPoint = points[len - 1];
        
        // Glow
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(62, 99, 221, 0.3)';
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#3E63DD';
        ctx.fill();
    }
}

export default Neo.setupClass(Sparkline);
