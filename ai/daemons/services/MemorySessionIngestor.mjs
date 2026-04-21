import crypto                                                            from 'crypto';
import Base                                                              from '../../../src/core/Base.mjs';
import {Memory_GraphService as GraphService, Memory_StorageRouter as StorageRouter} from '../../services.mjs';
import logger                                                            from '../../mcp/server/memory-core/logger.mjs';

/**
 * Stable deep-stringify — sorts object keys recursively so logically-identical payloads
 * produce identical hashes regardless of author order. Mirrors the helper in `ConceptIngestor`;
 * kept local rather than exported to keep the REM-cycle services dependency-lean.
 * @param {*} value
 * @returns {String}
 * @private
 */
function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }

    const keys = Object.keys(value).sort();

    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/**
 * @summary Service that lifts Memory Core artifacts (session summaries + raw per-turn memories)
 * into the Native Edge Graph as first-class SESSION and MEMORY nodes — the **structural layer**
 * downstream consumers (mailbox `IN_REPLY_TO`, identity `AUTHORED_BY`, thread reconstruction,
 * #10030 concept-edge reach-back) traverse.
 *
 * Prior to this service, memories + summaries existed only as Chroma rows — extracted entities
 * (concepts, classes, methods) were graph citizens but their source memories were not, leaving
 * edges from extracted nodes dangling at the extraction boundary. Lifting Memory and Session to
 * graph nodes keyed by Chroma IDs closes that asymmetry: every Memory Core artifact becomes
 * structurally traversable in the **Projection Layer** of the Native Graph.
 *
 * This class mirrors the deterministic-ingestion pattern established by `ConceptIngestor`,
 * `IssueIngestor`, and `FileSystemIngestor` — a singleton with a single public
 * `syncSessionToGraph(session)` entry point that DreamService invokes per-session during the
 * REM cycle, **before** `SemanticGraphExtractor.executeTriVectorExtraction`. The separation is
 * load-bearing: deterministic Chroma-ID → graph-node mapping runs without LLM cost and without
 * schema migration (node labels are free-form strings; no `better-sqlite3` schema change needed
 * since `GraphService.upsertNode` accepts any `type` label).
 *
 * **Why differential sync via payloadHash?** Re-running the REM pipeline over previously-seen
 * sessions must not mutate graph state when the underlying artifact is unchanged. A SHA-256
 * hash of the relevant metadata fields lets the second call detect "nothing changed" and skip
 * the SQLite write round-trip. Matches `ConceptIngestor.computePayloadHash` precedent.
 *
 * **Why the `memoryCollection` parameter?** The real Chroma collection lives behind
 * `StorageRouter.getMemoryCollection()` — a runtime dependency unit tests cannot easily supply.
 * Accepting an optional `memoryCollection` parameter creates an explicit seam: production
 * callers pass nothing (defaults to the real collection); tests inject a stub with seeded data.
 * No module-level monkey-patching, no global-state mutation, no test-only branches in the
 * production code path.
 *
 * This service is the **structural-layer prerequisite** for the mailbox (#10139), AgentIdentity
 * ownership (#10016), Gemma4 extractor provenance edges (#10152), and lazy back-fill (#10153)
 * work streams under the Graph-first Memory artifacts sub-epic (#10143).
 *
 * @class Neo.ai.daemons.services.MemorySessionIngestor
 * @extends Neo.core.Base
 * @see Neo.ai.daemons.services.ConceptIngestor
 * @see Neo.ai.daemons.DreamService
 * @singleton
 */
class MemorySessionIngestor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.MemorySessionIngestor'
         * @protected
         */
        className: 'Neo.ai.daemons.services.MemorySessionIngestor',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Computes a stable SHA-256 hash of a session's relevant metadata fields. The Projection
     * Layer SESSION node carries this hash under `properties.payloadHash`; unchanged sessions
     * skip the upsert round trip on subsequent REM cycles.
     * @param {Object} session The session row from the Chroma summary collection; `session.meta`
     *     is expected to carry `title`, `createdAt`, `userId`, and `sessionId`.
     * @returns {String} 64-character hex sha256 digest
     * @protected
     */
    computeSessionPayloadHash(session) {
        const payload = {
            createdAt: session?.meta?.createdAt ?? '',
            sessionId: session?.meta?.sessionId ?? '',
            title    : session?.meta?.title     ?? '',
            userId   : session?.meta?.userId    ?? ''
        };

        return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
    }

    /**
     * Computes a stable SHA-256 hash of a memory's metadata fields. Mirror of
     * `computeSessionPayloadHash` scoped to per-turn Memory artifacts so the same
     * differential-sync skip path applies at memory granularity.
     * @param {Object} metadata The Chroma metadata object for a single memory row
     * @returns {String} 64-character hex sha256 digest
     * @protected
     */
    computeMemoryPayloadHash(metadata) {
        const payload = {
            createdAt: metadata?.createdAt ?? '',
            sessionId: metadata?.sessionId ?? '',
            userId   : metadata?.userId    ?? ''
        };

        return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
    }

    /**
     * Main entry point. Upserts a SESSION node keyed by the agent-logical `session.meta.sessionId`,
     * then fetches the raw per-turn memories belonging to that session from the Chroma memory
     * collection and upserts a MEMORY node per row with an `ORIGINATES_IN(Memory → Session)` edge.
     *
     * Deterministic: output depends only on (session metadata, memory metadata). No LLM calls.
     * Idempotent: re-running on the same session produces identical graph state (skip path via
     * `payloadHash`). The Chroma row set is the **Structural Layer** source; the graph nodes are
     * the **Projection Layer** other subsystems (`SemanticGraphExtractor`, future mailbox,
     * AgentIdentity ownership) traverse.
     *
     * @param {Object}   session The session row from the Chroma summary collection
     * @param {String}   session.id The Chroma ID of the summary row
     * @param {Object}   session.meta Session metadata; expects `sessionId`, optionally `title`,
     *     `createdAt`, `userId`
     * @param {Object}   [options]
     * @param {Object}   [options.memoryCollection=null] Optional explicit memory collection for
     *     testability — tests inject a stub with seeded data. Production callers pass nothing;
     *     falls back to `StorageRouter.getMemoryCollection()`.
     * @returns {Promise<Object>} Ingestion statistics:
     *     `{memoriesProcessed, memoriesUpserted, memoriesSkipped, sessionUpserted, errors}`
     */
    async syncSessionToGraph(session, {memoryCollection = null} = {}) {
        const stats = {
            memoriesProcessed: 0,
            memoriesUpserted : 0,
            memoriesSkipped  : 0,
            sessionUpserted  : false,
            errors           : []
        };

        if (!session?.meta?.sessionId) {
            stats.errors.push('[input] session.meta.sessionId is required');
            return stats;
        }

        try {
            const
                agentSessionId    = session.meta.sessionId,
                sessionNodeId     = `session:${agentSessionId}`,
                sessionPayloadHash = this.computeSessionPayloadHash(session),
                existingSession    = GraphService.db?.nodes?.get(sessionNodeId);

            if (existingSession?.properties?.payloadHash !== sessionPayloadHash) {
                GraphService.upsertNode({
                    id        : sessionNodeId,
                    type      : 'SESSION',
                    name      : session.meta.title || agentSessionId,
                    properties: {
                        chromaId   : session.id,
                        createdAt  : session.meta.createdAt,
                        payloadHash: sessionPayloadHash,
                        sessionId  : agentSessionId,
                        userId     : session.meta.userId
                    }
                });
                stats.sessionUpserted = true;
            }

            const
                collection  = memoryCollection || await StorageRouter.getMemoryCollection(),
                rawMemories = collection
                    ? await collection.get({where: {sessionId: agentSessionId}, include: ['metadatas']})
                    : null;

            if (!rawMemories?.ids?.length) {
                logger.info(`[MemorySessionIngestor] Session ${agentSessionId} has no raw memories.`);
                return stats;
            }

            for (let i = 0; i < rawMemories.ids.length; i++) {
                stats.memoriesProcessed++;

                try {
                    const
                        memoryChromaId    = rawMemories.ids[i],
                        meta              = rawMemories.metadatas?.[i] || {},
                        memoryNodeId      = `memory:${memoryChromaId}`,
                        memoryPayloadHash = this.computeMemoryPayloadHash(meta),
                        existingMemory    = GraphService.db?.nodes?.get(memoryNodeId);

                    if (existingMemory?.properties?.payloadHash === memoryPayloadHash) {
                        stats.memoriesSkipped++;
                        continue;
                    }

                    GraphService.upsertNode({
                        id        : memoryNodeId,
                        type      : 'MEMORY',
                        name      : memoryChromaId.slice(0, 12),
                        properties: {
                            chromaId   : memoryChromaId,
                            createdAt  : meta.createdAt,
                            payloadHash: memoryPayloadHash,
                            sessionId  : meta.sessionId ?? agentSessionId,
                            userId     : meta.userId
                        }
                    });

                    GraphService.linkNodes(memoryNodeId, sessionNodeId, 'ORIGINATES_IN', 1.0);
                    stats.memoriesUpserted++;
                } catch (e) {
                    stats.errors.push(`[${rawMemories.ids[i]}] ${e.message}`);
                }
            }

            logger.info(
                `[MemorySessionIngestor] Session ${agentSessionId}: ${stats.memoriesUpserted} upserted, ` +
                `${stats.memoriesSkipped} unchanged` +
                (stats.errors.length > 0 ? `, ${stats.errors.length} errors` : '') + '.'
            );
        } catch (e) {
            logger.error(`[MemorySessionIngestor] Fatal sync error for session ${session?.id}:`, e);
            stats.errors.push(`[fatal] ${e.message}`);
        }

        return stats;
    }
}

export default Neo.setupClass(MemorySessionIngestor);
