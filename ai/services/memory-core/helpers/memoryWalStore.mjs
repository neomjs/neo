import fs   from 'fs/promises';
import path from 'path';

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
 * ## File layout (two files per UTC-day segment, each with exactly ONE writer)
 *
 * - `wal-YYYY-MM-DD.jsonl`          — memory records; written only by the MCP-server process.
 * - `wal-YYYY-MM-DD.embedded.jsonl` — embed markers; written only by the embedder of the era
 *                                     (Phase 1: the server's deferred embed; Phase 2: the daemon).
 *
 * Records and markers are deliberately split into separate single-writer files instead of one
 * shared append stream: POSIX `O_APPEND` atomicity is only dependable for small writes, and memory
 * records (multi-KB `thought` payloads) appended concurrently with tiny markers from a second
 * process could interleave. One writer per file removes the interleave class by construction.
 * A record is "pending" when its id has no marker; a segment is "reconciled" when no record in it
 * is pending. Reads tolerate corrupt lines (skip, never throw) — sibling discipline to
 * {@link module:ai/services/memory-core/helpers/remRunStateStore}.
 *
 * @module ai/services/memory-core/helpers/memoryWalStore
 */

const SEGMENT_RE = /^wal-(\d{4}-\d{2}-\d{2})\.jsonl$/;

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
 * @param {Date|Number} [options.now] Clock source for the segment key (defaults to record.timestamp).
 * @returns {Promise<{filePath: String, segmentKey: String}>}
 */
export async function appendWalMemory(record, {dir, now} = {}) {
    if (!dir) {
        throw new TypeError('appendWalMemory: dir is required');
    }
    if (typeof record?.id !== 'string' || record.id.length === 0) {
        throw new TypeError('appendWalMemory: record.id is required');
    }

    await fs.mkdir(dir, {recursive: true});

    const segmentKey = getWalSegmentKey(now ?? record.timestamp ?? new Date());
    const filePath   = path.join(dir, getWalRecordsFileName(segmentKey));

    await fs.appendFile(filePath, `${JSON.stringify({...record, segmentKey})}\n`, 'utf8');

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
    const markerFileName = markerType === 'graph' ? getWalGraphMarkersFileName : getWalMarkersFileName;

    for (const segmentKey of await listWalSegmentKeys(dir)) {
        if (pending.length >= bounded) break;

        const records = await readJsonlEntries(path.join(dir, getWalRecordsFileName(segmentKey)));
        if (records.length === 0) continue;

        const markedIds = new Set(
            (await readJsonlEntries(path.join(dir, markerFileName(segmentKey)))).map(entry => entry.id)
        );

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
