import {appendFile, mkdir, readFile, rename, stat, writeFile} from 'fs/promises';
import {writeFileAtomic}                                      from '../../shared/atomicFileWrite.mjs';
import path                                                   from 'path';

/**
 * @module ai/services/memory-core/helpers/acceptedLossAuditStore
 * @summary Durable JSONL audit log for AUTONOMOUS accepted-loss settlements — the observability sink for
 * `decideAcceptedLossSettlement`'s `auto-settle` disposition. Append-only: every autonomous settlement
 * records its `auto-accepted-loss` audit entry (ids + reasons + the shared residue fingerprint) so an
 * operator, when one is present, can review the accepted losses asynchronously — but the system NEVER
 * blocks on a human and there is no ack. This is telemetry, not a gate. Mirrors the `recoveryRunStateStore`
 * JSONL shape: I/O at the edge only, deterministic content. The companion latest-state marker is the
 * machine-readable terminal surface for maintenance tooling: the JSONL is history, the marker is the current
 * accepted-loss outcome. The fingerprint is the auto-reopen key — a later embedding-capability change
 * re-opens the residue, so an audited loss is recorded-and-reversible, not silent.
 */

const AUDIT_FILE_NAME = 'auto-accepted-loss.jsonl',
      STATE_FILE_NAME = 'auto-accepted-loss-state.json';

/**
 * Bounded-retention cap. The audit log is append-only telemetry — operator-review only, with NO functional
 * reader (the auto-reopen is `computeResidueFingerprint`-recompute-driven, not audit-read-driven). So
 * retention is a plain keep-most-recent cap: the newest `MAX_AUTO_ACCEPTED_LOSS_EVENTS` survive a prune,
 * and there is no per-entry state to preserve (unlike the heal-event ledger's frozen-set fold).
 * @type {Number}
 */
const MAX_AUTO_ACCEPTED_LOSS_EVENTS = 2000;

/**
 * Append-time prune trigger. An O(1) size stat is far cheaper than reading the whole log every append, so a
 * prune fires only once the file crosses this threshold — bounding the file with amortized, not per-append,
 * cost. Picked well above the steady-state size (accepted losses are minted rarely).
 *
 * Coupling with `MAX_AUTO_ACCEPTED_LOSS_EVENTS`: this 2 MB trigger assumes entries < ~1 KB, so the byte gate
 * trips at ≈ the 2000-entry cap. If the entry shape grows past ~1 KB the gate trips *before* 2000 entries, so
 * the prune no-ops (count ≤ cap) and each subsequent append pays an O(N) re-read until growth stops — still
 * bounded (the file never exceeds the trigger by more than one entry), a perf not a correctness concern.
 * Keep the two in step if the entry shape grows.
 * @type {Number}
 */
const AUTO_ACCEPTED_LOSS_PRUNE_TRIGGER_BYTES = 2 * 1024 * 1024;

/**
 * @summary The JSONL audit-log path within a state directory.
 * @param {String} dir
 * @returns {String}
 */
export function getAcceptedLossAuditFilePath(dir) {
    return path.join(dir, AUDIT_FILE_NAME);
}

/**
 * @summary The latest accepted-loss state marker path within a state directory.
 * @param {String} dir
 * @returns {String}
 */
export function getAcceptedLossStateFilePath(dir) {
    return path.join(dir, STATE_FILE_NAME);
}

/**
 * @summary Appends one `auto-accepted-loss` audit entry to the durable JSONL log (creating the dir if needed),
 * then self-bounds via an O(1) size stat-gate (see `triggerBytes`).
 * @param {Object} entry The `decideAcceptedLossSettlement` `auditRecord` (or any JSON-serializable record).
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} [options.triggerBytes=AUTO_ACCEPTED_LOSS_PRUNE_TRIGGER_BYTES] Size threshold above which the
 *   append auto-prunes. Injectable so a test can drive the self-bounding gate with a tiny threshold.
 * @param {Number} [options.maxEvents=MAX_AUTO_ACCEPTED_LOSS_EVENTS] Retention cap the triggered auto-prune enforces.
 * @returns {Promise<String>} The audit-log file path written to.
 * @throws {TypeError} when `entry` is not an object or `dir` is missing/empty.
 */
export async function appendAutoAcceptedLoss(entry, {dir, triggerBytes = AUTO_ACCEPTED_LOSS_PRUNE_TRIGGER_BYTES, maxEvents = MAX_AUTO_ACCEPTED_LOSS_EVENTS} = {}) {
    if (!entry || typeof entry !== 'object') {
        throw new TypeError('appendAutoAcceptedLoss: entry object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('appendAutoAcceptedLoss: dir is required');
    }

    await mkdir(dir, {recursive: true});

    const filePath = getAcceptedLossAuditFilePath(dir);
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');

    // Self-bound: an O(1) size stat-gate (not a full read every append) triggers a prune only once the log
    // crosses the byte threshold. A stat/prune failure must never break the settlement path — telemetry,
    // not a gate.
    try {
        const {size} = await stat(filePath);
        if (size > triggerBytes) {
            await pruneAutoAcceptedLossAudit({dir, maxEvents});
        }
    } catch (error) {
        // a partial/failed prune leaves the prior log intact; the next append re-tries the gate
    }

    return filePath;
}

/**
 * @summary Reads all `auto-accepted-loss` audit entries from the durable JSONL log (oldest → newest).
 * A missing log returns `[]` (no settlements recorded yet) — never throws on absence.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @returns {Promise<Object[]>} The parsed audit entries in append order.
 */
export async function readAutoAcceptedLossAudit({dir} = {}) {
    let text;

    try {
        text = await readFile(getAcceptedLossAuditFilePath(dir), 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    const entries = [];
    for (const line of text.split('\n')) {
        if (!line) continue;
        try {
            entries.push(JSON.parse(line));
        } catch (error) {
            // skip a corrupt line — a partial append (or a torn write) must not break the whole audit read
        }
    }
    return entries;
}

/**
 * @summary Writes the latest non-blocking `auto-accepted-loss` state marker atomically.
 * This is the machine-distinguishable terminal state for a settled repair run; it complements the append-only
 * audit log and intentionally does NOT replace the blocking defrag marker that `clearDefragState()` removes.
 * @param {Object} state JSON-serializable latest-state payload.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @returns {Promise<String>} The marker path written.
 * @throws {TypeError} when `state` is not an object or `dir` is missing/empty.
 */
export async function writeAutoAcceptedLossState(state, {dir} = {}) {
    if (!state || typeof state !== 'object') {
        throw new TypeError('writeAutoAcceptedLossState: state object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('writeAutoAcceptedLossState: dir is required');
    }

    await mkdir(dir, {recursive: true});

    const filePath = getAcceptedLossStateFilePath(dir);

    // Was a fixed `${filePath}.tmp`: two audit writers in one process raced the same scratch.
    await writeFileAtomic(filePath, JSON.stringify(state, null, 2) + '\n');

    return filePath;
}

/**
 * @summary Reads the latest accepted-loss state marker. A missing marker returns `null`.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @returns {Promise<Object|null>}
 */
export async function readAutoAcceptedLossState({dir} = {}) {
    let text;

    try {
        text = await readFile(getAcceptedLossStateFilePath(dir), 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return null;
        }
        throw error;
    }

    return JSON.parse(text);
}

/**
 * @summary Prunes the audit log to its most-recent `maxEvents` entries (oldest dropped first), written
 * atomically via a temp file + rename so a concurrent reader never observes a torn log. A no-op when the log
 * is already within the cap, empty, or absent. The audit is telemetry-only (no functional reader; the
 * auto-reopen is fingerprint-recompute-driven), so a plain keep-most-recent cap is correct — there is no
 * per-fingerprint state to preserve, unlike `healEventLedgerStore`'s frozen-set fold.
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} [options.maxEvents=MAX_AUTO_ACCEPTED_LOSS_EVENTS] Max entries to retain.
 * @returns {Promise<{pruned: Number, retained: Number}>} Counts; `pruned: 0` when no prune was needed.
 * @throws {TypeError} when `dir` is missing/empty.
 */
export async function pruneAutoAcceptedLossAudit({dir, maxEvents = MAX_AUTO_ACCEPTED_LOSS_EVENTS} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('pruneAutoAcceptedLossAudit: dir is required');
    }

    const events = await readAutoAcceptedLossAudit({dir});

    if (!Number.isFinite(maxEvents) || maxEvents <= 0 || events.length <= maxEvents) {
        return {pruned: 0, retained: events.length};
    }

    const retained = events.slice(events.length - maxEvents),
          filePath = getAcceptedLossAuditFilePath(dir);

    await writeFileAtomic(filePath, retained.map(entry => JSON.stringify(entry)).join('\n') + '\n');

    return {pruned: events.length - retained.length, retained: retained.length};
}
