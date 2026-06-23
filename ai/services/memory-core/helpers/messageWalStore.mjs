import fs               from 'fs/promises';
import path             from 'path';
import {withAppendLock} from './walAppendLock.mjs';

/**
 * @summary Durable JSONL write-ahead store for accepted A2A mailbox messages.
 *
 * `MailboxService.addMessage` appends the canonical message intent here after all deliberate
 * pre-ack validation has passed and before derived graph projection starts. A graph write, wake
 * pump, or later vector/search failure can leave the record pending, but cannot erase the accepted
 * `MESSAGE:*` id.
 *
 * Message WAL records intentionally live under the existing memory WAL root for this acceptance
 * boundary. That keeps local/test/cloud volume reachability aligned with the proven memory WAL
 * substrate until the dedicated message drain topology promotes its own host-mode config.
 *
 * @module ai/services/memory-core/helpers/messageWalStore
 */

const MESSAGE_WAL_SEGMENT_RE = /^message-wal-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * @summary Names the `messageWal` config leaves missing from a config slice.
 *
 * Mirrors `memoryWal` stale-overlay diagnostics: local `config.mjs` files are materialized
 * template copies, so a deployment whose overlay predates the message WAL drain leaves would
 * otherwise fail later with a generic TypeError. Consumers call this before touching the leaves
 * and fail loud with the exact missing keys plus the config-migration remediation.
 *
 * @param {Object|undefined} messageWal The resolved `messageWal` config slice.
 * @param {String[]} requiredLeaves Leaf names the caller is about to read.
 * @returns {String[]} Missing leaf names; empty when the slice satisfies the caller.
 */
export function getMissingMessageWalLeaves(messageWal, requiredLeaves) {
    if (!messageWal) return [...requiredLeaves];

    return requiredLeaves.filter(leaf => messageWal[leaf] === undefined || messageWal[leaf] === null);
}

/**
 * @summary Derives the UTC-day segment key for a write timestamp.
 * @param {Date|Number} [now=new Date()] Clock source (epoch ms or Date).
 * @returns {String} `YYYY-MM-DD` UTC day key.
 */
export function getMessageWalSegmentKey(now = new Date()) {
    return new Date(now).toISOString().slice(0, 10);
}

/**
 * @summary Builds the message WAL records file name for a segment key.
 * @param {String} segmentKey `YYYY-MM-DD` day key.
 * @returns {String} JSONL records file name.
 */
export function getMessageWalRecordsFileName(segmentKey) {
    return `message-wal-${segmentKey}.jsonl`;
}

/**
 * @summary Builds the graph-projection markers file name for a message WAL segment key.
 * @param {String} segmentKey `YYYY-MM-DD` day key.
 * @returns {String} JSONL graph-projection markers file name.
 */
export function getMessageWalGraphMarkersFileName(segmentKey) {
    return `message-wal-${segmentKey}.graph.jsonl`;
}

/**
 * @summary Appends one accepted A2A message intent to its UTC-day WAL segment.
 * @param {Object} record
 * @param {String} record.id Stable `MESSAGE:*` id.
 * @param {Number} record.timestamp Epoch-ms write time.
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @param {Date|Number} [options.now] Clock source for the segment key.
 * @param {Object} [options.lockOptions] Forwarded to {@link withAppendLock}.
 * @returns {Promise<{filePath: String, segmentKey: String}>}
 */
export async function appendWalMessage(record, {dir, now, lockOptions} = {}) {
    if (!dir) {
        throw new TypeError('appendWalMessage: dir is required');
    }
    if (typeof record?.id !== 'string' || !record.id.startsWith('MESSAGE:')) {
        throw new TypeError('appendWalMessage: record.id must be a MESSAGE:* id');
    }

    await fs.mkdir(dir, {recursive: true});

    const segmentKey = getMessageWalSegmentKey(now ?? record.timestamp ?? new Date());
    const filePath   = path.join(dir, getMessageWalRecordsFileName(segmentKey));
    const line       = `${JSON.stringify({...record, segmentKey})}\n`;

    await withAppendLock(filePath, () => fs.appendFile(filePath, line, 'utf8'), lockOptions);

    return {filePath, segmentKey};
}

/**
 * @summary Appends a graph-projection success marker for one accepted message WAL record.
 *
 * The accepted message JSONL remains the authority. This marker records only that the derived
 * Native Edge Graph projection completed, so drain hosts can retry crash/pending rows
 * idempotently without reprocessing already-converged messages.
 *
 * @param {Object} marker
 * @param {String} marker.id Stable `MESSAGE:*` id.
 * @param {String} marker.segmentKey WAL segment key containing the accepted record.
 * @param {Number} [marker.projectedAt] Epoch-ms projection completion time.
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @returns {Promise<String>} Written markers file path.
 */
export async function appendMessageWalGraphProjectionMarker({id, segmentKey, projectedAt}, {dir} = {}) {
    if (!dir) {
        throw new TypeError('appendMessageWalGraphProjectionMarker: dir is required');
    }
    if (typeof id !== 'string' || !id.startsWith('MESSAGE:') || typeof segmentKey !== 'string' || segmentKey.length === 0) {
        throw new TypeError('appendMessageWalGraphProjectionMarker: id and segmentKey are required');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getMessageWalGraphMarkersFileName(segmentKey));

    await fs.appendFile(filePath, `${JSON.stringify({id, projectedAt: projectedAt ?? Date.now()})}\n`, 'utf8');

    return filePath;
}

/**
 * @summary Parses one JSONL file into entries, skipping corrupt/torn lines.
 * @param {String} filePath JSONL file path.
 * @returns {Promise<Object[]>}
 * @private
 */
async function readJsonlEntries(filePath) {
    let text;

    try {
        text = await fs.readFile(filePath, 'utf8');
    } catch (e) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }

    const entries = [];

    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
            entries.push(JSON.parse(line));
        } catch (e) {
            // Torn/corrupt line: skip. A partial append must not make other accepted
            // message records unreadable.
        }
    }

    return entries;
}

/**
 * @summary Lists message WAL segment keys newest first.
 * @param {String} dir Message WAL directory.
 * @returns {Promise<String[]>}
 * @private
 */
async function listMessageWalSegmentKeys(dir) {
    let names;

    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }

    return names
        .map(name => name.match(MESSAGE_WAL_SEGMENT_RE)?.[1])
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));
}

/**
 * @summary Reads message WAL records from newest segment to oldest, skipping corrupt lines.
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @returns {Promise<Object[]>}
 */
export async function readWalMessages({dir} = {}) {
    if (!dir) {
        throw new TypeError('readWalMessages: dir is required');
    }

    const records = [];

    for (const segmentKey of await listMessageWalSegmentKeys(dir)) {
        records.push(...await readJsonlEntries(path.join(dir, getMessageWalRecordsFileName(segmentKey))));
    }

    return records;
}

/**
 * @summary Reads accepted message WAL records whose graph-projection marker is still absent.
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @param {String[]} [options.ids] Optional targeted record ids.
 * @param {Number} [options.limit] Maximum pending records to return.
 * @returns {Promise<Object[]>} Pending records newest segment first.
 */
export async function readPendingMessageWalRecords({dir, ids, limit} = {}) {
    if (!dir) return [];

    const idFilter = Array.isArray(ids) ? new Set(ids) : null;
    const bounded  = Number.isFinite(limit) && limit > 0 ? limit : Infinity;
    const pending  = [];

    for (const segmentKey of await listMessageWalSegmentKeys(dir)) {
        if (pending.length >= bounded) break;

        const records = await readJsonlEntries(path.join(dir, getMessageWalRecordsFileName(segmentKey)));
        if (records.length === 0) continue;

        const markedIds = new Set(
            (await readJsonlEntries(path.join(dir, getMessageWalGraphMarkersFileName(segmentKey)))).map(entry => entry.id)
        );

        for (const record of records) {
            if (pending.length >= bounded) break;
            if (!record?.id || markedIds.has(record.id)) continue;
            if (record.graphProjectionVersion !== 1) continue;
            if (idFilter && !idFilter.has(record.id)) continue;
            pending.push(record);
        }
    }

    return pending;
}
