import {mkdir, readFile, writeFile} from 'fs/promises';
import path                         from 'path';

/**
 * @module ai/services/memory-core/helpers/freezeRecordStore
 * @summary Durable, mutable freeze-STATE store for the autonomous freeze → re-probe → auto-unfreeze cycle.
 * Keyed by collection name, it remembers WHICH collections the actuator has frozen, the fault fingerprint each
 * was frozen for, and the mutable re-probe bookkeeping (`unfreezeAttempts`, `lastProbeAt`) that
 * `decideFreezeReprobe` consumes to drive the bounded back-off + anti-thrash cap. A single small JSON map under
 * the gitignored `.neo-ai-data` tree (read-modify-write the whole map — the frozen set is tiny). Fail-safe: a
 * missing or corrupt file reads as an empty set, never crashing the recovery loop.
 *
 * This is OPERATIONAL state (mutable, keyed), distinct from the append-only heal-event ledger (the telemetry
 * sink an operator reviews asynchronously): a freeze is recorded here so the re-probe loop can find it and
 * decide unfreeze-vs-stay; the ledger separately records the freeze/unfreeze EVENTS. Mirrors the
 * `kbEmbeddingResumeStore` fail-safe shape: I/O at the edge only, deterministic content.
 */

const FREEZE_RECORDS_FILENAME = 'freeze-records.json';

/**
 * @summary The freeze-records JSON path within a state directory.
 * @param {String} dir
 * @returns {String}
 */
export function getFreezeRecordsFilePath(dir) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getFreezeRecordsFilePath: dir is required');
    }
    return path.join(dir, FREEZE_RECORDS_FILENAME);
}

/**
 * @summary Reads the full freeze-record map (`{[collectionName]: record}`), or `{}` if none / unreadable
 * (fail-safe → an empty frozen set, never a crash).
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @returns {Promise<Object>} The keyed freeze-record map.
 */
export async function readFreezeRecords({dir} = {}) {
    let raw;

    try {
        raw = await readFile(getFreezeRecordsFilePath(dir), 'utf8');
    } catch (error) {
        return {}; // ENOENT or any unreadable marker degrades to an empty set
    }

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {}; // a corrupt map must not crash the recovery loop
    }
}

/**
 * @summary Reads one collection's freeze-record, or `null` if it is not frozen.
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @param {String} options.collectionName
 * @returns {Promise<Object|null>}
 */
export async function getFreezeRecord({dir, collectionName} = {}) {
    if (typeof collectionName !== 'string' || collectionName.length === 0) {
        return null;
    }
    const records = await readFreezeRecords({dir});
    return Object.hasOwn(records, collectionName) ? records[collectionName] : null;
}

/**
 * @summary Inserts or updates one collection's freeze-record (records a freeze, or bumps the re-probe
 * bookkeeping after a probe tick). Merges onto any existing record so a partial update preserves prior fields.
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @param {String} options.collectionName The frozen collection (the map key).
 * @param {String} [options.faultFingerprint] The fault the collection was frozen for.
 * @param {Number} [options.frozenAt] Epoch ms the freeze was first recorded (preserved across updates).
 * @param {Number} [options.unfreezeAttempts] Auto-unfreeze attempts so far (the anti-thrash counter).
 * @param {Number} [options.lastProbeAt] Epoch ms of the last re-probe (the back-off clock).
 * @returns {Promise<Object>} The written record.
 */
export async function upsertFreezeRecord({dir, collectionName, faultFingerprint, frozenAt, unfreezeAttempts, lastProbeAt} = {}) {
    if (typeof collectionName !== 'string' || collectionName.length === 0) {
        throw new TypeError('upsertFreezeRecord: collectionName is required');
    }

    const records  = await readFreezeRecords({dir}),
          existing = Object.hasOwn(records, collectionName) && records[collectionName] && typeof records[collectionName] === 'object'
              ? records[collectionName] : {},
          merged   = {
              ...existing,
              collectionName,
              ...(faultFingerprint !== undefined ? {faultFingerprint} : {}),
              ...(frozenAt         !== undefined ? {frozenAt}         : {}),
              ...(unfreezeAttempts !== undefined ? {unfreezeAttempts} : {}),
              ...(lastProbeAt      !== undefined ? {lastProbeAt}      : {})
          };

    records[collectionName] = merged;

    await mkdir(dir, {recursive: true});
    await writeFile(getFreezeRecordsFilePath(dir), `${JSON.stringify(records, null, 2)}\n`, 'utf8');

    return merged;
}

/**
 * @summary Removes one collection's freeze-record (on a successful unfreeze + re-heal). A no-op if absent.
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @param {String} options.collectionName
 * @returns {Promise<Boolean>} True if a record was removed.
 */
export async function removeFreezeRecord({dir, collectionName} = {}) {
    if (typeof collectionName !== 'string' || collectionName.length === 0) {
        return false;
    }

    const records = await readFreezeRecords({dir});

    if (!Object.hasOwn(records, collectionName)) {
        return false;
    }

    delete records[collectionName];

    await mkdir(dir, {recursive: true});
    await writeFile(getFreezeRecordsFilePath(dir), `${JSON.stringify(records, null, 2)}\n`, 'utf8');

    return true;
}
