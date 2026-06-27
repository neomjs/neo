import {appendFile, mkdir, readFile, stat, writeFile} from 'fs/promises';
import path                                           from 'path';

/**
 * @module ai/services/memory-core/helpers/healEventLedgerStore
 * @summary Durable append-only ledger for autonomous self-heal events — the observability sink for the
 * data-recovery actuator (the dispatch outcomes), the accepted-loss settlements, and the freeze →
 * auto-unfreeze cycle. Under the zero-operator-ack mandate the immune system never blocks on a human, so the
 * ledger is how an operator (when present) reviews what the system healed, froze, or contained — asynchronously,
 * never as a gate. `summarizeHealLedger` folds the append-only stream into a queryable status surface
 * (counts + the currently-frozen set) without a second source of truth. Mirrors the `acceptedLossAuditStore`
 * JSONL shape: I/O at the edge only, deterministic content.
 */

const HEAL_LEDGER_FILENAME = 'heal-events.jsonl';

/**
 * Event types the ledger recognises for the folded status surface. `freeze` adds a collection to the
 * currently-frozen set; `unfreeze` removes it; everything else is a point-in-time heal/containment record.
 * @type {{FREEZE: String, UNFREEZE: String}}
 */
export const HEAL_LEDGER_FROZEN_TRANSITIONS = Object.freeze({FREEZE: 'freeze', UNFREEZE: 'unfreeze'});

/**
 * Bounded-retention cap (sibling of `acceptedLossAuditStore`). The ledger is append-only observability,
 * so retention is a plain keep-most-recent cap: the newest `MAX_HEAL_LEDGER_EVENTS` survive a prune. Sized well
 * above any realistic anti-thrash window — this is the ONE functional dependency the accepted-loss audit lacks:
 * `healEventsToRecentRuns` projects `attempt` rows for the dispatch cooldown/rate gate, but that gate filters by
 * `DEFAULT_DISPATCH_BOUNDS.windowMs` (~1h) and the rate-limit caps mutating heals to a handful per window, so a
 * 5000-event keep-most-recent prune can never evict a within-window attempt. Forensic depth ≈ months at typical volume.
 * @type {Number}
 */
export const MAX_HEAL_LEDGER_EVENTS = 5000;

/**
 * Append-time prune trigger (mirrors the accepted-loss audit store): an O(1) size stat-gate fires a prune only once the ledger crosses
 * this byte threshold, so the file is bounded with amortized — not per-append — O(N) work. At ~150 B/entry the
 * 5000-event cap is ~750 KB retained; a 1 MB trigger leaves headroom so the prune amortizes instead of firing every append.
 * @type {Number}
 */
export const HEAL_LEDGER_PRUNE_TRIGGER_BYTES = 1024 * 1024;

/**
 * @summary The JSONL ledger path within a state directory.
 * @param {String} dir
 * @returns {String}
 */
export function getHealLedgerFilePath(dir) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getHealLedgerFilePath: dir is required');
    }
    return path.join(dir, HEAL_LEDGER_FILENAME);
}

/**
 * @summary Appends one heal-event entry to the durable JSONL ledger (creating the dir if needed). Stamps
 * `at` from the injected clock when absent so every entry is time-ordered. Self-bounding: once the ledger
 * crosses `triggerBytes` an amortized keep-most-recent prune fires (sibling of the accepted-loss audit store), so the file never
 * grows without bound under sustained operation — the observability sink must not become its own disk leak.
 * @param {Object} entry A JSON-serializable heal event (`{type, collection, status, detail, at?}`).
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} [options.now] Epoch ms used to stamp `at` when the entry omits it.
 * @param {Number} [options.triggerBytes=HEAL_LEDGER_PRUNE_TRIGGER_BYTES] Byte threshold that arms the auto-prune. Injectable so a test can drive the self-bounding gate with a tiny threshold.
 * @param {Number} [options.maxEvents=MAX_HEAL_LEDGER_EVENTS] Retention cap the triggered auto-prune enforces.
 * @returns {Promise<String>} The ledger file path written to.
 * @throws {TypeError} when `entry` is not an object or `dir` is missing/empty.
 */
export async function appendHealEvent(entry, {dir, now, triggerBytes = HEAL_LEDGER_PRUNE_TRIGGER_BYTES, maxEvents = MAX_HEAL_LEDGER_EVENTS} = {}) {
    if (!entry || typeof entry !== 'object') {
        throw new TypeError('appendHealEvent: entry object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('appendHealEvent: dir is required');
    }

    const stamped = {...entry, at: Number.isFinite(entry.at) ? entry.at : (Number.isFinite(now) ? now : null)};

    await mkdir(dir, {recursive: true});
    const filePath = getHealLedgerFilePath(dir);
    await appendFile(filePath, `${JSON.stringify(stamped)}\n`, 'utf8');

    // Self-bound (mirrors acceptedLossAuditStore): an O(1) size stat-gate triggers an amortized prune
    // only once the ledger crosses the byte threshold — not a full read every append. A stat/prune failure must
    // never break the heal path (the ledger is observability, never a gate), so it is swallowed.
    try {
        const {size} = await stat(filePath);
        if (size > triggerBytes) await pruneHealLedger({dir, maxEvents});
    } catch (error) {
        // a partial/failed prune leaves the prior ledger intact; the next append re-tries the gate
    }

    return filePath;
}

/**
 * @summary Reads all heal-event entries (oldest → newest). A missing ledger returns `[]` (nothing healed yet);
 * a corrupt line is skipped rather than crashing the read (fail-safe — observability must never break the loop).
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @returns {Promise<Object[]>} The parsed events in append order.
 */
export async function readHealLedger({dir} = {}) {
    let text;

    try {
        text = await readFile(getHealLedgerFilePath(dir), 'utf8');
    } catch (error) {
        return []; // ENOENT or any unreadable ledger → nothing recorded yet
    }

    const events = [];
    for (const line of text.split('\n')) {
        if (!line) continue;
        try {
            events.push(JSON.parse(line));
        } catch (error) {
            // skip a corrupt line — a partial write must not break the whole status surface
        }
    }
    return events;
}

/**
 * @summary Bounds the durable ledger to the newest `maxEvents` entries (keep-most-recent), rewriting the file
 * in place. Pure keep-most-recent is correct because the ledger is append-only telemetry — no entry's removal
 * changes a heal decision (the anti-thrash gate reads only a recent window, far inside the retained set). A
 * corrupt line is dropped on rewrite (it was already unreadable). I/O at the edge only.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} [options.maxEvents=MAX_HEAL_LEDGER_EVENTS] Max entries to retain.
 * @returns {Promise<{pruned: Number, retained: Number}>} Counts; `pruned: 0` when no prune was needed.
 * @throws {TypeError} when `dir` is missing/empty.
 */
export async function pruneHealLedger({dir, maxEvents = MAX_HEAL_LEDGER_EVENTS} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('pruneHealLedger: dir is required');
    }

    const events = await readHealLedger({dir});
    if (events.length <= maxEvents) {
        return {pruned: 0, retained: events.length};
    }

    const retained = events.slice(events.length - maxEvents); // append order is oldest→newest; keep the tail
    await writeFile(getHealLedgerFilePath(dir), retained.map(event => JSON.stringify(event)).join('\n') + '\n', 'utf8');

    return {pruned: events.length - retained.length, retained: retained.length};
}

/**
 * @summary Projects heal-event ledger entries into the anti-thrash `recentRuns` shape `dispatchHeal`'s
 * cooldown/rate gate expects (`[{action, collection, at}]`). The ledger records the heal action under its
 * event-`type` field, but `decideHealAction` filters `recentRuns` by `run.action` — so a raw ledger entry
 * would never match its own action and the anti-thrash bound would silently never fire (a just-recorded
 * attempt would re-`execute` instead of `thrash-cooldown`). This projection (`type` → `action`, keeping the
 * epoch-ms `at` and the collection) is the seam where the ledger schema meets the dispatch contract.
 *
 * **Only `status: 'attempt'` rows project.** The pre-execution attempt is the anti-thrash unit (one per heal).
 * Outcome rows (the recorded dispatch result — `failed`, `healed`, etc.) carry the SAME `{type, collection}`
 * key but are observability, NOT additional runs; counting them would double the run-count per heal — silently
 * tightening the rate-limit (3 → 2 heals/window) and dragging the cooldown `lastAt` to the later outcome-time.
 * @param {Object[]} [events=[]] Heal-event entries (as read/filtered from the ledger).
 * @returns {Object[]} `[{action, collection, at}]` for `decideHealAction`.
 */
export function healEventsToRecentRuns(events = []) {
    return (Array.isArray(events) ? events : [])
        .filter(event => event && typeof event === 'object' && event.status === 'attempt')
        .map(event => ({action: event.type, collection: event.collection, at: event.at}));
}

/**
 * @summary Folds a heal-event stream into the queryable immune-system status surface: totals, counts by
 * status and by type, the currently-frozen set (freeze adds, unfreeze removes — last transition wins), and the
 * latest event timestamp. Pure — no I/O; the caller reads the ledger then summarizes.
 * @param {Object[]} [events=[]] The heal events (as read from the ledger).
 * @returns {Object} `{total, byStatus, byType, currentlyFrozen, lastEventAt}`.
 */
export function summarizeHealLedger(events = []) {
    const rows     = Array.isArray(events) ? events : [],
          byStatus = {},
          byType   = {},
          frozen   = new Set();

    let lastEventAt = null;

    for (const event of rows) {
        if (!event || typeof event !== 'object') continue;

        const status = typeof event.status === 'string' ? event.status : 'unknown',
              type   = typeof event.type   === 'string' ? event.type   : 'unknown';

        byStatus[status] = (byStatus[status] ?? 0) + 1;
        byType[type]     = (byType[type] ?? 0) + 1;

        if (typeof event.collection === 'string' && event.collection.length > 0) {
            if (type === HEAL_LEDGER_FROZEN_TRANSITIONS.FREEZE) {
                frozen.add(event.collection);
            } else if (type === HEAL_LEDGER_FROZEN_TRANSITIONS.UNFREEZE) {
                frozen.delete(event.collection);
            }
        }

        if (Number.isFinite(event.at) && (lastEventAt === null || event.at > lastEventAt)) {
            lastEventAt = event.at;
        }
    }

    return {
        total          : rows.length,
        byStatus,
        byType,
        currentlyFrozen: [...frozen].sort(),
        lastEventAt
    };
}

/**
 * @summary Filters a heal-event stream into a queryable view — the "what happened" surface that complements
 * `summarizeHealLedger`'s folded counts. Pure: restrict by an optional inclusive time window, event types,
 * collections, and statuses; returns newest-first (by `at`), capped at `limit`. A non-object entry, or one
 * outside a requested time window, is dropped; an untimed event is excluded when a time bound is requested.
 * @param {Object[]} [events=[]] The heal events (as read from the ledger).
 * @param {Object} [options]
 * @param {Number} [options.sinceMs] Lower bound (inclusive) on `at`.
 * @param {Number} [options.untilMs] Upper bound (inclusive) on `at`.
 * @param {String[]} [options.types] Restrict to these event types (e.g. `['freeze', 'unfreeze']`).
 * @param {String[]} [options.collections] Restrict to these collections.
 * @param {String[]} [options.statuses] Restrict to these statuses (e.g. `['failed']`).
 * @param {Number} [options.limit] Max events returned (newest-first); omitted → all matches.
 * @returns {Object[]} The matching events, newest-first.
 */
export function queryHealLedger(events = [], {sinceMs, untilMs, types, collections, statuses, limit} = {}) {
    const rows      = Array.isArray(events) ? events : [],
          typeSet   = Array.isArray(types)       && types.length       ? new Set(types)       : null,
          collSet   = Array.isArray(collections) && collections.length ? new Set(collections) : null,
          statusSet = Array.isArray(statuses)    && statuses.length    ? new Set(statuses)    : null;

    const filtered = rows.filter(event => {
        if (!event || typeof event !== 'object')                                            return false;
        if (Number.isFinite(sinceMs) && !(Number.isFinite(event.at) && event.at >= sinceMs)) return false;
        if (Number.isFinite(untilMs) && !(Number.isFinite(event.at) && event.at <= untilMs)) return false;
        if (typeSet   && !typeSet.has(event.type))         return false;
        if (collSet   && !collSet.has(event.collection))   return false;
        if (statusSet && !statusSet.has(event.status))     return false;
        return true;
    });

    // Newest-first by `at`; untimed events (-Infinity) sink to the end (Array.sort is stable in V8).
    filtered.sort((a, b) => (Number.isFinite(b.at) ? b.at : -Infinity) - (Number.isFinite(a.at) ? a.at : -Infinity));

    return Number.isFinite(limit) && limit >= 0 ? filtered.slice(0, limit) : filtered;
}
