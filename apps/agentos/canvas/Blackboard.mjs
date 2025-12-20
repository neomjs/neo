import Base from '../../../src/core/Base.mjs';

/**
 * @class AgentOS.canvas.Blackboard
 * @extends Neo.core.Base
 * @singleton
 */
class Blackboard extends Base {
    static config = {
        /**
         * @member {String} className='AgentOS.canvas.Blackboard'
         * @protected
         */
        className: 'AgentOS.canvas.Blackboard',
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
     * @member {Array} links=[]
     */
    links = []
    /**
     * @member {Array} nodes=[]
     */
    nodes = []

    construct(config) {
        super.construct(config);
        // Seed some dummy data for initial render verification
        this.nodes = [
            {id: 'root', x: 100, y: 100, label: 'Root Agent', color: '#4CAF50'},
            {id: 'task1', x: 200, y: 150, label: 'Task 1', color: '#2196F3'},
            {id: 'task2', x: 300, y: 100, label: 'Task 2', color: '#FFC107'}
        ];
        this.links = [
            {source: 'root', target: 'task1'},
            {source: 'root', target: 'task2'}
        ];
    }

    /**
     * Initialize the graph with a canvas ID
     * @param {Object} opts
     * @param {String} opts.canvasId
     * @param {String} opts.windowId
     */
    initGraph({canvasId, windowId}) {
        let me        = this,
            hasChange = me.canvasId !== canvasId;

        console.log('Blackboard: initGraph', canvasId, hasChange);
        this.canvasId = canvasId;

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

    updateGraphData(data) {
        this.nodes = data.nodes || [];
        this.links = data.links || [];
        // Simple layout re-calc could go here
    }

    updateSize(size) {
        let me = this;

        me.canvasSize = size;

        if (me.context) {
            me.context.canvas.width  = size.width;
            me.context.canvas.height = size.height
        }
    }

    render() {
        let me = this;

        if (!me.context) {
            return;
        }

        const ctx    = me.context;
        const width  = me.canvasSize?.width || 800;
        const height = me.canvasSize?.height || 600;

        // Clear
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Draw Title
        ctx.fillStyle = '#ffffff';
        ctx.font      = '20px Arial';
        ctx.fillText('Agent Swarm Blackboard (Canvas 2D)', 20, 30);

        // Draw Links
        ctx.strokeStyle = '#666';
        ctx.lineWidth   = 2;
        me.links.forEach(link => {
            const source = me.nodes.find(n => n.id === link.source);
            const target = me.nodes.find(n => n.id === link.target);
            if (source && target) {
                ctx.beginPath();
                ctx.moveTo(source.x, source.y);
                ctx.lineTo(target.x, target.y);
                ctx.stroke();
            }
        });

        // Draw Nodes
        me.nodes.forEach(node => {
            // Node shape
            ctx.beginPath();
            ctx.arc(node.x, node.y, 15, 0, 2 * Math.PI);
            ctx.fillStyle = node.color || '#ccc';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 2;
            ctx.stroke();

            // Label
            ctx.fillStyle = '#eee';
            ctx.font      = '12px Arial';
            ctx.fillText(node.label || node.id, node.x + 20, node.y + 5);
        });

        // Simple animation loop
        // Just moving the first node slightly to prove it's alive
        if (me.nodes.length > 0) {
            me.nodes[0].x = 100 + Math.sin(Date.now() / 1000) * 20;
        }

        // Loop using setTimeout since requestAnimationFrame support varies in workers
        setTimeout(me.render.bind(me), 1000 / 60);
    }
}

export default Neo.setupClass(Blackboard);
