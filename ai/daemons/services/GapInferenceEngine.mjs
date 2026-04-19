import Base                                 from '../../../src/core/Base.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import logger                               from '../../mcp/server/memory-core/logger.mjs';

/**
 * Minimum weight threshold for emitting a `[GUIDE_GAP]` on a CONCEPT node.
 *
 * **Derivation:** `ConceptService.calculateWeight` returns `tier_score + uniqueness + coverage_deficit`
 * where tier-1 gets `0.8`, tier-2 `0.5`, tier-3 `0.3`; uniqueness adds `0.2`; coverage deficit (no
 * EXPLAINED_BY) adds `0.3`. The minimum a tier-1 concept can score is `0.8` (covered, non-unique).
 * Setting threshold = `0.8` means *"at least tier-1 baseline priority"* — every tier-1 concept
 * without a guide qualifies; tier-2/3 concepts qualify only if uniqueness + deficit push them above.
 *
 * Not config-lifted in Phase 1 — if human tuning becomes a real need, promote to
 * `aiConfig.data.guideGapWeightThreshold` with the same default.
 * @type {Number}
 * @private
 */
const GUIDE_GAP_WEIGHT_THRESHOLD = 0.8;

/**
 * @summary Service for deterministic capability-gap inference over the Native Edge Graph.
 *
 * Operates in two parallel passes per REM cycle:
 *
 * 1. **TEST_GAP inference (regex):** iterates session-artifact structural nodes (CLASS / METHOD /
 *    COMPONENT) and matches tokenized node names against `test/*` file-path entries in the graph.
 *    Preserved from pre-#10035 behavior — testing discipline still maps 1:1 to source file names,
 *    where regex imprecision is acceptable because the test-file namespace is small and flat.
 *
 * 2. **GUIDE_GAP / EXAMPLE_GAP inference (graph traversal):** iterates CONCEPT nodes ingested by
 *    `ConceptIngestor` and checks for outbound `EXPLAINED_BY` / `EXEMPLIFIED_BY` edges. This
 *    replaces the pre-#10035 regex + LLM Boolean verification path.
 *
 *    **Why graph traversal over LLM verification?** The concept graph's `EXPLAINED_BY` edges are
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
     * Main entry point invoked by DreamService per session. Executes both the structural-node
     * TEST_GAP pass (session-artifact scoped) and the concept-graph GUIDE_GAP / EXAMPLE_GAP pass
     * (ontology scoped — session-independent).
     *
     * Gaps are persisted as a JSON-array-encoded string on `node.properties.capabilityGap`; each
     * entry carries a tag prefix (`[TEST_GAP]`, `[GUIDE_GAP]`, `[EXAMPLE_GAP]`) so
     * `GoldenPathSynthesizer` can categorize them into the correct display section in
     * `sandman_handoff.md`. The `lastGapCheck` timestamp supports TTL-based staleness pruning.
     *
     * @param {Object} session The wrapped session object
     * @param {Object} payload The parsed Tri-Vector schema from `SemanticGraphExtractor`
     */
    async executeCapabilityGapInference(session, payload) {
        await this.inferTestGapsFromSession(payload);
        await this.inferConceptGraphGaps();
    }

    /**
     * Pass 1: per-structural-node TEST_GAP inference. Iterates CLASS / METHOD / COMPONENT nodes
     * from the session artifact and checks for a matching test file via tokenized regex scan.
     * Preserved from pre-#10035 behavior. Internal-config lifecycle hooks (`beforeSet*`,
     * `afterSet*`, `beforeGet*`) are excluded since they're structurally shared and not
     * individually testable.
     * @param {Object} payload The parsed Tri-Vector schema
     * @protected
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
     * Pass 2: concept-graph GUIDE_GAP and EXAMPLE_GAP inference via deterministic edge traversal.
     *
     * For each CONCEPT node in the graph:
     * - **`[GUIDE_GAP]`**: emitted if no outbound `EXPLAINED_BY` edge exists AND concept weight
     *   meets `GUIDE_GAP_WEIGHT_THRESHOLD` (tier-1 baseline). Lower-weight concepts (tier-3
     *   without uniqueness or deficit lift) are considered low-priority; missing guides for them
     *   are not worth surfacing in the handoff.
     * - **`[EXAMPLE_GAP]`**: emitted if a concept has `EXPLAINED_BY` but no `EXEMPLIFIED_BY`.
     *   Signals that the concept is documented but lacks a working example — lower severity than
     *   a missing guide.
     *
     * Uses the edges-direct traversal pattern (`db.edges.getByIndex('source', id).filter(...)`)
     * rather than `db.getAdjacentNodes(...)` because concept edges point at string identifiers
     * (`file:learn/guides/X.md`, `ext:react-jsx`) that are deliberately NOT materialized as graph
     * nodes. `getAdjacentNodes` would return empty for these targets and mis-flag every concept
     * as a guide gap. See #10035 for the architectural decision.
     * @protected
     */
    async inferConceptGraphGaps() {
        const conceptNodes = GraphService.db.nodes.items.filter(n => n.label === 'CONCEPT');

        if (conceptNodes.length === 0) {
            logger.debug('[GapInferenceEngine] Concept graph empty — skipping GUIDE_GAP / EXAMPLE_GAP pass. (Is ConceptIngestor running before this?)');
            return;
        }

        logger.info(`[GapInferenceEngine] GUIDE_GAP / EXAMPLE_GAP pass: traversing ${conceptNodes.length} concepts.`);

        for (const concept of conceptNodes) {
            const
                outboundEdges      = GraphService.db.edges.getByIndex('source', concept.id),
                explainedByEdges   = outboundEdges.filter(e => e.type === 'EXPLAINED_BY'),
                exemplifiedByEdges = outboundEdges.filter(e => e.type === 'EXEMPLIFIED_BY'),
                weight             = concept.properties?.weight ?? 0,
                gaps               = [];

            if (explainedByEdges.length === 0 && weight >= GUIDE_GAP_WEIGHT_THRESHOLD) {
                const name = concept.properties?.name || concept.name || concept.id;
                gaps.push(`[GUIDE_GAP] The CONCEPT '${name}' lacks a corresponding architectural Guide (no EXPLAINED_BY edge in the concept ontology).`);
            }

            if (explainedByEdges.length > 0 && exemplifiedByEdges.length === 0 && weight >= GUIDE_GAP_WEIGHT_THRESHOLD) {
                const name = concept.properties?.name || concept.name || concept.id;
                gaps.push(`[EXAMPLE_GAP] The CONCEPT '${name}' is documented but lacks a working example (no EXEMPLIFIED_BY edge in the concept ontology).`);
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
