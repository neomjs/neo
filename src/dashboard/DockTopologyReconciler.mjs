import Base               from '../core/Base.mjs';
import DockRestorePlanner from './DockRestorePlanner.mjs';
import DockZoneModel      from './DockZoneModel.mjs';

/**
 * @summary Changed-topology perspective restore: assigns captured workspace slots onto live
 * windows by id-free shape affinity (optimal assignment, never greedy order), composes the landed
 * per-window restore, and reports everything it cannot cover — nothing silently drops, in either
 * direction, and no item ever duplicates across the output documents.
 *
 * The same-topology planner deliberately DEFERS on a shape-fingerprint mismatch ("the
 * cross-topology leaf owns that path") — this module is that leaf. Reconciliation semantics:
 *
 * - **Envelope authority first.** The saved-layout envelope validates through the landed
 *   `DockZoneModel.restoreSavedLayout()` (schema, `captureScope` ↔ `windowDocuments` coupling,
 *   slot-indexed document validation with the finite durable-field boundary applied to EVERY
 *   slot, primary presence) plus slot-indexed live-document validation and live cross-window
 *   item disjointness. Validation is total: a malformed envelope (e.g. a non-array
 *   `windowDocuments`) fails the ENTIRE restore closed without throwing — no document changes,
 *   every captured item reported `unrestored` with reason `validation-failed`, original
 *   captured indices preserved.
 * - **Assignment is optimal and deterministic.** Maximum cardinality first, then maximum summed
 *   Jaccard affinity (item-catalog overlap), then maximum summed structural affinity (node-type
 *   multiset overlap), then the lexicographically smallest CONTENT signature — each pair keyed by
 *   the live window's sorted item catalog + node-type multiset, so equal-affinity candidates with
 *   DIFFERENT content resolve to the same content regardless of live array order (permutation-
 *   stable). Only fully content-identical candidates fall through to live index order, where the
 *   pick is content-irrelevant by construction. Pairs require Jaccard > 0. Never reads node ids
 *   or window identifiers.
 * - **Per-window restore branches on the planner's OWN verdict.** Clean plan → incremental
 *   semantic operations. Deferred with reason `topology-fingerprint-mismatch` (the one deferral
 *   this leaf owns) → wholesale adoption of the captured document, with every live-only item
 *   reported in `displaced`. Any OTHER deferral reason passes through verbatim into `unrestored`
 *   (the owning leaf for that reason is not this one); executor failures report `apply-error` —
 *   never mislabeled as validation.
 * - **Workspace-global item uniqueness — over the COMPLETE final output.** Live documents must
 *   enter with pairwise-disjoint item catalogs (a cross-window duplicate is a validation
 *   failure). Every final document participates — placements, deferred slots' untouched live
 *   documents, and unmatched pass-through documents. A contested id resolves by LIVE
 *   OWNERSHIP: the window already holding it live keeps it whenever its final catalog retains
 *   it, and a placement importing that id elsewhere demotes to `duplicate-item` (its live
 *   window stays reference-identical). An owner that drops the id disclaims it; the earliest
 *   captured slot among importing placements wins. Demotions re-enter the check (fixpoint),
 *   so the emitted workspace never contains a duplicate id. Conservation is global: every
 *   captured item id lands in exactly one of `restored` or `unrestored`.
 * - **No window creation.** A restore MUST NOT depend on popup permission: this module exposes
 *   no spawning path whatsoever; unmatched live windows keep reference-identical documents.
 *
 * @class Neo.dashboard.DockTopologyReconciler
 * @extends Neo.core.Base
 * @see Neo.dashboard.DockRestorePlanner
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockTopologyReconciler extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockTopologyReconciler'
         * @protected
         */
        className: 'Neo.dashboard.DockTopologyReconciler'
    }

    /**
     * Reason class: the per-window executor failed while applying an incremental plan.
     * @member {String} REASON_APPLY_ERROR='apply-error'
     * @static
     */
    static REASON_APPLY_ERROR = 'apply-error'
    /**
     * Reason class: placing this slot would duplicate an item id already restored into another
     * output document (workspace-global uniqueness).
     * @member {String} REASON_DUPLICATE_ITEM='duplicate-item'
     * @static
     */
    static REASON_DUPLICATE_ITEM = 'duplicate-item'
    /**
     * Reason class: the captured slot had positive affinity somewhere, but every such window was
     * assigned to a better-matching slot — the topology shrank underneath it.
     * @member {String} REASON_NO_LIVE_WINDOW='no-live-window'
     * @static
     */
    static REASON_NO_LIVE_WINDOW = 'no-live-window'
    /**
     * Reason class: the captured slot shares no item overlap with ANY live window.
     * @member {String} REASON_UNMAPPED_SLOT='unmapped-slot'
     * @static
     */
    static REASON_UNMAPPED_SLOT = 'unmapped-slot'
    /**
     * Reason class: the envelope or a document failed validation — the whole restore fails closed.
     * @member {String} REASON_VALIDATION_FAILED='validation-failed'
     * @static
     */
    static REASON_VALIDATION_FAILED = 'validation-failed'

    /**
     * Extracts the captured workspace-slot documents from a topology-scope saved layout:
     * slot 0 is the wrapper's `dockZone`, slots 1..N are `windowDocuments`. Total and
     * index-preserving: a non-array `windowDocuments` contributes nothing (never spread —
     * never throws), and invalid/null slots stay IN PLACE so every downstream report carries
     * the ORIGINAL captured index (validation, not compaction, owns rejecting them).
     * @param {Object} savedLayout
     * @returns {Object[]}
     * @static
     */
    static capturedSlots(savedLayout) {
        let extra = savedLayout?.windowDocuments;

        return [savedLayout?.dockZone ?? null, ...(Array.isArray(extra) ? extra : [])]
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
     * Canonical content key of a live document: sorted item catalog + sorted node-type multiset.
     * Two documents share a key iff they are content-interchangeable at affinity altitude —
     * the assignment tie rule compares candidates by THIS key, never by live array position,
     * so equal-affinity ties resolve permutation-stably (same content wins under any live order).
     * @param {Object} live
     * @returns {String}
     * @static
     */
    static liveContentKey(live) {
        let items = Object.keys(live?.items || {}).sort().join(','),
            types = Object.values(live?.nodes || {}).map(node => node.type).sort().join(',');

        return `${items}#${types}`
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
     * Optimal deterministic slot assignment: exhaustive search over the (small — window-count-
     * bounded) pairing space, maximizing `(cardinality, Σ jaccard, Σ structural)`, then the
     * lexicographically smallest CONTENT signature (`capturedIndex>liveContentKey` per pair) —
     * permutation-stable: equal-affinity candidates with different content resolve to the SAME
     * content under any live array order. Only fully content-identical candidates fall through
     * to the smallest live-index sequence, where the pick is content-irrelevant by construction.
     * A pair requires Jaccard > 0. Greedy captured-order matching is explicitly NOT used — it
     * can strand a slot whose only viable window was consumed by an earlier slot's marginally
     * better match (the greedy trap; spec-pinned).
     * @param {Object[]} capturedDocs
     * @param {Object[]} liveDocs
     * @returns {{mapping: Object[], unmapped: Object[], unmatchedLive: Number[]}}
     *          `mapping`: `[{capturedIndex, liveIndex, affinity}]` in captured order · `unmapped`:
     *          `[{capturedIndex, reason}]` · `unmatchedLive`: untouched live indices.
     * @static
     */
    static assignSlots(capturedDocs, liveDocs) {
        let matrix      = capturedDocs.map(captured => liveDocs.map(live => this.slotAffinity(captured, live))),
            contentKeys = liveDocs.map(live => this.liveContentKey(live)),
            best        = null;

        const consider = (slotIndex, used, pairs, cardinality, jaccardSum, structuralSum) => {
            if (slotIndex === capturedDocs.length) {
                // Content first (permutation-stable), live-index sequence last (only reachable
                // between fully content-identical candidates, where the pick is content-free).
                let signature = pairs.map(pair => `${pair.capturedIndex}>${contentKeys[pair.liveIndex]}`).join('|'),
                    sequence  = pairs.map(pair => pair.liveIndex).join(',');

                if (!best
                    || cardinality > best.cardinality
                    || (cardinality === best.cardinality && jaccardSum > best.jaccardSum)
                    || (cardinality === best.cardinality && jaccardSum === best.jaccardSum && structuralSum > best.structuralSum)
                    || (cardinality === best.cardinality && jaccardSum === best.jaccardSum && structuralSum === best.structuralSum && signature < best.signature)
                    || (cardinality === best.cardinality && jaccardSum === best.jaccardSum && structuralSum === best.structuralSum && signature === best.signature && sequence < best.sequence)
                ) {
                    best = {cardinality, jaccardSum, pairs: [...pairs], sequence, signature, structuralSum}
                }
                return
            }

            // Option A: leave this slot unassigned.
            consider(slotIndex + 1, used, pairs, cardinality, jaccardSum, structuralSum);

            // Option B: pair it with any unused positive-affinity window.
            matrix[slotIndex].forEach((affinity, liveIndex) => {
                if (affinity.jaccard > 0 && !used.has(liveIndex)) {
                    used.add(liveIndex);
                    pairs.push({affinity, capturedIndex: slotIndex, liveIndex});
                    consider(slotIndex + 1, used, pairs, cardinality + 1, jaccardSum + affinity.jaccard, structuralSum + affinity.structural);
                    pairs.pop();
                    used.delete(liveIndex)
                }
            })
        };

        consider(0, new Set(), [], 0, 0, 0);

        let assigned = new Set(best.pairs.map(pair => pair.capturedIndex)),
            usedLive = new Set(best.pairs.map(pair => pair.liveIndex)),
            unmapped = [];

        capturedDocs.forEach((doc, capturedIndex) => {
            if (!assigned.has(capturedIndex)) {
                // Cardinality-first optimality guarantees: a slot with positive affinity to a
                // STILL-FREE window would have been assigned — so an unassigned slot either had
                // zero affinity everywhere, or every viable window went to a better match.
                let hadAffinity = matrix[capturedIndex].some(affinity => affinity.jaccard > 0);

                unmapped.push({
                    capturedIndex,
                    reason: hadAffinity ? this.REASON_NO_LIVE_WINDOW : this.REASON_UNMAPPED_SLOT
                })
            }
        });

        return {
            mapping      : best.pairs.sort((a, b) => a.capturedIndex - b.capturedIndex),
            unmapped,
            unmatchedLive: liveDocs.map((doc, index) => index).filter(index => !usedLive.has(index))
        }
    }

    /**
     * Reconciles a topology-scope perspective onto a changed live topology. See the class
     * summary for the governing semantics; every branch is spec-pinned. Live documents are
     * never mutated in place — `documents` mirrors `liveDocuments` (advanced, adopted, or
     * reference-identical untouched).
     * @param {Object} savedLayout    Topology-scope saved layout (`dockZone` + `windowDocuments`).
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
     * }}
     * @static
     */
    static reconcile(savedLayout, liveDocuments = []) {
        let errors = [];

        // Envelope authority: the landed restore validator owns the wrapper contract — schema,
        // captureScope ↔ windowDocuments coupling, slot-indexed tree validation, primary document.
        // Non-throwing by its own contract.
        let envelope = DockZoneModel.restoreSavedLayout(savedLayout ?? {});

        errors.push(...envelope.errors);

        liveDocuments.forEach((doc, index) => {
            DockZoneModel.validate(doc).forEach(error => errors.push(`live document ${index}: ${error}`))
        });

        // Workspace-global uniqueness is only provable over disjoint live inputs: a duplicate
        // item id ACROSS live windows is corrupt workspace state — fail closed, mutate nothing.
        let liveIdOwner = new Map();

        liveDocuments.forEach((doc, index) => {
            Object.keys(doc?.items || {}).forEach(itemId => {
                if (liveIdOwner.has(itemId)) {
                    errors.push(`live documents ${liveIdOwner.get(itemId)} and ${index} both carry item "${itemId}"`)
                } else {
                    liveIdOwner.set(itemId, index)
                }
            })
        });

        let slots = this.capturedSlots(savedLayout);

        if (!errors.length && !slots.length) {
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

        let {mapping, unmapped, unmatchedLive} = this.assignSlots(slots, liveDocuments),
            documents                          = [...liveDocuments],
            applied                            = [],
            displaced                          = [],
            restored                           = [],
            unrestored                         = [];

        const reportSlot = (capturedIndex, reason) => {
            Object.keys(slots[capturedIndex].items || {}).forEach(itemId =>
                unrestored.push({capturedIndex, itemId, reason}))
        };

        // Phase 1 — pure proposals: run the planner per pair against the ORIGINAL live document
        // (each live index pairs at most once, so no proposal sees another's output). A proposal
        // carries the document catalog it would contribute to the final workspace: the placed
        // catalog for adopt/incremental, the untouched live catalog for pass-through verdicts.
        let proposals = mapping.map(({affinity, capturedIndex, liveIndex}) => {
            let captured    = slots[capturedIndex],
                capturedIds = Object.keys(captured.items || {}),
                live        = liveDocuments[liveIndex],
                result      = DockRestorePlanner.restoreToward(live, captured),
                mode        = (result.deferred && result.reason === 'topology-fingerprint-mismatch') ? 'adopt'
                            : (result.deferred || result.errors.length)                              ? 'stay'
                            : 'incremental';

            return {
                affinity, captured, capturedIds, capturedIndex, live, liveIndex, mode, result,
                finalIds: new Set(mode === 'adopt'        ? capturedIds
                                : mode === 'incremental'  ? Object.keys(result.document.items || {})
                                : Object.keys(live.items  || {}))
            }
        });

        // Phase 2 — workspace-global uniqueness over the COMPLETE final output: unmatched
        // pass-through documents, stay verdicts, and placements all participate. Per contested
        // id, priority follows LIVE OWNERSHIP (unique by the disjointness validation above):
        // the window already holding the id live keeps it whenever its own final catalog
        // retains it — placements IMPORTING that id elsewhere convict (minimal motion, never
        // over-demotes the owner). An owner whose placement drops the id disclaims it; then the
        // earliest-capturedIndex importing placement wins. A convicted slot demotes to
        // `duplicate-item`, its live catalog re-enters the pool, and the check re-runs to
        // fixpoint (monotone: place → stay only, so it terminates).
        let liveOwner        = new Map(),
            proposalByWindow = new Map(proposals.map(proposal => [proposal.liveIndex, proposal])),
            changed          = true;

        liveDocuments.forEach((doc, index) => {
            Object.keys(doc?.items || {}).forEach(itemId => liveOwner.set(itemId, index))
        });

        // The final catalog a live window contributes: its proposal's (placements advance,
        // demoted/stay proposals hold live content) — or its untouched live items when unmatched.
        const windowFinalIds = index => proposalByWindow.get(index)?.finalIds
            ?? new Set(Object.keys(liveDocuments[index].items || {}));

        const convicted = proposal => {
            for (const itemId of proposal.finalIds) {
                let owner = liveOwner.get(itemId);

                // The proposal's own window already owned this id live — retaining it is free.
                if (owner === proposal.liveIndex) continue;

                // The live owner keeps a retained id — this import loses.
                if (owner !== undefined && windowFinalIds(owner).has(itemId)) return true;

                // Owner disclaimed (or the id is purely captured): the earliest captured slot
                // among importing placements wins the id; every later importer convicts.
                for (const other of proposals) {
                    if (other !== proposal && !other.duplicate && other.mode !== 'stay' &&
                        other.capturedIndex < proposal.capturedIndex && other.finalIds.has(itemId)) {
                        return true
                    }
                }
            }
            return false
        };

        while (changed) {
            changed = false;

            proposals.forEach(proposal => {
                if (proposal.mode !== 'stay' && !proposal.duplicate && convicted(proposal)) {
                    proposal.duplicate = true;
                    proposal.finalIds  = new Set(Object.keys(proposal.live.items || {}));
                    changed            = true
                }
            })
        }

        // Phase 3 — commit the surviving proposals; convicted and stay verdicts report.
        proposals.forEach(({affinity, captured, capturedIds, capturedIndex, duplicate, live, liveIndex, mode, result}) => {
            if (duplicate) {
                reportSlot(capturedIndex, this.REASON_DUPLICATE_ITEM);
                return
            }

            if (mode === 'adopt') {
                // The ONE deferral this leaf owns: adopt wholesale; live-only items are DISPLACED.
                let capturedIdSet = new Set(capturedIds);

                Object.keys(live.items || {}).forEach(itemId => {
                    capturedIdSet.has(itemId) || displaced.push({itemId, liveIndex})
                });

                documents[liveIndex] = DockZoneModel.clone(captured);
                applied.push({affinity, applied: 0, capturedIndex, liveIndex, mode: 'adopt'});
                restored.push(...capturedIds)
            } else if (mode === 'stay' && result.deferred) {
                // Every other deferral reason belongs to its own leaf: pass it through verbatim.
                reportSlot(capturedIndex, result.reason)
            } else if (mode === 'stay') {
                errors.push(`slot ${capturedIndex} -> live ${liveIndex}: ${result.errors[0]}`);
                reportSlot(capturedIndex, this.REASON_APPLY_ERROR)
            } else {
                documents[liveIndex] = result.document;
                applied.push({affinity, applied: result.applied, capturedIndex, liveIndex, mode: 'incremental'});
                restored.push(...capturedIds)
            }
        });

        unmapped.forEach(({capturedIndex, reason}) => reportSlot(capturedIndex, reason));

        return {applied, displaced, documents, errors, mapping, restored, unmatchedLive, unrestored}
    }
}

export default Neo.setupClass(DockTopologyReconciler);
