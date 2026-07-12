import {readRouteAttributionLedger} from './routeAttributionLedgerStore.mjs';

/**
 * @module ai/services/graph/typeGateRejectionLedgerStore
 * @summary Durable append-only ledger for the computed-Golden-Path **actionability type-gate**
 * rejections — the live per-run record of which computed candidates the `isActionableComputedRecommendation`
 * gate rejected (visibility-only nodes: `epic` / `not-code-ready` / …) and under which exclusion labels.
 * It is the SECOND filter point in the GP scoring pipeline, distinct from the routing-contradiction guard
 * the `routeAttributionLedgerStore` records: the guard filters candidates that CONTRADICT the current focus,
 * this gate rejects candidates that are structurally NON-ACTIONABLE. Keeping the two as sibling ledgers (one
 * runtime dir + the shared append/read/prune I/O + retention machinery, distinct filenames + record shapes)
 * lets the downstream 42.2%-type-gate disposition read exactly the type-gate window without
 * stage-filtering a mixed stream. Records carry an explicit `stage` so a merged analysis stays self-describing.
 *
 * The producer (the emit at the gate's real filter point) lives in `GoldenPathSynthesizer`; this module owns
 * the filename + record `stage` + the queryable fold (`summarize`/`query`) the disposition reads. I/O reuses
 * the shape-agnostic `routeAttributionLedgerStore` primitives via the `filename` seam — no duplicated append.
 */

/**
 * The JSONL leaf, a sibling of the route-attribution ledger inside the same runtime state dir.
 * @type {String}
 */
export const TYPE_GATE_REJECTION_FILENAME = 'type-gate-rejection.jsonl';

/**
 * The record `stage` discriminator — self-describes a type-gate rejection if it is ever read alongside
 * route-attribution records in a merged analysis.
 * @type {String}
 */
export const TYPE_GATE_REJECTION_STAGE = 'actionability-type-gate';

/**
 * @summary Reads all type-gate rejection records (oldest → newest) from the sibling ledger file. Delegates to
 * the shared shape-agnostic reader with the type-gate filename — same ENOENT-is-empty / corrupt-line-skipped /
 * unreadable-file-throws contract.
 * @param {Object} options
 * @param {String} options.dir The durable state directory (the shared route-attribution ledger dir).
 * @returns {Promise<Object[]>} The parsed records in append order.
 */
export function readTypeGateRejectionLedger({dir} = {}) {
    return readRouteAttributionLedger({dir, filename: TYPE_GATE_REJECTION_FILENAME});
}

/**
 * @summary Folds a type-gate rejection stream into the queryable evidence surface the type-gate disposition reads:
 * totals, how often each exclusion label rejected a candidate, and how often each node was rejected. Pure — no
 * I/O; the caller reads the ledger then summarizes. This is the type-gate analog of
 * `summarizeRouteAttributionLedger` (which folds the guard-filter stream's arming reasons + blocked nodes).
 * @param {Object[]} [records=[]] The type-gate rejection records (as read from the ledger).
 * @returns {Object} `{total, byRejectionLabel, rejectedNodeCounts, lastEventAt}`.
 */
export function summarizeTypeGateRejectionLedger(records = []) {
    const rows               = Array.isArray(records) ? records : [],
          byRejectionLabel   = {},
          rejectedNodeCounts = {};

    let lastEventAt = null;

    for (const record of rows) {
        if (!record || typeof record !== 'object') continue;

        for (const label of Array.isArray(record.rejectionBucket) ? record.rejectionBucket : []) {
            if (typeof label === 'string' && label.length > 0) {
                byRejectionLabel[label] = (byRejectionLabel[label] ?? 0) + 1;
            }
        }

        if (typeof record.nodeId === 'string' && record.nodeId.length > 0) {
            rejectedNodeCounts[record.nodeId] = (rejectedNodeCounts[record.nodeId] ?? 0) + 1;
        }

        if (Number.isFinite(record.at) && (lastEventAt === null || record.at > lastEventAt)) {
            lastEventAt = record.at;
        }
    }

    return {
        total: rows.length,
        byRejectionLabel,
        rejectedNodeCounts,
        lastEventAt
    };
}

/**
 * @summary Filters a type-gate rejection stream into a queryable view — the "what was rejected" surface that
 * complements the summarized counts. Pure: restrict by an optional inclusive time window, exclusion labels, and
 * node ids; returns newest-first (by `at`), capped at `limit`. A non-object record, or one outside a requested
 * time window, is dropped; an untimed record is excluded when a time bound is requested. A record matches a
 * `rejectionLabels` filter when its `rejectionBucket` array intersects the requested set.
 * @param {Object[]} [records=[]] The type-gate rejection records (as read from the ledger).
 * @param {Object} [options]
 * @param {Number} [options.sinceMs] Lower bound (inclusive) on `at`.
 * @param {Number} [options.untilMs] Upper bound (inclusive) on `at`.
 * @param {String[]} [options.rejectionLabels] Restrict to records whose `rejectionBucket` intersects these.
 * @param {String[]} [options.nodeIds] Restrict to these rejected node ids.
 * @param {Number} [options.limit] Max records returned (newest-first); omitted → all matches.
 * @returns {Object[]} The matching records, newest-first.
 */
export function queryTypeGateRejectionLedger(records = [], {sinceMs, untilMs, rejectionLabels, nodeIds, limit} = {}) {
    const rows     = Array.isArray(records) ? records : [],
          labelSet = Array.isArray(rejectionLabels) && rejectionLabels.length ? new Set(rejectionLabels) : null,
          nodeSet  = Array.isArray(nodeIds)         && nodeIds.length         ? new Set(nodeIds)         : null;

    const filtered = rows.filter(record => {
        if (!record || typeof record !== 'object')                                             return false;
        if (Number.isFinite(sinceMs) && !(Number.isFinite(record.at) && record.at >= sinceMs)) return false;
        if (Number.isFinite(untilMs) && !(Number.isFinite(record.at) && record.at <= untilMs)) return false;
        if (labelSet && !(Array.isArray(record.rejectionBucket) && record.rejectionBucket.some(label => labelSet.has(label)))) return false;
        if (nodeSet  && !nodeSet.has(record.nodeId)) return false;
        return true;
    });

    // Newest-first by `at`; untimed records (-Infinity) sink to the end (Array.sort is stable in V8).
    filtered.sort((a, b) => (Number.isFinite(b.at) ? b.at : -Infinity) - (Number.isFinite(a.at) ? a.at : -Infinity));

    return Number.isFinite(limit) && limit >= 0 ? filtered.slice(0, limit) : filtered;
}
