import DockRestorePlanner from './DockRestorePlanner.mjs';
import DockZoneModel      from './DockZoneModel.mjs';

/**
 * @summary Changed-topology perspective restore: maps captured workspace slots onto live windows
 * by shape affinity (never ids), composes the landed per-window restore, and reports everything
 * it cannot cover — nothing silently drops, in either direction.
 *
 * The same-topology planner deliberately DEFERS on a shape-fingerprint mismatch ("the
 * cross-topology leaf owns that path") — this module is that leaf. Reconciliation semantics:
 *
 * - **Validate everything before mutating anything.** Any invalid captured slot or live document
 *   fails the ENTIRE restore closed: no document changes, every captured item reported
 *   `unrestored` with reason `validation-failed`, errors surfaced. There is no partial restore
 *   across the validation boundary.
 * - **Slot mapping is deterministic and id-free.** Affinity = Jaccard overlap of the two
 *   documents' item catalogs (`dockItemId` sets), tie-broken by structural similarity (node-type
 *   multiset overlap), then by stable live-document order; captured slots map greedily in
 *   captured order. Zero-overlap slots never map (`unmapped-slot`); slots beyond the live window
 *   supply stay uncovered (`no-live-window`).
 * - **Per-window restore composes, never duplicates.** A mapped pair with an IDENTICAL shape
 *   fingerprint restores incrementally through `DockRestorePlanner.restoreToward()` (no-flicker
 *   semantic operations). A mapped pair with a DIFFERENT shape adopts the captured document
 *   wholesale — and every live item absent from the adopted document is reported in `displaced`
 *   (documents never destroy pane instances; the workspace decides what to do with displaced
 *   content, e.g. fallback placement).
 * - **No window creation.** A restore MUST NOT depend on popup permission: this module exposes no
 *   spawning path whatsoever; excess live windows keep their documents untouched.
 *
 * Conservation invariant (spec-pinned): every captured item id appears in exactly one of
 * `restored` or `unrestored`.
 *
 * @class Neo.dashboard.DockTopologyReconciler
 * @extends Neo.core.Base
 * @see Neo.dashboard.DockRestorePlanner
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockTopologyReconciler {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockTopologyReconciler'
         * @protected
         */
        className: 'Neo.dashboard.DockTopologyReconciler'
    }

    /**
     * Reason class: the captured slot could not map because every live window is already taken.
     * @member {String} REASON_NO_LIVE_WINDOW='no-live-window'
     * @static
     */
    static REASON_NO_LIVE_WINDOW = 'no-live-window'
    /**
     * Reason class: the captured slot shares no item overlap with any remaining live window.
     * @member {String} REASON_UNMAPPED_SLOT='unmapped-slot'
     * @static
     */
    static REASON_UNMAPPED_SLOT = 'unmapped-slot'
    /**
     * Reason class: validation failed somewhere — the whole restore fails closed.
     * @member {String} REASON_VALIDATION_FAILED='validation-failed'
     * @static
     */
    static REASON_VALIDATION_FAILED = 'validation-failed'

    /**
     * Extracts the captured workspace-slot documents from a topology-scope saved layout:
     * slot 0 is the wrapper's `dockZone`, slots 1..N are `windowDocuments`.
     * @param {Object} savedLayout
     * @returns {Object[]}
     * @static
     */
    static capturedSlots(savedLayout) {
        return [savedLayout?.dockZone, ...(savedLayout?.windowDocuments || [])].filter(Boolean)
    }

    /**
     * Id-free affinity between a captured slot and a live document.
     * Primary: Jaccard overlap of item-id catalogs. Secondary (tie-breaker only): node-type
     * multiset overlap fraction. Never reads node ids or window identifiers.
     * @param {Object} captured
     * @param {Object} live
     * @returns {{jaccard: Number, structural: Number}}
     * @static
     */
    static slotAffinity(captured, live) {
        let capturedIds = Object.keys(captured?.items || {}),
            liveIds     = new Set(Object.keys(live?.items || {})),
            overlap     = capturedIds.filter(id => liveIds.has(id)).length,
            union       = capturedIds.length + liveIds.size - overlap;

        return {
            jaccard   : union === 0 ? 0 : overlap / union,
            structural: this.structuralAffinity(captured, live)
        }
    }

    /**
     * Node-type multiset overlap fraction — the structural tie-breaker.
     * @param {Object} captured
     * @param {Object} live
     * @returns {Number}
     * @static
     */
    static structuralAffinity(captured, live) {
        const counts = document => {
            let map = {};
            Object.values(document?.nodes || {}).forEach(node => {
                map[node.type] = (map[node.type] || 0) + 1
            });
            return map
        };

        let a     = counts(captured),
            b     = counts(live),
            types = new Set([...Object.keys(a), ...Object.keys(b)]),
            inter = 0,
            union = 0;

        types.forEach(type => {
            inter += Math.min(a[type] || 0, b[type] || 0);
            union += Math.max(a[type] || 0, b[type] || 0)
        });

        return union === 0 ? 0 : inter / union
    }

    /**
     * Deterministic greedy slot mapping: captured slots claim live documents in captured order;
     * each takes the highest-affinity remaining live document (jaccard desc → structural desc →
     * live index asc). A slot maps only when its Jaccard overlap is > 0.
     * @param {Object[]} capturedDocs
     * @param {Object[]} liveDocs
     * @returns {{mapping: Object[], unmapped: Object[], unmatchedLive: Number[]}}
     *          `mapping`: `[{capturedIndex, liveIndex, affinity}]` · `unmapped`:
     *          `[{capturedIndex, reason}]` · `unmatchedLive`: live indices left untouched.
     * @static
     */
    static mapWorkspaceSlots(capturedDocs, liveDocs) {
        let remaining = liveDocs.map((doc, index) => ({doc, index})),
            mapping   = [],
            unmapped  = [];

        capturedDocs.forEach((captured, capturedIndex) => {
            if (!remaining.length) {
                unmapped.push({capturedIndex, reason: this.REASON_NO_LIVE_WINDOW});
                return
            }

            let best = null;

            remaining.forEach(candidate => {
                let affinity = this.slotAffinity(captured, candidate.doc);

                if (affinity.jaccard <= 0) {
                    return
                }

                if (!best
                    || affinity.jaccard   > best.affinity.jaccard
                    || (affinity.jaccard   === best.affinity.jaccard && affinity.structural > best.affinity.structural)
                    || (affinity.jaccard   === best.affinity.jaccard && affinity.structural === best.affinity.structural && candidate.index < best.liveIndex)
                ) {
                    best = {affinity, liveIndex: candidate.index}
                }
            });

            if (best) {
                mapping.push({capturedIndex, liveIndex: best.liveIndex, affinity: best.affinity});
                remaining = remaining.filter(candidate => candidate.index !== best.liveIndex)
            } else {
                unmapped.push({capturedIndex, reason: this.REASON_UNMAPPED_SLOT})
            }
        });

        return {mapping, unmapped, unmatchedLive: remaining.map(candidate => candidate.index)}
    }

    /**
     * Reconciles a topology-scope perspective onto a changed live topology.
     *
     * Fail-closed validation boundary first; then deterministic slot mapping; then per-window
     * restore (incremental via the landed planner on shape match, wholesale adoption on
     * mismatch); uncovered captured content returns reason-classed. Live documents are NEVER
     * mutated in place — the result carries next-documents per live index.
     * @param {Object} savedLayout   Topology-scope saved layout (`dockZone` + `windowDocuments`).
     * @param {Object[]} liveDocuments Live per-window committed documents, in window order.
     * @returns {{
     *     applied: Object[],
     *     displaced: Object[],
     *     documents: Object[],
     *     errors: String[],
     *     mapping: Object[],
     *     restored: String[],
     *     unmatchedLive: Number[],
     *     unrestored: Object[]
     * }} `documents` mirrors `liveDocuments` (adopted/advanced or untouched); `restored` =
     *     covered captured item ids; `unrestored` = `[{itemId, reason, capturedIndex}]`;
     *     `displaced` = `[{itemId, liveIndex}]` live items absent from an adopted document;
     *     `applied` = per-mapping restore results (`{capturedIndex, liveIndex, mode, applied}`).
     * @static
     */
    static reconcile(savedLayout, liveDocuments = []) {
        let slots  = this.capturedSlots(savedLayout),
            errors = [];

        // §validation boundary: everything valid before anything mutates — no partial restore.
        slots.forEach((doc, index) => {
            DockZoneModel.validate(doc).forEach(error => errors.push(`captured slot ${index}: ${error}`))
        });
        liveDocuments.forEach((doc, index) => {
            DockZoneModel.validate(doc).forEach(error => errors.push(`live document ${index}: ${error}`))
        });

        if (!slots.length) {
            errors.push('savedLayout carries no captured workspace documents')
        }

        if (errors.length) {
            return {
                applied      : [],
                displaced    : [],
                documents    : liveDocuments,
                errors,
                mapping      : [],
                restored     : [],
                unmatchedLive: liveDocuments.map((doc, index) => index),
                unrestored   : slots.flatMap((doc, capturedIndex) =>
                    Object.keys(doc?.items || {}).map(itemId =>
                        ({capturedIndex, itemId, reason: this.REASON_VALIDATION_FAILED})))
            }
        }

        let {mapping, unmapped, unmatchedLive} = this.mapWorkspaceSlots(slots, liveDocuments),
            documents                          = [...liveDocuments],
            applied                            = [],
            displaced                          = [],
            restored                           = [],
            unrestored                         = [];

        mapping.forEach(({capturedIndex, liveIndex, affinity}) => {
            let captured = slots[capturedIndex],
                live     = documents[liveIndex],
                result   = DockRestorePlanner.restoreToward(live, captured);

            if (result.deferred) {
                // Shape mismatch: the captured document is adopted wholesale (the wrapper-restore
                // semantics); live-only items are DISPLACED — reported, never silently dropped.
                let capturedIds = new Set(Object.keys(captured.items || {}));

                Object.keys(live.items || {}).forEach(itemId => {
                    capturedIds.has(itemId) || displaced.push({itemId, liveIndex})
                });

                documents[liveIndex] = DockZoneModel.clone(captured);
                applied.push({capturedIndex, liveIndex, affinity, applied: 0, mode: 'adopt'});
                restored.push(...Object.keys(captured.items || {}))
            } else if (result.errors.length) {
                // Per-window executor failure: that window stays as-is; its slot reports closed.
                errors.push(`slot ${capturedIndex} -> live ${liveIndex}: ${result.errors[0]}`);
                Object.keys(captured.items || {}).forEach(itemId =>
                    unrestored.push({capturedIndex, itemId, reason: this.REASON_VALIDATION_FAILED}))
            } else {
                documents[liveIndex] = result.document;
                applied.push({capturedIndex, liveIndex, affinity, applied: result.applied, mode: 'incremental'});
                restored.push(...Object.keys(captured.items || {}))
            }
        });

        unmapped.forEach(({capturedIndex, reason}) => {
            Object.keys(slots[capturedIndex].items || {}).forEach(itemId =>
                unrestored.push({capturedIndex, itemId, reason}))
        });

        return {applied, displaced, documents, errors, mapping, restored, unmatchedLive, unrestored}
    }
}

export default Neo.setupClass(DockTopologyReconciler);
