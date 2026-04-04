import Base      from '../../src/core/Base.mjs';
import Store     from '../../src/data/Store.mjs';
import EdgeModel from './EdgeModel.mjs';
import NodeModel from './NodeModel.mjs';

/**
 * @class Neo.ai.graph.Database
 * @extends Neo.core.Base
 */
class Database extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.graph.Database'
         * @protected
         */
        className: 'Neo.ai.graph.Database',
        /**
         * @member {Neo.data.Store} edges=null
         * @protected
         */
        edges: null,
        /**
         * @member {Neo.data.Store} nodes=null
         * @protected
         */
        nodes: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.nodes = Neo.create(Store, {
            autoInitRecords: false, // Turbo Mode
            model          : NodeModel
        });

        me.edges = Neo.create(Store, {
            autoInitRecords: false, // Turbo Mode
            model          : EdgeModel
        });
    }

    /**
     * @param {Object} edge
     */
    addEdge(edge) {
        edge.id ??= Neo.getId('edge');
        this.edges.add(edge);
    }

    /**
     * @param {Object} node
     */
    addNode(node) {
        node.id ??= Neo.getId('node');
        this.nodes.add(node);
    }

    /**
     * @param {String} edgeId
     */
    removeEdge(edgeId) {
        this.edges.remove(edgeId);
    }

    /**
     * @param {String} nodeId
     */
    removeNode(nodeId) {
        let me            = this,
            edgesToRemove = [],
            edges         = me.edges.items,
            i             = 0,
            len           = edges.length,
            edge;
        
        me.nodes.remove(nodeId);

        // Cascade delete attached edges
        for (; i < len; i++) {
            edge = edges[i];
            if (edge.source === nodeId || edge.target === nodeId) {
                edgesToRemove.push(edge);
            }
        }

        if (edgesToRemove.length > 0) {
            me.edges.remove(edgesToRemove);
        }
    }

    /**
     * @param {String} nodeId
     * @param {String} direction 'outbound' | 'inbound' | 'both'
     * @param {String} [type=null] Filter by edge type
     * @returns {Object[]} Array of adjacent nodes
     */
    getAdjacentNodes(nodeId, direction = 'outbound', type = null) {
        let me    = this,
            edges = me.edges.items,
            nodes = [],
            i     = 0,
            len   = edges.length,
            edge,
            adjacentNode;

        for (; i < len; i++) {
            edge = edges[i];

            if (type && edge.type !== type) {
                continue;
            }

            if ((direction === 'outbound' || direction === 'both') && edge.source === nodeId) {
                adjacentNode = me.nodes.get(edge.target);
                if (adjacentNode) {
                    nodes.push(adjacentNode);
                }
            } else if ((direction === 'inbound' || direction === 'both') && edge.target === nodeId) {
                adjacentNode = me.nodes.get(edge.source);
                if (adjacentNode) {
                    nodes.push(adjacentNode);
                }
            }
        }

        return nodes;
    }
}

export default Neo.setupClass(Database);
