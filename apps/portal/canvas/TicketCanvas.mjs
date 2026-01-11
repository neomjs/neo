import Base from '../../../src/core/Base.mjs';

/**
 * @class Portal.canvas.TicketCanvas
 * @extends Neo.core.Base
 * @singleton
 */
class TicketCanvas extends Base {
    static config = {
        /**
         * @member {String} className='Portal.canvas.TicketCanvas'
         * @protected
         */
        className: 'Portal.canvas.TicketCanvas',
        /**
         * Remote method access
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'updateGraphData',
                'updateSize',
                'initGraph'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {String|null} canvasId=null
     */
    canvasId = null
    /**
     * @member {Object} canvasSize=null
     */
    canvasSize = null
    /**
     * @member {Object} context=null
     */
    context = null
    /**
     * @member {Array} nodes=[]
     */
    nodes = []

    /**
     * Initialize the graph with a canvas ID
     * @param {Object} opts
     * @param {String} opts.canvasId
     * @param {String} opts.windowId
     */
    initGraph({canvasId, windowId}) {
        let me        = this,
            hasChange = me.canvasId !== canvasId;

        me.canvasId = canvasId;

        // Wait for the canvas to be available in the worker map
        const checkCanvas = () => {
            const canvas = Neo.currentWorker.canvasWindowMap[canvasId]?.[windowId];

            if (canvas) {
                me.context = canvas.getContext('2d');
                hasChange && me.render()
            } else {
                setTimeout(checkCanvas, 50)
            }
        };
        checkCanvas()
    }

    /**
     * @member {Number} startY=0
     */
    startY = 0

    /**
     * @member {Number} baseSpeed=0.5
     */
    baseSpeed = 0.5
    /**
     * @member {Number} lastFrameTime=0
     */
    lastFrameTime = 0
    /**
     * @member {Number} pulseY=0
     */
    pulseY = 0

    /**
     * @param {Object} data
     * @param {Array}  data.nodes
     * @param {Number} [data.startY]
     */
    updateGraphData(data) {
        this.nodes = data.nodes || [];
        if (data.startY !== undefined) {
            this.startY = data.startY;
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

    /**
     * Main Render Loop
     */
    render() {
        let me = this;

        if (!me.context) {
            return;
        }

        const
            ctx    = me.context,
            width  = me.canvasSize?.width || 800,
            height = me.canvasSize?.height || 600,
            now    = Date.now();

        // Time delta in ms
        let dt = now - (me.lastFrameTime || now);
        me.lastFrameTime = now;
        
        // Cap dt to prevent huge jumps if tab was inactive
        if (dt > 100) dt = 16; 

        // 1. Calculate Physics
        // Find distance to nearest node to determine speed
        let minDist = Infinity;
        
        // We only care about vertical distance for speed throttling
        me.nodes.forEach(node => {
            let dist = Math.abs(me.pulseY - node.y);
            if (dist < minDist) minDist = dist;
        });

        // Speed Modifier:
        // Far away (>150px): 1.5x (Highway)
        // At node (0px): 0.2x (Traffic)
        // Smooth interpolation
        const influenceRange = 150;
        const minMod = 0.2;
        const maxMod = 1.5;
        
        let speedModifier = maxMod;
        
        if (minDist < influenceRange) {
            let ratio = minDist / influenceRange;
            // Ease out cubic for smoother braking
            // ratio 0 -> minMod
            // ratio 1 -> maxMod
            speedModifier = minMod + (maxMod - minMod) * (ratio * ratio);
        }

        // Apply Velocity
        me.pulseY += me.baseSpeed * speedModifier * dt;
        if (me.pulseY > height + 200) {
            me.pulseY = -200; // Restart above
        }
        
        // Dynamic Pulse Length (Squash & Stretch)
        // Fast = Long, Slow = Short
        const baseLength = 100;
        const pulseLength = baseLength * (speedModifier * 0.8); // Scale length with speed

        // 2. Clear
        ctx.clearRect(0, 0, width, height);

        // 3. Draw Neural Connections (The "Spine")
        
        // Gradient for the spine - refined to Gray/Subtle
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0,   'rgba(150, 150, 150, 0.1)');
        gradient.addColorStop(0.5, 'rgba(150, 150, 150, 0.3)');
        gradient.addColorStop(1,   'rgba(150, 150, 150, 0.1)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth   = 2;
        ctx.beginPath();

        if (me.nodes.length > 0) {
            let first = me.nodes[0];
            ctx.moveTo(first.x, first.y);

            for (let i = 1; i < me.nodes.length; i++) {
                let node = me.nodes[i];
                ctx.lineTo(node.x, node.y);
            }
            // Extend to bottom from last node
            let last = me.nodes[me.nodes.length - 1];
            ctx.lineTo(last.x, height);
        }
        ctx.stroke();

        // 4. Draw "Pulse" Effect
        const pulseY = me.pulseY;

        // Find which segment the pulse is in
        const getXAtY = (y) => {
            if (me.nodes.length < 2) return me.nodes[0]?.x || 38;
            
            // Before first node
            if (y < me.nodes[0].y) return me.nodes[0].x;

            for (let i = 0; i < me.nodes.length - 1; i++) {
                let curr = me.nodes[i];
                let next = me.nodes[i+1];
                if (y >= curr.y && y <= next.y) {
                    let ratio = (y - curr.y) / (next.y - curr.y);
                    return curr.x + (next.x - curr.x) * ratio;
                }
            }
            
            // After last node
            return me.nodes[me.nodes.length - 1].x;
        };

        if (me.nodes.length > 0 && pulseY > me.nodes[0].y - pulseLength) {
            const pulseGrad = ctx.createLinearGradient(0, pulseY, 0, pulseY + pulseLength);
            pulseGrad.addColorStop(0,   'rgba(64, 196, 255, 0)');
            pulseGrad.addColorStop(0.5, 'rgba(64, 196, 255, 1)');
            pulseGrad.addColorStop(1,   'rgba(64, 196, 255, 0)');

            ctx.strokeStyle = pulseGrad;
            ctx.lineWidth   = 4;
            ctx.beginPath();
            
            let pulseX = getXAtY(pulseY);
            ctx.moveTo(pulseX, pulseY);
            ctx.lineTo(getXAtY(pulseY + pulseLength), Math.min(pulseY + pulseLength, height));
            ctx.stroke();
        }

        // 5. "The Gap": Cut out holes for the DOM Nodes
        // This ensures the line never visually crosses the Avatar/Badge
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000'; // Color irrelevant for erase

        me.nodes.forEach(node => {
            if (node.radius) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
                ctx.fill();
            }
        });

        // 5. Draw Orbit/Glow Effects
        // Switch back to drawing on top
        ctx.globalCompositeOperation = 'source-over';

        me.nodes.forEach(node => {
            const radius = node.radius || 20;
            const x      = node.x;
            const y      = node.y;
            
            // Pulse range
            const pTop    = pulseY;
            const pBottom = pulseY + pulseLength;
            const nTop    = y - radius;
            const nBottom = y + radius;

            // Check overlap
            if (pBottom > nTop && pTop < nBottom) {
                // Calculate angular progress
                // 0 = Top (-PI/2), 1 = Bottom (PI/2)
                
                const getProgress = (val) => {
                    return Math.max(0, Math.min(1, (val - nTop) / (2 * radius)));
                };

                const startP = getProgress(pTop);    // Where the tail is
                const endP   = getProgress(pBottom); // Where the head is

                // Angles: -PI/2 is top. PI/2 is bottom.
                // But we draw from startAngle to endAngle.
                // Head is at endP (bottom-most), Tail is at startP (top-most).
                // We want to draw the segment between Tail and Head.
                
                const angleTail = -Math.PI/2 + (startP * Math.PI);
                const angleHead = -Math.PI/2 + (endP * Math.PI);

                // Intensity based on how much of the pulse is "inside" vs outside?
                // Or just standard pulse color. 
                // Let's use the standard blue but maybe slightly brighter as it compresses.
                ctx.strokeStyle = 'rgba(64, 196, 255, 1)';
                ctx.lineWidth   = 2; // Conservation of mass: 4px pulse splits into two 2px arcs

                // Right Arc
                ctx.beginPath();
                ctx.arc(x, y, radius + 2, angleTail, angleHead, false);
                ctx.stroke();

                // Left Arc
                // Mirror the angles?
                // Left side goes from Top (-PI/2) to Left (PI) to Bottom (PI/2).
                // Or -PI/2 to -3PI/2.
                // Left Arc: Start at Tail, End at Head (Counter-Clockwise)
                // If we use CCW:
                // Tail (-PI/2 + offset) -> Head (-PI/2 + offset)
                // We want to mirror the progress.
                // Right side: -90deg -> +90deg
                // Left side:  -90deg -> -270deg
                // So angle = -PI/2 - (p * PI)
                
                const leftTail = -Math.PI/2 - (startP * Math.PI);
                const leftHead = -Math.PI/2 - (endP * Math.PI);
                
                ctx.beginPath();
                // Draw from Tail to Head? 
                // Context.arc draws from start to end.
                // If we use CCW=true, we should go from Tail to Head?
                // Let's test: Tail=-90, Head=-180. CCW=true -> -90 to -180. Correct.
                ctx.arc(x, y, radius + 2, leftTail, leftHead, true);
                ctx.stroke();
            }
        });

        // Loop
        setTimeout(me.render.bind(me), 1000 / 60);
    }
}

export default Neo.setupClass(TicketCanvas);