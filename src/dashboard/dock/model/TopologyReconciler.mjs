import Base           from '../../../core/Base.mjs';
import RestorePlanner from '../persistence/RestorePlanner.mjs';
import Document       from './Document.mjs';
import Persistence    from './Persistence.mjs';

/**
 * @summary Reduces an exact assignment-score fraction to its canonical form.
 *
 * The assignment solver keeps overlap evidence as integer ratios. This avoids scalar
 * weights and floating-point epsilons changing the ordered objective at dense scale.
 * @param {BigInt|Number} numerator
 * @param {BigInt|Number} [denominator=1]
 * @returns {{denominator: BigInt, numerator: BigInt}}
 * @private
 */
function createFraction(numerator, denominator=1) {
    numerator   = BigInt(numerator);
    denominator = BigInt(denominator);

    if (denominator === 0n) {
        throw new Error('Dock topology assignment fraction denominator must be non-zero')
    }

    if (denominator < 0n) {
        numerator   = -numerator;
        denominator = -denominator
    }

    let a = numerator < 0n ? -numerator : numerator,
        b = denominator;

    while (b !== 0n) {
        [a, b] = [b, a % b]
    }

    let divisor = a || 1n;

    return {denominator: denominator / divisor, numerator: numerator / divisor}
}

/**
 * @summary Adds two exact assignment-score fractions.
 * @param {{denominator: BigInt, numerator: BigInt}} a
 * @param {{denominator: BigInt, numerator: BigInt}} b
 * @returns {{denominator: BigInt, numerator: BigInt}}
 * @private
 */
function addFractions(a, b) {
    return createFraction(
        a.numerator * b.denominator + b.numerator * a.denominator,
        a.denominator * b.denominator
    )
}

/**
 * @summary Compares two exact assignment-score fractions.
 * @param {{denominator: BigInt, numerator: BigInt}} a
 * @param {{denominator: BigInt, numerator: BigInt}} b
 * @returns {Number} `-1`, `0`, or `1`
 * @private
 */
function compareFractions(a, b) {
    let delta = a.numerator * b.denominator - b.numerator * a.denominator;

    return delta < 0n ? -1 : delta > 0n ? 1 : 0
}

/**
 * @summary Creates the additive identity for one lexicographic assignment path.
 * @param {Number} coordinateCount Captured-slot count
 * @returns {Object}
 * @private
 */
function createZeroCost(coordinateCount) {
    return {
        jaccard   : createFraction(0),
        structural: createFraction(0),
        signature : Array(coordinateCount).fill(0n),
        sequence  : Array(coordinateCount).fill(0n)
    }
}

/**
 * @summary Adds two lexicographic assignment-path costs.
 * @param {Object} a
 * @param {Object} b
 * @returns {Object}
 * @private
 */
function addCosts(a, b) {
    return {
        jaccard   : addFractions(a.jaccard, b.jaccard),
        structural: addFractions(a.structural, b.structural),
        signature : a.signature.map((value, index) => value + b.signature[index]),
        sequence  : a.sequence.map((value, index) => value + b.sequence[index])
    }
}

/**
 * @summary Negates a lexicographic path cost for a residual reverse edge.
 * @param {Object} cost
 * @returns {Object}
 * @private
 */
function negateCost(cost) {
    return {
        jaccard   : {denominator: cost.jaccard.denominator, numerator: -cost.jaccard.numerator},
        structural: {denominator: cost.structural.denominator, numerator: -cost.structural.numerator},
        signature : cost.signature.map(value => -value),
        sequence  : cost.sequence.map(value => -value)
    }
}

/**
 * @summary Compares assignment costs in the contract's exact ordered objective.
 *
 * Costs are minimized, so affinity fractions enter negated. Content-signature and
 * live-index coordinates remain ascending, one coordinate per captured slot.
 * @param {Object} a
 * @param {Object} b
 * @returns {Number} `-1`, `0`, or `1`
 * @private
 */
function compareCosts(a, b) {
    let result = compareFractions(a.jaccard, b.jaccard)
              || compareFractions(a.structural, b.structural);

    if (result) return result;

    for (let index = 0; index < a.signature.length; index++) {
        if (a.signature[index] !== b.signature[index]) {
            return a.signature[index] < b.signature[index] ? -1 : 1
        }
    }

    for (let index = 0; index < a.sequence.length; index++) {
        if (a.sequence[index] !== b.sequence[index]) {
            return a.sequence[index] < b.sequence[index] ? -1 : 1
        }
    }

    return 0
}

/**
 * @summary Adds one unit-capacity edge and its exact inverse to a residual graph.
 * @param {Object[][]} graph
 * @param {Number} from
 * @param {Number} to
 * @param {Object} cost
 * @param {Object|null} [pair=null] Assignment metadata for captured-to-live edges
 * @returns {Object} The forward edge
 * @private
 */
function addResidualEdge(graph, from, to, cost, pair=null) {
    let forward = {capacity: 1, cost, pair, reverseIndex: graph[to].length, to},
        reverse = {capacity: 0, cost: negateCost(cost), pair: null, reverseIndex: graph[from].length, to: from};

    graph[from].push(forward);
    graph[to].push(reverse);

    return forward
}

/**
 * @summary Finds the cheapest residual augmenting path under the ordered objective.
 *
 * Bellman-Ford is intentional: reverse edges are negative and let later flow units repair
 * earlier pairings. The residual invariant therefore yields a globally optimal matching at
 * every attained cardinality, while avoiding any unsafe scalarization.
 * @param {Object[][]} graph
 * @param {Number} source
 * @param {Number} coordinateCount
 * @returns {Object[]} Predecessor edge per graph node
 * @private
 */
function findShortestResidualPath(graph, source, coordinateCount) {
    let distance = Array(graph.length).fill(null),
        previous = Array(graph.length).fill(null);

    distance[source] = createZeroCost(coordinateCount);

    for (let pass = 0; pass < graph.length - 1; pass++) {
        let changed = false;

        graph.forEach((edges, from) => {
            if (!distance[from]) return;

            edges.forEach((edge, edgeIndex) => {
                if (edge.capacity === 0) return;

                let candidate = addCosts(distance[from], edge.cost);

                if (!distance[edge.to] || compareCosts(candidate, distance[edge.to]) < 0) {
                    distance[edge.to] = candidate;
                    previous[edge.to] = {edgeIndex, from};
                    changed           = true
                }
            })
        });

        if (!changed) break
    }

    return previous
}

/**
 * @summary Computes numeric affinity plus exact ratios from the same integer evidence.
 * @param {Object} captured
 * @param {Object} live
 * @returns {{affinity: Object, jaccardFraction: Object, structuralFraction: Object}}
 * @private
 */
function createAffinityDetails(captured, live) {
    const typeCounts = document => {
        let counts = {};

        Object.values(document?.nodes || {}).forEach(node => {
            counts[node.type] = (counts[node.type] || 0) + 1
        });

        return counts
    };

    let capturedIds     = Object.keys(captured?.items || {}),
        liveIds         = new Set(Object.keys(live?.items || {})),
        overlap         = capturedIds.filter(id => liveIds.has(id)).length,
        itemUnion       = capturedIds.length + liveIds.size - overlap,
        capturedTypes   = typeCounts(captured),
        liveTypes       = typeCounts(live),
        types           = new Set([...Object.keys(capturedTypes), ...Object.keys(liveTypes)]),
        structuralInter = 0,
        structuralUnion = 0;

    types.forEach(type => {
        structuralInter += Math.min(capturedTypes[type] || 0, liveTypes[type] || 0);
        structuralUnion += Math.max(capturedTypes[type] || 0, liveTypes[type] || 0)
    });

    let jaccardFraction    = createFraction(overlap, itemUnion || 1),
        structuralFraction = createFraction(structuralInter, structuralUnion || 1);

    return {
        affinity: {
            jaccard   : Number(jaccardFraction.numerator) / Number(jaccardFraction.denominator),
            structural: Number(structuralFraction.numerator) / Number(structuralFraction.denominator)
        },
        jaccardFraction,
        structuralFraction
    }
}

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
 *   `Persistence.restoreSavedLayout()` (schema, `captureScope` ↔ `windowDocuments` coupling,
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
 * @class Neo.dashboard.dock.model.TopologyReconciler
 * @extends Neo.core.Base
 * @see Neo.dashboard.dock.persistence.RestorePlanner
 * @see Neo.dashboard.dock.model.Document
 * @see learn/agentos/DockZoneModel.md
 */
class TopologyReconciler extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.TopologyReconciler'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.TopologyReconciler'
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
        return createAffinityDetails(captured, live).affinity
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
        return createAffinityDetails(captured, live).affinity.structural
    }

    /**
     * Optimal deterministic slot assignment via exact lexicographic min-cost max-flow. Every
     * positive-Jaccard pair becomes a unit-capacity captured→live edge. Successive shortest
     * residual paths maximize cardinality, then minimize the additive cost vector
     * `(-Σjaccard, -Σstructural, contentSignature, liveIndexSequence)`. Affinity components are
     * reduced `BigInt` fractions; content and live-index tie coordinates use an explicit
     * unassigned sentinel per captured row. This preserves content-permutation stability and
     * makes the final content-identical tie numeric (`2 < 10`) instead of stringifying indices.
     *
     * With `C` captured slots, `L` live windows, `P ≤ C·L` viable pairs, `V=C+L+2`, and
     * `F≤min(C,L)` assignments, Bellman-Ford successive-shortest-path runs in
     * `O(F·V·(C+L+P)·C)` ordered-coordinate work (plus polynomial exact-integer arithmetic).
     * Production never falls back to exhaustive traversal. Greedy captured-order matching is
     * explicitly NOT used — it can strand a slot whose only viable window was consumed by an
     * earlier slot's marginally better match (the greedy trap; spec-pinned).
     * @param {Object[]} capturedDocs
     * @param {Object[]} liveDocs
     * @returns {{mapping: Object[], unmapped: Object[], unmatchedLive: Number[]}}
     *          `mapping`: `[{capturedIndex, liveIndex, affinity}]` in captured order · `unmapped`:
     *          `[{capturedIndex, reason}]` · `unmatchedLive`: untouched live indices.
     * @static
     */
    static assignSlots(capturedDocs, liveDocs) {
        let matrix       = capturedDocs.map(captured => liveDocs.map(live => createAffinityDetails(captured, live))),
            contentKeys  = liveDocs.map(live => this.liveContentKey(live)),
            orderedKeys  = [...new Set(contentKeys)].sort(),
            contentRanks = new Map(orderedKeys.map((key, index) => [key, index])),
            capturedBase = 1,
            liveBase     = capturedBase + capturedDocs.length,
            source       = 0,
            sink         = liveBase + liveDocs.length,
            graph        = Array.from({length: sink + 1}, () => []),
            pairEdges    = [];

        capturedDocs.forEach((captured, capturedIndex) => {
            addResidualEdge(graph, source, capturedBase + capturedIndex, createZeroCost(capturedDocs.length));

            matrix[capturedIndex].forEach((details, liveIndex) => {
                if (details.jaccardFraction.numerator === 0n) return;

                let cost            = createZeroCost(capturedDocs.length),
                    contentSentinel = orderedKeys.length,
                    liveSentinel    = liveDocs.length;

                cost.jaccard = {
                    denominator: details.jaccardFraction.denominator,
                    numerator  : -details.jaccardFraction.numerator
                };
                cost.structural = {
                    denominator: details.structuralFraction.denominator,
                    numerator  : -details.structuralFraction.numerator
                };
                cost.signature[capturedIndex] = BigInt(contentRanks.get(contentKeys[liveIndex]) - contentSentinel);
                cost.sequence[capturedIndex]  = BigInt(liveIndex - liveSentinel);

                let pair = {affinity: details.affinity, capturedIndex, liveIndex};

                pairEdges.push(addResidualEdge(
                    graph,
                    capturedBase + capturedIndex,
                    liveBase + liveIndex,
                    cost,
                    pair
                ))
            })
        });

        liveDocs.forEach((live, liveIndex) => {
            addResidualEdge(graph, liveBase + liveIndex, sink, createZeroCost(capturedDocs.length))
        });

        // Each successful augmentation raises cardinality by one. Reverse edges let the path
        // re-route previous pairs, so stopping only when the sink is unreachable yields maximum
        // cardinality and the exact minimum ordered cost at that cardinality.
        while (true) {
            let previous = findShortestResidualPath(graph, source, capturedDocs.length);

            if (!previous[sink]) break;

            for (let node = sink; node !== source;) {
                let {edgeIndex, from} = previous[node],
                    edge              = graph[from][edgeIndex];

                edge.capacity = 0;
                graph[node][edge.reverseIndex].capacity = 1;
                node = from
            }
        }

        let pairs = pairEdges.filter(edge => edge.capacity === 0).map(edge => edge.pair)
                .sort((a, b) => a.capturedIndex - b.capturedIndex),
            assigned = new Set(pairs.map(pair => pair.capturedIndex)),
            usedLive = new Set(pairs.map(pair => pair.liveIndex)),
            unmapped = [];

        capturedDocs.forEach((doc, capturedIndex) => {
            if (!assigned.has(capturedIndex)) {
                // Cardinality-first optimality guarantees: a slot with positive affinity to a
                // STILL-FREE window would have been assigned — so an unassigned slot either had
                // zero affinity everywhere, or every viable window went to a better match.
                let hadAffinity = matrix[capturedIndex].some(details => details.jaccardFraction.numerator > 0n);

                unmapped.push({
                    capturedIndex,
                    reason: hadAffinity ? this.REASON_NO_LIVE_WINDOW : this.REASON_UNMAPPED_SLOT
                })
            }
        });

        return {
            mapping      : pairs,
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
        let envelope = Persistence.restoreSavedLayout(savedLayout ?? {});

        errors.push(...envelope.errors);

        liveDocuments.forEach((doc, index) => {
            Document.validate(doc).forEach(error => errors.push(`live document ${index}: ${error}`))
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
                result      = RestorePlanner.restoreToward(live, captured),
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

                documents[liveIndex] = Document.clone(captured);
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

export default Neo.setupClass(TopologyReconciler);
