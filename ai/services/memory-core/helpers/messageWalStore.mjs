import fs                                  from 'fs/promises';
import path                                from 'path';
import {UNKNOWN_PLANE_ID, isOpaquePlaneId} from '../../../planeConfig.mjs';
import {withAppendLock}                    from './walAppendLock.mjs';

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

const MESSAGE_WAL_SEGMENT_RE    = /^message-wal-(\d{4}-\d{2}-\d{2})\.jsonl$/,
    MESSAGE_WAL_GRAPH_MARKER_RE = /^message-wal-(\d{4}-\d{2}-\d{2})\.graph\.jsonl$/;
const projectionStatsCache = new Map();

/**
 * @summary Normalizes the immutable sender/destination fact stored beside a graph marker.
 *
 * Recipient-cohort knowledge is deliberately not part of this value. Historical broadcasts can
 * have a trustworthy `sentBy` / `to: 'AGENT:*'` route while lacking the later send-time audience
 * snapshot, so route and cohort evidence must remain independently upgradeable.
 *
 * @param {*} value Candidate marker value.
 * @returns {{disposition: 'known', sentBy: String, to: String}|{disposition: 'legacy-unknown'}|null}
 * @private
 */
function normalizeMailboxRoutingMarker(value) {
    if (
        value?.disposition === 'known' &&
        typeof value.sentBy === 'string' && value.sentBy.length > 0 &&
        typeof value.to === 'string' && value.to.length > 0
    ) {
        return {disposition: 'known', sentBy: value.sentBy, to: value.to}
    }

    if (value?.disposition === 'legacy-unknown') {
        return {disposition: 'legacy-unknown'}
    }

    return null
}

/**
 * @summary Normalizes the immutable broadcast-cohort fact stored beside a graph marker.
 *
 * `known` means the accepted WAL carried a send-time audience snapshot, including the valid
 * zero-recipient case. `legacy-unknown` is an explicit compatibility disposition for historical
 * rows that predate that snapshot; it is deliberately distinct from known zero so read-path
 * integrity checks never manufacture recipients or repeatedly parse the same legacy WAL row.
 *
 * @param {*} value Candidate marker value.
 * @returns {{disposition: 'known', intendedRecipientCount: Number}|{disposition: 'legacy-unknown'}|null}
 * @private
 */
function normalizeBroadcastCohortMarker(value) {
    if (value?.disposition === 'known' && Number.isSafeInteger(value.intendedRecipientCount) && value.intendedRecipientCount >= 0) {
        return {disposition: 'known', intendedRecipientCount: value.intendedRecipientCount}
    }

    if (value?.disposition === 'legacy-unknown') {
        return {disposition: 'legacy-unknown'}
    }

    return null
}

/**
 * @summary Merges append-only projection-marker evidence without allowing later weaker facts to
 * downgrade known evidence.
 *
 * The first known fact is authoritative because the initial projection marker is written from the
 * accepted WAL record. A later unknown can never erase it. A later conflicting known fact is kept
 * out of the serving value and surfaced through the conflict set instead of silently winning by
 * file position.
 *
 * @param {Map<String,Object>} factsById Resolved monotonic facts.
 * @param {Set<String>} conflictIds Ids carrying conflicting known facts.
 * @param {String} id Message id.
 * @param {Object|null} incoming Normalized incoming fact.
 * @param {Function} equalKnown Compares two known facts.
 * @returns {void}
 * @private
 */
function mergeProjectionMarkerFact(factsById, conflictIds, id, incoming, equalKnown) {
    if (!incoming) return;

    const current = factsById.get(id);

    if (!current || (current.disposition === 'legacy-unknown' && incoming.disposition === 'known')) {
        factsById.set(id, incoming);
        return
    }

    if (current.disposition === 'known' && incoming.disposition === 'known' && !equalKnown(current, incoming)) {
        conflictIds.add(id);
    }
}

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
 * @param {String} options.planeId Resolved server plane identity; stamped after caller fields.
 * @param {Date|Number} [options.now] Clock source for the segment key.
 * @param {Object} [options.lockOptions] Forwarded to {@link withAppendLock}.
 * @returns {Promise<{filePath: String, segmentKey: String}>}
 */
export async function appendWalMessage(record, {dir, planeId, now, lockOptions} = {}) {
    if (!dir) {
        throw new TypeError('appendWalMessage: dir is required');
    }
    if (typeof record?.id !== 'string' || !record.id.startsWith('MESSAGE:')) {
        throw new TypeError('appendWalMessage: record.id must be a MESSAGE:* id');
    }
    if (!isOpaquePlaneId(planeId)) {
        throw new TypeError('appendWalMessage: planeId must be an opaque resolved plane identity');
    }

    await fs.mkdir(dir, {recursive: true});

    const segmentKey = getMessageWalSegmentKey(now ?? record.timestamp ?? new Date());
    const filePath   = path.join(dir, getMessageWalRecordsFileName(segmentKey));
    // Server provenance is LAST so a caller-owned record.planeId can never spoof the accepting plane.
    const line = `${JSON.stringify({...record, segmentKey, planeId})}\n`;

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
 * @param {Object} [marker.mailboxRouting] Immutable canonical sender/destination fact.
 * @param {Object} [marker.broadcastCohort] Immutable intended-cohort fact for broadcasts.
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @returns {Promise<String>} Written markers file path.
 */
export async function appendMessageWalGraphProjectionMarker({
    id,
    segmentKey,
    projectedAt,
    mailboxRouting,
    broadcastCohort
}, {dir} = {}) {
    if (!dir) {
        throw new TypeError('appendMessageWalGraphProjectionMarker: dir is required');
    }
    if (typeof id !== 'string' || !id.startsWith('MESSAGE:') || typeof segmentKey !== 'string' || segmentKey.length === 0) {
        throw new TypeError('appendMessageWalGraphProjectionMarker: id and segmentKey are required');
    }

    const normalizedMailboxRouting = mailboxRouting === undefined
        ? undefined
        : normalizeMailboxRoutingMarker(mailboxRouting);
    const normalizedBroadcastCohort = broadcastCohort === undefined
        ? undefined
        : normalizeBroadcastCohortMarker(broadcastCohort);

    if (mailboxRouting !== undefined && !normalizedMailboxRouting) {
        throw new TypeError('appendMessageWalGraphProjectionMarker: mailboxRouting must be known with sentBy/to or legacy-unknown');
    }
    if (broadcastCohort !== undefined && !normalizedBroadcastCohort) {
        throw new TypeError('appendMessageWalGraphProjectionMarker: broadcastCohort must be known with a non-negative integer count or legacy-unknown');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getMessageWalGraphMarkersFileName(segmentKey));

    const marker = {
        id,
        projectedAt: projectedAt ?? Date.now(),
        ...(normalizedMailboxRouting ? {mailboxRouting: normalizedMailboxRouting} : {}),
        ...(normalizedBroadcastCohort ? {broadcastCohort: normalizedBroadcastCohort} : {})
    };

    await fs.appendFile(filePath, `${JSON.stringify(marker)}\n`, 'utf8');

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
 * @summary Surfaces absent or invalid historical provenance as the explicit read-side `unknown` sentinel.
 *
 * This is a read projection only; legacy files stay untouched. A valid stamped identity is returned
 * unchanged so drains and repair paths preserve the accepted-write evidence.
 * @param {Object} record Parsed message WAL record.
 * @returns {Object} Record with a usable `planeId` or `unknown`.
 */
function surfaceWalPlaneProvenance(record) {
    return isOpaquePlaneId(record?.planeId) ? record : {...record, planeId: UNKNOWN_PLANE_ID}
}

/**
 * @summary Strictly parses one message JSONL payload for parity evidence.
 *
 * Serving readers skip torn lines; demotion evidence refuses them because an unreadable row cannot be
 * proven older than the cutover window or unrelated to the overlay.
 * @param {String} filePath JSONL payload path.
 * @returns {Promise<Object>} `{ok, records}` or `{ok:false, reason}`.
 */
async function readJsonlEntriesStrict(filePath) {
    let text;

    try {
        text = await fs.readFile(filePath, 'utf8');
    } catch (e) {
        return {ok: false, reason: `${filePath}: ${e?.message || String(e)}`}
    }

    const records = [];

    for (const [index, rawLine] of text.split('\n').entries()) {
        if (!rawLine.trim()) continue;

        try {
            records.push(surfaceWalPlaneProvenance(JSON.parse(rawLine)));
        } catch (e) {
            return {
                ok    : false,
                reason: `${filePath}: line ${index + 1} is not valid JSON (${e?.message || String(e)})`
            }
        }
    }

    return {ok: true, records}
}

/**
 * @summary Builds a cacheable signature for graph-projection marker files.
 * @param {String} dir Message WAL directory.
 * @param {String[]} segmentKeys Segment keys newest first.
 * @returns {Promise<Object[]>}
 * @private
 */
async function getGraphMarkerFileStats(dir, segmentKeys) {
    const stats = [];

    for (const segmentKey of segmentKeys) {
        const filePath = path.join(dir, getMessageWalGraphMarkersFileName(segmentKey));

        try {
            const stat = await fs.stat(filePath);
            stats.push({
                filePath,
                segmentKey,
                signature: `${segmentKey}:${stat.size}:${stat.mtimeMs}`
            });
        } catch (e) {
            if (e?.code === 'ENOENT') continue;
            throw e;
        }
    }

    return stats;
}

/**
 * @summary Builds change-sensitive signatures for accepted-message payload segments.
 *
 * Read-path repair uses these signatures only to bound retries for an unreadable indexed record.
 * File kind is included so replacing an accidental directory with the expected JSONL file wakes a
 * deferred candidate immediately, even if coarse filesystem timestamps happen to coincide.
 *
 * @param {String} dir Message WAL directory.
 * @param {String[]} segmentKeys Segment keys newest first.
 * @returns {Promise<Map<String,String>>}
 * @private
 */
async function getPayloadSignaturesBySegment(dir, segmentKeys) {
    const signatures = new Map();

    for (const segmentKey of segmentKeys) {
        const filePath = path.join(dir, getMessageWalRecordsFileName(segmentKey));

        try {
            const stat = await fs.stat(filePath);
            signatures.set(segmentKey, [
                stat.isFile() ? 'file' : 'non-file',
                stat.dev,
                stat.ino,
                stat.size,
                stat.mtimeMs
            ].join(':'));
        } catch (e) {
            signatures.set(segmentKey, `unavailable:${e?.code || 'unknown'}`);
        }
    }

    return signatures
}

/**
 * @summary Lists the union of accepted-payload and graph-marker segment keys newest first.
 *
 * Graph markers remain the durable projected-id index even when a payload segment is temporarily
 * missing or unreadable. Deriving this population from payload names alone made those ids vanish
 * as false-healthy before the unreadable-candidate boundary could observe them.
 *
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
        .map(name => name.match(MESSAGE_WAL_SEGMENT_RE)?.[1] || name.match(MESSAGE_WAL_GRAPH_MARKER_RE)?.[1])
        .filter(Boolean)
        .filter((segmentKey, index, keys) => keys.indexOf(segmentKey) === index)
        .sort((a, b) => b.localeCompare(a));
}

/**
 * @summary Strictly enumerates message WAL payload segments with normalized plane provenance.
 *
 * This is the Message WAL store's half of the pilot demotion evidence producer. It owns the canonical
 * file grammar, keeps message and memory families distinct, and refuses malformed payload rows.
 * @param {Object} options
 * @param {String} options.dir Directory for message WAL payload segments.
 * @returns {Promise<Object>} `{ok, segments}` or `{ok:false, reason}`.
 */
export async function readMessageWalProvenanceSegments({dir} = {}) {
    if (!dir) {
        return {ok: false, reason: 'readMessageWalProvenanceSegments: dir is required'}
    }

    const segments = [];

    for (const segmentKey of await listMessageWalSegmentKeys(dir)) {
        const segmentId = getMessageWalRecordsFileName(segmentKey),
              parsed    = await readJsonlEntriesStrict(path.join(dir, segmentId));

        if (!parsed.ok) return parsed;

        segments.push({segmentId, segmentKey, records: parsed.records});
    }

    return {ok: true, segments}
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
        records.push(...(await readJsonlEntries(path.join(dir, getMessageWalRecordsFileName(segmentKey))))
            .map(surfaceWalPlaneProvenance));
    }

    return records;
}

/**
 * @summary Reads the graph-projection marker index for accepted message WAL records.
 *
 * The marker index is deliberately smaller than the accepted-message WAL and is safe to consult
 * from read-path repair gates. It lets callers detect graph/WAL divergence or locate a targeted
 * message id without parsing every accepted message record on the common path.
 *
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @returns {Promise<{projectedCount: Number, projectedIds: Set<String>, segmentById: Map<String,String>, mailboxRoutingById: Map<String,Object>, broadcastCohortById: Map<String,Object>, markerConflicts: Object, payloadSignatureBySegment: Map<String,String>}>}
 */
export async function getMessageWalGraphProjectionStats({dir} = {}) {
    if (!dir) {
        throw new TypeError('getMessageWalGraphProjectionStats: dir is required');
    }

    const segmentKeys               = await listMessageWalSegmentKeys(dir);
    const markerStats               = await getGraphMarkerFileStats(dir, segmentKeys);
    const payloadSignatureBySegment = await getPayloadSignaturesBySegment(dir, segmentKeys);
    const signature                 = [
        ...markerStats.map(item => item.signature),
        ...[...payloadSignatureBySegment].map(([segmentKey, value]) => `payload:${segmentKey}:${value}`)
    ].join('|');
    const cached = projectionStatsCache.get(dir);

    if (cached?.signature === signature) {
        return cached.stats;
    }

    const segmentById       = new Map(),
        mailboxRoutingById  = new Map(),
        broadcastCohortById = new Map(),
        markerConflicts     = {
            mailboxRoutingIds : new Set(),
            broadcastCohortIds: new Set()
        };

    for (const {filePath, segmentKey} of markerStats) {
        for (const entry of await readJsonlEntries(filePath)) {
            const id            = entry?.id,
                mailboxRouting  = normalizeMailboxRoutingMarker(entry?.mailboxRouting),
                broadcastCohort = normalizeBroadcastCohortMarker(entry?.broadcastCohort);

            if (typeof id === 'string' && id.startsWith('MESSAGE:') && !segmentById.has(id)) {
                segmentById.set(id, segmentKey);
            }
            if (typeof id === 'string' && id.startsWith('MESSAGE:')) {
                mergeProjectionMarkerFact(
                    mailboxRoutingById,
                    markerConflicts.mailboxRoutingIds,
                    id,
                    mailboxRouting,
                    (current, incoming) => current.sentBy === incoming.sentBy && current.to === incoming.to
                );
                mergeProjectionMarkerFact(
                    broadcastCohortById,
                    markerConflicts.broadcastCohortIds,
                    id,
                    broadcastCohort,
                    (current, incoming) => current.intendedRecipientCount === incoming.intendedRecipientCount
                );
            }
        }
    }

    const stats = {
        projectedCount: segmentById.size,
        projectedIds  : new Set(segmentById.keys()),
        segmentById,
        mailboxRoutingById,
        broadcastCohortById,
        markerConflicts,
        payloadSignatureBySegment
    };

    projectionStatsCache.set(dir, {signature, stats});

    return stats;
}

/**
 * @summary Reads accepted message WAL records for specific ids only.
 *
 * Targeted read-path repair uses graph-projection markers as the id -> segment index, then opens
 * only the segment(s) containing the requested ids. This avoids pulling the full deployment-age
 * WAL when `getMessage` needs to rebuild one damaged MESSAGE projection.
 *
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @param {String[]} options.ids Message ids to read.
 * @param {Number} [options.limit] Maximum matching records to return.
 * @returns {Promise<Object[]>}
 */
export async function readWalMessagesByIds({dir, ids, limit} = {}) {
    if (!dir) {
        throw new TypeError('readWalMessagesByIds: dir is required');
    }

    if (!Array.isArray(ids) || ids.length === 0) return [];

    const idFilter      = new Set(ids.filter(id => typeof id === 'string' && id.startsWith('MESSAGE:')));
    const bounded       = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : Infinity;
    const records       = [];
    const {segmentById} = await getMessageWalGraphProjectionStats({dir});
    const idsBySegment  = new Map();

    for (const id of idFilter) {
        const segmentKey = segmentById.get(id);

        if (!segmentKey) continue;
        if (!idsBySegment.has(segmentKey)) {
            idsBySegment.set(segmentKey, new Set());
        }
        idsBySegment.get(segmentKey).add(id);
    }

    for (const [segmentKey, segmentIds] of idsBySegment) {
        if (records.length >= bounded) break;

        const segmentRecords = (await readJsonlEntries(path.join(dir, getMessageWalRecordsFileName(segmentKey))))
            .map(surfaceWalPlaneProvenance);

        for (const record of segmentRecords) {
            if (records.length >= bounded) break;
            if (record?.graphProjectionVersion !== 1) continue;
            if (segmentIds.has(record.id)) {
                records.push(record);
            }
        }
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

        const records = (await readJsonlEntries(path.join(dir, getMessageWalRecordsFileName(segmentKey))))
            .map(surfaceWalPlaneProvenance);
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
