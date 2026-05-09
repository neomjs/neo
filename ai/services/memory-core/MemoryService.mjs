import Base                  from '../../../src/core/Base.mjs';
import StorageRouter         from './managers/StorageRouter.mjs';
import crypto                from 'crypto';
import GraphService          from './GraphService.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';
import SessionService        from './SessionService.mjs';
import aiConfig              from '../../mcp/server/memory-core/config.mjs';
import RequestContextService, {SHARED_USER_ID, normalizeUserId} from '../../mcp/server/shared/services/RequestContextService.mjs';

/**
 * Computes a lightweight inbox snapshot for the bound AgentIdentity to piggyback on every
 * `add_memory` response — the per-turn **mailbox delta signal** shipped with #10174.
 *
 * Why it lives here rather than in `MailboxService`: `add_memory` is called by the agent's
 * Memory Core Protocol every single turn (per `CLAUDE.md §4.2`'s Consolidate-Then-Save mandate).
 * Extending its response payload gives agents push-style inbox awareness without adding a new
 * polling endpoint and without waiting for the `ai/graph/Database.mjs` in-memory edge cache to
 * gain cross-process coherence. The query intentionally bypasses `GraphService.db.edges.items`
 * (the per-process in-memory cache that never sees remote writes without a server restart —
 * observed empirically during the #10174 diagnostic) and reads straight from SQLite via
 * `GraphService.db.storage.db.prepare()`, so a message sent by another harness's MCP server is
 * visible as soon as its transaction commits.
 *
 * **Failure mode is non-fatal.** Any error inside this helper is swallowed and logged — the
 * caller's memory write must always succeed on its own merits. An agent briefly missing its
 * mailbox preview is an inconvenience; a silently dropped memory write would be a critical
 * data-loss regression.
 *
 * @returns {{unreadCount: Number, latestPreview: Object|null}|null} A snapshot block with the
 *     unread count + most-recent unread message preview (messageId, subject, from, sentAt).
 *     Returns `null` when the caller has no bound agent identity (single-tenant fallthrough —
 *     consistent with every other RequestContext-scoped operation in this service).
 * @private
 */
function buildMailboxDelta() {
    const me = RequestContextService.getAgentIdentityNodeId();
    if (!me) return null;

    const sqlite = GraphService.db?.storage?.db;
    if (!sqlite) return null;

    try {
        // Unread-count: edges of type SENT_TO whose target is either the caller's bound
        // identity OR the `AGENT:*` broadcast sentinel (seeded per #10174). readAt-null on the
        // joined MESSAGE node filters to unread. DISTINCT e.source defends against duplicate
        // SENT_TO edges (shouldn't happen in current schema, but cheap insurance).
        const unreadRow = sqlite.prepare(`
            SELECT COUNT(DISTINCT e.source) AS unreadCount
            FROM Edges e
            JOIN Nodes n ON n.id = e.source
            WHERE e.type = 'SENT_TO'
              AND (e.target = ? OR e.target = 'AGENT:*')
              AND json_extract(n.data, '$.properties.readAt') IS NULL
        `).get(me);

        // Latest unread preview: newest sentAt wins. The correlated subquery resolves the
        // sender identity via the message's SENT_BY edge. `messageId` on the outer select is
        // the MESSAGE node id (redundant with n.id but explicit for caller ergonomics).
        const previewRow = sqlite.prepare(`
            SELECT
                n.id AS messageId,
                json_extract(n.data, '$.properties.subject') AS subject,
                json_extract(n.data, '$.properties.sentAt') AS sentAt,
                (
                    SELECT se.target FROM Edges se
                    WHERE se.source = n.id AND se.type = 'SENT_BY'
                    LIMIT 1
                ) AS "from"
            FROM Edges e
            JOIN Nodes n ON n.id = e.source
            WHERE e.type = 'SENT_TO'
              AND (e.target = ? OR e.target = 'AGENT:*')
              AND json_extract(n.data, '$.properties.readAt') IS NULL
            ORDER BY json_extract(n.data, '$.properties.sentAt') DESC
            LIMIT 1
        `).get(me);

        return {
            unreadCount  : unreadRow?.unreadCount ?? 0,
            latestPreview: previewRow || null
        };
    } catch (error) {
        logger.warn('[MemoryService] Mailbox delta query failed (non-fatal, memory write unaffected):', error.message);
        return null;
    }
}


/**
 * @summary Service for handling adding, listing, and querying agent memories.
 *
 * This service acts as the primary interface for interacting with the 'memories' collection in ChromaDB.
 * It handles the creation of new memory entries (including embedding generation), retrieving memories by session,
 * and performing semantic searches to find relevant past interactions.
 *
 * **Multi-tenant isolation (Epic #9999, sub-epic #10016, ticket #10000):** When a request arrives
 * via SSE transport with a valid OIDC Bearer token, `RequestContextService.getUserId()` returns
 * the authenticated user's identifier (derived from the token's `preferred_username` / `sub`
 * claim). Writes (`addMemory`) tag ChromaDB metadata with that `userId`; reads (`listMemories`,
 * `queryMemories`, and the graph-bridged summary fetches inside `getContextFrontier` and
 * `preBriefSession`) apply a `where: {userId}` filter so tenants only see their own data. In
 * stdio transport mode no request context is active, `getUserId()` returns `undefined`, and
 * writes + reads fall through unchanged — single-tenant backward-compat. The team-vs-private
 * toggle (#10010) will later let operators opt out of the read filter while keeping the write
 * tag.
 *
 * @class Neo.ai.services.memory-core.MemoryService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
 */
class MemoryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.MemoryService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.MemoryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await StorageRouter.ready();
    }

    /**
     * Adds a new memory to the collection.
     * @param {Object} options
     * @param {String} options.prompt    The user's prompt.
     * @param {String} options.response  The agent's response.
     * @param {String} options.thought   The agent's internal thought process.
     * @param {String} [options.sessionId] The ID of the session this memory belongs to. If omitted, resolves from the request-bound `Mcp-Session-Id` header when present.
     * @param {String} [options.agent]   The agent profile (e.g. 'antigravity').
     * @param {String} [options.model]   The model name (e.g. 'gemini-3.1-pro').
     * @param {Number} [options.amountToolCalls] The number of tool calls executed during the turn.
     * @param {Array|String} [options.toolsUsed] Descriptions or array of tools used.
     * @returns {Promise<{id: string, sessionId: string, timestamp: string, message: string, mailbox: Object|null}>}
     *     Memory-write confirmation plus a per-turn **mailbox delta signal** (`mailbox` block —
     *     `{unreadCount, latestPreview}` when the caller has a bound AgentIdentity, `null`
     *     otherwise). Piggybacks inbox awareness on the protocol's mandatory per-turn save,
     *     bypassing the in-memory graph cache so cross-harness writes surface immediately —
     *     see {@link buildMailboxDelta} and ticket #10174.
     */
    async addMemory({prompt, response, thought, sessionId, agent, model, amountToolCalls, toolsUsed}) {
        try {
            const collection   = await StorageRouter.getMemoryCollection();
            const combinedText = `User Prompt: ${prompt}\nAgent Thought: ${thought}\nAgent Response: ${response}`;
            const now          = Date.now();
            const timestamp    = new Date(now).toISOString();
            const memoryId     = crypto.randomUUID();

            if (!sessionId) {
                sessionId = SessionService.currentSessionId;
            }

            const metadata = {
                prompt,
                response,
                thought,
                sessionId,
                timestamp: now,
                type: 'agent-interaction'
            };

            // Tenant-isolation tag (#10000): present only when a request context was established
            // by the SSE transport layer. In stdio mode it is absent — single-tenant fallthrough.
            const userId = normalizeUserId(RequestContextService.getUserId());
            if (userId) metadata.userId = userId;

            if (agent) metadata.agent = agent;
            if (model) metadata.model = model;
            if (amountToolCalls !== undefined) metadata.amountToolCalls = amountToolCalls;
            if (toolsUsed !== undefined) {
                metadata.toolsUsed = typeof toolsUsed === 'string' ? toolsUsed : JSON.stringify(toolsUsed);
            }

            await collection.add({
                ids: [memoryId],
                metadatas: [metadata],
                documents: [combinedText]
            });

            // Derive canonical graph identity. Fallback to formatting userId, or passing raw agent.
            const canonicalIdentity = RequestContextService.getAgentIdentityNodeId()
                || (userId ? `@${userId}` : (agent?.startsWith('@') ? agent : (agent ? `@${agent}` : undefined)));

            // 1. Topologically inject the new memory into the Native Edge Graph
            GraphService.upsertNode({
                id: memoryId,
                type: 'AGENT_MEMORY',
                name: `Memory: ${timestamp}`,
                description: `Agent thought flow inside session ${sessionId}.`,
                semanticVectorId: memoryId,
                properties: {
                    ...(canonicalIdentity ? { agentIdentity: canonicalIdentity } : {}),
                    ...(userId ? { userId } : {}),
                    sessionId,
                    timestamp
                }
            });

            // 2. Link this memory dynamically to the active context frontier
            GraphService.linkNodes('frontier', memoryId, 'SPAWNED_MEMORY', 0.8);

            // 3. Real-Time A2A JSON Parsing (Deprecated)
            if (aiConfig.realTimeMemoryParsing) {
                logger.warn(`[MemoryService] Real-Time parsing skipped: DreamService decoupled. Awaiting REM sleep.`);
            }

            // 4. Mailbox delta signal: per-turn piggyback of inbox unread-count + latest preview.
            //    Non-fatal — buildMailboxDelta swallows its own errors and returns null on failure,
            //    so a degraded mailbox query never blocks a successful memory write.
            const mailbox = buildMailboxDelta();

            return {id: memoryId, sessionId, timestamp, message: "Memory successfully added", mailbox};
        } catch (error) {
            logger.error('[MemoryService] Error adding memory:', error);
            return {
                error  : 'Failed to add memory',
                message: error.message,
                code   : 'MEMORY_ADD_ERROR'
            };
        }
    }

    /**
     * Retrieves all memories for a session and returns a paginated payload.
     * @param {Object} options
     * @param {String} options.sessionId The ID of the session to list memories for.
     * @param {Number} options.limit     The maximum number of memories to return.
     * @param {Number} options.offset    The number of memories to skip.
     * @returns {Promise<{sessionId: string, count: number, total: number, memories: Object[]}>}
     */
    async listMemories({sessionId, limit=100, offset=0} = {}) {
        try {
            if (!sessionId) {
                return { sessionId, count: 0, total: 0, memories: [] };
            }

            const collection = await StorageRouter.getMemoryCollection();

            // Tenant read-filter (#10000) with additive shared-commons access (#10556): when a
            // userId resolves, the filter returns the tenant's own records AND records tagged
            // with SHARED_USER_ID (legacy pre-#10145 data backfilled by the migration runner,
            // plus any explicitly-shared future data). In stdio mode without resolved identity,
            // the filter reduces to sessionId alone — single-tenant fallthrough preserved.
            // normalizeUserId strips `@`-prefix at the AgentIdentity ↔ userId boundary.
            const userId = normalizeUserId(RequestContextService.getUserId());
            const where  = userId
                ? {$and: [{sessionId}, {$or: [{userId}, {userId: SHARED_USER_ID}]}]}
                : {sessionId};

            const result = await collection.get({
                where,
                include: ['metadatas']
            });

            const records = result.ids.map((id, index) => {
                const metadata = result.metadatas[index] || {};

                return {
                    id,
                    sessionId: metadata.sessionId,
                    timestamp: new Date(metadata.timestamp).toISOString(),
                    prompt   : metadata.prompt,
                    thought  : metadata.thought,
                    response : metadata.response,
                    type     : metadata.type,
                    agent    : metadata.agent || null,
                    model    : metadata.model || null,
                    amountToolCalls: metadata.amountToolCalls || 0,
                    toolsUsed: metadata.toolsUsed || null
                };
            }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const total = records.length;
            const memories = records.slice(offset, offset + limit);

            return {
                sessionId,
                count: memories.length,
                total,
                memories
            };
        } catch (error) {
            logger.error('[MemoryService] Error listing memories:', error);
            return {
                error  : 'Failed to list memories',
                message: error.message,
                code   : 'MEMORY_LIST_ERROR'
            };
        }
    }

    /**
     * Executes a semantic search against the memory collection.
     * @param {Object} options
     * @param {String} options.query       The search query string.
     * @param {Number} options.nResults    The number of results to return.
     * @param {String} [options.sessionId] Optional session ID to filter results.
     * @returns {Promise<{query: string, count: number, results: Object[]}>}
     */
    async queryMemories({query, nResults, sessionId}) {
        try {
            const collection = await StorageRouter.getMemoryCollection();
            const queryArgs = {
                queryTexts: [query],
                nResults,
                include   : ['metadatas']
            };

            // Tenant-scoped where clause (#10000) with additive shared-commons access (#10556).
            // userId-resolved branches return the tenant's own records PLUS SHARED_USER_ID-tagged
            // records (legacy commons + explicit shares); unresolved-identity preserves single-tenant
            // fallthrough. normalizeUserId handles the AgentIdentity ↔ userId boundary.
            const userId    = normalizeUserId(RequestContextService.getUserId());
            const tenantOr  = userId ? {$or: [{userId}, {userId: SHARED_USER_ID}]} : null;
            if (sessionId && tenantOr) {
                queryArgs.where = {$and: [{sessionId}, tenantOr]};
            } else if (sessionId) {
                queryArgs.where = {sessionId};
            } else if (tenantOr) {
                queryArgs.where = tenantOr;
            }

            const searchResult = await collection.query(queryArgs);

            const ids       = searchResult.ids?.[0] || [];
            const distances = searchResult.distances?.[0] || [];
            const metadatas = searchResult.metadatas?.[0] || [];

            const memories = ids.map((id, index) => {
                const metadata       = metadatas[index] || {};
                const distance       = Number(distances[index] ?? 0);
                const relevanceScore = Number((1 / (1 + distance)).toFixed(6));

                return {
                    id,
                    sessionId: metadata.sessionId,
                    timestamp: new Date(metadata.timestamp).toISOString(),
                    prompt   : metadata.prompt,
                    thought  : metadata.thought,
                    response : metadata.response,
                    type     : metadata.type,
                    distance,
                    relevanceScore
                };
            });

            return {
                query,
                count  : memories.length,
                results: memories
            };
        } catch (error) {
            logger.error('[MemoryService] Error querying memories:', error);
            return {
                error  : 'Failed to query memories',
                message: error.message,
                code   : 'MEMORY_QUERY_ERROR'
            };
        }
    }

    /**
     * Executes the Context Priming Engine to fetch the highly scaled topological frontier
     * and maps vectors back to extract specific underlying episodic knowledge logic.
     * @returns {Promise<Object>}
     */
    async getContextFrontier() {
        try {
            // 1. Traverse Graph Topology
            const topology = GraphService.getContextFrontier();
            if (!topology) {
                return {
                    message: "No context frontier configured. Graph topology returns null."
                };
            }

            // 2. Unpack mapping to map context to Chroma db entries
            const { frontier, strategicNeighbors } = topology;
            const semanticContexts = [];

            // We grab context blocks from summaries, as that is where DreamService extracts episodic graph nodes from
            const collection = await StorageRouter.getSummaryCollection();

            // Tenant defense-in-depth (#10000): the graph is shared across users until #10011 adds
            // SQLite row-level security. If a neighbor's semanticVectorId points at another user's
            // summary, the userId filter reduces the fetch to zero rows rather than leaking it.
            const userId = normalizeUserId(RequestContextService.getUserId());

            if (Array.isArray(strategicNeighbors)) {
                for (const neighbor of strategicNeighbors) {
                    if (neighbor.semanticVectorId) {
                        try {
                            const getArgs = {
                                ids    : [neighbor.semanticVectorId],
                                include: ['documents', 'metadatas']
                            };
                            if (userId) getArgs.where = {$or: [{userId}, {userId: SHARED_USER_ID}]};
                            const result = await collection.get(getArgs);

                            if (result.documents && result.documents.length > 0) {
                                semanticContexts.push({
                                    nodeId: neighbor.id,
                                    name: neighbor.name,
                                    relationship: neighbor.relationship,
                                    weight: neighbor.weight,
                                    content: result.documents[0],
                                    metadata: result.metadatas ? result.metadatas[0] : null
                                });
                            }
                        } catch (e) {
                             logger.warn(`[MemoryService] Failed to fetch vector ${neighbor.semanticVectorId} for node ${neighbor.id}`);
                        }
                    }
                }
            }

            return {
                topology,
                semanticContexts
            };

        } catch (error) {
            logger.error('[MemoryService] Error running getContextFrontier:', error);
            return {
                error  : 'Failed to retrieve context frontier',
                message: error.message,
                code   : 'CONTEXT_FRONTIER_ERROR'
            };
        }
    }

    /**
     * Instantly contextualizes the agent by targeting a specific Epic or Graph Node,
     * loading its high-weight semantic relationships and returning a structured brief.
     * @param {Object} options
     * @param {String} options.targetId The Target Epic / Node ID to brief against.
     * @param {Number} [options.limit=5] Max context neighbors to pull.
     * @returns {Promise<Object>}
     */
    async preBriefSession({ targetId, limit = 5 }) {
        try {
            const baseNode = GraphService.getNode({ id: targetId });
            if (!baseNode) {
                 return {
                     error: `Node ${targetId} not found in the Native Graph.`,
                     code: 'NODE_NOT_FOUND'
                 };
            }

            let {neighbors} = GraphService.getNeighbors({ id: targetId });

            // Focus purely on highest-weight semantic and architectural relationships
            neighbors = Array.isArray(neighbors)
                ? neighbors
                    .filter(n => n.weight >= 0.5) // filter weak noise
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, limit)
                : [];

            const brief = {
                target: baseNode,
                context: []
            };

            const collection = await StorageRouter.getSummaryCollection();

            // Tenant defense-in-depth (#10000): same rationale as getContextFrontier — the graph
            // may return a neighbor whose vector belongs to another tenant until #10011 isolates
            // the graph itself. userId filter converts cross-tenant leaks into empty results.
            const userId = normalizeUserId(RequestContextService.getUserId());

            for (const neighbor of neighbors) {
                let episodicContext = null;

                if (neighbor.semanticVectorId) {
                    try {
                        const getArgs = {
                            ids    : [neighbor.semanticVectorId],
                            include: ['documents']
                        };
                        if (userId) getArgs.where = {$or: [{userId}, {userId: SHARED_USER_ID}]};
                        const result = await collection.get(getArgs);
                        if (result.documents && result.documents.length > 0) {
                            episodicContext = result.documents[0];
                        }
                    } catch (e) {
                         // Missing vector is fine, we still have structural graph data
                    }
                }

                brief.context.push({
                    id: neighbor.id,
                    type: neighbor.type,
                    name: neighbor.name,
                    relationship: neighbor.relationship,
                    weight: neighbor.weight,
                    episodicContext
                });
            }

            return brief;

        } catch (error) {
            logger.error('[MemoryService] Error in preBriefSession:', error);
            return {
                error  : 'Failed to generate contextual brief',
                message: error.message,
                code   : 'PRE_BRIEF_ERROR'
            };
        }
    }

    /**
     * Mutates the active context frontier in the native knowledge graph.
     * @param {Object} options
     * @param {String} options.targetNodeId The semantic target ID.
     * @param {Number} [options.weight=1.0] Importance weighting.
     * @param {String} [options.relationship='STRATEGIC_PIVOT'] Relationships label.
     * @returns {Promise<Object>}
     */
    async mutateFrontier({targetNodeId, weight = 1.0, relationship = 'STRATEGIC_PIVOT'}) {
        try {
            if (!targetNodeId) {
                return {
                    error  : 'targetNodeId is required',
                    code   : 'INVALID_PARAMETERS'
                };
            }

            const result = GraphService.mutateFrontier({ targetNodeId, weight, relationship });

            return {
                message: 'Successfully mutated the context frontier.',
                result
            };
        } catch (error) {
            logger.error('[MemoryService] Error running mutateFrontier:', error);
            return {
                error  : 'Failed to mutate context frontier',
                message: error.message,
                code   : 'MUTATE_FRONTIER_ERROR'
            };
        }
    }
}

export default Neo.setupClass(MemoryService);
// Exported for unit-test consumption — see
// `test/playwright/unit/ai/services/memory-core/MailboxService.spec.mjs` (#10174
// regression coverage). Not part of the public service surface; consumers outside the test
// suite should call `MemoryService.addMemory` and read the `mailbox` property on the response.
export {buildMailboxDelta};
