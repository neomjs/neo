import Base              from '../../../core/Base.mjs';
import TopologyDiff      from '../model/TopologyDiff.mjs';
import WorkspaceDocument from '../model/WorkspaceDocument.mjs';
import Operations        from '../model/Operations.mjs';

/**
 * @class Neo.dashboard.dock.persistence.RestorePlanner
 * @extends Neo.core.Base
 *
 * @summary Plans + applies a same-topology perspective RESTORE through semantic operations.
 *
 * Restore is where object permanence must hold: reaching a captured layout must happen via the
 * {@link Neo.dashboard.dock.model.WorkspaceDocument} executor (`moveItem` / `resizeSplit` / `setItemAutoHidden`), NEVER by
 * document replacement — a swap would remount every pane, violating the §2.6 reparent-never-recreate promise
 * (a restore that flickers every pane is a contract violation wearing a feature's name).
 *
 * This is the UNCHANGED-topology leaf: the shape fingerprint must match (same split tree + per-node tab
 * counts). The cross-topology / structure-recreation case (fingerprint mismatch) is a separate leaf; this
 * planner defers it structurally rather than guessing. A matching fingerprint means per-node item COUNTS are
 * equal, so `adds`/`removes` cannot occur — but items can still be EXCHANGED across nodes (`moves`) while
 * preserving every count (two `t2` zones, or a `t2` and a `t1`, swapping items). Those moves are sequenced
 * collapse-safely; the one residual a matching fingerprint cannot rule out — a cycle of single-item nodes
 * swapping, unsolvable by ordering under per-step normalization — defers structurally.
 *
 * The planner is a PURE fold over `TopologyDiff.diffDockDocuments(current, captured)` (direction:
 * current → captured, planning TOWARD the capture). Application is a sequential, fail-closed executor pass.
 */
class RestorePlanner extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.persistence.RestorePlanner'
         * @protected
         */
        className: 'Neo.dashboard.dock.persistence.RestorePlanner'
    }

    /**
     * @summary Pure planner: two documents → an ordered semantic-operation plan toward the captured layout.
     *
     * Fingerprint gate first: a shape mismatch returns a structured deferral (the cross-topology leaf owns
     * that path) with an empty plan — never a silent partial. Otherwise it maps each diff category to its
     * operation in a deterministic order (moves → tab reorders ascending target index → active items →
     * split resizes → edge-zone resizes → auto-hide flips; `adds` lead when present). `removes` are NOT
     * destroyed — restore never deletes — they surface as a `surplus` list the cross-topology dual consumes.
     *
     * Not every reported change becomes a step: each value-bearing category is filtered to what the
     * executor accepts, so a zone the app has since made non-resizable, a split size outside the
     * reducer's domain, or an auto-hide of an unpinnable pane is reported by the differ and skipped
     * here rather than planned into a step that would fail the whole application. A skipped step is
     * never an error — the differ reports document truth, this planner emits only what can run.
     * @param {Object} current  The live committed document.
     * @param {Object} captured The captured layout document to restore toward.
     * @returns {{deferred: Boolean, reason: (String|null), plan: Object[], surplus: Object[], errors: String[]}}
     * @static
     */
    static planRestore(current, captured) {
        let fpCurrent  = WorkspaceDocument.computeShapeFingerprint(current),
            fpCaptured = WorkspaceDocument.computeShapeFingerprint(captured),
            errors     = [...fpCurrent.errors, ...fpCaptured.errors];

        if (errors.length) {
            return {deferred: false, reason: null, plan: [], surplus: [], errors}
        }

        // computeShapeFingerprint returns {fingerprint: {shape, nodeCounts, itemCount}, ...}; `shape` is the
        // canonical structural signature (split tree + per-node tab counts). Same shape ⇒ same topology.
        if (fpCurrent.fingerprint?.shape !== fpCaptured.fingerprint?.shape) {
            return {
                deferred: true,
                reason  : 'topology-fingerprint-mismatch',
                plan    : [],
                surplus : [],
                errors  : []
            }
        }

        let diff = TopologyDiff.diffDockDocuments(current, captured);

        if (diff.errors.length) {
            return {deferred: false, reason: null, plan: [], surplus: [], errors: diff.errors}
        }

        // Cross-node moves must be SEQUENCED so no source tabs node empties mid-plan: the executor
        // normalizes after every step, so an emptied node collapses and a later move to/from it fails
        // (Clio's structural-collapse trap). A move is safe to apply when its source still holds >1 item;
        // we greedily emit safe moves, simulating per-node counts. A residual set that can never satisfy
        // this — a cycle of single-item nodes swapping (e.g. two `t1` zones exchanging) — is unsolvable by
        // ordering alone under per-step normalization, so it defers structurally rather than crashing.
        let counts = {};
        Object.entries(current.nodes).forEach(([id, n]) => { if (n.type === 'tabs') counts[id] = (n.items || []).length });

        let remaining = [...diff.moves], orderedMoves = [], progressed = true;

        while (remaining.length && progressed) {
            progressed = false;
            for (let i = 0; i < remaining.length; i++) {
                let mv = remaining[i];
                if (counts[mv.from.nodeId] > 1) {
                    orderedMoves.push(mv);
                    counts[mv.from.nodeId]--;
                    counts[mv.to.nodeId] = (counts[mv.to.nodeId] || 0) + 1;
                    remaining.splice(i, 1);
                    progressed = true;
                    break
                }
            }
        }

        if (remaining.length) {
            return {deferred: true, reason: 'cross-node-singleton-cycle', plan: [], surplus: [], errors: []}
        }

        let plan = [];

        // adds → moves (collapse-safe order) → tabReorders (ascending captured index) → activeItems → resizes → edgeResizes → autoHideFlips.
        diff.adds.forEach(({itemId, to}) =>
            plan.push({operation: 'addTab', itemId, tabsNodeId: to.nodeId, index: to.index}));

        orderedMoves.forEach(({itemId, to}) =>
            plan.push({operation: 'moveItem', itemId, targetNodeId: to.nodeId, index: to.index}));

        [...diff.tabReorders].sort((a, b) => a.toIndex - b.toIndex).forEach(({itemId, nodeId, toIndex}) =>
            plan.push({operation: 'moveItem', itemId, targetNodeId: nodeId, index: toIndex}));

        // After the membership steps and before the flags: the executor rejects an active item that
        // is not a member of its node, so this cannot run until every add/move/reorder has landed —
        // and it must run while the item is still in the tab flow, ahead of any auto-hide flip.
        diff.activeItemChanges.forEach(({nodeId, to}) =>
            plan.push({operation: 'setActiveItem', tabsNodeId: nodeId, itemId: to}));

        // The three value-bearing categories emit only what the executor will accept, and the rule
        // for each is the same: cover the refusals the shape gate upstream does not. Predicates read
        // `current`, never the capture, because the live document is the one the executor validates —
        // reading the capture's would emit a step it then rejects, and suppress one it would accept.
        //
        // Why a filter and not a best effort: `applyRestorePlan` is fail-closed on the first error,
        // so ONE unusable step strands every later one, including steps with no relationship to it.
        // The failure is not "the rail does not move" but "the restore silently did almost nothing".
        //
        // A value gets here unusable for two different reasons, and both are measured:
        //   - contract-ILLEGAL and unchecked — nothing in the persistence tier calls
        //     `WorkspaceDocument.validate`, so an out-of-range extent from another writer
        //     (hand-authored, an older schema, edited storage) arrives intact.
        //   - contract-LEGAL and refused anyway — the contract and the reducers are different sets.
        //     `validate` accepts a split `sizes: [0, 1]` (it checks the sum, not the elements) and
        //     accepts `pinnable: false` beside `autoHidden: true` (it checks the type only), while
        //     `normalizeSplitSizes` and `setItemAutoHidden` refuse both.
        //
        // These predicates deliberately MIRROR the executor's rather than sharing them: keeping
        // `planRestore` a pure fold — no executor round-trip to decide what to plan — is worth the
        // duplication. But the duplication is real and unlinked. A refusal added to any of the three
        // reducers will not surface here, and the arms in `DockRestorePlanner.spec.mjs` are the only
        // thing that would catch it.

        // `resizeSplit` rejects a non-finite or non-positive element; every-element-positive also
        // gives `normalizeSplitSizes` the finite positive total it requires.
        diff.resizes.forEach(({nodeId, toSizes}) => {
            if (toSizes.every(size => Number.isFinite(size) && size > 0)) {
                plan.push({operation: 'resizeSplit', splitNodeId: nodeId, sizes: [...toSizes]})
            }
        });

        // `resizeEdgeZone` rejects `center` (not one of the four resizable edges), a descriptor that
        // is not exactly `resizable`, and an extent outside the open interval `(0, 1)`. Its fourth
        // refusal — an unresolvable descriptor — is the one the shape gate already catches.
        diff.edgeResizes.forEach(({nodeId, edge, to}) => {
            if (edge !== 'center' && to > 0 && to < 1 &&
                current.nodes?.[nodeId]?.zones?.[edge]?.resizable === true
            ) {
                plan.push({operation: 'resizeEdgeZone', edgeZoneId: nodeId, edge, extent: to})
            }
        });

        // `setItemAutoHidden` rejects a non-pinnable item — in BOTH directions, since it gates on
        // `pinnable` before it looks at the value — and rejects auto-hiding a pinned one. A pane the
        // app has since unpinned from the rail keeps its live visibility rather than taking the
        // restore down with it, the same degradation the edge-zone filter above chooses.
        diff.autoHideFlips.forEach(({itemId, to}) => {
            const item = current.items?.[itemId];

            if (item && item.pinnable !== false && !(to && item.pinned === true)) {
                plan.push({operation: 'setItemAutoHidden', itemId, autoHidden: to})
            }
        });

        // Restore never destroys: an item current holds that the capture doesn't surfaces as surplus, not a delete.
        let surplus = diff.removes.map(({itemId, from}) => ({itemId, from}));

        return {deferred: false, reason: null, plan, surplus, errors: []}
    }

    /**
     * @summary Applies a restore plan sequentially through the executor, fail-closed.
     *
     * Each descriptor runs through {@link Neo.dashboard.Operations.applyOperation}; the first error stops
     * application and returns the document as of the last successful step (partial application is visible,
     * never silent). An empty plan (incl. a deferred plan) is a clean no-op.
     * @param {Object} document The document to apply the plan onto (the live/current document).
     * @param {Object[]} plan   The ordered operation descriptors from {@link #planRestore}.
     * @returns {{applied: Number, plan: Object[], errors: String[], document: Object}}
     * @static
     */
    static applyRestorePlan(document, plan = []) {
        let doc     = document,
            applied = 0;

        for (const descriptor of plan) {
            let result = Operations.applyOperation(doc, descriptor);

            if (result.errors?.length) {
                return {applied, plan, errors: result.errors, document: doc}
            }

            doc = result.document;
            applied++
        }

        return {applied, plan, errors: [], document: doc}
    }

    /**
     * @summary Convenience: plan + apply in one call.
     * @param {Object} current
     * @param {Object} captured
     * @returns {{deferred: Boolean, reason: (String|null), applied: Number, plan: Object[], surplus: Object[], errors: String[], document: Object}}
     * @static
     */
    static restoreToward(current, captured) {
        let {deferred, reason, plan, surplus, errors} = RestorePlanner.planRestore(current, captured);

        if (deferred || errors.length) {
            return {deferred, reason, applied: 0, plan, surplus, errors, document: current}
        }

        let {applied, errors: applyErrors, document} = RestorePlanner.applyRestorePlan(current, plan);

        return {deferred: false, reason: null, applied, plan, surplus, errors: applyErrors, document}
    }
}

export default Neo.setupClass(RestorePlanner);
