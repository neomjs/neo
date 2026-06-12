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
 * and concept-edge reach-back) traverse.
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
 * This service is the **structural-layer prerequisite** for mailbox threading, AgentIdentity
 * ownership, extractor provenance edges, and lazy graph back-fill work streams.
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
                        chromaId    : session.id,
                        createdAt   : session.meta.createdAt,
                        // Provenance marker distinguishing live REM-cycle ingestion from lazy
                        // back-fill. Queries discriminating between the two sources use
                        // `liveIngested` vs `backfilled` on the node's properties.
                        liveIngested: true,
                        payloadHash : sessionPayloadHash,
                        sessionId   : agentSessionId,
                        userId      : session.meta.userId
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
                            chromaId    : memoryChromaId,
                            createdAt   : meta.createdAt,
                            // Provenance marker — see sibling comment in the SESSION upsert.
                            liveIngested: true,
                            payloadHash : memoryPayloadHash,
                            sessionId   : meta.sessionId ?? agentSessionId,
                            userId      : meta.userId
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

    /**
     * Back-fills a single MEMORY or SESSION graph node from its Chroma source row — the per-row
     * analog of `syncSessionToGraph` (which is batch-per-session). Invoked by the lazy
     * back-fill mechanism when `GraphService.linkNodes` encounters a missing target matching
     * the `memory:` or `session:` prefix pattern.
     *
     * **Graph-node-id convention:** the canonical form is lowercase (`memory:<chromaId>`,
     * `session:<sessionId>`) matching the IDs produced by `syncSessionToGraph`. This method
     * accepts **case-insensitive** prefix matching so it can consume edges queued with the
     * uppercase convention used by `SemanticGraphExtractor`'s lazy-edges queue without requiring
     * a canonical-format migration. The back-filled node always lands under the
     * lowercase canonical ID; callers whose edge had the uppercase form should have their edge
     * target re-normalized at the same call site via the `linkNodes` prefix-normalization path.
     *
     * **Memory → Session dependency:** a Memory's `sessionId` metadata points at its parent
     * Session. Back-filling a Memory whose parent Session is absent would dangle the
     * `ORIGINATES_IN` edge, so this method recursively back-fills the Session first, then the
     * Memory. Session back-fill has no further dependency chain.
     *
     * **Minimal-session fallback:** if a Session back-fill is requested but no summary row
     * exists in the Chroma summary collection (possible for sessions that never reached
     * summarization), a MINIMAL SESSION node is created with just `{sessionId, backfilled: true,
     * minimal: true}` properties. This keeps the graph link-target resolvable even for
     * partial-history sessions; a future live ingestion or summarization will upgrade the node
     * by upserting the full payload.
     *
     * @param {String} graphNodeId The graph-node ID to back-fill. Accepts both lowercase
     *     (`memory:<id>`, `session:<id>`) and uppercase (`MEMORY:<id>`, `SESSION:<id>`) prefix
     *     forms. Unrecognized prefixes return a no-op result rather than raising.
     * @param {Object} [options]
     * @param {Object} [options.memoryCollection=null] Optional memory collection override for
     *     test injection. Production callers pass nothing; falls back to
     *     `StorageRouter.getMemoryCollection()`.
     * @param {Object} [options.summaryCollection=null] Optional summary collection override for
     *     test injection.
     * @returns {Promise<Object>} Result descriptor:
     *     `{success: Boolean, reason: String, graphNodeId?: String, error?: String}`. Possible
     *     `reason` values: `'unrecognized-prefix'`, `'already-exists'`, `'backfilled'`,
     *     `'backfilled-minimal'`, `'no-collection'`, `'chroma-fetch-failed'`,
     *     `'chroma-row-not-found'`.
     */
    async ingestSingleRow(graphNodeId, {memoryCollection = null, summaryCollection = null} = {}) {
        const parsed = this.parseGraphNodeId(graphNodeId);

        if (!parsed) {
            return {success: false, reason: 'unrecognized-prefix', graphNodeId};
        }

        const {type, bareId, canonicalGraphId} = parsed;

        if (GraphService.db?.nodes?.get(canonicalGraphId)) {
            return {success: true, reason: 'already-exists', graphNodeId: canonicalGraphId};
        }

        try {
            if (type === 'MEMORY') {
                return await this.backfillMemory(bareId, canonicalGraphId, {memoryCollection, summaryCollection});
            } else {
                return await this.backfillSession(bareId, canonicalGraphId, {summaryCollection});
            }
        } catch (e) {
            logger.error(`[MemorySessionIngestor] Lazy back-fill error for ${graphNodeId}:`, e);
            return {success: false, reason: 'error', graphNodeId: canonicalGraphId, error: e.message};
        }
    }

    /**
     * Parses a graph-node ID into its canonical (lowercase) form + type + bare identifier.
     * Case-insensitive on the `memory:` / `session:` prefix so we can consume edges queued with
     * either convention. Returns `null` for unrecognized prefixes; callers treat that as
     * "not a back-fillable node — fall through to the existing cull path".
     *
     * @param {String} id Raw graph-node ID from a call site
     * @returns {{type: String, bareId: String, canonicalGraphId: String}|null}
     * @protected
     */
    parseGraphNodeId(id) {
        if (!id || typeof id !== 'string') {
            return null;
        }

        const lower = id.toLowerCase();

        if (lower.startsWith('memory:')) {
            const bareId = id.slice(7);
            return {type: 'MEMORY', bareId, canonicalGraphId: 'memory:' + bareId};
        }

        if (lower.startsWith('session:')) {
            const bareId = id.slice(8);
            return {type: 'SESSION', bareId, canonicalGraphId: 'session:' + bareId};
        }

        return null;
    }

    /**
     * Fetches a single Memory row from Chroma and upserts it as a MEMORY graph node, recursively
     * ensuring the parent Session node exists so the `ORIGINATES_IN` edge terminates cleanly.
     * Private helper for `ingestSingleRow`.
     *
     * @param {String} chromaId Chroma memory row ID (the bare ID, no `memory:` prefix)
     * @param {String} canonicalGraphId Canonical graph-node ID (`memory:<chromaId>`)
     * @param {Object} collections
     * @param {Object} [collections.memoryCollection]
     * @param {Object} [collections.summaryCollection]
     * @returns {Promise<Object>} Result descriptor
     * @protected
     */
    async backfillMemory(chromaId, canonicalGraphId, {memoryCollection, summaryCollection}) {
        const collection = memoryCollection || await StorageRouter.getMemoryCollection();

        if (!collection) {
            return {success: false, reason: 'no-collection', graphNodeId: canonicalGraphId};
        }

        let raw;

        try {
            raw = await collection.get({ids: [chromaId], include: ['metadatas']});
        } catch (e) {
            return {success: false, reason: 'chroma-fetch-failed', graphNodeId: canonicalGraphId, error: e.message};
        }

        if (!raw?.ids?.length) {
            return {success: false, reason: 'chroma-row-not-found', graphNodeId: canonicalGraphId};
        }

        const
            meta         = raw.metadatas?.[0] || {},
            sessionId    = meta.sessionId,
            sessionNodeId = sessionId ? 'session:' + sessionId : null;

        // Recursively ensure parent Session exists before creating the Memory edge. Without this
        // the ORIGINATES_IN edge created below would dangle at the session endpoint.
        if (sessionNodeId && !GraphService.db?.nodes?.get(sessionNodeId)) {
            await this.backfillSession(sessionId, sessionNodeId, {summaryCollection});
        }

        const payloadHash = this.computeMemoryPayloadHash(meta);

        GraphService.upsertNode({
            id        : canonicalGraphId,
            type      : 'MEMORY',
            name      : chromaId.slice(0, 12),
            properties: {
                backfilled : true,
                chromaId,
                createdAt  : meta.createdAt,
                payloadHash,
                sessionId,
                userId     : meta.userId
            }
        });

        if (sessionNodeId) {
            GraphService.linkNodes(canonicalGraphId, sessionNodeId, 'ORIGINATES_IN', 1.0);
        }

        return {success: true, reason: 'backfilled', graphNodeId: canonicalGraphId};
    }

    /**
     * Fetches a single Session summary row from Chroma (by `sessionId` metadata filter, since
     * session summary Chroma IDs are opaque) and upserts it as a SESSION graph node. Private
     * helper for `ingestSingleRow`.
     *
     * **Minimal-session fallback:** if no summary row matches the sessionId, creates a minimal
     * node so link targets resolve even for never-summarized sessions. See class-level note on
     * the minimal-session fallback.
     *
     * @param {String} sessionId Agent-logical session ID (the bare ID, no `session:` prefix)
     * @param {String} canonicalGraphId Canonical graph-node ID (`session:<sessionId>`)
     * @param {Object} collections
     * @param {Object} [collections.summaryCollection]
     * @returns {Promise<Object>} Result descriptor
     * @protected
     */
    async backfillSession(sessionId, canonicalGraphId, {summaryCollection}) {
        const collection = summaryCollection || await StorageRouter.getSummaryCollection();

        if (!collection) {
            return {success: false, reason: 'no-collection', graphNodeId: canonicalGraphId};
        }

        let raw;

        try {
            raw = await collection.get({where: {sessionId}, include: ['metadatas']});
        } catch (e) {
            return {success: false, reason: 'chroma-fetch-failed', graphNodeId: canonicalGraphId, error: e.message};
        }

        if (!raw?.ids?.length) {
            // Minimal-session fallback: no summary exists. Still create the node so downstream
            // edges resolve; a future summarization cycle will upgrade the payload.
            GraphService.upsertNode({
                id        : canonicalGraphId,
                type      : 'SESSION',
                name      : sessionId,
                properties: {
                    backfilled: true,
                    minimal   : true,
                    sessionId : sessionId
                }
            });

            return {success: true, reason: 'backfilled-minimal', graphNodeId: canonicalGraphId};
        }

        const
            meta        = raw.metadatas?.[0] || {},
            chromaId    = raw.ids[0],
            session     = {id: chromaId, meta},
            payloadHash = this.computeSessionPayloadHash(session);

        GraphService.upsertNode({
            id        : canonicalGraphId,
            type      : 'SESSION',
            name      : meta.title || sessionId,
            properties: {
                backfilled : true,
                chromaId,
                createdAt  : meta.createdAt,
                payloadHash,
                sessionId,
                userId     : meta.userId
            }
        });

        return {success: true, reason: 'backfilled', graphNodeId: canonicalGraphId};
    }
}

export default Neo.setupClass(MemorySessionIngestor);
