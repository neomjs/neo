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
     * Not every reported change becomes a step: `edgeResizes` is filtered to what the executor accepts,
     * so a zone the app has since made non-resizable is reported by the differ and skipped here rather
     * than planned into a step that would fail the whole application.
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

        diff.resizes.forEach(({nodeId, toSizes}) =>
            plan.push({operation: 'resizeSplit', splitNodeId: nodeId, sizes: [...toSizes]}));

        // Only the steps the executor will accept. `Operations.resizeEdgeZone` has four refusals;
        // the shape gate upstream already rejects one of them (an unresolvable descriptor fails
        // `computeShapeFingerprint`, so no plan is built at all), and the three below are this
        // filter's scope: a non-edge `center`, a descriptor that is not exactly `resizable`, and an
        // `extent` outside the open interval `(0, 1)`. The permission and the edge are read off the
        // LIVE document because that is the descriptor the executor validates — reading the
        // capture's would emit a step the executor then rejects, and suppress one it would accept.
        //
        // Missing ANY of the three is not "the rail does not move". `applyRestorePlan` is
        // fail-closed on the first error, so one unusable step strands every later one — a valid
        // auto-hide flip queued behind an illegal rail simply never runs. The `(0, 1)` clause
        // matters because nothing in the persistence tier calls `WorkspaceDocument.validate`: a
        // capture is trusted on shape and never on contract, so a contract-illegal value from
        // another writer (hand-authored, an older schema, edited storage) reaches here intact.
        //
        // This predicate deliberately mirrors the executor's rather than sharing it. Keeping the
        // planner a PURE fold — no executor round-trip to decide what to plan — is worth the
        // duplication, but the duplication is real and unlinked: a fifth refusal added to
        // `Operations.resizeEdgeZone` will not surface here, and the arms in
        // `DockRestorePlanner.spec.mjs` are what would catch it.
        diff.edgeResizes.forEach(({nodeId, edge, to}) => {
            if (edge !== 'center' && to > 0 && to < 1 &&
                current.nodes?.[nodeId]?.zones?.[edge]?.resizable === true
            ) {
                plan.push({operation: 'resizeEdgeZone', edgeZoneId: nodeId, edge, extent: to})
            }
        });

        diff.autoHideFlips.forEach(({itemId, to}) =>
            plan.push({operation: 'setItemAutoHidden', itemId, autoHidden: to}));

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
