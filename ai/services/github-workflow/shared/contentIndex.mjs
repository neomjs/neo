import fs   from 'fs-extra';
import path from 'path';
import {chunkNumberFor, DEFAULT_ITEMS_PER_CHUNK, validateSegment} from './contentPath.mjs';

export const CONTENT_INDEX_FILENAME = '_index.json';

/**
 * @summary Resolves the root directory that owns `resources/content/_index.json`.
 *
 * ADR 0004 makes the index a sibling of the active type directories and the archive root.
 * The GitHub workflow config currently exposes per-type paths, so this helper derives the
 * common root from `issuesDir` without adding another config surface.
 *
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @returns {String}
 */
export function contentRootFor(issueSyncConfig = {}) {
    if (issueSyncConfig.contentRoot) {
        return issueSyncConfig.contentRoot;
    }

    if (issueSyncConfig.issuesDir) {
        return path.dirname(issueSyncConfig.issuesDir);
    }

    if (issueSyncConfig.archiveRoot) {
        return path.dirname(issueSyncConfig.archiveRoot);
    }

    throw new TypeError('issueSyncConfig must define issuesDir, archiveRoot, or contentRoot');
}

/**
 * @summary Resolves the absolute `_index.json` path for a GitHub workflow sync config.
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @returns {String}
 */
export function contentIndexPath(issueSyncConfig = {}) {
    return path.join(contentRootFor(issueSyncConfig), CONTENT_INDEX_FILENAME);
}

/**
 * @summary Reads `resources/content/_index.json`.
 *
 * Missing index files are treated as an empty regeneratable cache surface. Malformed files fail
 * loudly so syncers do not silently preserve bad lookup data.
 *
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @returns {Promise<Array<Object>>}
 */
export async function readContentIndex(issueSyncConfig = {}) {
    const indexPath = contentIndexPath(issueSyncConfig);

    if (!await fs.pathExists(indexPath)) {
        return [];
    }

    const entries = await fs.readJson(indexPath);

    if (!Array.isArray(entries)) {
        throw new TypeError(`${CONTENT_INDEX_FILENAME} must contain an array`);
    }

    return entries;
}

/**
 * @summary Writes `resources/content/_index.json` with stable ordering.
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @param {Array<Object>} entries Content index entries
 * @returns {Promise<void>}
 */
export async function writeContentIndex(issueSyncConfig = {}, entries = []) {
    const indexPath = contentIndexPath(issueSyncConfig);
    await fs.ensureDir(path.dirname(indexPath));
    await fs.writeJson(indexPath, sortContentIndex(entries), {spaces: 2});
    await fs.appendFile(indexPath, '\n');
}

/**
 * @summary Applies upsert/remove mutations to the content index in one read/write pass.
 *
 * Syncers call this after determining their final target paths. Entries are keyed by
 * `{type, id}` because ADR 0004 permits exactly one current lookup target for each GitHub item.
 *
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @param {Object} mutations
 * @param {Array<Object>} [mutations.upsert]
 * @param {Array<Object>} [mutations.remove]
 * @returns {Promise<Array<Object>>} The written index entries
 */
export async function updateContentIndex(issueSyncConfig = {}, mutations = {}) {
    const {upsert = [], remove = []} = mutations;
    const index = new Map((await readContentIndex(issueSyncConfig)).map(entry => [indexKey(entry), entry]));

    remove.forEach(entry => index.delete(indexKey(entry)));
    upsert.forEach(entry => index.set(indexKey(entry), normalizeContentIndexEntry(entry)));

    const entries = sortContentIndex([...index.values()]);
    await writeContentIndex(issueSyncConfig, entries);
    return entries;
}

/**
 * @summary Finds an index entry by type and id.
 * @param {Array<Object>} entries Content index entries
 * @param {Object} query
 * @param {String} query.type Content type
 * @param {Number|String} query.id GitHub identifier
 * @returns {Object|null}
 */
export function findContentIndexEntry(entries = [], query = {}) {
    const key = indexKey(query);
    return entries.find(entry => indexKey(entry) === key) || null;
}

/**
 * @summary Creates a normalized content index entry for a resolved output path.
 * @param {Object} config
 * @param {Object} config.issueSyncConfig GitHub workflow `issueSync` config block
 * @param {'issues'|'pulls'|'discussions'|'release-notes'} config.type Content type
 * @param {Number|String} config.id GitHub ID or semver identifier
 * @param {String} config.filePath Absolute output file path
 * @param {Number} config.itemIndex Zero-based ordinal within the active/archive bucket
 * @param {String|null} [config.version=null] Archive release version, if archived
 * @param {String} [config.bucket] Non-release archive bucket
 * @param {Number} [config.itemsPerChunk=100]
 * @returns {Object}
 */
export function createContentIndexEntry(config = {}) {
    const {
        issueSyncConfig,
        type,
        id,
        filePath,
        itemIndex,
        version = null,
        bucket,
        itemsPerChunk = DEFAULT_ITEMS_PER_CHUNK
    } = config;

    const contentRoot = contentRootFor(issueSyncConfig);
    const relativePath = path.relative(contentRoot, filePath);

    return normalizeContentIndexEntry({
        type,
        id,
        version,
        bucket,
        chunkNumber: chunkNumberFor(itemIndex, itemsPerChunk),
        path       : relativePath
    });
}

/**
 * @summary Resolves an indexed path and rejects entries that escape the content root.
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @param {Object} entry Content index entry
 * @returns {String}
 */
export function resolveIndexedPath(issueSyncConfig = {}, entry = {}) {
    validateSegment(entry.path, 'path', {allowPath: true});

    const contentRoot = path.resolve(contentRootFor(issueSyncConfig));
    const absolutePath = path.resolve(contentRoot, entry.path);
    const relative = path.relative(contentRoot, absolutePath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new TypeError('indexed path must stay within the content root');
    }

    return absolutePath;
}

function indexKey(entry = {}) {
    validateSegment(entry.type, 'type');

    if (entry.id === undefined || entry.id === null || `${entry.id}`.length === 0) {
        throw new TypeError('id must be a non-empty value');
    }

    return `${entry.type}:${entry.id}`;
}

function normalizeContentIndexEntry(entry = {}) {
    validateSegment(entry.type, 'type');
    validateSegment(entry.path, 'path', {allowPath: true});

    if (entry.id === undefined || entry.id === null || `${entry.id}`.length === 0) {
        throw new TypeError('id must be a non-empty value');
    }

    if (!Number.isInteger(entry.chunkNumber) || entry.chunkNumber < 1) {
        throw new TypeError('chunkNumber must be a positive integer');
    }

    const normalized = {
        type       : entry.type,
        id         : entry.id,
        version    : entry.version ?? null,
        chunkNumber: entry.chunkNumber,
        path       : entry.path
    };

    if (entry.bucket !== undefined && entry.bucket !== null) {
        validateSegment(entry.bucket, 'bucket');
        normalized.bucket = entry.bucket;
    }

    return normalized;
}

function sortContentIndex(entries = []) {
    return entries
        .map(entry => normalizeContentIndexEntry(entry))
        .sort((a, b) => {
            const typeCompare = a.type.localeCompare(b.type);
            if (typeCompare) return typeCompare;

            const aId = Number(a.id);
            const bId = Number(b.id);
            const idCompare = Number.isFinite(aId) && Number.isFinite(bId)
                ? aId - bId
                : `${a.id}`.localeCompare(`${b.id}`);

            return idCompare || `${a.version || ''}`.localeCompare(`${b.version || ''}`);
        });
}
