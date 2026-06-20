import path                from 'path';
import aiConfig            from '../../mcp/server/memory-core/config.mjs';
import logger              from '../../mcp/server/memory-core/logger.mjs';
import Base                from '../../../src/core/Base.mjs';
import CoreDatabase        from '../../../ai/graph/Database.mjs';
import SQLite              from '../../../ai/graph/storage/SQLite.mjs';
import { IDENTITIES }      from '../../../ai/graph/identityRoots.mjs';
import { normalizeUserId } from '../../mcp/server/shared/services/RequestContextService.mjs';
import fsExtra             from 'fs-extra';

/**
 * Row-level-security visibility predicate for an in-memory graph **node or edge**, mirroring
 * the SQL RLS clause that `SQLite.loadNodeVicinitySync` / `searchNodes` apply to BOTH the
 * `Nodes` and `Edges` tables. Applied at the public read return boundary because the
 * node/edge Stores are a process-wide cache, so an entity warmed by one requester's
 * RLS-filtered lazy-load is otherwise readable by any other requester straight from the cache.
 * Edges carry their own `properties.userId` (server-stamped), so a private edge between two
 * otherwise-visible nodes is a distinct leak surface from the nodes themselves.
 * @param {Object|null} entity A graph node or edge (Record or plain object) from an in-memory Store.
 * @param {String|null} requesterUserId The acting agent-identity node id, or null.
 * @returns {Boolean} true when the entity is visible to the requester.
 */
function isRlsVisible(entity, requesterUserId) {
    if (!entity) {
        return false;
    }

    const properties  = (entity.isRecord ? entity.get('properties') : entity.properties) || {},
          ownerUserId = properties.userId;

    // Compare canonical-to-canonical: the stored owner key (`properties.userId`) exists in BOTH the
    // `@`-prefixed (getAgentIdentityNodeId) and normalized (normalizeUserId(getUserId)) forms across
    // node types, while `requesterUserId` is resolved canonically (resolveRlsUserId). Normalizing the
    // owner key here matches an agent's OWN nodes regardless of which form they were stored in, and
    // never widens across tenants (distinct tenants normalize to distinct ids).
    return ownerUserId == null                              ||
           normalizeUserId(ownerUserId) === requesterUserId ||
           properties.sharedEntity === 1                    ||
           properties.sharedEntity === true                 ||
           properties.visibility === 'team';
}

/**
 * Resolves the canonical (normalized, no-`@`) RLS tenant key for the acting request. The isolation
 * key is the userId (`RequestContextService.getUserId`); `getAgentIdentityNodeId` is an `@`-prefixed
 * node id explicitly NOT for isolation, used only as a fallback when no userId is bound. Returning the
 * normalized form lets the RLS predicate match an owner's own nodes regardless of the (historically
 * inconsistent) stored `user_id` form.
 *
 * Namespace-disjointness invariant (per Grace's identity-boundary review): the only id this collapses
 * is `@X`↔`X` (one agent's two stamping forms). It therefore assumes tenant userIds and agent
 * identities occupy DISJOINT namespaces — a tenant userId equal to an agent identity sans-`@` (e.g.
 * tenant `neo-opus-grace` vs agent `@neo-opus-grace`) would normalize-collide and cross the boundary.
 * This holds today (tenant ids are gitlab / SHARED_USER_ID-shaped, never `@neo-*`).
 * @param {Object|null|undefined} rcs The request-bound RequestContextService.
 * @returns {String|null} Normalized userId, or null when no identity is bound.
 */
function resolveRlsUserId(rcs) {
    const raw = rcs?.getUserId?.() ?? rcs?.getAgentIdentityNodeId?.() ?? null;
    return raw == null ? null : normalizeUserId(raw);
}

/**
 * Validates the Native Edge Graph node-id contract before writes/deletes reach
 * the lower Store layer, where `null` otherwise looks object-like.
 * @param {*} id Candidate graph node id.
 * @returns {Boolean} true for non-empty string ids.
 */
function isValidGraphNodeId(id) {
    return typeof id === 'string' && id.length > 0;
}

const PROTECTED_EDGE_TYPES = Object.freeze([
    'IMPLEMENTS',
    'EXTENDS',
    'SYSTEM_TENET',
    'RESOLVES'
]);

/**
 * @summary Service that manages the SQLite Knowledge Graph (Nodes and Edges).
 *
 * It provides the topological layout of the Neo.mjs namespace, knowledge,
 * and history structurally mapping against semantic ChromaDB queries.
 *
 * @class Neo.ai.services.memory-core.GraphService
 * @extends Neo.core.Base
 * @singleton
 */
class GraphService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.GraphService'
         */
        className: 'Neo.ai.services.memory-core.GraphService',
        /**
         * @member {Object|null} db=null
         */
        db: null,
        /**
         * @member {Object|null} graphInitError=null
         */
        graphInitError: null,
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
            try {
                const dbPath              = aiConfig.storagePaths.graph;
                let storage               = Neo.create(SQLite, {dbPath: dbPath});
                await storage.ready();

                let memoryCoreGraph = Neo.get ? Neo.get('memory-core-graph') : Neo.idMap?.['memory-core-graph'];
                if (memoryCoreGraph) {
                    this.db         = memoryCoreGraph;
                    this.db.storage = storage;
                } else {
                    this.db = Neo.create(CoreDatabase, {
                        id     : 'memory-core-graph',
                        storage: storage
                    });
                }

                await storage.load();
                this.graphInitError = null;

                // Ensure the frontier node exists to prevent context frontier errors
                try {
                    this.db.getAdjacentNodes('frontier', 'both'); // trigger lazy load
                    if (!this.db.nodes.has('frontier')) {
                        this.upsertGlobalNode({
                            id         : 'frontier',
                            type       : 'SYSTEM_ANCHOR',
                            name       : 'Active Context Frontier',
                            description: 'The shifting focal point of the active Neo OS agent session.'
                        });
                    }
                } catch (error) {
                    logger.warn(`[GraphService] Non-fatal DB contention during 'frontier' seed: ${error.message}`);
                }

                // --- 1. THE GLOBAL SYSTEM PRIMER ---
                // Inject the Master Architecture Tenets directly into the Native Graph at boot.
                // Because this is anchored to the 'frontier' with a protected SYSTEM_TENET edge,
                // it acts as a deterministic onboarding payload for every agent session.
                try {
                    this.db.getAdjacentNodes('Neo-Master-Architecture', 'both');
                    if (!this.db.nodes.has('Neo-Master-Architecture')) {
                        this.upsertGlobalNode({
                            id         : 'Neo-Master-Architecture',
                            type       : 'System',
                            name       : 'Global System Primer',
                            description: 'Core framework tenets: 1. All Playwright tests must be run using "npm run test-unit -- [file]". No npx. 2. UI debugging and application state inspection must use the Neural Link MCP tools. 3. Look at .agents/skills for reusable agent workflows.'
                        });
                    }
                    this.linkGlobalNodes('frontier', 'Neo-Master-Architecture', 'SYSTEM_TENET', 1.0);
                } catch (error) {
                    logger.warn(`[GraphService] Non-fatal DB contention during Master Architecture seed: ${error.message}`);
                }

                // --- 2. AGENT IDENTITY SUBSTRATE SEEDING ---
                // Eliminates the "seed → restart-again" recovery loop for fresh local setups.
                // Auto-provision identity roots at boot so bindAgentIdentity doesn't throw on fresh setups.
                try {
                    for (const identity of IDENTITIES) {
                        // We use getAdjacentNodes as a trigger for lazy-loading into the cache
                        this.db.getAdjacentNodes(identity.id, 'both');

                        if (!this.db.nodes.has(identity.id)) {
                            this.upsertGlobalNode(identity);
                        } else {
                            // Defensive createdAt retention: Peek SQLite to preserve original timestamp
                            const row = storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(identity.id);
                            if (row) {
                                const rawData = JSON.parse(row.data);
                                if (rawData.properties?.createdAt) {
                                    const preserved = {...identity, properties: {...identity.properties, createdAt: rawData.properties.createdAt}};
                                    this.upsertGlobalNode(preserved);
                                    continue;
                                }
                            }
                            this.upsertGlobalNode(identity);
                        }
                    }
                } catch (error) {
                    logger.warn(`[GraphService] Non-fatal DB contention during Identity Substrate seed: ${error.message}`);
                }

                logger.log('[GraphService] SQLite database mounted securely via ai.graph.Database.');
            } catch (error) {
                this.db = null;
                this.graphInitError = {
                    message: error.message,
                    name   : error.name
                };
                logger.warn(`[GraphService] SQLite graph unavailable during init (degraded, graph-backed tools may fail): ${error.message}`);
            }
        })();

        await this._initPromise;
    }

    /**
     * Builds the canonical degraded-graph error surfaced by graph-backed Memory Core tools.
     * @param {String} surface Consumer surface reporting the unavailable graph.
     * @returns {Error}
     */
    createUnavailableError(surface='GraphService') {
        const reason = this.graphInitError?.message || 'graph database is unavailable';
        return new Error(`[${surface}] GraphService unavailable: ${reason}`);
    }

    /**
     * @summary Returns the mounted graph database or throws the canonical degraded-graph error.
     *
     * WAL-only paths such as `add_memory` must stay callable during graph startup degradation, but
     * graph-backed tool paths must fail closed with a stable error instead of leaking `TypeError`
     * from a `null` database dereference.
     * @param {String} surface Consumer surface requiring the graph.
     * @returns {Neo.ai.graph.Database}
     */
    requireDb(surface='GraphService') {
        if (!this.db) {
            throw this.createUnavailableError(surface);
        }

        return this.db;
    }

    /**
     * Upserts a Node representation into the graph securely linking the ID.
     * @important The `type` string is mapped directly to `node.label` to comply with strict Graph Database taxonomy (Node Labels).
     * @param {Object} nodeData
     */
    upsertNode({id, type, name, description, semanticVectorId, state, updatedAt, properties}) {
        if (!isValidGraphNodeId(id)) {
            throw new Error(`[GraphService] Cannot upsert graph node without a non-empty string id. Received: ${String(id)}`);
        }

        // Lazy-load from SQLite before in-memory check — prevents cold-cache stubs from
        // overwriting rich SQLite rows via addNodes' ON CONFLICT DO UPDATE semantics.
        // Mirrors the read path's cache-warm discipline before mutating cached records.
        this.db.getAdjacentNodes(id, 'both');

        let node = this.db.nodes.get(id);

        // Stamp the canonical normalized isolation key (mirrors the RLS read boundary) — never the @-form node id.
        let currentUserId = resolveRlsUserId(this.db.storage?.RequestContextService) ?? undefined;

        if (node) {
            const currentLabel = node.isRecord ? node.get('label') : node.label;
            const updatedLabel = type || currentLabel || 'NODE';

            if (node.isRecord) {
                node.set({ label: updatedLabel });
            } else {
                node.label = updatedLabel;
            }

            const currentProperties = node.isRecord ? node.get('properties') : node.properties;
            let p = Object.assign({}, currentProperties || {});
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

            if (properties !== undefined && typeof properties === 'object') {
                Object.assign(p, properties);
            }

            if (currentUserId !== undefined && p.userId === undefined) {
                p.userId = currentUserId;
            }

            if (node.isRecord) {
                node.set({ properties: p });
            } else {
                node.properties = p;
            }

            // Directly commit delta to SQLite since Store.update does not exist
            if (this.db.autoSave && this.db.storage) {
                this.db.storage.addNodes([node]);
                if (typeof this.db.acknowledgeLocalMutations === 'function') {
                    this.db.acknowledgeLocalMutations();
                }
            }
        } else {
            let p = {
                name       : name || id,
                description: description || '',
                semanticVectorId,
                state,
                updatedAt,
                ...(properties || {})
            };

            if (currentUserId !== undefined && p.userId === undefined) {
                p.userId = currentUserId;
            }

            this.db.addNode({
                id,
                label     : type || 'NODE',
                properties: p
            });
            // logger.debug(`Successfully added node to Database RAM: ${id}`);
        }
    }

    /**
     * Upserts a globally-visible system node, forcing `userId: null` so it stays
     * reachable to every tenant under RLS regardless of which boot harness creates
     * it first. Plain {@link GraphService#upsertNode} stamps the active request's
     * bound identity, which would isolate these shared sentinels (`frontier`, the
     * `Neo-Master-Architecture` primer, `_SYSTEM_STATE`, and the identity roots) to
     * a single tenant — they would then vanish from the graph for all others.
     * @param {Object} spec See {@link GraphService#upsertNode}; `properties.userId`
     * is forced to `null`.
     */
    upsertGlobalNode(spec) {
        this.upsertNode({...spec, properties: {...spec.properties, userId: null}});
    }

    /**
     * Links two globally-visible system nodes, forcing the edge's `userId: null` so the
     * **connection itself** stays visible to every tenant under RLS. {@link GraphService#getContextFrontier}
     * and {@link GraphService#getNeighbors} / {@link GraphService#queryNodeTopology} require BOTH the node
     * AND the edge to be RLS-visible, so a global sentinel reached only through a tenant-stamped edge
     * (the default {@link GraphService#linkNodes} stamps the active request's identity) would still vanish
     * from topology traversal for non-booting tenants — even when {@link GraphService#upsertGlobalNode}
     * already made the node itself global.
     * @param {String} source
     * @param {String} target
     * @param {String} relationship
     * @param {Number} [weight=1.0]
     */
    linkGlobalNodes(source, target, relationship, weight = 1.0) {
        this.linkNodes(source, target, relationship, weight, {userId: null});
    }

    /**
     * Links two nodes via a relationship tracking edge weight metadata.
     *
     * @summary Creates an edge between two nodes. This method executes as an atomic transaction
     * (if not already inside one) to prevent race conditions during SQLite WAL flushes. It also
     * features a cache-warm retry mechanism on FK verify miss to account for WAL-snapshot-lag
     * from other processes.
     *
     * @description
     * **Transaction Overhead:** Future callers should be aware that invoking `linkNodes` rapidly
     * in a hot path incurs SQLite transaction overhead.
     * **WAL Snapshot Lag:** If a peer process writes a node, the current connection's snapshot
     * might lack it temporarily. This method automatically attempts to warm the cache and retry
     * the FK verification before culling the edge.
     *
     * @param {String} source
     * @param {String} target
     * @param {String} relationship
     * @param {Number} weight
     * @param {Object} [properties={}] Additional edge metadata (e.g. justification, context_source).
     */
    linkNodes(source, target, relationship, weight = 1.0, properties = {}) {
        if (!this.db?.storage?.db) {
            return;
        } // Safe guard for SQLite backend

        const executeLink = () => {
            // Enforce Foreign Key constraints preemptively to prevent SQLite crash from hallucinated paths
            const verifyStmt = this.db.storage.db.prepare('SELECT count(*) as count FROM Nodes WHERE id IN (?, ?)');
            let count = verifyStmt.get(source, target).count;

            let expectedCount = source === target ? 1 : 2;

            if (count !== expectedCount) {
                // Cache-warm retry: If the count check fails, the node might exist in the SQLite WAL
                // from another agent but hasn't been synced to this connection's snapshot yet.
                // We force a cache warm (which invokes syncCache and WAL read) and re-verify.
                if (this.db && typeof this.db.getAdjacentNodes === 'function') {
                    // Ensure we attempt to warm both endpoints in case either is the missing link
                    this.db.getAdjacentNodes(source, 'both');
                    this.db.getAdjacentNodes(target, 'both');

                    // Re-evaluate the count after forcing synchronization
                    count = verifyStmt.get(source, target).count;
                }
            }

            if (count !== expectedCount) {
                 logger.warn(`[GraphService] Culling hallucinated edge mapping: ${source} -> ${target} (count was ${count})`);
                 return;
            }

            const stmt     = this.db.storage.db.prepare(`SELECT id, json_extract(data, '$.properties.weight') as weight
                                                         FROM Edges
                                                         WHERE source = ?
                                                           AND target = ?
                                                           AND type = ?`);
            const existing = stmt.get(source, target, relationship);

            // Stamp the canonical normalized isolation key (mirrors the RLS read boundary) — never the @-form node id.
            let currentUserId = resolveRlsUserId(this.db.storage?.RequestContextService) ?? undefined;
            let edgeProperties = {weight, ...properties};
            if (currentUserId !== undefined && edgeProperties.userId === undefined) {
                edgeProperties.userId = currentUserId;
            }

            if (!existing) {
                this.db.addEdge({
                    id        : globalThis.crypto.randomUUID(),
                    source,
                    target,
                    type      : relationship,
                    properties: edgeProperties
                });
            } else {
                const currentWeight = parseFloat(existing.weight) || 1.0;
                const newWeight     = Math.min(currentWeight + (weight * 0.1), 5.0);

                // Fetch the entire current JSON to merge new properties natively
                const dataStmt = this.db.storage.db.prepare(`SELECT data FROM Edges WHERE id = ?`);
                const row = dataStmt.get(existing.id);
                if (row && row.data) {
                    let parsed = JSON.parse(row.data);
                    parsed.properties = { ...(parsed.properties || {}), ...edgeProperties, weight: newWeight };

                    const updateStmt = this.db.storage.db.prepare(`UPDATE Edges SET data = ? WHERE id = ?`);
                    updateStmt.run(JSON.stringify(parsed), existing.id);
                }

                // Keep RAM cache functionally coherent if edge actively exists
                let ramEdge = this.db.edges.get(existing.id);
                if (ramEdge) {
                    if (ramEdge.isRecord) {
                        const newProps = { ...(ramEdge.get('properties') || {}), ...edgeProperties, weight: newWeight };
                        ramEdge.set('properties', newProps);
                    } else {
                        ramEdge.properties.weight = newWeight;
                        Object.assign(ramEdge.properties, edgeProperties);
                    }
                }

                if (typeof this.db.acknowledgeLocalMutations === 'function') {
                    this.db.acknowledgeLocalMutations();
                }
            }
        };

        if (this.db.isExecutingTransaction) {
            executeLink();
        } else {
            this.db.transaction(executeLink);
        }
    }

    /**
     * Async variant of {@link GraphService#linkNodes linkNodes} that performs **lazy
     * back-fill** on missing endpoints before attempting the edge creation.
     *
     * Where the sync `linkNodes` silently culls edges whose source or target is absent from the
     * graph, this async path first attempts to materialize the missing endpoints from their
     * Chroma source rows via `MemorySessionIngestor.ingestSingleRow`. Back-fill applies only to
     * node IDs matching the `memory:<chromaId>` or `session:<sessionId>` prefix (case-insensitive
     * — consumes the uppercase-prefix convention used by queued lazy edges without requiring a
     * canonical-format migration). Unrecognized prefixes fall
     * through to the sync `linkNodes` cull behavior unchanged.
     *
     * **Why a separate method rather than making `linkNodes` async:** the sync `linkNodes` is
     * called from many synchronous code paths where adding an `await` would have wide blast
     * radius. Back-fill-aware callers such as `LazyEdgeDrainer`, mailbox `IN_REPLY_TO`, and
     * identity `AUTHORED_BY` edge creators use this async path; existing sync callers remain
     * unaffected.
     *
     * **Prefix normalization:** if either endpoint uses the uppercase `MEMORY:`/`SESSION:`
     * prefix, the back-filled node lands under the canonical lowercase ID and the edge is
     * created against the canonical form. Callers should expect the edge's actual source/target
     * in SQLite to be the normalized lowercase variant regardless of the input case.
     *
     * @param {String} source Source node ID
     * @param {String} target Target node ID
     * @param {String} relationship Edge type
     * @param {Number} [weight=1.0] Edge weight
     * @param {Object} [properties={}] Additional edge metadata
     * @returns {Promise<Boolean>} `true` if the edge was created or already existed; `false` if
     *     back-fill failed or the endpoints were unrecognized/unresolvable.
     */
    async linkNodesAsync(source, target, relationship, weight = 1.0, properties = {}) {
        if (!this.db?.storage?.db) {
            return false;
        }

        const
            normalizedSource = this.normalizeGraphNodeId(source),
            normalizedTarget = this.normalizeGraphNodeId(target);

        const
            sourceReady = await this.ensureNodeExists(normalizedSource),
            targetReady = await this.ensureNodeExists(normalizedTarget);

        if (!sourceReady || !targetReady) {
            logger.warn(`[GraphService] linkNodesAsync: endpoint resolution failed (source=${sourceReady}, target=${targetReady}) — ${normalizedSource} -> ${normalizedTarget}`);
            return false;
        }

        this.linkNodes(normalizedSource, normalizedTarget, relationship, weight, properties);
        return true;
    }

    /**
     * Ensures a graph node exists, attempting lazy back-fill from its Chroma source row if
     * absent. Used by `linkNodesAsync` and the `LazyEdgeDrainer` to resolve missing endpoints
     * before edge creation.
     *
     * Back-fill applies only to the `memory:` / `session:` prefix pattern — nodes managed by
     * other substrates (concepts, classes, AgentIdentity, files) remain the responsibility of
     * their owning ingestor. Returns `false` for unrecognized-prefix IDs: callers treat that as
     * "genuine hallucination, cull" rather than "back-fill failed".
     *
     * **Dynamic import rationale:** `MemorySessionIngestor` imports `GraphService` via
     * `ai/services.mjs`, so a static import here would create a module-load cycle. The dynamic
     * import resolves at call-time, after both modules have finished their top-level evaluation.
     *
     * @param {String} graphNodeId Canonical-form graph node ID to resolve
     * @returns {Promise<Boolean>} `true` if the node now exists (was present or was successfully
     *     back-filled); `false` otherwise.
     */
    async ensureNodeExists(graphNodeId) {
        if (!this.db?.storage?.db || !graphNodeId) {
            return false;
        }

        if (this.db.nodes.has(graphNodeId)) {
            return true;
        }

        const {default: MemorySessionIngestor} = await import('../../services/ingestion/MemorySessionIngestor.mjs');
        const result = await MemorySessionIngestor.ingestSingleRow(graphNodeId);

        if (!result.success) {
            if (result.reason !== 'unrecognized-prefix') {
                logger.warn(`[GraphService] ensureNodeExists: back-fill failed for ${graphNodeId} — ${result.reason}${result.error ? ' (' + result.error + ')' : ''}`);
            }
            return false;
        }

        return this.db.nodes.has(result.graphNodeId || graphNodeId);
    }

    /**
     * Normalizes a graph node ID's prefix to its canonical lowercase form. Non-`memory:` /
     * non-`session:` IDs pass through unchanged. Used by `linkNodesAsync` to accept edges
     * queued with the uppercase `MEMORY:`/`SESSION:` convention without polluting the
     * graph with case-variant duplicate nodes.
     *
     * @param {String} id Raw graph node ID
     * @returns {String} Normalized ID (lowercase prefix when recognized, unchanged otherwise)
     */
    normalizeGraphNodeId(id) {
        if (!id || typeof id !== 'string') {
            return id;
        }

        const lower = id.toLowerCase();

        if (lower.startsWith('memory:')) {
            return 'memory:' + id.slice(7);
        }

        if (lower.startsWith('session:')) {
            return 'session:' + id.slice(8);
        }

        return id;
    }

    /**
     * Applies geometric weight decay mapping to existing graph relationships over time.
     * Enforces a 24-hour algorithmic lock to prevent amnesia under high execution frequency.
     *
     * @param {Number} decayFactor
     * @param {Number} pruningThreshold
     * @param {Boolean} force Bypass the 24-hour lock (used strictly for manual forcing/tuning)
     */
    decayGlobalTopology(decayFactor = aiConfig.decayFactor, pruningThreshold = 0.2, force = false) {
        if (!this.db?.storage?.db) {
            return;
        }

        // Initialize or fetch the global _SYSTEM_STATE node for cycle tracking
        let systemNode = this.db.nodes.get('_SYSTEM_STATE');
        if (!systemNode) {
            this.upsertGlobalNode({
                id         : '_SYSTEM_STATE',
                type       : 'SYSTEM_CLOCK',
                name       : 'Global System Clock',
                description: 'Tracks algorithmic time intervals for global physics.'
            });
            systemNode = this.db.nodes.get('_SYSTEM_STATE');
        }

        const systemProperties = systemNode.isRecord ? systemNode.get('properties') : systemNode.properties;
        const lastDecayedAt    = systemProperties?.lastDecayedAt || 0;
        const now = Date.now();
        const hoursElapsed = (now - lastDecayedAt) / 3600000;

        // 24-hour Algorithmic Lock
        if (!force && hoursElapsed < 24) {
            logger.info(`[GraphService] Skipping global topology decay (Algorithmic Lock: only ${hoursElapsed.toFixed(1)}h elapsed).`);
            return;
        }

        logger.info(`[GraphService] Running ambient topology decay (factor: ${decayFactor})...`);

        const protectedEdgePlaceholders = PROTECTED_EDGE_TYPES.map(() => '?').join(', ');

        // Shield durable structural/provenance edges completely from decay and pruning.
        const decayStmt = this.db.storage.db.prepare(`
            UPDATE Edges
            SET data = json_set(data, '$.properties.weight',
                                MAX(COALESCE(CAST(json_extract(data, '$.properties.weight') AS REAL), 1.0) * ?, 0.1))
            WHERE type NOT IN (${protectedEdgePlaceholders})
        `);
        decayStmt.run(decayFactor, ...PROTECTED_EDGE_TYPES);

        // Prune dead pathways permanently mapping via physical SQL
        const pruneStmt = this.db.storage.db.prepare(`
            DELETE
            FROM Edges
            WHERE type NOT IN (${protectedEdgePlaceholders})
              AND COALESCE(CAST(json_extract(data, '$.properties.weight') AS REAL), 1.0) < ?
        `);
        const info      = pruneStmt.run(...PROTECTED_EDGE_TYPES, pruningThreshold);

        // Commit global clock update
        this.upsertGlobalNode({
            id        : '_SYSTEM_STATE',
            type      : systemNode.isRecord ? systemNode.get('label') : systemNode.label,
            properties: {
                ...(systemProperties || {}),
                lastDecayedAt: now
            }
        });

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

        // RLS: the node Store is a process-wide cache — re-check visibility at the
        // return boundary so a cross-requester cache-warmed node is not leaked.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);
        if (!isRlsVisible(node, rlsUserId)) {
            return null;
        }

        const
            nodeId     = node.isRecord ? node.get('id') : node.id,
            label      = node.isRecord ? node.get('label') : node.label,
            properties = node.isRecord ? node.get('properties') : node.properties;

        return {
            id              : nodeId,
            type            : label,
            name            : properties?.name,
            description     : properties?.description,
            semanticVectorId: properties?.semanticVectorId,
            state           : properties?.state
        };
    }

    /**
     * @summary Retrieves a node's full record — including the `properties` blob that {@link GraphService#getNode} strips.
     *
     * `getNode` projects only the hoisted fields (`id` / `type` / `name` / `description` / `semanticVectorId` /
     * `state`); a consumer that stores a structured payload under `properties` needs the raw
     * `properties` object. This getter applies the identical RLS visibility re-check as
     * `getNode` — a cross-tenant node returns `null` — so it is a
     * properties-returning read, not an RLS bypass.
     * @param {Object} data
     * @param {String} data.id Node id.
     * @returns {Object|null} `{id, type, properties}`, or `null` when the node is absent or RLS-invisible.
     */
    getNodeRecord({id}) {
        // Guarantee lazy-loading from SQLite triggers if not cached (mirrors getNode).
        this.db.getAdjacentNodes(id, 'both');

        const node = this.db.nodes.get(id);
        if (!node) {
            return null;
        }

        // RLS: the node Store is a process-wide cache — re-check visibility at the
        // return boundary so a cross-requester cache-warmed node is not leaked.
        const rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);
        if (!isRlsVisible(node, rlsUserId)) {
            return null;
        }

        return {
            id        : node.isRecord ? node.get('id') : node.id,
            type      : node.isRecord ? node.get('label') : node.label,
            properties: (node.isRecord ? node.get('properties') : node.properties) || {}
        };
    }

    /**
     * Dynamically computes the structural gravity (inbound/outbound edges) for a node natively via SQLite.
     * @param {String} id
     * @returns {Object} { in_degree, out_degree }
     */
    getNodeGravity(id) {
        if (!this.db?.storage?.db) {
            return { in_degree: 0, out_degree: 0 };
        }

        try {
            const inStmt = this.db.storage.db.prepare('SELECT count(*) as count FROM Edges WHERE target = ?');
            const inCount = inStmt.get(id).count || 0;

            const outStmt = this.db.storage.db.prepare('SELECT count(*) as count FROM Edges WHERE source = ?');
            const outCount = outStmt.get(id).count || 0;

            return { in_degree: inCount, out_degree: outCount };
        } catch (e) {
            return { in_degree: 0, out_degree: 0 };
        }
    }

    /**
     * Retrieves adjacent connected nodes (neighbors) alongside relationship metadata.
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object} Object containing connected Node objects with edge relationship mapping.
     *     Neighbor objects include `semanticVectorId` when present on the adjacent node,
     *     enabling vector-backed consumers such as `preBriefSession` to hydrate context.
     */
    getNeighbors({id}) {
        // Guarantee lazy-loading vicinity topology securely
        this.db.getAdjacentNodes(id, 'both');

        // RLS: resolve the requester once; do not expose the vicinity of a node the
        // requester cannot see, and filter each neighbor by node + edge visibility.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService),
            rootNode  = this.db.nodes.get(id);

        if (!rootNode || !isRlsVisible(rootNode, rlsUserId)) {
            return {neighbors: []};
        }

        let results  = [],
            inbound  = this.db.edges.getByIndex('target', id),
            outbound = this.db.edges.getByIndex('source', id);

        [...inbound, ...outbound].forEach(e => {
            let adjacentId = e.source === id ? e.target : e.source;
            let node       = this.db.nodes.get(adjacentId);
            // A neighbor is exposed only when BOTH the adjacent node and the connecting
            // edge are RLS-visible — a private edge between visible nodes still leaks.
            if (node && isRlsVisible(node, rlsUserId) && isRlsVisible(e, rlsUserId)) {
                results.push({
                    id              : node.id,
                    type            : node.label,
                    name            : node.properties?.name,
                    description     : node.properties?.description,
                    semanticVectorId: node.properties?.semanticVectorId,
                    relationship    : e.type,
                    weight          : e.properties?.weight || 1.0,
                    source          : e.source,
                    target          : e.target
                });
            }
        });

        return {neighbors: results};
    }

    /**
     * Performs a text-based fuzzy search across node topology to find structural entities.
     * @param {Object} data
     * @param {String} data.query
     * @returns {Object} List of matching Nodes.
     */
    searchNodes({query}) {
        if (!this.db?.storage?.db) {
            return {nodes: []};
        }

        let q = `%${query.toLowerCase()}%`;

        const userId = resolveRlsUserId(this.db.storage?.RequestContextService);

        // Match the canonical (no-`@`) key AND its `@`-prefixed legacy form — the user_id column was
        // written in both (see isRlsVisible) — so own-private rows stay visible to their owner
        // regardless of stored form, without widening to other tenants.
        let rlsClause = `AND (user_id = ? OR user_id = ? OR user_id IS NULL OR json_extract(data, '$.properties.sharedEntity') = 1 OR json_extract(data, '$.properties.visibility') = 'team')`;

        const stmt = this.db.storage.db.prepare(`
            SELECT data FROM Nodes
            WHERE (lower(json_extract(data, '$.properties.name')) LIKE ?
               OR lower(json_extract(data, '$.properties.description')) LIKE ?
               OR lower(id) LIKE ?)
              ${rlsClause}
            LIMIT 50
        `);

        let matches = [];
        const rows = stmt.all(q, q, q, userId, userId == null ? null : '@' + userId);
        for (const row of rows) {
            let node = JSON.parse(row.data);
            matches.push({
                id         : node.id,
                type       : node.label,
                name       : node.properties?.name,
                description: node.properties?.description
            });
        }

        return {nodes: matches};
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

        // RLS: the frontier anchor is shared, but its strategic neighbors may be
        // tenant-private — filter them at the return boundary.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);

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

                // Actively filter out CLOSED structural paths plus RLS-invisible nodes/edges.
                if (node && isRlsVisible(node, rlsUserId) && isRlsVisible(e, rlsUserId) && node.properties?.state !== 'CLOSED' && !node.properties?.archivedAt) {
                    topology.strategicNeighbors.push({
                        id              : node.id,
                        type            : node.label,
                        name            : node.properties?.name,
                        description     : node.properties?.description,
                        semanticVectorId: node.properties?.semanticVectorId,
                        relationship    : e.type,
                        weight,
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

        // RLS: the node Store is a process-wide cache — re-check the cache-resident
        // root and every traversed node at the return boundary.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);
        if (!isRlsVisible(rootNode, rlsUserId)) {
            logger.info(`[GraphService] Node ${nodeId} not visible to the active requester.`);
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
                    let adjacentId = e.source === id ? e.target : e.source;
                    let n          = this.db.nodes.get(adjacentId);

                    // RLS: skip an edge that is itself not visible, or whose far node
                    // is absent or not visible — do not leak the node, edge, or traverse it.
                    if (!n || !isRlsVisible(n, rlsUserId) || !isRlsVisible(e, rlsUserId)) {
                        return;
                    }

                    if (!visitedEdges.has(e.id)) {
                        visitedEdges.add(e.id);
                        topology.edges.push({
                            source      : e.source,
                            target      : e.target,
                            relationship: e.type,
                            weight      : e.properties?.weight || 1.0
                        });
                    }

                    if (!visitedNodes.has(adjacentId)) {
                        visitedNodes.add(adjacentId);
                        nextLevel.add(adjacentId);
                        topology.nodes.push({
                            id              : n.id,
                            type            : n.label,
                            name            : n.properties?.name,
                            description     : n.properties?.description,
                            semanticVectorId: n.properties?.semanticVectorId
                        });
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
            this.upsertGlobalNode({
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
                id        : globalThis.crypto.randomUUID(),
                source    : 'frontier',
                target    : targetNodeId,
                type      : relationship,
                properties: {weight}
            });
        }

        logger.info(`[GraphService] Mutated [Frontier] -> ${targetNodeId} w/ weight ${weight}`);

        return {success: true, targetNodeId, newWeight: weight};
    }

    /**
     * Finds nodes that have lost all structural edges to trigger algorithmic forgetting.
     * Protects structural-anchor node types (`SYSTEM_ANCHOR`, `System`, `ADR`, `ISSUE`, `DISCUSSION`,
     * `PULL_REQUEST`, `SESSION`, `MEMORY`, `AgentIdentity`, `BroadcastSentinel`, `WAKE_SUBSCRIPTION`) from pruning regardless of edge state. `SESSION` and
     * `MEMORY` are protected because they are load-bearing anchors for future mailbox
     * (`IN_REPLY_TO`), identity (`AUTHORED_BY`), and provenance (`MENTIONED_IN`) edges — they may
     * be momentarily edgeless during the ingestion window or for empty sessions, and must persist
     * so downstream edge-creators attach to real targets.
     * `AgentIdentity` and `BroadcastSentinel` are protected to prevent silent wipes during
     * idle or fresh Memory Core states prior to their first activity edges.
     * `WAKE_SUBSCRIPTION` nodes are protected natively against GC race conditions during background
     * maintenance sweeps. `ADR` nodes are durable architectural authority records, so they remain
     * graph-queryable even before relationship edges are materialized.
     * @returns {String[]} Array of node IDs mapping to orphaned vectors.
     */
    getOrphanedNodes() {
        if (!this.db || !this.db.storage || !this.db.storage.db) return [];

        const stmt = this.db.storage.db.prepare(`
            SELECT n.id, n.data
            FROM Nodes n
            WHERE NOT EXISTS (SELECT 1 FROM Edges WHERE source = n.id)
              AND NOT EXISTS (SELECT 1 FROM Edges WHERE target = n.id)
        `);

        let orphaned = [];
        for (let row of stmt.all()) {
            let data;
            try {
                // n.data maps to JSON payload storing the node label
                data = JSON.parse(row.data);
            } catch(e) { continue; }

            if (data.label !== 'SYSTEM_ANCHOR' && data.label !== 'System' && data.label !== 'ADR' && data.label !== 'ISSUE' && data.label !== 'DISCUSSION' && data.label !== 'PULL_REQUEST' && data.label !== 'SESSION' && data.label !== 'MEMORY' && data.label !== 'AgentIdentity' && data.label !== 'BroadcastSentinel' && data.label !== 'WAKE_SUBSCRIPTION') {
                orphaned.push(row.id);
            }
        }

        return orphaned;
    }

    /**
     * @summary On-demand Memory/Session graph lifecycle census for storage-growth observability.
     *
     * Returns counts of durable `MEMORY` / `SESSION` provenance-anchor nodes plus the graph SQLite
     * file sizes (main / WAL / SHM). Deliberately **not** a healthcheck field and **not** an MCP tool:
     * the optional incident-edge count is an `O(edges)` scan (multi-second at millions of edges, growing
     * linearly with the graph), so this is invoked on demand via the maintenance report script, never on
     * the healthcheck hot path or in an always-loaded tool-response schema. The node counts + file sizes
     * are cheap (sub-second); the incident-edge counts are opt-in via `includeIncidentEdges`.
     *
     * @param {Object} [options]
     * @param {Boolean} [options.includeIncidentEdges=false] Also count edges incident to MEMORY/SESSION
     *     nodes — an `O(edges)` scan, off by default so the census stays cheap at scale.
     * @returns {Promise<{available: Boolean, memoryNodes: Number, sessionNodes: Number, sqliteBytes: Number, sqliteWalBytes: Number, sqliteShmBytes: Number, measuredAt: String, memoryIncidentEdges: Number, sessionIncidentEdges: Number, error: String}>} Incident-edge counts only present with `includeIncidentEdges`; `error` only on failure.
     */
    async getLifecycleCensus({includeIncidentEdges = false} = {}) {
        const measuredAt = new Date().toISOString(),
              storage    = this.db?.storage,
              sqliteDb   = storage?.db,
              dbPath     = storage?.dbPath;

        if (!sqliteDb || !dbPath) {
            return {
                available  : false, memoryNodes: 0, sessionNodes: 0,
                sqliteBytes: 0, sqliteWalBytes: 0, sqliteShmBytes: 0,
                measuredAt, error: 'Graph SQLite storage is unavailable.'
            };
        }

        try {
            const countNodes = label => Number(sqliteDb.prepare(`
                SELECT COUNT(*) AS count FROM Nodes WHERE json_extract(data, '$.label') = ?
            `).get(label)?.count || 0);

            const fileSize = async filePath => {
                try {
                    return Number((await fsExtra.stat(filePath)).size || 0);
                } catch (e) {
                    return 0;
                }
            };

            const [sqliteBytes, sqliteWalBytes, sqliteShmBytes] = await Promise.all([
                fileSize(dbPath),
                fileSize(`${dbPath}-wal`),
                fileSize(`${dbPath}-shm`)
            ]);

            const census = {
                available   : true,
                memoryNodes : countNodes('MEMORY'),
                sessionNodes: countNodes('SESSION'),
                sqliteBytes, sqliteWalBytes, sqliteShmBytes,
                measuredAt
            };

            if (includeIncidentEdges) {
                const countIncidentEdges = label => Number(sqliteDb.prepare(`
                    SELECT COUNT(*) AS count FROM Edges e
                    WHERE EXISTS (SELECT 1 FROM Nodes n WHERE n.id = e.source AND json_extract(n.data, '$.label') = ?)
                       OR EXISTS (SELECT 1 FROM Nodes n WHERE n.id = e.target AND json_extract(n.data, '$.label') = ?)
                `).get(label, label)?.count || 0);

                census.memoryIncidentEdges  = countIncidentEdges('MEMORY');
                census.sessionIncidentEdges = countIncidentEdges('SESSION');
            }

            return census;
        } catch (e) {
            return {
                available  : false, memoryNodes: 0, sessionNodes: 0,
                sqliteBytes: 0, sqliteWalBytes: 0, sqliteShmBytes: 0,
                measuredAt, error: e?.message || String(e)
            };
        }
    }

    /**
     * Bulk atomic deletion of graph nodes mapping back to SQLite natively.
     * @param {String[]} nodeIds
     */
    removeNodes(nodeIds) {
        if (!nodeIds || nodeIds.length === 0) return;

        const invalidNodeIds = nodeIds.filter(id => !isValidGraphNodeId(id));

        if (invalidNodeIds.length > 0) {
            throw new Error(`[GraphService] removeNodes received invalid node id(s): ${invalidNodeIds.map(id => String(id)).join(', ')}`);
        }

        this.db.transaction(() => {
            nodeIds.forEach(id => this.db.removeNode(id));
        });
        logger.debug(`[GraphService] Obliterated ${nodeIds.length} Nodes from Native Engine synchronously.`);
    }

    /**
     * @summary Count SESSION-labeled graph nodes (deployment-wide, untenanted).
     * This is **Axis B** of the 5-axis REM observability model: the count of
     * sessions actually committed to the Semantic Graph by the REM digest pipeline.
     *
     * Mirrors the deployment-wide filter shape used by
     * {@link Neo.ai.services.memory-core.HealthService}: `label='SESSION'` and
     * empty `properties.userId`. A tenant-scoped variant
     * (`getSessionNodeCount({userId})`) is a future extension if operator
     * deployments need per-tenant axis counts.
     *
     * **Important divergence semantic:** the divergence between this count and
     * {@link Neo.ai.services.memory-core.managers.ChromaManager#getGraphDigestedCount}
     * is the empirical signal the 5-axis model surfaces: large divergence points
     * to silent failures in the graph-write arm of
     * DreamService.processUndigestedSessions. A healthy pipeline produces
     * `chroma.graphDigested ≈ graph.SESSION` within batch-window tolerance.
     *
     * @returns {Number} Count of deployment-wide SESSION nodes; 0 on storage error
     * @see Neo.ai.services.memory-core.managers.ChromaManager#getGraphDigestedCount
     */
    getSessionNodeCount() {
        try {
            const sqliteDb = this.db?.storage?.db;
            if (!sqliteDb) return 0;

            const stmt = sqliteDb.prepare(`
                SELECT COUNT(*) AS c FROM Nodes
                WHERE json_extract(data, '$.label') = 'SESSION'
                  AND COALESCE(json_extract(data, '$.properties.userId'), '') = ''
            `);
            return stmt.get().c;
        } catch (e) {
            logger.warn('[GraphService] getSessionNodeCount failed:', e?.message ?? e);
            return 0;
        }
    }

    /**
     * @summary Count inbound entity-relation edges TO a specific session node.
     * This is **Axis C** of the 5-axis REM observability model: the per-session
     * extraction yield, measured as the number of graph edges where the session
     * node is the TARGET (the canonical provenance direction).
     *
     * **Edge-direction contract:** the session node is the TARGET of provenance
     * edges from extracted entities (memories ORIGINATES_IN session;
     * concepts/classes DISCUSSED_IN session; etc.). Counting
     * `Edges.target = session:<id>` captures the
     * full extraction-yield surface — a session with zero inbound edges
     * either had no entities OR suffered the extraction-failed-silent path
     * such as repeated JSON parse exhaustion returning `null`.
     *
     * **Case normalization:** delegated to
     * {@link GraphService#normalizeGraphNodeId}, which canonicalizes `memory:`
     * / `session:` prefixes to lowercase regardless of input case. The canonical
     * SQLite-stored convention is lowercase `session:<id>`. The `SESSION:`
     * uppercase form appears in SemanticGraphExtractor LLM prompts as an
     * instruction shape but is normalized to lowercase before any persistence;
     * querying SQLite with the uppercase form returns 0.
     *
     * @param {String} sessionId Session ID, with or without `session:` / `SESSION:` prefix
     * @returns {Number} Count of inbound edges; 0 on storage error, unknown session, or empty session
     * @see GraphService#normalizeGraphNodeId — case-canonicalization primitive
     */
    getSessionEntityCount(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') return 0;

        try {
            const sqliteDb = this.db?.storage?.db;
            if (!sqliteDb) return 0;

            // Normalize via the canonical primitive — handles both bare `<id>`
            // and prefixed `session:<id>` / `SESSION:<id>` inputs, always
            // returning the lowercase `session:<id>` form that matches SQLite
            // storage. For a bare-id input, manually prefix first so
            // normalizeGraphNodeId has a recognizable shape.
            const prefixed = /^(session|memory):/i.test(sessionId)
                ? sessionId
                : `session:${sessionId}`;
            const normalizedId = this.normalizeGraphNodeId(prefixed);

            const stmt = sqliteDb.prepare('SELECT count(*) as count FROM Edges WHERE target = ?');
            return stmt.get(normalizedId).count;
        } catch (e) {
            logger.warn('[GraphService] getSessionEntityCount failed:', e?.message ?? e);
            return 0;
        }
    }
}

export default Neo.setupClass(GraphService);
