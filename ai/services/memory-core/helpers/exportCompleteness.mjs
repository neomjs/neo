/**
 * @summary The pure three-way verdict over an export's row counts — the gate that stops a collection
 * which GREW during streaming from being destroyed as a partial export.
 *
 * Every backup on this plane aborted for hours with
 * `PARTIAL_COLLECTION_EXPORT: neo-agent-memory exported 32272/32271` — one row MORE than expected.
 * The guard used strict inequality in BOTH directions, so a single live agent writing one memory
 * mid-export manufactured the data-integrity failure it then reported, and the corpus sat unprotected.
 *
 * `expected` is a count snapshot taken BEFORE the streaming pass, and nothing holds the source still
 * across it, so the comparison has three outcomes rather than two:
 *
 * - `exported < expected` — rows the snapshot knew about are MISSING. A genuine loss; the caller aborts.
 * - `exported > expected` — the source GREW. Every snapshotted row was captured plus late arrivals, so
 *   aborting destroys a usable bundle. Complete-or-better, but NOT provably exact (see below).
 * - `exported === expected` — clean.
 *
 * A grown export must not be recorded as a clean capture. Neither export path holds a single-instant
 * read across the whole pass: the vector path walks by offset, where an insert landing in an
 * already-walked page shifts later rows, so a concurrent write can skip one row while duplicating
 * another and still finish high; the graph path reads Nodes and Edges as two separate statements, so
 * the two tables can come from different instants. Both are complete-or-better with a caveat, and the
 * caveat belongs in the receipt.
 *
 * `indeterminate` exists so an unreadable count can never certify a bundle. A missing or non-finite
 * count is not evidence of completeness, and defaulting it to `complete` would let an absent
 * measurement vouch for everything beneath it — the exact shape this module exists to remove.
 * @module ai/services/memory-core/helpers/exportCompleteness
 */

/**
 * @summary The verdicts an export's row counts can carry, stable for reporting and for callers to switch on.
 */
export const EXPORT_COMPLETENESS = Object.freeze({
    complete     : 'complete',
    grew         : 'grew-during-export',
    indeterminate: 'indeterminate',
    partial      : 'partial'
});

/**
 * @summary Classifies one export's row counts into a three-way verdict, refusing on unreadable counts.
 *
 * Pure and I/O-free: the caller owns the policy (abort on `partial` and `indeterminate`, record the
 * advisory on `grew`), because the accuracy caveat differs per export path and belongs in that path's
 * own message.
 *
 * @param {Number} exported Rows actually written by the streaming pass.
 * @param {Number} expected The pre-pass count snapshot.
 * @returns {String} A verdict from {@link EXPORT_COMPLETENESS}.
 */
export function classifyExportCompleteness(exported, expected) {
    if (!Number.isFinite(exported) || !Number.isFinite(expected)) {
        return EXPORT_COMPLETENESS.indeterminate;
    }
    if (exported < expected) {
        return EXPORT_COMPLETENESS.partial;
    }
    if (exported > expected) {
        return EXPORT_COMPLETENESS.grew;
    }

    return EXPORT_COMPLETENESS.complete;
}

/**
 * @summary Stamps the growth advisory onto an export's `stats`, so the bundle's receipt states
 * complete-or-better rather than claiming a clean capture.
 *
 * @param {Object} stats The export statistics object, mutated in place.
 * @returns {Object} The same `stats`, for call-site chaining.
 */
export function recordExportGrowth(stats) {
    stats.grewDuringExport = true;
    stats.growthDelta      = stats.exported - stats.expected;

    return stats
}
