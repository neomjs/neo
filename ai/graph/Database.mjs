import Base            from '../../src/core/Base.mjs';
import ClassSystemUtil from '../../src/util/ClassSystem.mjs';
import Store           from '../../src/data/Store.mjs';
import EdgeModel       from './EdgeModel.mjs';
import NodeModel       from './NodeModel.mjs';

/**
 * The Database class serves as the core coordinator for the Native Edge Graph Database engine. 
 * This engine operates in headless MCP server environments (like Sandman and memory-core) to store 
 * relational framework topologies alongside semantic vector embeddings in ChromaDB (GraphRAG). 
 * It leverages Neo.data.Store for high-speed edge traversals and minimal GC pressure.
 * 
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
         * @member {Object|Neo.data.Store|null} edges_=null
         * @reactive
         */
        edges_: null,
        /**
         * @member {Object|Neo.data.Store|null} nodes_=null
         * @reactive
         */
        nodes_: null
    }

    /**
     * Injects a relationship edge into the Native Edge Graph Database topology.
     * @param {Object} edge
     */
    addEdge(edge) {
        edge.id ??= Neo.getId('edge');
        this.edges.add(edge);
    }

    /**
     * Injects an entity node into the Native Edge Graph Database topology.
     * @param {Object} node
     */
    addNode(node) {
        node.id ??= Neo.getId('node');
        this.nodes.add(node);
    }

    /**
     * Triggered before the edges config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetEdges(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Store, {
            autoInitRecords: false,
            model          : EdgeModel
        });
    }

    /**
     * Triggered before the nodes config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetNodes(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Store, {
            autoInitRecords: false,
            model          : NodeModel
        });
    }

    /**
     * Extracts adjacent nodes based on semantic relationship topologies for GraphRAG evaluation.
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

    /**
     * Removes an edge from the Native Edge Graph Database topology.
     * @param {String} edgeId
     */
    removeEdge(edgeId) {
        this.edges.remove(edgeId);
    }

    /**
     * Removes a node and elegantly cascades relationship topological deletions.
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
}

export default Neo.setupClass(Database);
