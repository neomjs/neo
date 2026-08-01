import fs                                  from 'fs/promises';
import path                                from 'path';
import {UNKNOWN_PLANE_ID, isOpaquePlaneId} from '../../../planeConfig.mjs';
import {withAppendLock}                    from './walAppendLock.mjs';

/**
 * @summary Durable JSONL write-ahead store for `add_memory` payloads.
 *
 * The per-turn save (AGENTS.md §critical_gates #5) must never fail or stall on the model-dependent
 * Chroma embed. `MemoryService.addMemory` therefore appends the FULL turn payload here — a local,
 * append-only filesystem write, the most reliable write available — BEFORE returning, and the embed
 * happens asynchronously afterwards (Phase 1: a transitional fire-and-forget in-process; Phase 2:
 * the orchestrator-managed `ai/daemons/embed/` drain daemon). A crash, embed failure, or stalled
 * embedding model never loses the payload: it stays pending in the WAL until an embed pass succeeds.
 *
 * ## File layout (two files per UTC-day segment, one writer at a time)
 *
 * - `wal-YYYY-MM-DD.jsonl`          — memory records; written by the MCP-server process(es).
 * - `wal-YYYY-MM-DD.embedded.jsonl` — embed markers; written only by the embedder of the era
 *                                     (Phase 1: the server's deferred embed; Phase 2: the daemon).
 *
 * Records and markers are deliberately split into separate files instead of one shared append
 * stream: POSIX `O_APPEND` atomicity is only dependable for small writes, and memory records
 * (multi-KB `thought` payloads) appended concurrently with tiny markers from a second process could
 * interleave. For a per-clone dir, one writer per file removes the interleave class by construction;
 * for a SHARED dir (multiple harness clones draining through one embedder),
 * {@link module:ai/services/memory-core/helpers/walAppendLock} serializes the record writers across
 * processes to preserve the same no-interleave guarantee — best-effort, never blocking the never-fail
 * `add_memory` turn-save.
 * A record is "pending" when its id has no marker; a segment is "reconciled" when no record in it
 * is pending. Reads tolerate corrupt lines (skip, never throw) — sibling discipline to
 * {@link module:ai/services/memory-core/helpers/remRunStateStore}.
 *
 * @module ai/services/memory-core/helpers/memoryWalStore
 */

const SEGMENT_RE = /^wal-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * @summary Classifies the observable embed-drain backlog using the shared stall threshold.
 *
 * This is the single state definition consumed by both the orchestrator watchdog and the Memory
 * Core health envelope. Keeping the threshold comparison here prevents a green MCP healthcheck and
 * a failed watchdog from describing the same backlog differently. A read failure is explicit
 * `unobservable`, never a reassuring `caught-up`; a non-empty backlog only becomes `stalled` after
 * its oldest measurable record strictly exceeds the configured threshold.
 *
 * @param {Object} options
 * @param {Boolean} options.observable Whether the WAL backlog was measured successfully.
 * @param {Number|null} options.pendingDrainDepth Count of records awaiting an embed marker.
 * @param {Number|null} options.oldestPendingAgeMs Age of the oldest pending record.
 * @param {Number} options.stallThresholdMs Configured stall threshold; `<= 0` disables stall classification.
 * @returns {'caught-up'|'pending'|'stalled'|'unobservable'}
 */
export function classifyMemoryWalDrain({
    observable,
    pendingDrainDepth,
    oldestPendingAgeMs,
    stallThresholdMs
} = {}) {
    if (observable !== true || !Number.isInteger(pendingDrainDepth) || pendingDrainDepth < 0) {
        return 'unobservable'
    }

    if (pendingDrainDepth === 0) {
        return 'caught-up'
    }

    if (
        Number.isFinite(stallThresholdMs) && stallThresholdMs > 0 &&
        Number.isFinite(oldestPendingAgeMs) && oldestPendingAgeMs > stallThresholdMs
    ) {
        return 'stalled'
    }

    return 'pending'
}

/**
 * @summary Names the `memoryWal` config leaves missing from a config slice.
 *
 * The stale-overlay guard: gitignored `config.mjs` files are MATERIALIZED copies of
 * `config.template.mjs` (reconciled via `ai/scripts/setup/initServerConfigs.mjs
 * --migrate-config`), so a deployment whose overlay predates the `memoryWal` block — or this
 * block's daemon leaves — resolves them as `undefined` at runtime. Consumers
 * (`MemoryService.addMemory`, `ai/daemons/embed/daemon.mjs`) call this BEFORE touching the
 * leaves and fail loud with the remediation, naming exactly what is missing. Deliberately no
 * hidden fallbacks: fabricating a default `dir` here would silently split the WAL across two
 * directories — the config provider owns defaults, via the template.
 *
 * Pure function over a plain slice — unit-testable without reading or mutating the shared
 * AiConfig singleton (the B4 shared-singleton write ban).
 *
 * @param {Object|undefined} memoryWal The resolved `memoryWal` config slice (may be absent entirely).
 * @param {String[]} requiredLeaves Leaf names the calling consumer is about to read.
 * @returns {String[]} Missing leaf names; empty array when the slice satisfies the consumer.
 */
export function getMissingMemoryWalLeaves(memoryWal, requiredLeaves) {
    if (!memoryWal) return [...requiredLeaves];

    return requiredLeaves.filter(leaf => memoryWal[leaf] === undefined || memoryWal[leaf] === null);
}

/**
 * @summary Derives the UTC-day segment key for a write timestamp.
 *
 * Date-keyed segments rotate naturally without any cross-process coordination, and their names
 * sort lexicographically === chronologically, which `readPendingWalRecords` relies on.
 *
 * @param {Date|Number} [now=new Date()] Clock source (epoch ms or Date).
 * @returns {String} `YYYY-MM-DD` UTC day key.
 */
export function getWalSegmentKey(now = new Date()) {
    return new Date(now).toISOString().slice(0, 10);
}

/**
 * @summary Builds the records file name for a segment key.
 * @param {String} segmentKey `YYYY-MM-DD` day key.
 * @returns {String} JSONL records file name.
 */
export function getWalRecordsFileName(segmentKey) {
    return `wal-${segmentKey}.jsonl`;
}

/**
 * @summary Builds the embed-markers file name for a segment key.
 * @param {String} segmentKey `YYYY-MM-DD` day key.
 * @returns {String} JSONL markers file name.
 */
export function getWalMarkersFileName(segmentKey) {
    return `wal-${segmentKey}.embedded.jsonl`;
}

/**
 * @summary Builds the graph-projection markers file name for a segment key.
 * @param {String} segmentKey `YYYY-MM-DD` day key.
 * @returns {String} JSONL graph-projection markers file name.
 */
export function getWalGraphMarkersFileName(segmentKey) {
    return `wal-${segmentKey}.graph.jsonl`;
}

/**
 * @summary Appends one memory record to its UTC-day WAL segment. The durable write `addMemory`
 * awaits BEFORE any model-dependent work — this returning is what makes the turn save crash-safe.
 *
 * @param {Object} record
 * @param {String} record.id        Memory UUID (= Chroma document id = graph node id).
 * @param {Number} record.timestamp Epoch-ms write time.
 * @param {Object} record.metadata  The FULL Chroma metadata payload (prompt/thought/response/...).
 * @param {String} record.document  The combined text the embedder will index.
 * @param {Object} options
 * @param {String} options.dir Directory for WAL segment files.
 * @param {String} options.planeId Resolved server plane identity; stamped after caller fields.
 * @param {Date|Number} [options.now] Clock source for the segment key (defaults to record.timestamp).
 * @param {Object} [options.lockOptions] Forwarded to {@link withAppendLock} (tuning + spec injection of
 *     fs/clock/liveness/sleep). Omit for the default per-append serialization.
 * @returns {Promise<{filePath: String, segmentKey: String}>}
 */
export async function appendWalMemory(record, {dir, planeId, now, lockOptions} = {}) {
    if (!dir) {
        throw new TypeError('appendWalMemory: dir is required');
    }
    if (typeof record?.id !== 'string' || record.id.length === 0) {
        throw new TypeError('appendWalMemory: record.id is required');
    }
    if (!isOpaquePlaneId(planeId)) {
        throw new TypeError('appendWalMemory: planeId must be an opaque resolved plane identity');
    }

    await fs.mkdir(dir, {recursive: true});

    const segmentKey = getWalSegmentKey(now ?? record.timestamp ?? new Date());
    const filePath   = path.join(dir, getWalRecordsFileName(segmentKey));
    // Server provenance is LAST so a caller-owned record.planeId can never spoof the accepting plane.
    const line = `${JSON.stringify({...record, segmentKey, planeId})}\n`;

    // Serialize cross-process writers so a SHARED WAL dir cannot interleave multi-KB records; on a
    // bounded acquire-timeout it falls through and writes UNLOCKED, so the never-fail turn-save
    // (§critical_gates #5) is never blocked by a contended/hung lock.
    await withAppendLock(filePath, () => fs.appendFile(filePath, line, 'utf8'), lockOptions);

    return {filePath, segmentKey};
}

/**
 * @summary Appends an embed-success marker for one record. A marked record is no longer pending;
 * its WAL copy only awaits segment pruning.
 *
 * @param {Object} marker
 * @param {String} marker.id         Memory UUID the embed succeeded for.
 * @param {String} marker.segmentKey Segment key the record was written under.
 * @param {Number} [marker.embeddedAt] Epoch-ms embed completion time.
 * @param {Object} options
 * @param {String} options.dir Directory for WAL segment files.
 * @returns {Promise<String>} Written markers file path.
 */
export async function appendWalEmbedMarker({id, segmentKey, embeddedAt}, {dir} = {}) {
    if (!dir) {
        throw new TypeError('appendWalEmbedMarker: dir is required');
    }
    if (typeof id !== 'string' || id.length === 0 || typeof segmentKey !== 'string' || segmentKey.length === 0) {
        throw new TypeError('appendWalEmbedMarker: id and segmentKey are required');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getWalMarkersFileName(segmentKey));

    await fs.appendFile(filePath, `${JSON.stringify({id, embeddedAt: embeddedAt ?? Date.now()})}\n`, 'utf8');

    return filePath;
}

/**
 * @summary Appends a graph-projection success marker for one WAL record.
 *
 * Separate from the embed marker by design: Chroma reconciliation and graph projection are two
 * different derived states. A record may be embedded while graph projection is still pending, so
 * recency overlays and retention must not rely on the embed marker as graph evidence.
 *
 * @param {Object} marker
 * @param {String} marker.id          Memory UUID the graph projection succeeded for.
 * @param {String} marker.segmentKey  Segment key the record was written under.
 * @param {Number} [marker.projectedAt] Epoch-ms projection completion time.
 * @param {Object} options
 * @param {String} options.dir Directory for WAL segment files.
 * @returns {Promise<String>} Written markers file path.
 */
export async function appendWalGraphProjectionMarker({id, segmentKey, projectedAt}, {dir} = {}) {
    if (!dir) {
        throw new TypeError('appendWalGraphProjectionMarker: dir is required');
    }
    if (typeof id !== 'string' || id.length === 0 || typeof segmentKey !== 'string' || segmentKey.length === 0) {
        throw new TypeError('appendWalGraphProjectionMarker: id and segmentKey are required');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getWalGraphMarkersFileName(segmentKey));

    await fs.appendFile(filePath, `${JSON.stringify({id, projectedAt: projectedAt ?? Date.now()})}\n`, 'utf8');

    return filePath;
}

/**
 * @summary Parses one JSONL file into entries, skipping corrupt lines.
 *
 * Corruption tolerance is load-bearing: a torn final line (crash mid-append) must cost exactly
 * that line, never the read path — the WAL backs both the embed drain and the recency-recall
 * content fallback.
 *
 * @param {String} filePath JSONL file path.
 * @returns {Promise<Object[]>} Parsed entries; `[]` when the file does not exist.
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
            // Torn/corrupt line: skip — the WAL read path must never throw on partial appends.
        }
    }

    return entries;
}

/**
 * @summary Surfaces absent or invalid historical provenance as the explicit read-side `unknown` sentinel.
 *
 * No durable row is rewritten. Current valid provenance is preserved byte-for-byte in the returned object;
 * only rows whose writer cannot be attributed receive the sentinel in memory.
 * @param {Object} record Parsed WAL record.
 * @returns {Object} Record with a usable `planeId` or `unknown`.
 */
function surfaceWalPlaneProvenance(record) {
    return isOpaquePlaneId(record?.planeId) ? record : {...record, planeId: UNKNOWN_PLANE_ID}
}

/**
 * @summary Strictly parses one JSONL payload file for parity evidence.
 *
 * Operational readers deliberately skip torn rows so serving remains available. A demotion proof cannot:
 * an unreadable row may be the overlay write under investigation, so this evidence reader refuses the
 * whole segment on the first malformed line.
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
 * @summary Lists segment keys present in the WAL directory, newest first.
 * @param {String} dir Directory for WAL segment files.
 * @returns {Promise<String[]>} Sorted segment keys (lexicographic desc === chronological desc).
 */
async function listWalSegmentKeys(dir) {
    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }

    return names
        .map(name => name.match(SEGMENT_RE)?.[1])
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));
}

/**
 * @summary Strictly enumerates memory WAL payload segments with normalized plane provenance.
 *
 * This is the Memory WAL store's evidence-producing boundary for pilot demotion. Segment identities are
 * canonical payload file names, never inferred checkout paths, and malformed rows fail the scan closed.
 * @param {Object} options
 * @param {String} options.dir Directory for memory WAL payload segments.
 * @returns {Promise<Object>} `{ok, segments}` or `{ok:false, reason}`.
 */
export async function readMemoryWalProvenanceSegments({dir} = {}) {
    if (!dir) {
        return {ok: false, reason: 'readMemoryWalProvenanceSegments: dir is required'}
    }

    const segments = [];

    for (const segmentKey of await listWalSegmentKeys(dir)) {
        const segmentId = getWalRecordsFileName(segmentKey),
              parsed    = await readJsonlEntriesStrict(path.join(dir, segmentId));

        if (!parsed.ok) return parsed;

        segments.push({segmentId, segmentKey, records: parsed.records});
    }

    return {ok: true, segments}
}

/**
 * @summary Reads the reconciliation-marked ids for ONE segment — a positive observation.
 *
 * Exists because "not in the pending set" is ambiguous: it is true both for a record that
 * reconciled AND for a record that is not in the WAL at all. Deriving a caller-visible
 * "your write is queryable" claim from that absence fails OPEN — an unobserved record would be
 * reported as reconciled. This answers the question positively instead, so the claim rests on a
 * marker that was actually read.
 *
 * Markers are per-segment (`appendWalEmbedMarker` / `appendWalGraphProjectionMarker` both carry the
 * record's `segmentKey`), so the lookup is segment-scoped by construction.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for WAL segment files.
 * @param {String} options.segmentKey Segment whose marker stream is read.
 * @param {String} [options.markerType='embed'] Marker stream: `'embed'` or `'graph'`.
 * @returns {Promise<Set<String>>} Marked record ids; empty when the segment has no marker file.
 */
export async function readWalMarkedIds({dir, segmentKey, markerType = 'embed'} = {}) {
    if (!dir || !segmentKey) return new Set();

    const markerFileName = markerType === 'graph' ? getWalGraphMarkersFileName : getWalMarkersFileName;

    return new Set(
        (await readJsonlEntries(path.join(dir, markerFileName(segmentKey))))
            .map(entry => entry.id)
            .filter(Boolean)
    )
}

/**
 * @summary Reads pending (appended but not yet embed-marked) WAL records, newest segment first.
 *
 * Serves two consumers: the embed drain (Phase 1 deferred embed / Phase 2 daemon) reading the
 * backlog, and `MemoryService`'s recency-hydration fallback reading specific ids whose content is
 * not yet in Chroma — the pending-overlay that keeps `query_recent_turns` content-complete while
 * the embed is deferred or failing.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for WAL segment files.
 * @param {String[]} [options.ids] When given, only records with these ids are returned.
 * @param {Number} [options.limit] Maximum records to return (applied after the ids filter).
 * @param {String} [options.markerType='embed'] Reconciliation marker stream: `'embed'` or `'graph'`;
 *   graph-marker reads only treat versioned graph-projection records as pending work.
 * @returns {Promise<Object[]>} Pending records (each carries its `segmentKey`), newest segment first.
 */
export async function readPendingWalRecords({dir, ids, limit, markerType = 'embed'} = {}) {
    if (!dir) return [];

    const idFilter = Array.isArray(ids) ? new Set(ids) : null;
    const bounded  = Number.isFinite(limit) && limit > 0 ? limit : Infinity;
    const pending  = [];

    for (const segmentKey of await listWalSegmentKeys(dir)) {
        if (pending.length >= bounded) break;

        const records = (await readJsonlEntries(path.join(dir, getWalRecordsFileName(segmentKey))))
            .map(surfaceWalPlaneProvenance);
        if (records.length === 0) continue;

        // Same marker read the per-write disclosure uses, so "pending" here and "reconciled" there
        // can never disagree about one record.
        const markedIds = await readWalMarkedIds({dir, segmentKey, markerType});

        for (const record of records) {
            if (pending.length >= bounded) break;
            if (!record?.id || markedIds.has(record.id)) continue;
            if (markerType === 'graph' && record.graphProjectionVersion !== 1) continue;
            if (idFilter && !idFilter.has(record.id)) continue;
            pending.push(record);
        }
    }

    return pending;
}

/**
 * @summary Removes fully-reconciled, non-active WAL segments beyond a retention bound.
 *
 * Write-side retention (sibling discipline to `pruneRemRunStates`): bounding on append keeps both
 * the directory file count and the read-path fan-out from growing with deployment age. Segments
 * with ANY pending record are never removed — the WAL is a durability buffer first, a log second;
 * pruning must never lose an un-embedded payload. The active segment is excluded so the file the
 * server is currently appending to is never deleted underneath it.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for WAL segment files.
 * @param {Number} options.retentionLimit Maximum reconciled segments to retain; older ones are removed.
 *   Non-positive / non-finite values disable pruning (no-op).
 * @param {String} [options.activeSegmentKey] Segment key currently being written; always retained.
 * @returns {Promise<Number>} Count of removed segments.
 */
export async function pruneReconciledWalSegments({dir, retentionLimit, activeSegmentKey} = {}) {
    if (!dir || !Number.isFinite(retentionLimit) || retentionLimit <= 0) {
        return 0;
    }

    const reconciled = [];

    for (const segmentKey of await listWalSegmentKeys(dir)) {
        if (segmentKey === activeSegmentKey) continue;

        const records = await readJsonlEntries(path.join(dir, getWalRecordsFileName(segmentKey)));
        const marked  = new Set(
            (await readJsonlEntries(path.join(dir, getWalMarkersFileName(segmentKey)))).map(entry => entry.id)
        );
        const graphMarked = new Set(
            (await readJsonlEntries(path.join(dir, getWalGraphMarkersFileName(segmentKey)))).map(entry => entry.id)
        );

        if (records.every(record =>
            record?.id &&
            marked.has(record.id) &&
            (record.graphProjectionVersion !== 1 || graphMarked.has(record.id))
        )) {
            reconciled.push(segmentKey);
        }
    }

    // listWalSegmentKeys returns newest-first; everything beyond the bound is oldest.
    const toRemove = reconciled.slice(retentionLimit);

    await Promise.all(toRemove.flatMap(segmentKey => [
        fs.rm(path.join(dir, getWalRecordsFileName(segmentKey)), {force: true}),
        fs.rm(path.join(dir, getWalMarkersFileName(segmentKey)), {force: true}),
        fs.rm(path.join(dir, getWalGraphMarkersFileName(segmentKey)), {force: true})
    ]));

    return toRemove.length;
}
