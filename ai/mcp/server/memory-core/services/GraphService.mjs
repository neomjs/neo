import aiConfig     from '../config.mjs';
import logger       from '../logger.mjs';
import Base         from '../../../../../src/core/Base.mjs';
import CoreDatabase from '../../../../../ai/graph/Database.mjs';
import SQLite       from '../../../../../ai/graph/storage/SQLite.mjs';

/**
 * @summary Service that manages the SQLite Knowledge Graph (Nodes and Edges).
 *
 * It provides the topological layout of the Neo.mjs namespace, knowledge,
 * and history structurally mapping against semantic ChromaDB queries.
 *
 * @class Neo.ai.mcp.server.memory-core.services.GraphService
 * @extends Neo.core.Base
 * @singleton
 */
class GraphService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.GraphService'
         */
        className: 'Neo.ai.mcp.server.memory-core.services.GraphService',
        /**
         * @member {Object|null} db=null
         */
        db: null,
        /**
         * @member {Boolean} singleton=true
         */
        singleton: true
    }

    /**
     * Initializes the SQLite Database and Native Edge database structures.
     */
    async initAsync() {
        await super.initAsync();

        let storage = Neo.create(SQLite, { dbPath: aiConfig.sqlitePath });
        await storage.initAsync();

        this.db = Neo.create(CoreDatabase, {
            id: 'memory-core-graph',
            storage: storage
        });

        await storage.load();
        
        logger.log('[GraphService] SQLite database mounted securely via ai.graph.Database.');
    }

    /**
     * Upserts a Node representation into the graph securely linking the ID.
     * @param {Object} node
     */
    upsertNode({ id, type, name, description, semanticVectorId, state, updatedAt }) {
        let node = this.db.nodes.get(id);

        if (node) {
            if (type) node.label = type;
            
            let p = Object.assign({}, node.properties || {});
            if (name !== undefined) p.name = name;
            if (description !== undefined) p.description = description;
            if (semanticVectorId !== undefined) p.semanticVectorId = semanticVectorId;
            if (state !== undefined) p.state = state;
            if (updatedAt !== undefined) p.updatedAt = updatedAt;
            
            node.properties = p;
            
            // Directly commit delta to SQLite since Store.update does not exist
            if (this.db.autoSave && this.db.storage) {
                this.db.storage.addNodes([node]);
            }
        } else {
            this.db.addNode({
                id,
                label: type || 'NODE',
                properties: {
                    name: name || id,
                    description: description || '',
                    semanticVectorId,
                    state,
                    updatedAt
                }
            });
        }
    }

    /**
     * Links two nodes via a relationship tracking edge weight metadata.
     * @param {String} source
     * @param {String} target
     * @param {String} relationship
     * @param {Number} weight
     */
    linkNodes(source, target, relationship, weight = 1.0) {
        let existing = this.db.edges.items.find(e => e.source === source && e.target === target && e.type === relationship);
        if (!existing) {
            this.db.addEdge({
                id: Neo.getId('edge'),
                source,
                target,
                type: relationship,
                properties: { weight }
            });
        }
    }

    /**
     * Retrieves a specific node by its ID.
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object|null}
     */
    getNode({id}) {
        let node = this.db.nodes.get(id);
        if (!node) return null;
        return {
            id: node.id,
            type: node.label,
            name: node.properties?.name,
            description: node.properties?.description,
            semanticVectorId: node.properties?.semanticVectorId,
            state: node.properties?.state
        };
    }

    /**
     * Retrieves adjacent connected nodes (neighbors) alongside relationship metadata.
     * @param {Object} data
     * @param {String} data.id
     * @returns {Array} List of connected Node objects with edge relationship mapping.
     */
    getNeighbors({id}) {
        let results = [],
            inbound = this.db.edges.getByIndex('target', id),
            outbound = this.db.edges.getByIndex('source', id);
            
        [...inbound, ...outbound].forEach(e => {
            let adjacentId = e.source === id ? e.target : e.source;
            let node = this.db.nodes.get(adjacentId);
            if (node) {
                results.push({
                    id: node.id,
                    type: node.label,
                    name: node.properties?.name,
                    description: node.properties?.description,
                    relationship: e.type,
                    weight: e.properties?.weight || 1.0,
                    source: e.source,
                    target: e.target
                });
            }
        });
        
        return results;
    }

    /**
     * Performs a text-based fuzzy search across node topology to find structural entities.
     * @param {Object} data
     * @param {String} data.query
     * @returns {Array} List of matching Nodes.
     */
    searchNodes({query}) {
        let q = query.toLowerCase(),
            matches = [];
            
        this.db.nodes.items.forEach(node => {
            let name = (node.properties?.name || '').toLowerCase();
            let desc = (node.properties?.description || '').toLowerCase();
            let idLower = node.id.toLowerCase();
            
            if (name.includes(q) || desc.includes(q) || idLower.includes(q)) {
                matches.push({
                    id: node.id,
                    type: node.label,
                    name: node.properties?.name,
                    description: node.properties?.description
                });
            }
        });
        
        return matches.slice(0, 50);
    }

    /**
     * Retrieves the structural topology of the active context frontier.
     * @param {Object} args
     * @param {Number} [args.depth=2] The traversal depth from the frontier node.
     * @returns {Object|null}
     */
    getContextFrontier({depth = 2} = {}) {
        const frontierNode = this.db.nodes.get('frontier');
        if (!frontierNode) {
            logger.info('[GraphService] No frontier node found in graph.');
            return null;
        }

        const topology = {
            frontier: {
                id: frontierNode.id,
                type: frontierNode.label,
                name: frontierNode.properties?.name,
                description: frontierNode.properties?.description,
                semanticVectorId: frontierNode.properties?.semanticVectorId
            },
            strategicNeighbors: []
        };

        // Get immediate high-weight connections
        const inbound = this.db.edges.getByIndex('target', 'frontier');
        const outbound = this.db.edges.getByIndex('source', 'frontier');

        [...inbound, ...outbound].forEach(e => {
            const weight = e.properties?.weight || 1.0;
            if (weight >= 0.8) {
                let adjacentId = e.source === 'frontier' ? e.target : e.source;
                let node = this.db.nodes.get(adjacentId);
                
                // Actively filter out CLOSED structural paths
                if (node && node.properties?.state !== 'CLOSED') {
                    topology.strategicNeighbors.push({
                        id: node.id,
                        type: node.label,
                        name: node.properties?.name,
                        description: node.properties?.description,
                        semanticVectorId: node.properties?.semanticVectorId,
                        relationship: e.type,
                        weight: weight,
                        direction: e.source === 'frontier' ? 'outbound' : 'inbound'
                    });
                }
            }
        });

        // Sort by highest weight
        topology.strategicNeighbors.sort((a, b) => b.weight - a.weight);

        return topology;
    }

    /**
     * Actively mutates the relationships originating from the frontier node.
     * Upserts the frontier node if necessary, establishes the new relationship, and safely 
     * decays older strategic neighbors to prevent context saturation.
     * @param {Object} args
     * @param {String} args.targetNodeId The ID of the node to pivot focus to.
     * @param {Number} [args.weight=1.0] Importance weight, typically very high for a new pivot.
     * @param {String} [args.relationship='STRATEGIC_PIVOT'] The semantic edge type.
     */
    mutateFrontier({ targetNodeId, weight = 1.0, relationship = 'STRATEGIC_PIVOT' }) {
        let frontierNode = this.db.nodes.get('frontier');
        if (!frontierNode) {
            this.upsertNode({
                id: 'frontier',
                type: 'SYSTEM_ANCHOR',
                name: 'Active Context Frontier',
                description: 'The shifting focal point of the active Neo OS agent session.'
            });
        }

        // First, apply decay to existing frontier edges to prevent saturation
        const outbound = this.db.edges.getByIndex('source', 'frontier');
        const edgesToUpdate = [];
        outbound.forEach(e => {
            if (e.target !== targetNodeId) {
                // Decay by 50%
                let currentWeight = e.properties?.weight || 1.0;
                e.properties.weight = currentWeight * 0.5;
                edgesToUpdate.push(e);
            }
        });
        if (edgesToUpdate.length > 0 && this.db.autoSave && this.db.storage) {
            this.db.storage.addEdges(edgesToUpdate);
        }

        // Upsert target node placeholder if it doesn't exist, to prevent getContextFrontier filtering it out
        if (!this.db.nodes.get(targetNodeId)) {
            this.upsertNode({
                id: targetNodeId,
                type: 'CONTEXT_NODE',
                name: targetNodeId,
                description: `Dynamically injected context target during a STRATEGIC_PIVOT.`
            });
        }

        // Establish the new high-weight connection
        let existingEdge = this.db.edges.items.find(e => e.source === 'frontier' && e.target === targetNodeId && e.type === relationship);
        if (existingEdge) {
            existingEdge.properties.weight = weight;
            if (this.db.autoSave && this.db.storage) {
                this.db.storage.addEdges([existingEdge]);
            }
        } else {
            this.db.addEdge({
                id: Neo.getId('edge'),
                source: 'frontier',
                target: targetNodeId,
                type: relationship,
                properties: { weight }
            });
        }

        logger.info(`[GraphService] Mutated [Frontier] -> ${targetNodeId} w/ weight ${weight}`);
        
        return { success: true, targetNodeId, newWeight: weight };
    }
}

export default Neo.setupClass(GraphService);
