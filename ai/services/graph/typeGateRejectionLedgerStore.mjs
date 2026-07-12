import {stat, writeFile} from 'fs/promises';
import {
    appendRouteAttribution,
    getRouteAttributionLedgerFilePath,
    readRouteAttributionLedger
} from './routeAttributionLedgerStore.mjs';

/**
 * @module ai/services/graph/typeGateRejectionLedgerStore
 * @summary Durable append-only ledger for computed-Golden-Path candidate-admission rejections.
 * One physical stream carries stage-discriminated actionability and Discussion-liveness rows while
 * stage-aware read/fold/query defaults preserve the existing actionability-only view.
 * It is distinct from the routing-contradiction guard
 * the `routeAttributionLedgerStore` records: the guard filters candidates that CONTRADICT the current focus,
 * these admission gates reject candidates before scoring. Keeping the two as sibling ledgers (one
 * runtime dir + shared low-level append/read I/O, distinct filenames + record shapes) lets the downstream
 * disposition query either gate without cross-contamination. This store specializes pruning because its one
 * physical file carries two independently retained stage views.
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
 * @summary Exact stage discriminator for source-lifecycle/decaying-support rejections.
 * @type {String}
 */
export const DISCUSSION_LIVENESS_REJECTION_STAGE = 'discussion-liveness-gate';

const REJECTION_STAGES = new Set([
    TYPE_GATE_REJECTION_STAGE,
    DISCUSSION_LIVENESS_REJECTION_STAGE
]);

/**
 * @summary Accepts only the two producer-owned candidate-admission stage discriminators.
 * @param {String} stage
 * @returns {String|null}
 */
function normalizeRejectionStage(stage) {
    return REJECTION_STAGES.has(stage) ? stage : null
}

/**
 * @summary Appends one candidate-admission rejection to the shared physical rejection stream, then applies the
 * configured retention cap independently to each producer-owned stage. A busy Discussion-liveness producer
 * therefore cannot evict the actionability evidence that powers the compatibility-default read. The same
 * `maxEvents` and `triggerBytes` AiConfig leaves remain authoritative; this store owns no defaults.
 * @param {Object} entry A rejection row with one of the two exact `stage` discriminators.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} [options.now] Epoch ms used to stamp `at` when absent.
 * @param {Number} [options.triggerBytes] Byte threshold that arms stage-aware pruning.
 * @param {Number} [options.maxEvents] Per-stage retention cap.
 * @returns {Promise<String>} The physical ledger file path written to.
 * @throws {TypeError} when the row has no producer-owned stage.
 */
export async function appendTypeGateRejection(entry, {dir, now, triggerBytes, maxEvents} = {}) {
    if (!entry || typeof entry !== 'object' || !normalizeRejectionStage(entry.stage)) {
        throw new TypeError('appendTypeGateRejection: entry.stage must be a producer-owned rejection stage')
    }

    const filePath = await appendRouteAttribution(entry, {
        dir,
        filename: TYPE_GATE_REJECTION_FILENAME,
        now
    });

    if (Number.isFinite(triggerBytes) && Number.isFinite(maxEvents)) {
        try {
            const {size} = await stat(filePath);
            if (size > triggerBytes) await pruneTypeGateRejectionLedger({dir, maxEvents})
        } catch (error) {
            // Observability must not gate synthesis; the next append re-tries the bounded prune.
        }
    }

    return filePath
}

/**
 * @summary Bounds each producer-owned stage within the one physical rejection stream to its newest `maxEvents`
 * rows while preserving global append order among retained rows. Invalid-stage rows are discarded during a
 * rewrite because no reader can treat them as candidate-admission evidence.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} options.maxEvents Per-stage retention cap from the existing AiConfig leaf.
 * @returns {Promise<{pruned: Number, retained: Number}>} Physical row counts after stage-aware pruning.
 */
export async function pruneTypeGateRejectionLedger({dir, maxEvents} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('pruneTypeGateRejectionLedger: dir is required')
    }
    if (!Number.isFinite(maxEvents) || maxEvents < 0) {
        throw new TypeError(`pruneTypeGateRejectionLedger: a finite, non-negative maxEvents is required (the AiConfig leaf), got ${maxEvents}`)
    }

    const records  = await readRouteAttributionLedger({dir, filename: TYPE_GATE_REJECTION_FILENAME}),
          counts   = new Map([...REJECTION_STAGES].map(stage => [stage, 0])),
          retained = [];

    for (let index = records.length - 1; index >= 0; index--) {
        const record = records[index],
              stage  = normalizeRejectionStage(record?.stage);

        if (stage && counts.get(stage) < maxEvents) {
            counts.set(stage, counts.get(stage) + 1);
            retained.push(record)
        }
    }

    retained.reverse();

    if (retained.length === records.length) {
        return {pruned: 0, retained: retained.length}
    }

    const text = retained.length ? `${retained.map(record => JSON.stringify(record)).join('\n')}\n` : '';
    await writeFile(getRouteAttributionLedgerFilePath(dir, TYPE_GATE_REJECTION_FILENAME), text, 'utf8');

    return {pruned: records.length - retained.length, retained: retained.length}
}

/**
 * @summary Reads one exact rejection stage (oldest → newest) from the sibling ledger file. Delegates to
 * the shared shape-agnostic reader with the type-gate filename — same ENOENT-is-empty / corrupt-line-skipped /
 * unreadable-file-throws contract.
 * @param {Object} options
 * @param {String} options.dir The durable state directory (the shared route-attribution ledger dir).
 * @param {String} [options.stage=TYPE_GATE_REJECTION_STAGE] Exact stage view.
 * @returns {Promise<Object[]>} The parsed records in append order.
 */
export async function readTypeGateRejectionLedger({dir, stage = TYPE_GATE_REJECTION_STAGE} = {}) {
    const normalizedStage = normalizeRejectionStage(stage);
    if (!normalizedStage) return [];

    const records = await readRouteAttributionLedger({dir, filename: TYPE_GATE_REJECTION_FILENAME});
    return records.filter(record => record?.stage === normalizedStage)
}

/**
 * @summary Folds one stage of a mixed candidate-admission stream into its queryable evidence surface:
 * totals, how often each exclusion label rejected a candidate, and how often each node was rejected. Pure — no
 * I/O; the caller reads the ledger then summarizes. This is the type-gate analog of
 * `summarizeRouteAttributionLedger` (which folds the guard-filter stream's arming reasons + blocked nodes).
 * @param {Object[]} [records=[]] Mixed-stage rejection records.
 * @param {Object} [options]
 * @param {String} [options.stage=TYPE_GATE_REJECTION_STAGE] Exact stage view.
 * @returns {Object} `{total, byRejectionBucket, byRejectionLabel, rejectedNodeCounts, lastEventAt}`.
 */
export function summarizeTypeGateRejectionLedger(records = [], {stage = TYPE_GATE_REJECTION_STAGE} = {}) {
    const normalizedStage = normalizeRejectionStage(stage),
          rows            = normalizedStage && Array.isArray(records)
              ? records.filter(record => record?.stage === normalizedStage)
              : [],
          byRejectionBucket  = {},
          rejectedNodeCounts = {};

    let lastEventAt = null;

    for (const record of rows) {
        if (!record || typeof record !== 'object') continue;

        for (const label of Array.isArray(record.rejectionBucket) ? record.rejectionBucket : []) {
            if (typeof label === 'string' && label.length > 0) {
                byRejectionBucket[label] = (byRejectionBucket[label] ?? 0) + 1;
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
        total           : rows.length,
        byRejectionBucket,
        byRejectionLabel: normalizedStage === TYPE_GATE_REJECTION_STAGE ? {...byRejectionBucket} : {},
        rejectedNodeCounts,
        lastEventAt
    };
}

/**
 * @summary Filters a type-gate rejection stream into a queryable view — the "what was rejected" surface that
 * complements the summarized counts. Pure: restrict by one exact stage plus an optional inclusive time window, rejection buckets, and
 * node ids; returns newest-first (by `at`), capped at `limit`. A non-object record, or one outside a requested
 * time window, is dropped; an untimed record is excluded when a time bound is requested. A record matches a
 * `rejectionLabels` filter when its `rejectionBucket` array intersects the requested set.
 * @param {Object[]} [records=[]] The type-gate rejection records (as read from the ledger).
 * @param {Object} [options]
 * @param {Number} [options.sinceMs] Lower bound (inclusive) on `at`.
 * @param {Number} [options.untilMs] Upper bound (inclusive) on `at`.
 * @param {String[]} [options.rejectionLabels] Restrict to records whose `rejectionBucket` intersects these.
 * @param {String[]} [options.rejectionBuckets] Generic alias for liveness or actionability buckets.
 * @param {String[]} [options.nodeIds] Restrict to these rejected node ids.
 * @param {String} [options.stage=TYPE_GATE_REJECTION_STAGE] Exact stage view.
 * @param {Number} [options.limit] Max records returned (newest-first); omitted → all matches.
 * @returns {Object[]} The matching records, newest-first.
 */
export function queryTypeGateRejectionLedger(records = [], {
    sinceMs,
    untilMs,
    rejectionLabels,
    rejectionBuckets,
    nodeIds,
    limit,
    stage = TYPE_GATE_REJECTION_STAGE
} = {}) {
    const normalizedStage = normalizeRejectionStage(stage),
          rows            = Array.isArray(records) ? records : [],
          buckets         = Array.isArray(rejectionBuckets) ? rejectionBuckets : rejectionLabels,
          labelSet        = Array.isArray(buckets) && buckets.length ? new Set(buckets) : null,
          nodeSet         = Array.isArray(nodeIds)         && nodeIds.length         ? new Set(nodeIds)         : null;

    if (!normalizedStage) return [];

    const filtered = rows.filter(record => {
        if (!record || typeof record !== 'object')                                             return false;
        if (record.stage !== normalizedStage)                                                   return false;
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
