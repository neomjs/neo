import {appendFile, mkdir, readFile} from 'fs/promises';
import path                          from 'path';

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
 * `at` from the injected clock when absent so every entry is time-ordered.
 * @param {Object} entry A JSON-serializable heal event (`{type, collection, status, detail, at?}`).
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {Number} [options.now] Epoch ms used to stamp `at` when the entry omits it.
 * @returns {Promise<String>} The ledger file path written to.
 * @throws {TypeError} when `entry` is not an object or `dir` is missing/empty.
 */
export async function appendHealEvent(entry, {dir, now} = {}) {
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
