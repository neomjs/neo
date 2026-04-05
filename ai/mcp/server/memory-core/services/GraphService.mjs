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

        if (this.db || this._initPromise) {
            if (this._initPromise) {
                await this._initPromise;
            }
            return;
        }

        this._initPromise = (async () => {
            let storage = Neo.create(SQLite, {dbPath: aiConfig.sqlitePath});
        await storage.initAsync();

        if (Neo.get('memory-core-graph')) {
            this.db         = Neo.get('memory-core-graph');
            this.db.storage = storage;
        } else {
            this.db = Neo.create(CoreDatabase, {
                id     : 'memory-core-graph',
                storage: storage
            });
        }

        await storage.load();

        // Ensure the frontier node exists to prevent context frontier errors
        this.db.getAdjacentNodes('frontier', 'both'); // trigger lazy load
        if (!this.db.nodes.has('frontier')) {
            this.upsertNode({
                id         : 'frontier',
                type       : 'SYSTEM_ANCHOR',
                name       : 'Active Context Frontier',
                description: 'The shifting focal point of the active Neo OS agent session.'
            });
        }

        // --- 1. THE GLOBAL SYSTEM PRIMER (Epic #9671) ---
        // Inject the Master Architecture Tenets directly into the Native Graph at boot.
        // Because this is anchored to the 'frontier' with a protected SYSTEM_TENET edge,
        // it acts as a deterministic onboarding payload for every agent session.
        this.db.getAdjacentNodes('Neo-Master-Architecture', 'both');
        if (!this.db.nodes.has('Neo-Master-Architecture')) {
            this.upsertNode({
                id         : 'Neo-Master-Architecture',
                type       : 'System',
                name       : 'Global System Primer',
                description: 'Core framework tenets: 1. All Playwright tests must be run using "npm run test-unit -- [file]". No npx. 2. UI debugging and application state inspection must use the Neural Link MCP tools. 3. Look at .agent/skills for reusable agent workflows.'
            });
        }
        this.linkNodes('frontier', 'Neo-Master-Architecture', 'SYSTEM_TENET', 1.0);

        logger.log('[GraphService] SQLite database mounted securely via ai.graph.Database.');
        })();

        await this._initPromise;
    }

    /**
     * Upserts a Node representation into the graph securely linking the ID.
     * @param {Object} node
     */
    upsertNode({id, type, name, description, semanticVectorId, state, updatedAt}) {
        let node = this.db.nodes.get(id);

        if (node) {
            if (type) {
                node.label = type;
            }

            let p = Object.assign({}, node.properties || {});
            if (name !== undefined) {
                p.name = name;
            }
            if (description !== undefined) {
                p.description = description;
            }
            if (semanticVectorId !== undefined) {
                p.semanticVectorId = semanticVectorId;
            }
            if (state !== undefined) {
                p.state = state;
            }
            if (updatedAt !== undefined) {
                p.updatedAt = updatedAt;
            }

            node.properties = p;

            // Directly commit delta to SQLite since Store.update does not exist
            if (this.db.autoSave && this.db.storage) {
                this.db.storage.addNodes([node]);
                if (typeof this.db.acknowledgeLocalMutations === 'function') {
                    this.db.acknowledgeLocalMutations();
                }
            }
        } else {
            this.db.addNode({
                id,
                label     : type || 'NODE',
                properties: {
                    name       : name || id,
                    description: description || '',
                    semanticVectorId,
                    state,
                    updatedAt
                }
            });
            console.log(`Successfully added node to Database RAM: ${id}`);
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
        if (!this.db?.storage?.db) {
            return;
        } // Safe guard for SQLite backend

        const stmt     = this.db.storage.db.prepare(`SELECT id, json_extract(data, '$.properties.weight') as weight
                                                     FROM Edges
                                                     WHERE source = ?
                                                       AND target = ?
                                                       AND type = ?`);
        const existing = stmt.get(source, target, relationship);

        if (!existing) {
            this.db.addEdge({
                id        : Neo.getId('edge'),
                source,
                target,
                type      : relationship,
                properties: {weight}
            });
        } else {
            const currentWeight = parseFloat(existing.weight) || 1.0;
            const newWeight     = Math.min(currentWeight + (weight * 0.1), 5.0);

            const updateStmt = this.db.storage.db.prepare(`UPDATE Edges
                                                           SET data = json_set(data, '$.properties.weight', ?)
                                                           WHERE id = ?`);
            updateStmt.run(newWeight, existing.id);
            if (typeof this.db.acknowledgeLocalMutations === 'function') {
                this.db.acknowledgeLocalMutations();
            }
        }
    }

    /**
     * Applies a geometric decay over the edge topology and deletes edges under the pruning threshold.
     */
    decayGlobalTopology(decayFactor = 0.95, pruningThreshold = 0.2) {
        if (!this.db?.storage?.db) {
            return;
        }
        logger.info(`[GraphService] Running ambient topology decay (factor: ${decayFactor})...`);

        // Shield structural AST edges completely from decay
        const decayStmt = this.db.storage.db.prepare(`
            UPDATE Edges
            SET data = json_set(data, '$.properties.weight',
                                MAX(COALESCE(CAST(json_extract(data, '$.properties.weight') AS REAL), 1.0) * ?, 0.1))
            WHERE type NOT IN ('IMPLEMENTS', 'EXTENDS')
        `);
        decayStmt.run(decayFactor);

        // Prune dead pathways permanently mapping via physical SQL
        const pruneStmt = this.db.storage.db.prepare(`
            DELETE
            FROM Edges
            WHERE COALESCE(CAST(json_extract(data, '$.properties.weight') AS REAL), 1.0) < ?
        `);
        const info      = pruneStmt.run(pruningThreshold);

        logger.info(`[GraphService] Ambient Decay complete. Pruned ${info.changes} dead pathways.`);
    }

    /**
     * Retrieves a specific node by its ID.
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object|null}
     */
    getNode({id}) {
        // Guarantee lazy-loading from SQLite triggers if not cached
        this.db.getAdjacentNodes(id, 'both');

        let node = this.db.nodes.get(id);
        if (!node) {
            return null;
        }
        return {
            id              : node.id,
            type            : node.label,
            name            : node.properties?.name,
            description     : node.properties?.description,
            semanticVectorId: node.properties?.semanticVectorId,
            state           : node.properties?.state
        };
    }

    /**
     * Retrieves adjacent connected nodes (neighbors) alongside relationship metadata.
     * @param {Object} data
     * @param {String} data.id
     * @returns {Array} List of connected Node objects with edge relationship mapping.
     */
    getNeighbors({id}) {
        // Guarantee lazy-loading vicinity topology securely
        this.db.getAdjacentNodes(id, 'both');

        let results  = [],
            inbound  = this.db.edges.getByIndex('target', id),
            outbound = this.db.edges.getByIndex('source', id);

        [...inbound, ...outbound].forEach(e => {
            let adjacentId = e.source === id ? e.target : e.source;
            let node       = this.db.nodes.get(adjacentId);
            if (node) {
                results.push({
                    id          : node.id,
                    type        : node.label,
                    name        : node.properties?.name,
                    description : node.properties?.description,
                    relationship: e.type,
                    weight      : e.properties?.weight || 1.0,
                    source      : e.source,
                    target      : e.target
                });
            }
        });

        return {neighbors: results};
    }

    /**
     * Performs a text-based fuzzy search across node topology to find structural entities.
     * @param {Object} data
     * @param {String} data.query
     * @returns {Array} List of matching Nodes.
     */
    searchNodes({query}) {
        let q       = query.toLowerCase(),
            matches = [];

        this.db.nodes.items.forEach(node => {
            let name    = (node.properties?.name || '').toLowerCase();
            let desc    = (node.properties?.description || '').toLowerCase();
            let idLower = node.id.toLowerCase();

            if (name.includes(q) || desc.includes(q) || idLower.includes(q)) {
                matches.push({
                    id         : node.id,
                    type       : node.label,
                    name       : node.properties?.name,
                    description: node.properties?.description
                });
            }
        });

        return {nodes: matches.slice(0, 50)};
    }

    /**
     * Retrieves the structural topology of the active context frontier.
     * @param {Object} args
     * @param {Number} [args.depth=2] The traversal depth from the frontier node.
     * @returns {Object|null}
     */
    getContextFrontier({depth = 2} = {}) {
        // Guarantee lazy-loading of frontier topology explicitly
        this.db.getAdjacentNodes('frontier', 'both');

        const frontierNode = this.db.nodes.get('frontier');
        if (!frontierNode) {
            logger.info('[GraphService] No frontier node found in graph.');
            return null;
        }

        const topology = {
            frontier          : {
                id              : frontierNode.id,
                type            : frontierNode.label,
                name            : frontierNode.properties?.name,
                description     : frontierNode.properties?.description,
                semanticVectorId: frontierNode.properties?.semanticVectorId
            },
            strategicNeighbors: []
        };

        // Get immediate high-weight connections
        const inbound  = this.db.edges.getByIndex('target', 'frontier');
        const outbound = this.db.edges.getByIndex('source', 'frontier');

        [...inbound, ...outbound].forEach(e => {
            const weight = e.properties?.weight || 1.0;
            if (weight >= 0.8) {
                let adjacentId = e.source === 'frontier' ? e.target : e.source;
                let node       = this.db.nodes.get(adjacentId);

                // Actively filter out CLOSED structural paths
                if (node && node.properties?.state !== 'CLOSED') {
                    topology.strategicNeighbors.push({
                        id              : node.id,
                        type            : node.label,
                        name            : node.properties?.name,
                        description     : node.properties?.description,
                        semanticVectorId: node.properties?.semanticVectorId,
                        relationship    : e.type,
                        weight          : weight,
                        direction       : e.source === 'frontier' ? 'outbound' : 'inbound'
                    });
                }
            }
        });

        // Sort by highest weight
        topology.strategicNeighbors.sort((a, b) => b.weight - a.weight);

        return topology;
    }

    /**
     * Retrieves the structural topology surrounding a specific node.
     * @param {Object} args
     * @param {String} args.nodeId The ID of the root node.
     * @param {Number} [args.maxDepth=2] The traversal depth from the root.
     * @returns {Object|null}
     */
    queryNodeTopology({nodeId, maxDepth = 2} = {}) {
        const rootNode = this.db.nodes.get(nodeId);
        if (!rootNode) {
            logger.info(`[GraphService] Node ${nodeId} not found in graph.`);
            return null;
        }

        const topology = {
            root : {
                id              : rootNode.id,
                type            : rootNode.label,
                name            : rootNode.properties?.name,
                description     : rootNode.properties?.description,
                semanticVectorId: rootNode.properties?.semanticVectorId
            },
            nodes: [],
            edges: []
        };

        topology.nodes.push(topology.root);

        let currentLevel = new Set([nodeId]);
        let visitedNodes = new Set([nodeId]);
        let visitedEdges = new Set();

        for (let depth = 0; typeof maxDepth === 'number' && depth < maxDepth; depth++) {
            let nextLevel = new Set();
            for (let id of currentLevel) {
                // Guarantee lazy-loading of the topology explicitly
                this.db.getAdjacentNodes(id, 'both');

                const inbound  = this.db.edges.getByIndex('target', id);
                const outbound = this.db.edges.getByIndex('source', id);

                [...inbound, ...outbound].forEach(e => {
                    if (!visitedEdges.has(e.id)) {
                        visitedEdges.add(e.id);
                        topology.edges.push({
                            source      : e.source,
                            target      : e.target,
                            relationship: e.type,
                            weight      : e.properties?.weight || 1.0
                        });
                    }

                    let adjacentId = e.source === id ? e.target : e.source;
                    if (!visitedNodes.has(adjacentId)) {
                        visitedNodes.add(adjacentId);
                        nextLevel.add(adjacentId);
                        let n = this.db.nodes.get(adjacentId);
                        if (n) {
                            topology.nodes.push({
                                id              : n.id,
                                type            : n.label,
                                name            : n.properties?.name,
                                description     : n.properties?.description,
                                semanticVectorId: n.properties?.semanticVectorId
                            });
                        }
                    }
                });
            }
            if (nextLevel.size === 0) {
                break;
            }
            currentLevel = nextLevel;
        }

        // Sort edges by highest weight as a convenience
        topology.edges.sort((a, b) => b.weight - a.weight);

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
    mutateFrontier({targetNodeId, weight = 1.0, relationship = 'STRATEGIC_PIVOT'}) {
        let frontierNode = this.db.nodes.get('frontier');
        if (!frontierNode) {
            this.upsertNode({
                id         : 'frontier',
                type       : 'SYSTEM_ANCHOR',
                name       : 'Active Context Frontier',
                description: 'The shifting focal point of the active Neo OS agent session.'
            });
        }

        // First, apply decay to existing frontier edges to prevent saturation
        const outbound      = this.db.edges.getByIndex('source', 'frontier');
        const edgesToUpdate = [];
        outbound.forEach(e => {
            if (e.target !== targetNodeId) {
                // Decay by 50%
                let currentWeight   = e.properties?.weight || 1.0;
                e.properties.weight = currentWeight * 0.5;
                edgesToUpdate.push(e);
            }
        });
        if (edgesToUpdate.length > 0 && this.db.autoSave && this.db.storage) {
            this.db.storage.addEdges(edgesToUpdate);
            if (typeof this.db.acknowledgeLocalMutations === 'function') {
                this.db.acknowledgeLocalMutations();
            }
        }

        // Upsert target node placeholder if it doesn't exist, to prevent getContextFrontier filtering it out
        if (!this.db.nodes.get(targetNodeId)) {
            this.upsertNode({
                id         : targetNodeId,
                type       : 'CONTEXT_NODE',
                name       : targetNodeId,
                description: `Dynamically injected context target during a STRATEGIC_PIVOT.`
            });
        }

        // Establish the new high-weight connection
        let existingEdge = this.db.edges.items.find(e => e.source === 'frontier' && e.target === targetNodeId && e.type === relationship);
        if (existingEdge) {
            existingEdge.properties.weight = weight;
            if (this.db.autoSave && this.db.storage) {
                this.db.storage.addEdges([existingEdge]);
                if (typeof this.db.acknowledgeLocalMutations === 'function') {
                    this.db.acknowledgeLocalMutations();
                }
            }
        } else {
            this.db.addEdge({
                id        : Neo.getId('edge'),
                source    : 'frontier',
                target    : targetNodeId,
                type      : relationship,
                properties: {weight}
            });
        }

        logger.info(`[GraphService] Mutated [Frontier] -> ${targetNodeId} w/ weight ${weight}`);

        return {success: true, targetNodeId, newWeight: weight};
    }
}

export default Neo.setupClass(GraphService);
