import {appendFile, mkdir, readFile, stat, writeFile} from 'fs/promises';
import path                                           from 'path';

/**
 * @module ai/services/graph/routeAttributionLedgerStore
 * @summary Durable append-only ledger for computed-Golden-Path route-attribution — the live per-run record of
 * which computed focus candidates the routing contradiction guard FILTERED, how often, and under which live focus
 * reasons. This is the record-seam the one-shot `golden-path-route-attribution` measurement dataset was a manual
 * snapshot of: `GoldenPathSynthesizer` runs inside the orchestrator daemon (a RUNTIME service), so the seam is a
 * JSONL store in a runtime state dir — never a git-tracked `measurements/*.md` (that is a diagnostic-script
 * output shape, not a live writer). `summarizeRouteAttributionLedger` folds the append-only stream into the
 * queryable evidence surface the downstream type-gate disposition reads (which nodes are blocked, under which
 * focus reasons, with which exclusion buckets) without a second source of truth. Mirrors the
 * `healEventLedgerStore` JSONL shape: I/O at the edge only, deterministic content, no config-SSOT read, no
 * helper-owned defaults.
 */

const ROUTE_ATTRIBUTION_FILENAME = 'route-attribution.jsonl';

/**
 * @summary The JSONL ledger path within a state directory. The append/read/prune I/O below is
 * record-shape-agnostic, so the optional `filename` generalizes it to a SIBLING ledger sharing the
 * same runtime dir + retention machinery but a distinct record shape — e.g. the type-gate rejection
 * ledger (`typeGateRejectionLedgerStore`), which passes its own filename and owns its own
 * summarize/query fold. `filename` defaults to the route-attribution ledger, so the guard-filter
 * callers pass nothing and are unchanged.
 * @param {String} dir
 * @param {String} [filename=ROUTE_ATTRIBUTION_FILENAME] Ledger leaf within `dir`.
 * @returns {String}
 */
export function getRouteAttributionLedgerFilePath(dir, filename = ROUTE_ATTRIBUTION_FILENAME) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getRouteAttributionLedgerFilePath: dir is required');
    }
    return path.join(dir, filename);
}

/**
 * @summary Validates a route-attribution retention policy (the AiConfig ledger leaves) at the AiConfig-consuming
 * boundary, BEFORE it is handed to `appendRouteAttribution`. Invalid operator config must fail VISIBLY here:
 * `appendRouteAttribution`'s prune gate swallows errors (the ledger is observability, never a gate), so a
 * negative/non-finite `maxEvents` or `triggerBytes` would otherwise silently disable the bound and let the ledger
 * grow unbounded. Pure (no I/O, no SSOT read): the boundary reads the leaves and calls this; the helper owns no
 * production default, only this fail-closed validation.
 * @param {Number} maxEvents Retention cap (the ledger `maxEvents` leaf).
 * @param {Number} triggerBytes Prune byte-trigger (the ledger `pruneTriggerBytes` leaf).
 * @returns {{maxEvents: Number, triggerBytes: Number}} The validated pair (spread straight into `appendRouteAttribution` options).
 * @throws {TypeError} when either value is not a finite, non-negative number.
 */
export function validateRouteAttributionRetention(maxEvents, triggerBytes) {
    for (const [name, value] of [['maxEvents', maxEvents], ['pruneTriggerBytes', triggerBytes]]) {
        if (!Number.isFinite(value) || value < 0) {
            throw new TypeError(`route-attribution retention: ${name} must be a finite, non-negative number (the AiConfig leaf), got ${value}`);
        }
    }
    return {maxEvents, triggerBytes};
}

/**
 * @summary Appends one route-attribution entry to the durable JSONL ledger (creating the dir if needed). Stamps
 * `at` from the injected clock when absent so every entry is time-ordered. Self-bounding ONLY when the
 * AiConfig-aware caller supplies the retention policy: with both `triggerBytes` and `maxEvents` finite, an O(1)
 * size stat-gate fires an amortized keep-most-recent prune once the ledger crosses `triggerBytes`, so the file
 * never grows without bound. With no policy supplied the auto-prune is inert; this helper owns no production
 * default — the config-SSOT leaves do.
 * @param {Object} entry A JSON-serializable record (`{blockedNodeId, armingReasons, candidateReasons, at?}`).
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {String} [options.filename] Ledger leaf within `dir` (defaults to the route-attribution ledger); a sibling record shape passes its own.
 * @param {Number} [options.now] Epoch ms used to stamp `at` when the entry omits it.
 * @param {Number} [options.triggerBytes] Byte threshold that arms the auto-prune (from the AiConfig retention leaf). Skipped unless both this and `maxEvents` are finite.
 * @param {Number} [options.maxEvents] Retention cap the triggered auto-prune enforces (from the AiConfig retention leaf).
 * @returns {Promise<String>} The ledger file path written to.
 * @throws {TypeError} when `entry` is not an object or `dir` is missing/empty.
 */
export async function appendRouteAttribution(entry, {dir, filename, now, triggerBytes, maxEvents} = {}) {
    if (!entry || typeof entry !== 'object') {
        throw new TypeError('appendRouteAttribution: entry object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('appendRouteAttribution: dir is required');
    }

    const stamped = {...entry, at: Number.isFinite(entry.at) ? entry.at : (Number.isFinite(now) ? now : null)};

    await mkdir(dir, {recursive: true});
    const filePath = getRouteAttributionLedgerFilePath(dir, filename);
    await appendFile(filePath, `${JSON.stringify(stamped)}\n`, 'utf8');

    // Self-bound (mirrors healEventLedgerStore) ONLY when the AiConfig-aware caller supplied the retention policy
    // — no helper-owned default. An O(1) size stat-gate triggers an amortized prune only once the ledger crosses
    // the byte threshold (not a full read every append). A stat/prune failure must never break synthesis (the
    // ledger is observability, never a gate), so it is swallowed.
    if (Number.isFinite(triggerBytes) && Number.isFinite(maxEvents)) {
        try {
            const {size} = await stat(filePath);
            if (size > triggerBytes) await pruneRouteAttributionLedger({dir, filename, maxEvents});
        } catch (error) {
            // a partial/failed prune leaves the prior ledger intact; the next append re-tries the gate
        }
    }

    return filePath;
}

/**
 * @summary Reads all route-attribution records (oldest → newest). A MISSING ledger (`ENOENT`) returns `[]`
 * (nothing filtered yet); a corrupt LINE is skipped (a partial write must not break the read). But an
 * unreadable/corrupt FILE (`EISDIR`, `EACCES`, …) THROWS — that is a real degradation, not "nothing yet", so the
 * evidence boundary sees it instead of reporting a false-empty window. A synthesis caller that must never be
 * gated by the ledger catches this itself and proceeds fail-safe.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {String} [options.filename] Ledger leaf within `dir` (defaults to the route-attribution ledger).
 * @returns {Promise<Object[]>} The parsed records in append order.
 * @throws when the ledger file exists but is unreadable at the FILE level (any non-`ENOENT` read error).
 */
export async function readRouteAttributionLedger({dir, filename} = {}) {
    let text;

    try {
        text = await readFile(getRouteAttributionLedgerFilePath(dir, filename), 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return []; // missing ledger → nothing recorded yet (not a degradation)
        }
        throw error; // unreadable/corrupt storage → surface so the evidence boundary degrades visibly
    }

    const records = [];
    for (const line of text.split('\n')) {
        if (!line) continue;
        try {
            records.push(JSON.parse(line));
        } catch (error) {
            // skip a corrupt line — a partial write must not break the whole evidence surface
        }
    }
    return records;
}

/**
 * @summary Bounds the durable ledger to the newest `maxEvents` records (keep-most-recent), rewriting the file in
 * place. Pure keep-most-recent is correct because the ledger is append-only telemetry — no record's removal
 * changes a routing decision (the guard reads live graph state, never this ledger). A corrupt line is dropped on
 * rewrite (it was already unreadable). I/O at the edge only.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {String} [options.filename] Ledger leaf within `dir` (defaults to the route-attribution ledger).
 * @param {Number} options.maxEvents Max records to retain (the AiConfig retention leaf; no helper-owned default).
 * @returns {Promise<{pruned: Number, retained: Number}>} Counts; `pruned: 0` when no prune was needed.
 * @throws {TypeError} when `dir` is missing/empty or `maxEvents` is not a finite, non-negative number.
 */
export async function pruneRouteAttributionLedger({dir, filename, maxEvents} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('pruneRouteAttributionLedger: dir is required');
    }
    if (!Number.isFinite(maxEvents) || maxEvents < 0) {
        throw new TypeError(`pruneRouteAttributionLedger: a finite, non-negative maxEvents is required (the AiConfig retention leaf), got ${maxEvents}`);
    }

    const records = await readRouteAttributionLedger({dir, filename});
    if (records.length <= maxEvents) {
        return {pruned: 0, retained: records.length};
    }

    const retained = records.slice(records.length - maxEvents); // append order is oldest→newest; keep the tail
    await writeFile(getRouteAttributionLedgerFilePath(dir, filename), retained.map(record => JSON.stringify(record)).join('\n') + '\n', 'utf8');

    return {pruned: records.length - retained.length, retained: retained.length};
}

/**
 * @summary Folds a route-attribution stream into the queryable evidence surface the downstream disposition
 * reads: totals, how often each live arming reason fired the guard, and how often each node was blocked. Pure —
 * no I/O; the caller reads the ledger then summarizes. (No exclusion-label fold: every guard-blocked node already
 * passed the actionability type-gate, so its exclusion set is empty — that dimension belongs to the type-gate
 * producer, not this guard-filter one.)
 * @param {Object[]} [records=[]] The route-attribution records (as read from the ledger).
 * @returns {Object} `{total, byArmingReason, blockedNodeCounts, lastEventAt}`.
 */
export function summarizeRouteAttributionLedger(records = []) {
    const rows              = Array.isArray(records) ? records : [],
          byArmingReason    = {},
          blockedNodeCounts = {};

    let lastEventAt = null;

    for (const record of rows) {
        if (!record || typeof record !== 'object') continue;

        for (const reason of Array.isArray(record.armingReasons) ? record.armingReasons : []) {
            if (typeof reason === 'string' && reason.length > 0) {
                byArmingReason[reason] = (byArmingReason[reason] ?? 0) + 1;
            }
        }

        if (typeof record.blockedNodeId === 'string' && record.blockedNodeId.length > 0) {
            blockedNodeCounts[record.blockedNodeId] = (blockedNodeCounts[record.blockedNodeId] ?? 0) + 1;
        }

        if (Number.isFinite(record.at) && (lastEventAt === null || record.at > lastEventAt)) {
            lastEventAt = record.at;
        }
    }

    return {
        total: rows.length,
        byArmingReason,
        blockedNodeCounts,
        lastEventAt
    };
}

/**
 * @summary Filters a route-attribution stream into a queryable view — the "what was blocked" surface that
 * complements `summarizeRouteAttributionLedger`'s folded counts. Pure: restrict by an optional inclusive time
 * window, live arming reasons, and blocked node ids; returns newest-first (by `at`), capped at `limit`. A
 * non-object record, or one outside a requested time window, is dropped; an untimed record is excluded when a
 * time bound is requested. A record matches an `armingReasons` filter when its array intersects the requested set.
 * @param {Object[]} [records=[]] The route-attribution records (as read from the ledger).
 * @param {Object} [options]
 * @param {Number} [options.sinceMs] Lower bound (inclusive) on `at`.
 * @param {Number} [options.untilMs] Upper bound (inclusive) on `at`.
 * @param {String[]} [options.armingReasons] Restrict to records whose `armingReasons` intersect these.
 * @param {String[]} [options.blockedNodeIds] Restrict to these blocked node ids.
 * @param {Number} [options.limit] Max records returned (newest-first); omitted → all matches.
 * @returns {Object[]} The matching records, newest-first.
 */
export function queryRouteAttributionLedger(records = [], {sinceMs, untilMs, armingReasons, blockedNodeIds, limit} = {}) {
    const rows      = Array.isArray(records) ? records : [],
          reasonSet = Array.isArray(armingReasons)   && armingReasons.length   ? new Set(armingReasons)   : null,
          nodeSet   = Array.isArray(blockedNodeIds)  && blockedNodeIds.length  ? new Set(blockedNodeIds)  : null;

    const filtered = rows.filter(record => {
        if (!record || typeof record !== 'object')                                             return false;
        if (Number.isFinite(sinceMs) && !(Number.isFinite(record.at) && record.at >= sinceMs)) return false;
        if (Number.isFinite(untilMs) && !(Number.isFinite(record.at) && record.at <= untilMs)) return false;
        if (reasonSet && !(Array.isArray(record.armingReasons) && record.armingReasons.some(reason => reasonSet.has(reason)))) return false;
        if (nodeSet   && !nodeSet.has(record.blockedNodeId)) return false;
        return true;
    });

    // Newest-first by `at`; untimed records (-Infinity) sink to the end (Array.sort is stable in V8).
    filtered.sort((a, b) => (Number.isFinite(b.at) ? b.at : -Infinity) - (Number.isFinite(a.at) ? a.at : -Infinity));

    return Number.isFinite(limit) && limit >= 0 ? filtered.slice(0, limit) : filtered;
}
