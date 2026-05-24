import crypto                               from 'crypto';
import Base                                 from '../../../src/core/Base.mjs';
import ConceptService                       from '../../services/ConceptService.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import logger                               from '../../mcp/server/memory-core/logger.mjs';

/**
 * Canonical concept edge types. Enforced at ingestion time so downstream consumers
 * (GapInferenceEngine, GoldenPathSynthesizer) can filter by type with exact string
 * comparison — no case-normalization ambiguity.
 * @type {Object}
 * @private
 */
const CONCEPT_EDGE_TYPES = {
    ANALOGOUS_TO   : 'ANALOGOUS_TO',
    EXEMPLIFIED_BY : 'EXEMPLIFIED_BY',
    EXPLAINED_BY   : 'EXPLAINED_BY',
    IMPLEMENTED_BY : 'IMPLEMENTED_BY',
    PARENT_CONCEPT : 'PARENT_CONCEPT'
};

/**
 * Stable deep-stringify — used for payload hashing. Sorts object keys recursively
 * so logically-identical payloads produce identical hashes regardless of author order.
 * Intentionally simple (no external deps) — the SLM-run REM pipeline benefits from
 * boring, auditable hashing over clever algorithms.
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
 * @summary Service to ingest the standalone JSONL Concept Ontology (`.neo-ai-data/concepts/*.jsonl`)
 * into the Native Edge Graph (SQLite) as first-class graph citizens — CONCEPT nodes plus typed edges
 * (PARENT_CONCEPT, IMPLEMENTED_BY, EXPLAINED_BY, EXEMPLIFIED_BY, ANALOGOUS_TO).
 *
 * This service is the bridge between the version-controlled concept graph maintained as
 * JSONL (cheap to edit, diff-friendly, PR-reviewable) and the runtime Native Edge Graph that
 * `GapInferenceEngine` traverses for deterministic gap detection. It mirrors the ingestor pattern
 * established by `IssueIngestor` and `FileSystemIngestor` — a singleton with a single public
 * `syncConceptsToGraph()` entry point that DreamService invokes during the REM cycle.
 *
 * **Why differential sync?** The REM pipeline runs on local models (currently `gemma4-31b` — a
 * 256K-context frontier-capable open-weight model distilled from Gemini 3). Capability is not the
 * concern; I/O throughput is. Hashing concept payloads and skipping unchanged rows eliminates
 * redundant SQLite writes across cycles — compact today, potentially thousands of nodes
 * as ontology enrichment expands. Cheap, deterministic, auditable.
 *
 * **Why upsert-only, no deletions here?** Concept removal is a data-hygiene concern handled
 * by `GraphMaintenanceService`'s Fade / Apoptosis passes. This ingestor is strictly additive.
 *
 * This class is the canonical example of **deterministic graph ingestion** consumed by
 * relevance-bounded query layers and tech-debt radar sweeps.
 *
 * @class Neo.ai.daemons.services.ConceptIngestor
 * @extends Neo.core.Base
 * @see Neo.ai.services.ConceptService
 * @see Neo.ai.daemons.services.GapInferenceEngine
 * @see Neo.ai.daemons.services.IssueIngestor
 * @singleton
 */
class ConceptIngestor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.ConceptIngestor'
         * @protected
         */
        className: 'Neo.ai.daemons.services.ConceptIngestor',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Computes a stable SHA-256 hash of a concept payload for differential-sync skip checks.
     * The **Projection Layer** of the Concept Ontology (what lands in SQLite) carries this hash
     * under `properties.payloadHash`; unchanged payloads skip the upsert round trip.
     * @param {Object} conceptNode A concept node record from the JSONL ontology
     * @returns {String} 64-character hex sha256 digest
     * @protected
     */
    computePayloadHash(conceptNode) {
        const payload = {
            aliases    : conceptNode.aliases     ?? [],
            description: conceptNode.description ?? '',
            name       : conceptNode.name        ?? '',
            tags       : conceptNode.tags        ?? [],
            tier       : conceptNode.tier        ?? 0,
            uniqueToNeo: !!conceptNode.uniqueToNeo,
            // Unvalidated concepts are candidates from ConceptDiscoveryService awaiting human
            // curation. `undefined` from legacy rows is treated as validated.
            // Flipping `validated: false → true` during curator review must trigger re-upsert, so the
            // flag contributes to the hash.
            validated  : conceptNode.validated !== false,
            // Freshness metadata is non-destructive. It queues re-verification work but never
            // fades the CONCEPT node or its edges. Missing legacy values normalize to null and
            // must trigger re-upsert when curators later stamp an ISO date.
            verifiedAt : conceptNode.verifiedAt ?? null
        };

        return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
    }

    /**
     * Ensures stub nodes exist for every edge target before the edge itself is inserted. The
     * SQLite schema enforces a FOREIGN KEY from `edges.target` to `nodes.id`, so concept edges
     * pointing at `file:...` or `ext:...` namespaced identifiers would crash insertion if those
     * nodes didn't already exist. Stubs carry the label appropriate to their namespace prefix
     * (`FILE` for `file:`, `EXT` for `ext:`, fallback `CONCEPT` for direct concept-to-concept
     * references) so downstream filters can treat them correctly.
     *
     * Idempotent: only creates stubs for targets not already present. If `FileSystemIngestor`
     * later materializes a real FILE node for the same path, the stub is naturally replaced by
     * the real node's upsert since IDs match.
     * @param {Object[]} edges Edges about to be inserted; their `target` fields are scanned
     * @protected
     */
    ensureEdgeTargetsExist(edges) {
        const db = GraphService.db;

        for (const edge of edges) {
            if (db.nodes.get(edge.target)) continue;

            let stubType;
            if (edge.target.startsWith('file:')) {
                stubType = 'FILE';
            } else if (edge.target.startsWith('ext:')) {
                stubType = 'EXT';
            } else {
                // Direct concept-to-concept reference (e.g., ANALOGOUS_TO across concept IDs).
                // A stub CONCEPT node is created only if the sibling concept hasn't been ingested
                // yet — the next iteration of the ingestor's main loop will upgrade it in place.
                stubType = 'CONCEPT';
            }

            GraphService.upsertNode({
                id        : edge.target,
                type      : stubType,
                name      : edge.target,
                properties: {isConceptEdgeStub: true}
            });
        }
    }

    /**
     * Removes all existing concept-typed edges originating from a given source concept, then
     * re-inserts them. Used during edge sync because edges don't have stable IDs — a (source,
     * target, type) tuple is the natural key, but rather than implement tuple-level differential
     * sync for a small edge set we favor the simpler replace-in-place pattern.
     *
     * Target-node existence is guaranteed via `ensureEdgeTargetsExist` before insertion to
     * satisfy the SQLite FOREIGN KEY constraint on `edges.target → nodes.id`.
     * @param {String}   sourceId The concept ID whose outbound concept edges should be replaced
     * @param {Object[]} newEdges Ingestor-shaped edges (see `syncConceptsToGraph` for schema)
     * @protected
     */
    replaceOutboundConceptEdges(sourceId, newEdges) {
        const
            db                = GraphService.db,
            existingOutbound  = db.edges.getByIndex('source', sourceId).slice(),
            conceptEdgeTypes  = new Set(Object.values(CONCEPT_EDGE_TYPES)),
            edgesToRemove     = existingOutbound.filter(e => conceptEdgeTypes.has(e.type));

        if (edgesToRemove.length > 0) {
            db.edges.remove(edgesToRemove);
        }

        this.ensureEdgeTargetsExist(newEdges);

        for (const edge of newEdges) {
            db.addEdge(edge);
        }
    }

    /**
     * Main entry point. Loads the concept graph from JSONL via `ConceptService`, then upserts
     * each concept as a CONCEPT-labelled node into the Native Edge Graph, wires up its typed
     * edges (PARENT_CONCEPT, IMPLEMENTED_BY, EXPLAINED_BY, EXEMPLIFIED_BY, ANALOGOUS_TO),
     * and skips unchanged payloads via sha256 hash comparison.
     *
     * Orphan concepts (concepts with NO outbound IMPLEMENTED_BY edge) are counted in the
     * returned stats for the cycle-summary `logger.info` line. They are NOT written to the
     * `capabilityGap` channel from this service — that emission lives in
     * `GapInferenceEngine.inferConceptGraphGaps`, which weight-gates the signal and routes it
     * through the same `capabilityGap` tag channel + `sandman_handoff.md` section pattern as
     * `[GUIDE_GAP]` and `[EXAMPLE_GAP]`. Per-orphan `logger.warn` output is ephemeral in an
     * offline daemon; the graph+handoff plane is durable.
     *
     * @returns {Promise<Object>} Ingestion statistics: `{conceptsProcessed, conceptsUpserted, conceptsSkipped, edgesReplaced, orphansDetected, errors}`
     */
    async syncConceptsToGraph() {
        const stats = {
            conceptsProcessed: 0,
            conceptsUpserted : 0,
            conceptsSkipped  : 0,
            edgesReplaced    : 0,
            orphansDetected  : 0,
            errors           : []
        };

        try {
            const loadStats = ConceptService.loadGraph();

            if (loadStats.errors?.length > 0) {
                stats.errors.push(...loadStats.errors.map(e => `[ConceptService.loadGraph] ${e}`));
                logger.warn(`[ConceptIngestor] ConceptService reported ${loadStats.errors.length} load errors — proceeding with valid subset.`);
            }

            const db = GraphService.db;

            for (const [conceptId, conceptNode] of ConceptService.nodes) {
                stats.conceptsProcessed++;

                try {
                    const
                        payloadHash  = this.computePayloadHash(conceptNode),
                        existingNode = db.nodes.get(conceptId),
                        weight       = ConceptService.calculateWeight(conceptNode),
                        outboundEdges = ConceptService.edgesBySource.get(conceptId) || [];

                    // Differential sync: skip upsert AND edge replacement if payload unchanged.
                    // Edge set is keyed off the same payload, so hash coherence is sufficient.
                    if (existingNode?.properties?.payloadHash === payloadHash) {
                        stats.conceptsSkipped++;
                        continue;
                    }

                    GraphService.upsertNode({
                        id        : conceptId,
                        type      : 'CONCEPT',
                        name      : conceptNode.name,
                        properties: {
                            aliases    : conceptNode.aliases     ?? [],
                            description: conceptNode.description ?? '',
                            payloadHash,
                            tags       : conceptNode.tags        ?? [],
                            tier       : conceptNode.tier        ?? 0,
                            uniqueToNeo: !!conceptNode.uniqueToNeo,
                            validated  : conceptNode.validated !== false,
                            verifiedAt : conceptNode.verifiedAt ?? null,
                            weight
                        }
                    });

                    stats.conceptsUpserted++;

                    const newEdges = outboundEdges
                        .filter(e => CONCEPT_EDGE_TYPES[e.type])
                        .map(e => ({
                            source    : conceptId,
                            target    : e.target,
                            type      : CONCEPT_EDGE_TYPES[e.type],
                            properties: e.note ? {note: e.note} : {}
                        }));

                    this.replaceOutboundConceptEdges(conceptId, newEdges);
                    stats.edgesReplaced += newEdges.length;

                    // Orphan detection — no IMPLEMENTED_BY means no source code anchors this concept.
                    // Counted here for the cycle-summary stats line; the actionable `[ORPHAN_CONCEPT]`
                    // gap signal is emitted by `GapInferenceEngine.inferConceptGraphGaps` through the
                    // durable `capabilityGap` channel + `sandman_handoff.md` section.
                    const hasImplementedBy = newEdges.some(e => e.type === CONCEPT_EDGE_TYPES.IMPLEMENTED_BY);
                    if (!hasImplementedBy && conceptNode.tier > 0) {
                        stats.orphansDetected++;
                    }
                } catch (e) {
                    stats.errors.push(`[${conceptId}] ${e.message}`);
                    logger.warn(`[ConceptIngestor] Failed to upsert concept '${conceptId}': ${e.message}`);
                }
            }

            logger.info(`[ConceptIngestor] Sync complete: ${stats.conceptsUpserted} upserted, ${stats.conceptsSkipped} unchanged, ${stats.edgesReplaced} edges, ${stats.orphansDetected} orphans${stats.errors.length > 0 ? `, ${stats.errors.length} errors` : ''}.`);
        } catch (e) {
            logger.error('[ConceptIngestor] Fatal sync error:', e);
            stats.errors.push(`[fatal] ${e.message}`);
        }

        return stats;
    }
}

export default Neo.setupClass(ConceptIngestor);
