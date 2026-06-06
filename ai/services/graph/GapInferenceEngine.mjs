import Base                                                        from '../../../src/core/Base.mjs';
import {Memory_Config as aiConfig, Memory_GraphService as GraphService} from '../../services.mjs';
import KBRecorderService                                           from '../../services/knowledge-base/KBRecorderService.mjs';
import logger                                                      from '../../mcp/server/memory-core/logger.mjs';

/**
 * Default freshness window for Concept Ontology source-grounding. Concepts with missing,
 * null, invalid, or older `verifiedAt` values emit `[CONCEPT_REVERIFY_DUE]` so curators
 * can review them again. This signal is intentionally non-destructive: it never mutates
 * concept weights, edge weights, validation state, or graph visibility.
 * @type {Number}
 * @private
 */
const CONCEPT_REVERIFY_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * ISO freshness stamps accept either a date-only value (`YYYY-MM-DD`) or the canonical
 * JavaScript UTC timestamp emitted by `Date#toISOString()`.
 * @type {RegExp}
 * @private
 */
const ISO_VERIFIED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/;

/**
 * @summary Service for deterministic capability-gap inference over the Native Edge Graph.
 *
 * Operates in two passes per REM cycle:
 *
 * 1. **TEST_GAP inference (regex, session-scoped):** iterates session-artifact structural nodes
 *    (CLASS / METHOD / COMPONENT) and matches tokenized node names against `test/*` file-path
 *    entries in the graph. This legacy regex path is still acceptable because testing
 *    discipline maps 1:1 to source file names and the test-file namespace is small and flat.
 *
 * 2. **Concept-graph inference (edge traversal, cycle-scoped):** iterates CONCEPT nodes ingested
 *    by `ConceptIngestor` and emits deterministic signals via metadata + outbound-edge checks:
 *    - `[CONCEPT_REVERIFY_DUE]` — `verifiedAt` is null, missing, invalid, or older than the
 *      90-day freshness window. This queues curation only; it never fades graph nodes or edges.
 *    - `[GUIDE_GAP]` — no `EXPLAINED_BY` edge
 *    - `[EXAMPLE_GAP]` — has `EXPLAINED_BY`, lacks `EXEMPLIFIED_BY`
 *    - `[ORPHAN_CONCEPT]` — no `IMPLEMENTED_BY` edge (concept exists in ontology but no source
 *      code anchors it; either the ontology is stale/aspirational or the implementation is
 *      missing and should be added). Surfaced through the same `capabilityGap` channel +
 *      `sandman_handoff.md` section pattern as the other gap types, not via `logger.warn`
 *      (logger is ephemeral; the graph + handoff is the durable substrate).
 *    - `[KB_DEMAND_GAP]` — repeated agent questions from the Knowledge Base FAQ telemetry
 *      table map to this concept, but the FAQ cluster still lacks strong guide coverage.
 *    The three coverage signals share the `aiConfig.guideGapWeightThreshold` gate
 *    (config-lifted for curator tuning; defaults to `0.8` = tier-1 baseline).
 *    `[CONCEPT_REVERIFY_DUE]` is not weight-gated because freshness review is a curation
 *    cadence, not a severity claim. Low-priority concepts may need review without becoming
 *    more important.
 *
 *    **Why graph traversal over LLM verification?** The concept graph's edges are
 *    curator-maintained (`.neo-ai-data/concepts/edges.jsonl` is version-controlled; each edge
 *    exists because a human — or an agent under PR review — asserted it). The LLM verification
 *    step that existed pre-refactor was a patch for regex imprecision when matching concept names
 *    against guide file paths; concepts don't have that imprecision, so the check becomes
 *    rubber-stamping. Removing it reclaims per-node inference cost from the REM pipeline without
 *    loss of signal fidelity.
 *
 * @class Neo.ai.daemons.services.GapInferenceEngine
 * @extends Neo.core.Base
 * @see Neo.ai.daemons.services.ConceptIngestor
 * @see Neo.ai.daemons.services.GoldenPathSynthesizer
 * @singleton
 */
class GapInferenceEngine extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.GapInferenceEngine'
         * @protected
         */
        className: 'Neo.ai.daemons.services.GapInferenceEngine',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Session-scoped TEST_GAP inference entry point. Iterates CLASS / METHOD / COMPONENT nodes
     * from the session artifact and checks for a matching test file via tokenized regex scan.
     * The legacy regex path is retained for test-file discovery. Internal-config lifecycle
     * hooks (`beforeSet*`, `afterSet*`, `beforeGet*`) are excluded since they're structurally
     * shared and not individually testable.
     *
     * Gaps are persisted as a JSON-array-encoded string on `node.properties.capabilityGap` with
     * `[TEST_GAP]` prefix so `GoldenPathSynthesizer` can categorize them into the correct
     * `sandman_handoff.md` section. The `lastGapCheck` timestamp supports TTL-based staleness
     * pruning.
     *
     * Paired with `inferConceptGraphGaps` — which runs at cycle-scope, not per-session — to form
     * the full capability-gap pass while keeping session-bound test coverage separate from
     * ontology-wide concept coverage.
     * @param {Object} payload The parsed Tri-Vector schema from `SemanticGraphExtractor`
     */
    async inferTestGapsFromSession(payload) {
        if (!payload || !payload.session_artifact || !payload.session_artifact.graph || !payload.session_artifact.graph.nodes) return;

        const structuralNodes = payload.session_artifact.graph.nodes.filter(n =>
            (n.type === 'CLASS' || n.type === 'METHOD' || n.type === 'COMPONENT') &&
            (typeof n.confidence === 'number' ? n.confidence : 1.0) >= 0.6
        );

        if (structuralNodes.length === 0) return;

        logger.info(`[GapInferenceEngine] TEST_GAP pass: scanning ${structuralNodes.length} structural nodes.`);

        // INTERNAL MAPPING NOTE: The native SQLite items iterate over `Neo.ai.graph.NodeModel`
        // instances. To align with formal Graph Database taxonomy, the DTO `.type` property
        // is mapped to `.label` on Nodes (while Edges retain `.type`).
        const testFileNodes = GraphService.db.nodes.items.filter(n =>
            n.label === 'FILE' && n.properties?.path?.startsWith('test/')
        ).map(n => ({
            id       : n.id,
            path     : n.properties?.path || '',
            pathLower: (n.properties?.path || '').toLowerCase()
        }));

        for (const node of structuralNodes) {
            const isInternalConfigHook = node.type === 'METHOD' && /^(beforeGet|beforeSet|afterSet)[A-Z]/.test(node.name);
            const dbNode = GraphService.db.nodes.get(node.id) || GraphService.db.nodes.get(node._resolvedId);

            if (!dbNode) continue;

            let testGap           = null;
            let matchingTestFiles = [];

            if (!isInternalConfigHook) {
                const nodeTokens = node.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
                if (nodeTokens.length === 0) nodeTokens.push(node.name.toLowerCase());

                matchingTestFiles = testFileNodes.filter(({pathLower}) => nodeTokens.some(term => {
                    const regex = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
                    return regex.test(pathLower);
                }));

                if (matchingTestFiles.length === 0) {
                    testGap = `[TEST_GAP] The ${node.type} '${node.name}' lacks corresponding automated validation suites (Playwright) covering its tokens within the test/ directory.`;
                } else {
                    this.linkTestEvidenceToStructuralNode(matchingTestFiles, dbNode, node);
                }
            }

            this.applyGapsToNode(dbNode, testGap ? [testGap] : []);
        }
    }

    /**
     * @summary Links durable test-file evidence to a structural graph node.
     *
     * `FILE` nodes whose `properties.path` starts with `test/` are the canonical evidence node
     * for this first relation contract. The edge metadata keeps downstream reward / gap-downgrade
     * consumers from re-parsing `capabilityGap` strings once a matching test file exists.
     * @param {Object[]} testFileNodes Matching test-file node descriptors
     * @param {Object}   dbNode        SQLite-persisted structural graph node
     * @param {Object}   sourceNode    Session-artifact structural node
     * @protected
     */
    linkTestEvidenceToStructuralNode(testFileNodes, dbNode, sourceNode) {
        const linkedIds = new Set();

        for (const testFile of testFileNodes) {
            if (!testFile.id || linkedIds.has(testFile.id)) continue;

            linkedIds.add(testFile.id);

            GraphService.linkNodes(testFile.id, dbNode.id, 'VALIDATES', 1.0, {
                evidenceKind      : 'permanent-test-file',
                evidencePath      : testFile.path,
                inferredBy        : 'GapInferenceEngine.inferTestGapsFromSession',
                validatedNodeName : sourceNode.name,
                validatedNodeType : sourceNode.type
            });
        }
    }

    /**
     * Pass 2: concept-graph gap inference via deterministic edge traversal.
     *
     * For each CONCEPT node in the graph, emits a non-destructive freshness signal plus three
     * weight-gated coverage signals based on outbound edges in the Native Edge Graph:
     * - **`[CONCEPT_REVERIFY_DUE]`**: `verifiedAt` is `null`, missing,
     *   invalid, or older than the 90-day freshness window. This queues source-grounding review
     *   work only; it never changes concept weight, edge weight, validation, or graph visibility.
     * - **`[GUIDE_GAP]`**: no outbound `EXPLAINED_BY` edge. Concept is architecturally relevant
     *   but undocumented — write a guide.
     * - **`[EXAMPLE_GAP]`**: has `EXPLAINED_BY` but no `EXEMPLIFIED_BY`. Concept is documented
     *   but lacks a working example — lower severity than a missing guide.
     * - **`[ORPHAN_CONCEPT]`**: no `IMPLEMENTED_BY` edge. Concept exists in
     *   the ontology but no source code anchors it. Either add an implementation or retire the
     *   concept from `nodes.jsonl`. Replaces the ephemeral per-orphan `logger.warn` that used
     *   to live in `ConceptIngestor` — routing through `capabilityGap` + `sandman_handoff.md`
     *   makes the signal durable and aggregatable.
     *
     * The three coverage signals share the same `aiConfig.guideGapWeightThreshold` weight gate
     * (default `0.8` = tier-1 baseline; config-lifted for curator tuning). Lower-weight
     * concepts (tier-3 without uniqueness or coverage deficit lift) are considered low-priority —
     * missing guides/examples/implementations for them aren't worth surfacing in the handoff at
     * the current early stage of the ontology. As concept ingestion accumulates richer validation
     * and enrichment signals, meaningful gaps auto-promote through the same gate without config
     * changes. The derivation of the default (0.8) lives in `config.template.mjs` next to the
     * value itself. Freshness review remains independent of this gate.
     *
     * Uses the edges-direct traversal pattern (`db.edges.getByIndex('source', id).filter(...)`)
     * rather than `db.getAdjacentNodes(...)` because concept edges point at string identifiers
     * (`file:learn/guides/X.md`, `ext:react-jsx`) that are deliberately NOT materialized as graph
     * nodes. `getAdjacentNodes` would return empty for these targets and mis-flag every concept
     * as a guide gap.
     *
     * **Scope:** cycle-scoped. Output depends only on ontology state, not on any individual
     * session — invoked once per REM cycle from `DreamService.processUndigestedSessions` after
     * the per-session loop, before garbage collection.
     */
    async inferConceptGraphGaps() {
        const
            conceptNodes = GraphService.db.nodes.items.filter(n => n.label === 'CONCEPT'),
            now          = Date.now();

        if (conceptNodes.length === 0) {
            logger.debug('[GapInferenceEngine] Concept graph empty — skipping concept-graph gap pass. (Is ConceptIngestor running before this?)');
            return;
        }

        const kbDemandGaps = await this.getKbDemandGapsByConcept();

        logger.info(`[GapInferenceEngine] Concept-graph gap pass: traversing ${conceptNodes.length} concepts.`);

        // Resolved once per cycle (not per concept) — the config value is read at gate time so
        // mid-cycle config mutations in tests / runtime take effect without re-importing.
        const threshold = aiConfig.guideGapWeightThreshold;

        for (const concept of conceptNodes) {
            // Unvalidated concepts (candidates from ConceptDiscoveryService awaiting curator
            // review) are silenced regardless of weight. Low weight is the primary gate for
            // legitimate low-priority concepts; the validated flag is the explicit override
            // for "this hasn't been reviewed yet — don't surface it." Legacy rows without the
            // field have `validated === undefined`, treated as validated.
            if (concept.properties?.validated === false) continue;

            const
                outboundEdges       = GraphService.db.edges.getByIndex('source', concept.id),
                explainedByEdges    = outboundEdges.filter(e => e.type === 'EXPLAINED_BY'),
                exemplifiedByEdges  = outboundEdges.filter(e => e.type === 'EXEMPLIFIED_BY'),
                implementedByEdges  = outboundEdges.filter(e => e.type === 'IMPLEMENTED_BY'),
                weight              = concept.properties?.weight ?? 0,
                gaps                = [],
                name                = concept.properties?.name || concept.name || concept.id;

            if (this.isConceptReverifyDue(concept, now)) {
                const verifiedAt = concept.properties?.verifiedAt ?? null;
                gaps.push([
                    `[CONCEPT_REVERIFY_DUE] The CONCEPT '${name}' has verifiedAt=${JSON.stringify(verifiedAt)}`,
                    'and needs source-grounded re-verification. Re-check the Concept Ontology metadata;',
                    'do not decay graph weight or edges automatically.'
                ].join(' '));
            }

            if (weight >= threshold) {
                if (explainedByEdges.length === 0) {
                    gaps.push(`[GUIDE_GAP] The CONCEPT '${name}' lacks a corresponding architectural Guide (no EXPLAINED_BY edge in the concept ontology).`);
                } else if (exemplifiedByEdges.length === 0) {
                    gaps.push(`[EXAMPLE_GAP] The CONCEPT '${name}' is documented but lacks a working example (no EXEMPLIFIED_BY edge in the concept ontology).`);
                }

                if (implementedByEdges.length === 0) {
                    gaps.push(`[ORPHAN_CONCEPT] The CONCEPT '${name}' has no IMPLEMENTED_BY edge — either anchor it to a source file or retire the concept from nodes.jsonl if aspirational/stale.`);
                }
            }

            gaps.push(...(kbDemandGaps.get(concept.id) || []));

            this.applyGapsToNode(concept, gaps);
        }
    }

    /**
     * @summary Maps materialized Agent FAQ demand rows onto Concept Ontology nodes.
     *
     * `KBRecorderService` owns `kb_query_log` / `kb_query_faqs`; this method only consumes its
     * read model and converts high-frequency uncovered questions into the same durable
     * `capabilityGap` channel used by structural concept gaps. The FAQ table's
     * `has_strong_guide_coverage` flag is authoritative here — it keeps the daemon from
     * re-running semantic coverage checks during every REM cycle.
     *
     * @returns {Promise<Map<String, String[]>>} Concept ID to `[KB_DEMAND_GAP]` strings.
     * @protected
     */
    async getKbDemandGapsByConcept() {
        const gapsByConcept = new Map();

        try {
            await KBRecorderService.ready();

            const {faqs} = KBRecorderService.listAgentFaqs({refresh: true});

            for (const faq of faqs) {
                if (faq.hasStrongGuideCoverage) continue;

                const relatedConceptIds = faq.relatedConceptIds || [];

                for (const conceptId of relatedConceptIds) {
                    if (!gapsByConcept.has(conceptId)) {
                        gapsByConcept.set(conceptId, []);
                    }

                    gapsByConcept.get(conceptId).push(
                        `[KB_DEMAND_GAP] Agents asked "${faq.canonicalQuery}" ${faq.count} times ` +
                        `(cluster ${faq.clusterId}) but the mapped Concept Ontology area lacks strong guide coverage.`
                    );
                }
            }
        } catch (err) {
            logger.debug('[GapInferenceEngine] KB demand gap pass skipped:', err.message);
        }

        return gapsByConcept;
    }

    /**
     * @summary Determines whether a Concept Ontology node is due for source-grounded re-verification.
     *
     * `verifiedAt` is freshness metadata, not graph physics. Returning `true` means the concept
     * should appear in the curation queue via `[CONCEPT_REVERIFY_DUE]`; callers must not treat this
     * as permission to reduce graph weight, weaken edges, flip `validated`, or hide the concept.
     * Missing legacy values, explicit `null`, non-ISO / invalid date strings, and dates older than the
     * configured review window are all due.
     * @param {Object} conceptNode                      SQLite-persisted CONCEPT node
     * @param {Number} now=Date.now()                   Epoch milliseconds used for deterministic tests
     * @param {Number} reviewWindowMs=CONCEPT_REVERIFY_INTERVAL_MS Freshness window in milliseconds
     * @returns {Boolean}
     * @protected
     */
    isConceptReverifyDue(conceptNode, now=Date.now(), reviewWindowMs=CONCEPT_REVERIFY_INTERVAL_MS) {
        const verifiedAt = conceptNode?.properties?.verifiedAt ?? null;
        if (!verifiedAt || typeof verifiedAt !== 'string') return true;
        if (!ISO_VERIFIED_AT_PATTERN.test(verifiedAt)) return true;

        const verifiedTime = Date.parse(verifiedAt);
        if (!Number.isFinite(verifiedTime)) return true;

        return now - verifiedTime > reviewWindowMs;
    }

    /**
     * Writes gaps to `node.properties.capabilityGap` as a JSON-encoded array of tagged strings,
     * or garbage-collects the property if the current pass produced zero gaps for a node that
     * previously had any. Updates `lastGapCheck` on every invocation so `GoldenPathSynthesizer`'s
     * TTL pruning (7-day window) can reliably distinguish fresh from stale records.
     * @param {Object}   dbNode       The SQLite-persisted graph node
     * @param {String[]} gapsForNode  Array of gap strings discovered this pass (may be empty)
     * @protected
     */
    applyGapsToNode(dbNode, gapsForNode) {
        if (!dbNode) return;

        dbNode.properties = dbNode.properties || {};

        if (gapsForNode.length > 0) {
            dbNode.properties.capabilityGap = JSON.stringify(gapsForNode);
            dbNode.properties.lastGapCheck  = Date.now();
            GraphService.upsertNode(dbNode);
            logger.debug(`[GapInferenceEngine] Gap(s) attached to ${dbNode.id}: ${gapsForNode.length} entry(ies).`);
        } else if (dbNode.properties.capabilityGap) {
            delete dbNode.properties.capabilityGap;
            dbNode.properties.lastGapCheck = Date.now();
            GraphService.upsertNode(dbNode);
            logger.debug(`[GapInferenceEngine] Gap eradicated for ${dbNode.id} — coverage complete.`);
        }
    }
}

export default Neo.setupClass(GapInferenceEngine);
