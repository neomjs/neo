import {mkdir, readFile, rename, stat, writeFile} from 'fs/promises';
import {writeFileAtomic}                          from '../../shared/atomicFileWrite.mjs';
import path                                       from 'path';

/**
 * @module ai/services/memory-core/helpers/quarantineStore
 * @summary Durable per-collection quarantine state for the autonomous data-recovery actuator's
 * `quarantine`-from-serving heal — the safe-default terminal for corruption that is NOT losslessly recoverable
 * (re-embed / restore cannot heal it). A quarantined collection is FENCED from similarity-serving:
 * `MemoryService.queryMemories` / `SummaryService.querySummaries` fail-fast to an empty result rather than
 * serve a known-corrupt index, so a corrupt store is never silently served while it awaits repair. Lossless +
 * reversible: no data is mutated, and a collection un-quarantines when a subsequent repair or a clean re-audit
 * clears the corruption.
 *
 * Current-state (not an append-log): the fence map is the SSOT for "fenced right now". I/O at the edge only,
 * atomic writes (tmp + rename). The read path is stat-gated + cached so the hot similarity-query check never
 * re-parses the file when nothing changed, yet a concurrent writer (the orchestrator actuator) is seen via
 * `mtimeMs`. A missing OR corrupt fence file fails SAFE to "nothing fenced" — the fence protects against serving
 * corruption; a bad fence file must never itself become a read outage.
 */

const QUARANTINE_FILENAME = 'quarantined-collections.json';

/**
 * @summary The quarantine state-file path within a durable state directory.
 * @param {String} dir
 * @returns {String}
 */
export function getQuarantineFilePath(dir) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getQuarantineFilePath: dir is required');
    }
    return path.join(dir, QUARANTINE_FILENAME);
}

/**
 * @summary Resolves which served collections a quarantine target fences. A store-level fault (sqlite-integrity /
 * store-bloat) targets the service id rather than a served collection, so it must fence EVERY served collection
 * in the store — otherwise no query guard observes the fence. A collection-level target fences exactly itself.
 * @param {String} collection The quarantine target (a served collection name OR a store-level service id).
 * @param {String[]} [servedCollections=[]] The collections the read guards actually check.
 * @returns {String[]} The collection(s) to fence.
 */
export function storeFenceTargets(collection, servedCollections = []) {
    return servedCollections.includes(collection) ? [collection] : servedCollections;
}

// path → {mtimeMs, fences}. Module-level so the hot read path is O(1) when the file is unchanged.
const fenceCache = new Map();

async function readFenceMap(dir) {
    const filePath = getQuarantineFilePath(dir);

    let stats;
    try {
        stats = await stat(filePath);
    } catch {
        return {}; // no file → nothing quarantined
    }

    const cached = fenceCache.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs) {
        return cached.fences;
    }

    let fences = {};
    try {
        fences = JSON.parse(await readFile(filePath, 'utf8')) || {};
    } catch {
        fences = {}; // corrupt/partial write → fail SAFE (never block reads on a bad fence file)
    }

    fenceCache.set(filePath, {mtimeMs: stats.mtimeMs, fences});
    return fences;
}

async function writeFenceMap(dir, fences) {
    await mkdir(dir, {recursive: true});

    const filePath = getQuarantineFilePath(dir);

    await writeFileAtomic(filePath, JSON.stringify(fences));
    fenceCache.delete(filePath);     // force a re-stat on the next read
}

/**
 * @summary Fences a collection from similarity-serving (idempotent). No data is mutated.
 * @param {String} collection
 * @param {Object} options
 * @param {String} options.dir The durable state directory.
 * @param {String|null} [options.reason] Why it was quarantined (the diagnosis reasonCode).
 * @param {Number} [options.now] Epoch ms stamped as `quarantinedAt`.
 * @returns {Promise<Object>} The stored fence record `{quarantinedAt, reason}`.
 */
export async function quarantineCollection(collection, {dir, reason = null, now} = {}) {
    if (typeof collection !== 'string' || collection.length === 0) {
        throw new TypeError('quarantineCollection: collection is required');
    }

    const fences = {...await readFenceMap(dir)};
    fences[collection] = {quarantinedAt: Number.isFinite(now) ? now : null, reason};
    await writeFenceMap(dir, fences);

    return fences[collection];
}

/**
 * @summary Lifts a collection's fence (reversibility — a repair or clean re-audit cleared the corruption).
 * @param {String} collection
 * @param {Object} options
 * @param {String} options.dir
 * @returns {Promise<Boolean>} `true` if it was fenced and is now lifted, `false` if it was not fenced.
 */
export async function unquarantineCollection(collection, {dir} = {}) {
    const fences = {...await readFenceMap(dir)};
    if (!Object.hasOwn(fences, collection)) {
        return false;
    }

    delete fences[collection];
    await writeFenceMap(dir, fences);

    return true;
}

/**
 * @summary The hot-path serving guard: is this collection fenced right now? Fails SAFE (`false`) on any
 * unreadable state — a bad fence file must never turn into a read outage.
 * @param {String} collection
 * @param {Object} options
 * @param {String} options.dir
 * @returns {Promise<Boolean>}
 */
export async function isCollectionQuarantined(collection, {dir} = {}) {
    if (typeof collection !== 'string' || collection.length === 0 || typeof dir !== 'string' || dir.length === 0) {
        return false;
    }

    return Object.hasOwn(await readFenceMap(dir), collection);
}

/**
 * @summary The full fence map `{collection: {quarantinedAt, reason}}` — for the observability surface.
 * @param {Object} options
 * @param {String} options.dir
 * @returns {Promise<Object>}
 */
export async function readQuarantinedCollections({dir} = {}) {
    return readFenceMap(dir);
}
