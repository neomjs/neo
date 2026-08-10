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

/**
 * Filename of the heal-event ledger inside its directory. Exported for the same reason as the
 * directory name: the backup/restore lane must address this file by its exact name rather than
 * guessing "the first `.jsonl` in the folder", which silently picks the wrong file the moment a
 * second ledger lands beside it.
 * @type {String}
 */
export const HEAL_LEDGER_FILENAME = 'heal-events.jsonl';

/**
 * Directory name holding the heal-event ledger, relative to the orchestrator data directory.
 *
 * Exported because the ledger has no config leaf of its own — its location is derived from the
 * resolved `orchestrator.dataDir` by every consumer. That derivation was written out longhand at
 * three separate sites, and the backup lane needs a fourth: a producer and a backup that disagree
 * about where the ledger lives would not fail, it would silently bundle nothing, which is precisely
 * the class of defect the ledger exists to make visible. One name, one home.
 * @type {String}
 */
export const HEAL_LEDGER_DIR_NAME = 'data-heal-events';

/**
 * Event types the ledger recognises for the folded status surface. `freeze` adds a collection to the
 * currently-frozen set; `unfreeze` removes it; everything else is a point-in-time heal/containment record.
 * @type {{FREEZE: String, UNFREEZE: String}}
 */
export const HEAL_LEDGER_FROZEN_TRANSITIONS = Object.freeze({FREEZE: 'freeze', UNFREEZE: 'unfreeze'});

/**
 * Retention policy (keep-most-recent cap + append-time prune-trigger) is NOT owned here. Retained event count,
 * prune byte-trigger, and recent-event read-cap are operator-configurable RUNTIME policy, declared as `AiConfig`
 * leaves (`orchestrator.recoveryActuator.healLedger.{maxEvents, pruneTriggerBytes}`) and passed explicitly into
 * `appendHealEvent` / `pruneHealLedger` by the AiConfig-aware orchestrator boundary. This pure edge-I/O helper
 * never reads the config SSOT and owns no production defaults — with no retention supplied the append-time
 * auto-prune is simply inert (a forgotten policy is visibly unbounded growth, never a silent helper magic number).
 */

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
 * @summary Validates a heal-ledger retention policy (the AiConfig `recoveryActuator.healLedger` leaves) at the
 * AiConfig-consuming boundary, BEFORE it is handed to `appendHealEvent`. Invalid operator config must fail VISIBLY
 * here: `appendHealEvent`'s prune gate swallows errors (the ledger is observability, never a gate), so a
 * negative/non-finite `maxEvents` or `triggerBytes` would otherwise silently disable the bound and let the ledger
 * grow unbounded. Pure (no I/O, no SSOT read): the boundary reads the leaves and calls this; the helper owns no
 * production default, only this fail-closed validation.
 * @param {Number} maxEvents Retention cap (the `healLedger.maxEvents` leaf).
 * @param {Number} triggerBytes Prune byte-trigger (the `healLedger.pruneTriggerBytes` leaf).
 * @returns {{maxEvents: Number, triggerBytes: Number}} The validated pair (spread straight into `appendHealEvent` options).
 * @throws {TypeError} when either value is not a finite, non-negative number.
 */
export function validateHealLedgerRetention(maxEvents, triggerBytes) {
    for (const [name, value] of [['maxEvents', maxEvents], ['pruneTriggerBytes', triggerBytes]]) {
        if (!Number.isFinite(value) || value < 0) {
            throw new TypeError(`heal-ledger retention: ${name} must be a finite, non-negative number (the AiConfig leaf), got ${value}`);
        }
    }
    return {maxEvents, triggerBytes};
}

/**
 * @summary Appends one heal-event entry to the durable JSONL ledger (creating the dir if needed). Stamps
 * `at` from the injected clock when absent so every entry is time-ordered. Self-bounding ONLY when the
 * AiConfig-aware caller supplies the retention policy: with both `triggerBytes` and `maxEvents` finite, an O(1)
 * size stat-gate fires an amortized keep-most-recent prune once the ledger crosses `triggerBytes`, so the file
 * never grows without bound — the observability sink must not become its own disk leak. With no policy supplied
 * the auto-prune is inert; this helper owns no production default — the config-SSOT leaves do.
 * @param {Object} entry A JSON-serializable heal event (`{type, collection, status, detail, at?}`).
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} [options.now] Epoch ms used to stamp `at` when the entry omits it.
 * @param {Number} [options.triggerBytes] Byte threshold that arms the auto-prune (from the AiConfig retention leaf). The auto-prune is skipped unless both this and `maxEvents` are finite.
 * @param {Number} [options.maxEvents] Retention cap the triggered auto-prune enforces (from the AiConfig retention leaf).
 * @param {Function|null} [options.isAuthorityHeld=null] Optional live authority oracle. When supplied, it is
 * sampled after awaited directory setup and immediately before the append; admitted rows are stamped
 * `heldAtWrite: true`, while a displaced writer is refused. Callers without an oracle retain the legacy row shape.
 * @returns {Promise<String>} The ledger file path written to.
 * @throws {TypeError} when `entry` is not an object or `dir` is missing/empty.
 * @throws {Error} with `reason: 'runtime-authority-lost'` when a supplied oracle reports takeover.
 */
export async function appendHealEvent(entry, {
    dir,
    now,
    triggerBytes,
    maxEvents,
    isAuthorityHeld = null
} = {}) {
    if (!entry || typeof entry !== 'object') {
        throw new TypeError('appendHealEvent: entry object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('appendHealEvent: dir is required');
    }

    const timed = {...entry, at: Number.isFinite(entry.at) ? entry.at : (Number.isFinite(now) ? now : null)};

    await mkdir(dir, {recursive: true});
    const filePath = getHealLedgerFilePath(dir);

    // The caller's entry check cannot bind this write: directory setup above yielded. Sample at the
    // store boundary, with no await before `appendFile`, so a record-only predecessor cannot write
    // an unqualified `status: recorded` row after its successor has taken authority.
    const heldAtWrite = typeof isAuthorityHeld === 'function' ? isAuthorityHeld() === true : null;

    if (heldAtWrite === false) {
        const error = new Error('Authority moved before the heal-event append; refusing.');

        error.reason = 'runtime-authority-lost';

        throw error;
    }

    const stamped = heldAtWrite === null ? timed : {...timed, heldAtWrite};

    await appendFile(filePath, `${JSON.stringify(stamped)}\n`, 'utf8');

    // Self-bound (mirrors acceptedLossAuditStore) ONLY when the AiConfig-aware caller supplied the retention
    // policy — no helper-owned default. An O(1) size stat-gate triggers an amortized prune only once
    // the ledger crosses the byte threshold (not a full read every append). A stat/prune failure must never break
    // the heal path (the ledger is observability, never a gate), so it is swallowed.
    if (Number.isFinite(triggerBytes) && Number.isFinite(maxEvents)) {
        try {
            const {size} = await stat(filePath);
            if (size > triggerBytes) await pruneHealLedger({dir, maxEvents});
        } catch (error) {
            // a partial/failed prune leaves the prior ledger intact; the next append re-tries the gate
        }
    }

    return filePath;
}

/**
 * @summary Reads all heal-event entries (oldest → newest). A MISSING ledger (`ENOENT`) returns `[]` (nothing
 * healed yet); a corrupt LINE is skipped (a partial write must not break the read). But an unreadable/corrupt
 * FILE (`EISDIR`, `EACCES`, …) THROWS — that is a real degradation, not "nothing yet", so the observability
 * boundary sees it (the self-heal snapshot degrades visibly instead of reporting a false-empty 'available'). A
 * heal-path caller that must never be gated by the ledger catches this itself and proceeds fail-safe.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @returns {Promise<Object[]>} The parsed events in append order.
 * @throws when the ledger file exists but is unreadable at the FILE level (any non-`ENOENT` read error).
 */
export async function readHealLedger({dir} = {}) {
    let text;

    try {
        text = await readFile(getHealLedgerFilePath(dir), 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return []; // missing ledger → nothing recorded yet (not a degradation)
        }
        throw error; // unreadable/corrupt storage → surface so the observability boundary degrades visibly
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
 * @param {Number} options.maxEvents Max entries to retain (the AiConfig retention leaf; no helper-owned default).
 * @returns {Promise<{pruned: Number, retained: Number}>} Counts; `pruned: 0` when no prune was needed.
 * @throws {TypeError} when `dir` is missing/empty or `maxEvents` is not a finite, non-negative number.
 */
export async function pruneHealLedger({dir, maxEvents} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('pruneHealLedger: dir is required');
    }
    if (!Number.isFinite(maxEvents) || maxEvents < 0) {
        throw new TypeError(`pruneHealLedger: a finite, non-negative maxEvents is required (the AiConfig retention leaf), got ${maxEvents}`);
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
