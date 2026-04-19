import Base                                                        from '../../../src/core/Base.mjs';
import {Memory_Config as aiConfig, Memory_GraphService as GraphService} from '../../services.mjs';
import logger                                                      from '../../mcp/server/memory-core/logger.mjs';

/**
 * @summary Service for deterministic capability-gap inference over the Native Edge Graph.
 *
 * Operates in two passes per REM cycle:
 *
 * 1. **TEST_GAP inference (regex, session-scoped):** iterates session-artifact structural nodes
 *    (CLASS / METHOD / COMPONENT) and matches tokenized node names against `test/*` file-path
 *    entries in the graph. Preserved from pre-#10035 behavior — testing discipline still maps
 *    1:1 to source file names, where regex imprecision is acceptable because the test-file
 *    namespace is small and flat.
 *
 * 2. **Concept-graph inference (edge traversal, cycle-scoped):** iterates CONCEPT nodes ingested
 *    by `ConceptIngestor` and emits three deterministic signals via outbound-edge checks:
 *    - `[GUIDE_GAP]` — no `EXPLAINED_BY` edge
 *    - `[EXAMPLE_GAP]` — has `EXPLAINED_BY`, lacks `EXEMPLIFIED_BY`
 *    - `[ORPHAN_CONCEPT]` — no `IMPLEMENTED_BY` edge (concept exists in ontology but no source
 *      code anchors it; either the ontology is stale/aspirational or the implementation is
 *      missing and should be added). Surfaced through the same `capabilityGap` channel +
 *      `sandman_handoff.md` section pattern as the other gap types, not via `logger.warn`
 *      (logger is ephemeral; the graph + handoff is the durable substrate). Added in #10087.
 *    All three share the `aiConfig.data.guideGapWeightThreshold` gate (config-lifted in #10086
 *    for curator tuning; defaults to `0.8` = tier-1 baseline). Low-priority concepts don't flood
 *    the handoff; the gate auto-surfaces meaningful signals as concept ingestion matures
 *    (#10036 / #10037 / #10050). The config name retains the historical `guideGap*` prefix for
 *    the same reason the ticket does — the threshold was introduced for GUIDE_GAP in #10035,
 *    then widened to gate all three concept-graph signals in #10087.
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
     * Preserved from pre-#10035 behavior. Internal-config lifecycle hooks (`beforeSet*`,
     * `afterSet*`, `beforeGet*`) are excluded since they're structurally shared and not
     * individually testable.
     *
     * Gaps are persisted as a JSON-array-encoded string on `node.properties.capabilityGap` with
     * `[TEST_GAP]` prefix so `GoldenPathSynthesizer` can categorize them into the correct
     * `sandman_handoff.md` section. The `lastGapCheck` timestamp supports TTL-based staleness
     * pruning.
     *
     * Paired with `inferConceptGraphGaps` — which runs at cycle-scope, not per-session — to form
     * the full capability-gap pass. See #10085 for the scope split rationale.
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
        const testFilePaths = GraphService.db.nodes.items.filter(n =>
            n.label === 'FILE' && n.properties?.path?.startsWith('test/')
        ).map(n => n.properties?.path || '').map(p => p.toLowerCase());

        for (const node of structuralNodes) {
            const isInternalConfigHook = node.type === 'METHOD' && /^(beforeGet|beforeSet|afterSet)[A-Z]/.test(node.name);
            let testGap = null;

            if (!isInternalConfigHook) {
                const nodeTokens = node.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
                if (nodeTokens.length === 0) nodeTokens.push(node.name.toLowerCase());

                const hasTest = testFilePaths.some(p => nodeTokens.some(term => {
                    const regex = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
                    return regex.test(p);
                }));

                if (!hasTest) {
                    testGap = `[TEST_GAP] The ${node.type} '${node.name}' lacks corresponding automated validation suites (Playwright) covering its tokens within the test/ directory.`;
                }
            }

            const dbNode = GraphService.db.nodes.get(node.id) || GraphService.db.nodes.get(node._resolvedId);
            if (!dbNode) continue;

            this.applyGapsToNode(dbNode, testGap ? [testGap] : []);
        }
    }

    /**
     * Pass 2: concept-graph gap inference via deterministic edge traversal.
     *
     * For each CONCEPT node in the graph, emits three weight-gated signals based on outbound
     * edges in the Native Edge Graph:
     * - **`[GUIDE_GAP]`**: no outbound `EXPLAINED_BY` edge. Concept is architecturally relevant
     *   but undocumented — write a guide.
     * - **`[EXAMPLE_GAP]`**: has `EXPLAINED_BY` but no `EXEMPLIFIED_BY`. Concept is documented
     *   but lacks a working example — lower severity than a missing guide.
     * - **`[ORPHAN_CONCEPT]`** (added in #10087): no `IMPLEMENTED_BY` edge. Concept exists in
     *   the ontology but no source code anchors it. Either add an implementation or retire the
     *   concept from `nodes.jsonl`. Replaces the ephemeral per-orphan `logger.warn` that used
     *   to live in `ConceptIngestor` — routing through `capabilityGap` + `sandman_handoff.md`
     *   makes the signal durable and aggregatable.
     *
     * All three signals share the same `aiConfig.data.guideGapWeightThreshold` weight gate
     * (default `0.8` = tier-1 baseline; config-lifted in #10086 for curator tuning). Lower-weight
     * concepts (tier-3 without uniqueness or coverage deficit lift) are considered low-priority —
     * missing guides/examples/implementations for them aren't worth surfacing in the handoff at
     * the current early stage of the ontology. As concept ingestion matures (#10036 / #10037 /
     * #10050), richer weight signals auto-promote meaningful gaps through the same gate without
     * config changes. The derivation of the default (0.8) lives in `config.template.mjs` next to
     * the value itself.
     *
     * Uses the edges-direct traversal pattern (`db.edges.getByIndex('source', id).filter(...)`)
     * rather than `db.getAdjacentNodes(...)` because concept edges point at string identifiers
     * (`file:learn/guides/X.md`, `ext:react-jsx`) that are deliberately NOT materialized as graph
     * nodes. `getAdjacentNodes` would return empty for these targets and mis-flag every concept
     * as a guide gap. See #10035 for the architectural decision.
     *
     * **Scope:** cycle-scoped. Output depends only on ontology state, not on any individual
     * session — invoked once per REM cycle from `DreamService.processUndigestedSessions` after
     * the per-session loop, before garbage collection. See #10085 for why this was hoisted out
     * of the per-session loop.
     */
    async inferConceptGraphGaps() {
        const conceptNodes = GraphService.db.nodes.items.filter(n => n.label === 'CONCEPT');

        if (conceptNodes.length === 0) {
            logger.debug('[GapInferenceEngine] Concept graph empty — skipping concept-graph gap pass. (Is ConceptIngestor running before this?)');
            return;
        }

        logger.info(`[GapInferenceEngine] Concept-graph gap pass: traversing ${conceptNodes.length} concepts.`);

        // Resolved once per cycle (not per concept) — the config value is read at gate time so
        // mid-cycle config mutations in tests / runtime take effect without re-importing.
        const threshold = aiConfig.data.guideGapWeightThreshold;

        for (const concept of conceptNodes) {
            const
                outboundEdges       = GraphService.db.edges.getByIndex('source', concept.id),
                explainedByEdges    = outboundEdges.filter(e => e.type === 'EXPLAINED_BY'),
                exemplifiedByEdges  = outboundEdges.filter(e => e.type === 'EXEMPLIFIED_BY'),
                implementedByEdges  = outboundEdges.filter(e => e.type === 'IMPLEMENTED_BY'),
                weight              = concept.properties?.weight ?? 0,
                gaps                = [];

            if (weight >= threshold) {
                const name = concept.properties?.name || concept.name || concept.id;

                if (explainedByEdges.length === 0) {
                    gaps.push(`[GUIDE_GAP] The CONCEPT '${name}' lacks a corresponding architectural Guide (no EXPLAINED_BY edge in the concept ontology).`);
                } else if (exemplifiedByEdges.length === 0) {
                    gaps.push(`[EXAMPLE_GAP] The CONCEPT '${name}' is documented but lacks a working example (no EXEMPLIFIED_BY edge in the concept ontology).`);
                }

                if (implementedByEdges.length === 0) {
                    gaps.push(`[ORPHAN_CONCEPT] The CONCEPT '${name}' has no IMPLEMENTED_BY edge — either anchor it to a source file or retire the concept from nodes.jsonl if aspirational/stale.`);
                }
            }

            this.applyGapsToNode(concept, gaps);
        }
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
