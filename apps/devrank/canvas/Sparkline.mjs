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
            range   = max - min || 1, // Prevent division by zero
            stepX   = width / (len - 1),
            padding = 2,
            h       = height - (padding * 2);

        ctx.clearRect(0, 0, width, height);
        
        // Style
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth   = 2;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';

        ctx.beginPath();

        values.forEach((val, index) => {
            let x = index * stepX,
                // Invert Y because canvas 0,0 is top-left
                // Normalize value to 0-1, then scale to height
                normalized = (val - min) / range,
                y = height - padding - (normalized * h);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Optional: Draw end point
        let lastX = (len - 1) * stepX,
            lastY = height - padding - ((values[len - 1] - min) / range * h);

        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

export default Neo.setupClass(Sparkline);
