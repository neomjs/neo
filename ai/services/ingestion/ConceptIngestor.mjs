import crypto                                from 'crypto';
import Base                                  from '../../../src/core/Base.mjs';
import ConceptService                        from '../../services/ConceptService.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import FileSystemIngestor                    from '../memory-core/FileSystemIngestor.mjs';
import logger                                from '../../mcp/server/memory-core/logger.mjs';

/**
 * Canonical concept edge types. Enforced at ingestion time so downstream consumers
 * (GapInferenceEngine, GoldenPathSynthesizer) can filter by type with exact string
 * comparison — no case-normalization ambiguity.
 * @type {Object}
 * @private
 */
const CONCEPT_EDGE_TYPES = Object.freeze({
    ANALOGOUS_TO  : 'ANALOGOUS_TO',
    EXEMPLIFIED_BY: 'EXEMPLIFIED_BY',
    EXPLAINED_BY  : 'EXPLAINED_BY',
    IMPLEMENTED_BY: 'IMPLEMENTED_BY',
    PARENT_CONCEPT: 'PARENT_CONCEPT',
    REQUIRES      : 'REQUIRES'
});

const
    CONCEPT_EDGE_TYPE_SET      = new Set(Object.values(CONCEPT_EDGE_TYPES)),
    CONCEPT_PROJECTION_SOURCE  = 'concept-ontology-jsonl',
    CONCEPT_PROJECTION_VERSION = 1;

/**
 * Returns the four independent provenance/lifecycle axes carried by every
 * curated Concept Ontology edge. They intentionally remain separate objects;
 * no composite score is derivable from this contract.
 * @returns {Object}
 * @private
 */
function createProjectionAxes() {
    return {
        authority           : {trustTier: 'repo-trusted'},
        extractionProvenance: {curated: true, source: CONCEPT_PROJECTION_SOURCE},
        fidelity            : {degraded: false, sourceTier: 'curated'},
        lifecycle           : {state: 'promoted'}
    }
}

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
 * (PARENT_CONCEPT, IMPLEMENTED_BY, EXPLAINED_BY, EXEMPLIFIED_BY, REQUIRES, ANALOGOUS_TO).
 *
 * This service is the bridge between the version-controlled concept graph maintained as
 * JSONL (cheap to edit, diff-friendly, PR-reviewable) and the runtime Native Edge Graph that
 * `GapInferenceEngine` traverses for deterministic gap detection. It mirrors the ingestor pattern
 * established by `IssueIngestor` and `FileSystemIngestor` — a singleton with a single public
 * `syncConceptsToGraph()` entry point that DreamService invokes during the REM cycle.
 *
 * Node payload hashing is only an upsert optimization. Relationship membership is reconciled
 * independently on every run because a declared tuple can disappear from live SQLite through
 * ambient pruning or an external mutation without changing its JSONL row. Reconciliation is
 * source-owned and tuple-level: surviving tuples retain their edge IDs and decayed weights,
 * missing declared tuples are re-derived, and foreign producers' same-type edges are preserved.
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
            aliases        : conceptNode.aliases     ?? [],
            codeGapEligible: conceptNode.codeGapEligible !== false,
            description    : conceptNode.description ?? '',
            name           : conceptNode.name        ?? '',
            ontologyLayer  : conceptNode.ontologyLayer ?? 'code',
            tags           : conceptNode.tags        ?? [],
            tier           : conceptNode.tier        ?? 0,
            uniqueToNeo    : !!conceptNode.uniqueToNeo,
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
     * Creates one deterministic integrity finding without dropping the source row
     * that produced it. Findings are returned in sync stats and persisted on the
     * source CONCEPT node so gap inference can surface the reason durably.
     * @param {String} conceptId
     * @param {Object} edge
     * @param {String} code
     * @param {String} reason
     * @returns {Object}
     * @protected
     */
    createIntegrityFinding(conceptId, edge, code, reason) {
        return {
            code,
            reason,
            source   : conceptId,
            // JSON.parse preserves source key order, and committed rows are compact
            // one-object-per-line JSON. Re-serializing here retains the exact row
            // payload that reviewers can paste back into edges.jsonl.
            sourceRow: JSON.stringify(edge),
            target   : edge?.target ?? null,
            type     : edge?.type ?? null
        }
    }

    /**
     * Normalizes author-facing JSONL edges into runtime graph identities. File
     * references are admitted only through FileSystemIngestor's existence and
     * projectability boundary. Duplicate normalized tuples are explicit integrity
     * findings rather than last-write-wins ambiguity.
     * @param {String} conceptId
     * @param {Object[]} outboundEdges
     * @returns {{edges: Object[], findings: Object[]}}
     * @protected
     */
    normalizeOutboundEdges(conceptId, outboundEdges) {
        const
            edges    = [],
            findings = [],
            seen     = new Set();

        for (const edge of outboundEdges) {
            const type = CONCEPT_EDGE_TYPES[edge.type];

            if (!type) {
                findings.push(this.createIntegrityFinding(
                    conceptId,
                    edge,
                    'UNSUPPORTED_EDGE_TYPE',
                    `Unsupported Concept Ontology edge type: ${String(edge.type)}`
                ));
                continue;
            }

            let target     = edge.target,
                targetSpec = null;

            if (typeof target !== 'string' || target.length === 0) {
                findings.push(this.createIntegrityFinding(
                    conceptId,
                    edge,
                    'INVALID_EDGE_TARGET',
                    'Concept Ontology edge targets must be non-empty strings.'
                ));
                continue;
            }

            if (target.startsWith('file:')) {
                const resolution = FileSystemIngestor.resolveFileReference(target.slice(5));

                if (!resolution.valid) {
                    findings.push(this.createIntegrityFinding(conceptId, edge, resolution.code, resolution.reason));
                    continue;
                }

                target = resolution.nodeId;
                targetSpec = {
                    id        : target,
                    name      : resolution.relativePath,
                    type      : 'FILE',
                    properties: {
                        isConceptEdgeStub: true,
                        path             : resolution.relativePath
                    }
                }
            } else if (target.startsWith('ext:')) {
                if (target.length === 4) {
                    findings.push(this.createIntegrityFinding(
                        conceptId,
                        edge,
                        'INVALID_EDGE_TARGET',
                        'External Concept Ontology targets require a non-empty ext: identifier.'
                    ));
                    continue;
                }

                targetSpec = {
                    id        : target,
                    name      : target,
                    type      : 'EXT',
                    properties: {isConceptEdgeStub: true}
                }
            } else {
                targetSpec = {
                    id        : target,
                    name      : target,
                    type      : 'CONCEPT',
                    properties: {isConceptEdgeStub: true}
                }
            }

            const tupleKey = `${conceptId}\u0000${target}\u0000${type}`;

            if (seen.has(tupleKey)) {
                findings.push(this.createIntegrityFinding(
                    conceptId,
                    edge,
                    'DUPLICATE_EDGE_TUPLE',
                    `Duplicate normalized Concept Ontology tuple: ${conceptId} -> ${target} (${type})`
                ));
                continue;
            }

            seen.add(tupleKey);
            edges.push({
                note  : edge.note,
                source: conceptId,
                target,
                targetSpec,
                tupleKey,
                type
            })
        }

        return {edges, findings}
    }

    /**
     * Ensures graph endpoints exist before an edge transaction reaches SQLite's
     * foreign-key boundary. Canonical FILE stubs share the same `file-` identity
     * that FileSystemIngestor later enriches in place.
     * @param {Object[]} edges Normalized desired edges.
     * @protected
     */
    ensureEdgeTargetsExist(edges) {
        const db = GraphService.db;

        for (const edge of edges) {
            if (db.nodes.get(edge.target)) continue;

            // Absence from the request cache is not proof of absence from SQLite.
            // Warm first so a projection stub can never overwrite richer source-owned
            // FILE metadata from FileSystemIngestor after a cold-cache boundary.
            db.getAdjacentNodes(edge.target, 'both');

            if (!db.nodes.get(edge.target)) GraphService.upsertNode(edge.targetSpec)
        }
    }

    /**
     * Builds the canonical source-owned edge metadata while retaining unrelated
     * runtime properties (especially decayed `weight` and RLS `userId`).
     * @param {Object} edge Normalized desired edge.
     * @param {Object} [existingProperties={}]
     * @returns {Object}
     * @protected
     */
    buildEdgeProperties(edge, existingProperties={}) {
        const properties = {
            ...existingProperties,
            axes            : createProjectionAxes(),
            projectionSource: CONCEPT_PROJECTION_SOURCE,
            weight          : existingProperties.weight ?? 1.0
        };

        delete properties.note;

        if (edge.note) {
            properties.note = edge.note
        }

        return properties
    }

    /**
     * Reconciles one concept's source-owned tuple set. Matching rows preserve edge
     * identity and decayed weight; missing rows are re-derived; stale rows are
     * removed only when ownership is explicit (or historically provable during the
     * one-time projection-version migration). Foreign same-type edges are untouched.
     * @param {String} sourceId
     * @param {Object[]} desiredEdges
     * @param {Boolean} [adoptLegacy=false]
     * @returns {Object} Logical mutation counts.
     * @protected
     */
    reconcileOutboundConceptEdges(sourceId, desiredEdges, adoptLegacy=false) {
        const db = GraphService.db;

        // Warm the full persisted vicinity before deciding ownership or absence.
        db.getAdjacentNodes(sourceId, 'outbound');

        const
            indexedOutbound  = db.edges.getByIndex('source', sourceId).slice(),
            staleIndexRefs   = new Set(),
            canonicalToIndex = new Map(),
            canonicalById    = new Map();

        // A remove/re-add update can leave an older same-ID record reachable only
        // from a secondary index. Reconcile against the Store map's canonical record
        // and retire stale references before tuple/weight decisions.
        indexedOutbound.forEach(indexedEdge => {
            const canonicalEdge = db.edges.get(indexedEdge.id);

            if (!canonicalEdge) {
                staleIndexRefs.add(indexedEdge)
                return
            }

            if (canonicalEdge !== indexedEdge || canonicalEdge.source !== sourceId) {
                staleIndexRefs.add(indexedEdge);

                // The canonical edge may itself have older same-ID copies in its
                // current source/target buckets after a move or cross-process
                // refresh. Remove every noncanonical exact reference before adding
                // the one Store-owned object back to both indices.
                for (const [property, value] of [['source', canonicalEdge.source], ['target', canonicalEdge.target]]) {
                    db.edges.getByIndex(property, value)
                        .filter(edge => edge.id === canonicalEdge.id && edge !== canonicalEdge)
                        .forEach(edge => staleIndexRefs.add(edge))
                }

                canonicalToIndex.set(canonicalEdge.id, canonicalEdge)
            }

            if (canonicalEdge.source === sourceId) {
                canonicalById.set(canonicalEdge.id, canonicalEdge)
            }
        });

        if (staleIndexRefs.size > 0) {
            // Replace stale index-only objects with the Store map's canonical
            // references. Removal-only would make unchanged/foreign edges vanish
            // from indexed traversal even though they still exist in the Store.
            db.edges.updateIndexMaps?.([...canonicalToIndex.values()], [...staleIndexRefs])
        }

        const
            existingOutbound = [...canonicalById.values()],
            desiredByTuple   = new Map(desiredEdges.map(edge => [edge.tupleKey, edge])),
            ownedByTuple     = new Map(),
            logicalRemovals  = new Set(),
            physicalRemovals = new Map(),
            additions        = [],
            updates          = [];

        for (const edge of existingOutbound) {
            if (!CONCEPT_EDGE_TYPE_SET.has(edge.type)) continue;

            const owner   = edge.properties?.projectionSource,
                  isOwned = owner === CONCEPT_PROJECTION_SOURCE || (adoptLegacy && owner == null);

            if (!isOwned) continue;

            let tupleTarget = edge.target;

            // Legacy ConceptIngestor rows used the author-facing `file:` id as the
            // runtime target. During the one proven migration pass, match that row
            // against its canonical FileSystemIngestor identity so the edge can move
            // in place without losing its id or decayed weight.
            if (adoptLegacy && typeof tupleTarget === 'string' && tupleTarget.startsWith('file:')) {
                const resolution = FileSystemIngestor.resolveFileReference(tupleTarget.slice(5));

                if (resolution.valid) tupleTarget = resolution.nodeId
            }

            const tupleKey = `${sourceId}\u0000${tupleTarget}\u0000${edge.type}`;

            if (!ownedByTuple.has(tupleKey)) {
                ownedByTuple.set(tupleKey, [])
            }

            ownedByTuple.get(tupleKey).push(edge)
        }

        for (const desiredEdge of desiredEdges) {
            const candidates = (ownedByTuple.get(desiredEdge.tupleKey) || []).sort((a, b) => {
                const weightDelta = (b.properties?.weight ?? 1.0) - (a.properties?.weight ?? 1.0);
                return weightDelta || String(a.id).localeCompare(String(b.id))
            });
            const existing = candidates.shift();

            for (const duplicate of candidates) {
                physicalRemovals.set(duplicate.id, duplicate);
                logicalRemovals.add(duplicate.id)
            }

            if (!existing) {
                additions.push({
                    source    : desiredEdge.source,
                    target    : desiredEdge.target,
                    type      : desiredEdge.type,
                    properties: this.buildEdgeProperties(desiredEdge)
                });
                continue;
            }

            const properties = this.buildEdgeProperties(desiredEdge, existing.properties || {});

            if (existing.source === desiredEdge.source
                && existing.target === desiredEdge.target
                && existing.type === desiredEdge.type
                && stableStringify(properties) === stableStringify(existing.properties || {})) {
                continue;
            }

            physicalRemovals.set(existing.id, existing);
            updates.push({
                id    : existing.id,
                source: desiredEdge.source,
                target: desiredEdge.target,
                type  : desiredEdge.type,
                properties
            })
        }

        for (const [tupleKey, candidates] of ownedByTuple) {
            if (desiredByTuple.has(tupleKey)) continue;

            for (const staleEdge of candidates) {
                physicalRemovals.set(staleEdge.id, staleEdge);
                logicalRemovals.add(staleEdge.id)
            }
        }

        this.ensureEdgeTargetsExist(desiredEdges);

        if (physicalRemovals.size > 0 || additions.length > 0 || updates.length > 0) {
            db.transaction(() => {
                if (physicalRemovals.size > 0) {
                    db.edges.remove([...physicalRemovals.values()])
                }

                [...updates, ...additions].forEach(edge => db.addEdge(edge))
            });

            // Store.splice normally clears these refs. Repeating the exact-reference
            // cleanup closes the known same-ID secondary-index residue without
            // touching the newly-added replacement record.
            db.edges.updateIndexMaps?.(null, [...physicalRemovals.values()])
        }

        return {
            added    : additions.length,
            removed  : logicalRemovals.size,
            unchanged: desiredEdges.length - additions.length - updates.length,
            updated  : updates.length
        }
    }

    /**
     * Retires only legacy `file:` stubs whose verified marker remains and whose
     * incident edge count is zero after canonical tuple migration.
     * @returns {Number} Removed stub count.
     * @protected
     */
    cleanupLegacyFileStubs() {
        const
            db           = GraphService.db,
            candidateIds = new Set(db.nodes.items
                .filter(node => node.id?.startsWith('file:') && node.properties?.isConceptEdgeStub === true)
                .map(node => node.id)),
            toRemove     = [];

        if (db.storage?.db) {
            try {
                // Include cold, already-orphaned stubs. Source-vicinity warming finds
                // legacy targets that still have concept edges, but a previously
                // pruned edge can leave its verified stub absent from the RAM cache.
                for (const row of db.storage.db.prepare("SELECT id, data FROM Nodes WHERE id LIKE 'file:%'").all()) {
                    const node = JSON.parse(row.data);

                    if (node.properties?.isConceptEdgeStub === true) candidateIds.add(row.id)
                }
            } catch (error) {
                logger.warn(`[ConceptIngestor] Legacy stub cleanup skipped: candidate scan failed (${error.message}).`);
                return 0
            }
        }

        for (const candidateId of candidateIds) {
            // A cache-resident node can still have incident edges that have not been
            // loaded in this request. Warm both directions before the zero-reference
            // proof; otherwise removeNode() could cascade-delete a foreign edge.
            db.getAdjacentNodes(candidateId, 'both');

            const node = db.nodes.get(candidateId);

            if (node?.properties?.isConceptEdgeStub === true
                && db.edges.getByIndex('source', node.id).length === 0
                && db.edges.getByIndex('target', node.id).length === 0) {
                toRemove.push(node.id)
            }
        }

        let removed = 0;

        // Enumeration is advisory only. The Database delegates each destructive
        // decision to one marker-bound, zero-incident SQLite DELETE, closing the
        // cross-worker edge-insertion race before FK CASCADE can fire.
        toRemove.forEach(nodeId => {
            if (db.removeNodeIfUnreferenced(nodeId, {
                requiredPropertyPath : '$.properties.isConceptEdgeStub',
                requiredPropertyValue: true
            })) {
                removed++
            }
        });

        return removed
    }

    /**
     * Persists the source projection version and current integrity result without
     * turning unchanged node payloads into false upserts.
     * @param {String} conceptId
     * @param {Object[]} findings
     * @protected
     */
    updateProjectionMetadata(conceptId, findings) {
        const
            node                     = GraphService.db.nodes.get(conceptId),
            properties               = node?.properties || {},
            currentProjectionVersion = Number.isInteger(properties.conceptProjectionVersion)
                && properties.conceptProjectionVersion > CONCEPT_PROJECTION_VERSION
                    ? properties.conceptProjectionVersion
                    : CONCEPT_PROJECTION_VERSION;

        if (properties.conceptProjectionVersion === currentProjectionVersion
            && stableStringify(properties.conceptProjectionIntegrityFindings || []) === stableStringify(findings)) {
            return
        }

        GraphService.upsertNode({
            id        : conceptId,
            type      : 'CONCEPT',
            properties: {
                conceptProjectionIntegrityFindings: findings,
                // A v1 process must never downgrade a marker written by a newer
                // projection contract. That marker is the fail-closed migration
                // boundary even when the older process refreshes integrity facts.
                conceptProjectionVersion          : currentProjectionVersion
            }
        })
    }

    /**
     * Main entry point. Loads the concept graph from JSONL via `ConceptService`, then upserts
     * each concept as a CONCEPT-labelled node into the Native Edge Graph and independently
     * reconciles its source-owned typed edges. Node payloads still use sha256 differential
     * sync, but edge membership never depends on that skip path.
     *
     * Orphan concepts (concepts with NO outbound IMPLEMENTED_BY edge) are counted in the
     * returned stats for the cycle-summary `logger.info` line. They are NOT written to the
     * `capabilityGap` channel from this service — that emission lives in
     * `GapInferenceEngine.inferConceptGraphGaps`, which weight-gates the signal and routes it
     * through the same `capabilityGap` tag channel + `sandman_handoff.md` section pattern as
     * `[GUIDE_GAP]` and `[EXAMPLE_GAP]`. Per-orphan `logger.warn` output is ephemeral in an
     * offline daemon; the graph+handoff plane is durable.
     *
     * @returns {Promise<Object>} Ingestion statistics including logical edge mutations and integrity findings.
     */
    async syncConceptsToGraph() {
        const stats = {
            conceptsProcessed : 0,
            conceptsUpserted  : 0,
            conceptsSkipped   : 0,
            edgesAdded        : 0,
            edgesRemoved      : 0,
            edgesReplaced     : 0,
            edgesUnchanged    : 0,
            edgesUpdated      : 0,
            integrityFindings : [],
            legacyStubsRemoved: 0,
            orphansDetected   : 0,
            errors            : []
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
                    // A persisted concept may not be resident in the request-scoped
                    // cache yet. Load its vicinity before deciding whether this is a
                    // first projection or the one-time legacy adoption pass.
                    db.getAdjacentNodes(conceptId, 'outbound');

                    const
                        payloadHash  = this.computePayloadHash(conceptNode),
                        existingNode = db.nodes.get(conceptId),
                        adoptLegacy  = !!existingNode
                            && /^[a-f0-9]{64}$/.test(existingNode.properties?.payloadHash || '')
                            && existingNode.properties?.conceptProjectionVersion == null,
                        weight           = ConceptService.calculateWeight(conceptNode),
                        outboundEdges    = ConceptService.edgesBySource.get(conceptId) || [],
                        normalized       = this.normalizeOutboundEdges(conceptId, outboundEdges),
                        nodePayloadMatch = existingNode?.properties?.payloadHash === payloadHash;

                    if (nodePayloadMatch) {
                        stats.conceptsSkipped++
                    } else {
                        GraphService.upsertNode({
                            id        : conceptId,
                            type      : 'CONCEPT',
                            name      : conceptNode.name,
                            properties: {
                                aliases          : conceptNode.aliases     ?? [],
                                codeGapEligible  : conceptNode.codeGapEligible !== false,
                                description      : conceptNode.description ?? '',
                                isConceptEdgeStub: false,
                                ontologyLayer    : conceptNode.ontologyLayer ?? 'code',
                                payloadHash,
                                tags             : conceptNode.tags        ?? [],
                                tier             : conceptNode.tier        ?? 0,
                                uniqueToNeo      : !!conceptNode.uniqueToNeo,
                                validated        : conceptNode.validated !== false,
                                verifiedAt       : conceptNode.verifiedAt ?? null,
                                weight
                            }
                        });

                        stats.conceptsUpserted++
                    }

                    const reconciliation = this.reconcileOutboundConceptEdges(conceptId, normalized.edges, adoptLegacy);

                    stats.edgesAdded     += reconciliation.added;
                    stats.edgesRemoved   += reconciliation.removed;
                    stats.edgesUnchanged += reconciliation.unchanged;
                    stats.edgesUpdated   += reconciliation.updated;
                    stats.edgesReplaced  += reconciliation.added + reconciliation.removed + reconciliation.updated;
                    stats.integrityFindings.push(...normalized.findings);

                    this.updateProjectionMetadata(conceptId, normalized.findings);

                    // Orphan detection — no IMPLEMENTED_BY means no source code anchors this concept.
                    // Counted here for the cycle-summary stats line; the actionable `[ORPHAN_CONCEPT]`
                    // gap signal is emitted by `GapInferenceEngine.inferConceptGraphGaps` through the
                    // durable `capabilityGap` channel + `sandman_handoff.md` section.
                    const hasImplementedBy = normalized.edges.some(e => e.type === CONCEPT_EDGE_TYPES.IMPLEMENTED_BY);
                    if (!hasImplementedBy && conceptNode.tier > 0) {
                        stats.orphansDetected++;
                    }
                } catch (e) {
                    stats.errors.push(`[${conceptId}] ${e.message}`);
                    logger.warn(`[ConceptIngestor] Failed to upsert concept '${conceptId}': ${e.message}`);
                }
            }

            stats.legacyStubsRemoved = this.cleanupLegacyFileStubs();

            if (stats.integrityFindings.length > 0) {
                logger.warn(`[ConceptIngestor] ${stats.integrityFindings.length} projection integrity finding(s): ${JSON.stringify(stats.integrityFindings)}`)
            }

            logger.info(`[ConceptIngestor] Sync complete: ${stats.conceptsUpserted} node payloads upserted, ${stats.conceptsSkipped} unchanged; edges ${stats.edgesAdded} added / ${stats.edgesUpdated} updated / ${stats.edgesRemoved} removed / ${stats.edgesUnchanged} unchanged; ${stats.legacyStubsRemoved} legacy stubs retired; ${stats.orphansDetected} orphans${stats.errors.length > 0 ? `, ${stats.errors.length} errors` : ''}.`);
        } catch (e) {
            logger.error('[ConceptIngestor] Fatal sync error:', e);
            stats.errors.push(`[fatal] ${e.message}`);
        }

        return stats;
    }
}

export default Neo.setupClass(ConceptIngestor);
