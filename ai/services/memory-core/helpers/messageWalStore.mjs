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
 * @summary Derives the message WAL directory from the active memory WAL directory.
 * @param {String} memoryWalDir Active `memoryWal.dir`.
 * @returns {String}
 */
export function getMessageWalDir(memoryWalDir) {
    if (!memoryWalDir) {
        throw new TypeError('getMessageWalDir: memoryWalDir is required');
    }

    return path.join(memoryWalDir, 'messages');
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
 * @summary Reads message WAL records from newest segment to oldest, skipping corrupt lines.
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @returns {Promise<Object[]>}
 */
export async function readWalMessages({dir} = {}) {
    if (!dir) {
        throw new TypeError('readWalMessages: dir is required');
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }

    const segmentNames = names
        .filter(name => MESSAGE_WAL_SEGMENT_RE.test(name))
        .sort()
        .reverse();

    const records = [];

    for (const name of segmentNames) {
        const filePath = path.join(dir, name);
        let text;

        try {
            text = await fs.readFile(filePath, 'utf8');
        } catch (e) {
            if (e?.code === 'ENOENT') continue;
            throw e;
        }

        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            try {
                records.push(JSON.parse(line));
            } catch (e) {
                // Torn/corrupt line: skip. A partial append must not make other accepted
                // message records unreadable.
            }
        }
    }

    return records;
}
