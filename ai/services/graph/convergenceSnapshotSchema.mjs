import {normalizeConceptKey} from './conceptSpineCanonicalization.mjs';
import {CONTRACT_AXES}       from './conceptNeighborhoodProbe.mjs';

/**
 * @module ai/services/graph/convergenceSnapshotSchema
 * @summary Convergence-weighted Golden Path — canonical-id snapshot node schema + firewalled render-target (#14633; ticket-ref-ok: owning-leaf anchor).
 *
 * Foundation leaf of epic #14581 (ticket-ref-ok: parent-epic anchor). A convergence snapshot annotates a
 * goal→sub-goal lattice node with how invariant it is across imagined futures ("structure not events" —
 * the sub-goals worth doing regardless of which future wins). This module defines ONLY the node schema
 * plus the two firewall-critical resolutions; the compute (Leaf 2) and the human render-ledger
 * (Leaf 3) build on it.
 *
 * Two hazards are closed at the schema layer:
 *   - **OQ1 node-identity drift:** every snapshot keys on a CANONICAL concept id (via the shipped
 *     `normalizeConceptKey` policy — reused, never re-derived) and records that id's provenance.
 *   - **OQ8 self-fulfilling firewall:** the render-target resolves to a surface NO agent boot-path
 *     consumes (`resolveRenderTarget`) — decision-support for humans, invisible to future-generation.
 *
 * Four-axis contract: annotations bind the shipped `CONTRACT_AXES` (authority / fidelity /
 * extractionProvenance / lifecycle) from the concept-graph measurement floor — the four axes stay
 * SEPARATE, never flattened to a composite score.
 *
 * ADR-0024 disposition (native-edge-graph-model; ticket-ref-ok: leaf-AC decay anchor; registered in ADR-0024 §2.2):
 * the `CONVERGENCE_SNAPSHOT` node class is ADDITIVE, FAIL-OPEN, re-derivable, and render-only / human-facing —
 * a read over the goal→sub-goal lattice, NOT durable authority. It is therefore **node-side non-protected
 * (DECAYING)**: a snapshot stale past its `remeasureAt` is discarded and recomputed, never trusted.
 * (`PROTECTED_EDGE_TYPES` governs EDGE facts, not node-class membership — the two are orthogonal.)
 *
 * EVOLUTION_GOAL binding: the shared `EVOLUTION_GOAL` schema (from the sibling direction chain) is
 * unmerged at this leaf's authoring, so the snapshot references it through `EVOLUTION_GOAL_SCHEMA_REF`
 * — a stub bound to the epic contract, reconciled to the real export when the sibling chain lands.
 */

export const CONVERGENCE_SNAPSHOT_NODE_TYPE = 'CONVERGENCE_SNAPSHOT';

/**
 * Stub reference to the shared `EVOLUTION_GOAL` schema (#14565 / PR #14626, unmerged; ticket-ref-ok: cross-lane dependency anchor).
 * The snapshot only needs the goal-id contract, which the epic fixes; reconcile `resolved` + a real
 * import when the sibling chain merges.
 */
export const EVOLUTION_GOAL_SCHEMA_REF = Object.freeze({
    ref     : 'EVOLUTION_GOAL',
    resolved: false,
    contract: 'canonical goal/sub-goal id + declared-intent axis (shared with the #14565 direction chain)'
});

/**
 * @summary The firewalled render-target for convergence output (OQ8). Resolves to a standalone ledger
 * artifact that NO agent boot-path consumes — the long-run home is the FM-cockpit terrain panel (a
 * surface agents never boot from). The redaction-filter branch is the reserved fallback, documented
 * not built.
 * @returns {Object} frozen `{target, notAuthority, agentBootConsumable, home, fallback}`.
 */
export function resolveRenderTarget() {
    return Object.freeze({
        target             : 'convergence-terrain-ledger',
        notAuthority       : true,
        agentBootConsumable: false,
        home               : 'fm-cockpit-terrain-panel',
        fallback           : 'redaction-filter'
    });
}

/**
 * @summary Projects an axis payload onto the four-axis contract, keeping the axes SEPARATE (never a
 * composite score). Unknown axis keys are dropped; only the four `CONTRACT_AXES` names are retained.
 * @param {Object} [axes] Caller axis payload keyed by axis name.
 * @returns {Object} present axes only, among `{authority, fidelity, extractionProvenance, lifecycle}`.
 */
export function pickContractAxes(axes = {}) {
    const out = {};

    for (const axis of Object.keys(CONTRACT_AXES)) {
        if (axes && axes[axis] !== undefined) {
            out[axis] = axes[axis];
        }
    }

    return out;
}

/**
 * @summary Builds a convergence-snapshot node keyed on the CANONICAL concept id of the lattice node it
 * annotates. Records id provenance (OQ1 — recorded, never invented), the four-axis annotations (never
 * flattened), the risk-node flag, and the born-scheduled longitudinal falsifier (`remeasureAt`). The
 * `convergenceWeight` + `independenceBudget` fields are declared but left `null` — the Leaf 2 compute
 * fills them; this builder never invents a weight.
 *
 * @param {Object}  input
 * @param {String}  input.latticeNodeId    Raw goal/sub-goal id to annotate (canonicalized here).
 * @param {String}  input.provenance       How the canonical id was derived (OQ1 — recorded verbatim).
 * @param {Boolean} [input.riskNode=false] Risk-node annotation.
 * @param {String}  [input.remeasureAt]    ISO time of the born-scheduled longitudinal re-measurement.
 * @param {Object}  [input.axes]           Four-axis annotations keyed by `CONTRACT_AXES` axis name.
 * @param {String}  [input.now]            ISO clock injection for deterministic tests.
 * @returns {Object|null} the snapshot node record, or `null` when the id does not canonicalize.
 */
export function buildConvergenceSnapshotNode({latticeNodeId, provenance, riskNode = false, remeasureAt, axes, now} = {}) {
    const canonicalId = normalizeConceptKey(latticeNodeId);

    if (!canonicalId) return null;

    return {
        type      : CONVERGENCE_SNAPSHOT_NODE_TYPE,
        id        : `${CONVERGENCE_SNAPSHOT_NODE_TYPE}:${canonicalId}`,
        properties: {
            canonicalId,
            provenance        : provenance || null,
            riskNode          : riskNode === true,
            remeasureAt       : remeasureAt || null,
            convergenceWeight : null,
            independenceBudget: null,
            axes              : pickContractAxes(axes),
            renderTarget      : resolveRenderTarget().target,
            evolutionGoalRef  : EVOLUTION_GOAL_SCHEMA_REF.ref,
            createdAt         : now || null
        }
    };
}
