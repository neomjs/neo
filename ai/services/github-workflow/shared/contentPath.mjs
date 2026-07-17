import path from 'path';

/**
 * @module ai/services/github-workflow/shared/contentPath
 * @summary Universal ordinal-100 path-resolution primitive for the `resources/content/` substrate.
 *
 * This helper is the single source-of-truth for active-tier and archive-tier on-disk path math
 * across all content types (issues, pulls, discussions, release-notes). It supersedes the
 * two-primitive model — `chunkPath.mjs` ID-range for active plus `archivePath.mjs` ordinal for
 * archive — which is retired.
 *
 * **Universal Ordinal-100 Rule:**
 *   1. `itemIndex` = zero-based ordinal within a collection bucket (active = ascending GitHub ID;
 *      archive = ascending GitHub ID within version-folder bucket; release-notes = ascending semver)
 *   2. `chunkNumber = Math.floor(itemIndex / itemsPerChunk) + 1` (1-based)
 *   3. Active tier path:  `{contentRoot}/{type}/chunk-{N}/{filename}`
 *   4. Archive tier path: `{contentRoot}/archive/{type}/{version|bucket}/chunk-{N}/{filename}`
 *
 * No flat-vs-chunked branching. No ID-range math. No `<NNN>xx/` folders. ONE primitive applied
 * universally under a single path-resolution contract.
 *
 * **Sealed-chunk invariant:** `.github/workflows/prevent-reopen.yml` enforces that closed items
 * past their 24h-grace window cannot be reopened; the CI guard preserves archive immutability.
 * Therefore once a chunk is sealed at archive-cut, membership is mechanically immutable — this
 * is what makes the ordinal chunking safe. Anyone reading this helper MUST mentally factor that
 * primitive in; treating the reopen guard as incidental is the classic misread here.
 *
 * **V-B-A obligation for path-mutating call sites:** before authoring any file in
 * `ai/services/github-workflow/sync/*.mjs`, `ai/services/github-workflow/shared/*Path.mjs`,
 * `ai/mcp/server/github-workflow/config{,.template}.mjs`, `ai/services/ingestion/IssueIngestor.mjs`,
 * `buildScripts/release/publish.mjs`, or any consumer of `resources/content/...`, you MUST read
 * `learn/agentos/decisions/0004-github-content-architecture.md` start-to-finish, then verify the
 * chosen pattern against this helper's signature.
 *
 * @see learn/agentos/decisions/0004-github-content-architecture.md (the governing decision record)
 * @see .github/workflows/prevent-reopen.yml (sealed-chunk substrate)
 */

export const DEFAULT_ITEMS_PER_CHUNK = 100;
export const DEFAULT_CHUNK_PREFIX    = 'chunk-';
// Mirrors `issueSync.versionDirectoryPrefix`. A default, not a universal: it exists so the inverse
// parse has the same fallback the forward build does, NOT so callers may skip threading the config.
export const DEFAULT_VERSION_PREFIX  = 'v';

/**
 * @typedef {Object} ContentIndexEntry
 * @property {'issues'|'pulls'|'discussions'|'release-notes'} type Content type segment
 * @property {Number|String} id GitHub ID for issues/pulls/discussions; semver string for release-notes
 * @property {String|null} version Release version `'v<X.Y.Z>'` for archive tier; `null` for active tier
 * @property {Number} chunkNumber 1-based chunk ordinal computed from `itemIndex`
 * @property {String} path Path relative to the `contentRoot` (consumers join with their own contentRoot)
 * @property {String} [bucket] Non-release archive bucket name (e.g., `'rejected'`); mutually exclusive with `version`
 *
 * @summary Per-item entry in the `_index.json` substrate.
 * The index map enables O(1) ID-keyed lookup once chunk position is no longer derivable from the
 * GitHub identifier alone. Maintained at sync time by syncers; consumed at read time by
 * `LocalFileService#getIssueById` and KB / Native Edge Graph ingestors.
 */

/**
 * @typedef {ContentIndexEntry[]} ContentIndex
 * @summary Top-level shape of `resources/content/_index.json`.
 *
 * The schema of an individual `ContentIndexEntry` is the durable contract owned by this helper.
 * File-sharding (single root-level `_index.json` vs per-type shards under each `{type}/`) is the
 * consuming syncer's choice and is not part of the path-helper contract.
 */

/**
 * @summary Resolves the on-disk path for a content item under the universal ordinal-100 rule.
 *
 * Active tier (omit both `version` and `bucket`):
 *   `{contentRoot}/{type}/{chunkPrefix}{N}/{filename}`
 *
 * Archive tier (supply exactly one of `version` or `bucket`):
 *   `{contentRoot}/archive/{type}/{version|bucket}/{chunkPrefix}{N}/{filename}`
 *
 * The helper performs path math only — it does NOT inspect the filesystem, plan migrations, or
 * maintain the `_index.json` substrate. Callers own those concerns.
 *
 * @param {Object} config
 * @param {String} config.contentRoot Repository-relative or absolute root, e.g. `'resources/content'`
 * @param {String} config.type Single-segment type identifier (e.g. `'issues'`, `'pulls'`, `'discussions'`, `'release-notes'`)
 * @param {String} [config.version] Release-bucket segment (e.g. `'v13.0.0'`). Mutually exclusive with `bucket`.
 * @param {String} [config.bucket] Non-release-bucket segment (e.g. `'rejected'`). Mutually exclusive with `version`.
 * @param {String} config.filename File leaf (e.g. `'issue-1234.md'`)
 * @param {Number} config.itemIndex Zero-based ordinal position within the collection bucket
 * @param {Number} [config.itemsPerChunk=100] Items per chunk; defaults to the ADR-mandated 100
 * @param {String} [config.chunkPrefix='chunk-'] Chunk-subdirectory prefix
 * @returns {String} Path joined from segments via `path.join`
 * @throws {TypeError} If any segment / integer invariant is violated
 *
 * @example
 *   // Active tier — issue 1234 at ordinal index 42 (chunk 1)
 *   contentPath({contentRoot: 'resources/content', type: 'issues', filename: 'issue-1234.md', itemIndex: 42})
 *   // → 'resources/content/issues/chunk-1/issue-1234.md'
 *
 * @example
 *   // Archive tier — pull 999 at ordinal index 250 in v12.1.0 (chunk 3)
 *   contentPath({
 *     contentRoot: 'resources/content', type: 'pulls', version: 'v12.1.0',
 *     filename: 'pr-999.md', itemIndex: 250
 *   })
 *   // → 'resources/content/archive/pulls/v12.1.0/chunk-3/pr-999.md'
 */
export default function contentPath(config = {}) {
    const {
        contentRoot,
        type,
        version,
        bucket,
        filename,
        itemIndex,
        itemsPerChunk = DEFAULT_ITEMS_PER_CHUNK,
        chunkPrefix   = DEFAULT_CHUNK_PREFIX
    } = config;

    validateSegment(contentRoot, 'contentRoot', {allowPath: true});
    validateSegment(type,        'type');
    validateSegment(filename,    'filename');
    validateSegment(chunkPrefix, 'chunkPrefix');
    validatePositiveInteger(itemsPerChunk, 'itemsPerChunk');
    validateNonNegativeInteger(itemIndex, 'itemIndex');
    validateBucketXor({version, bucket});

    // Presence-aware validation: supplying `version: ''` or `bucket: ''` is a
    // contract violation (caller signaled archive-tier routing without a value).
    // Distinguish key-not-supplied (undefined / null) from key-supplied-as-empty (which must throw).
    if (version !== undefined && version !== null) validateSegment(version, 'version');
    if (bucket  !== undefined && bucket  !== null) validateSegment(bucket,  'bucket');

    const chunkNumber = chunkNumberFor(itemIndex, itemsPerChunk);
    const chunkDir    = `${chunkPrefix}${chunkNumber}`;
    const archiveTier = (version !== undefined && version !== null) || (bucket !== undefined && bucket !== null);
    const bucketDir   = archiveTier
        ? path.join(contentRoot, 'archive', type, version || bucket)
        : path.join(contentRoot, type);

    return path.join(bucketDir, chunkDir, filename);
}

/**
 * @summary Inverts {@link contentPath} — reads an on-disk path back into its tier coordinates.
 *
 * The forward direction answers "where should this item go"; this answers "where does this file
 * actually live". Both are path math, so both belong to this module: a second module deriving
 * chunk/version by its own string-splitting would be a parallel truth free to disagree.
 *
 * The distinction is load-bearing for `_index.json`. An entry built from a *planned* ordinal
 * records intent, and intent goes stale the moment a later pass relocates the file — the exact
 * mechanism behind the archive-move drift, where the index kept naming active paths for files that
 * had already been renamed away. An entry built from the written path describes reality and cannot
 * disagree with the filesystem it was read from.
 *
 * Returns `null` for anything that is not a chunked content path, so callers can treat "not ours"
 * as data rather than as an exception.
 *
 * **`filePath` must be absolute or contentRoot-relative — NOT projectRoot-relative.** This subsystem
 * carries three path conventions, and two of them are bare relative strings distinguishable only by
 * a leading `resources/content/`:
 *
 *   - absolute                          — `/…/resources/content/pulls/chunk-1/pr-9537.md`
 *   - contentRoot-relative              — `pulls/chunk-1/pr-9537.md`            (`_index.json` entries)
 *   - projectRoot-relative              — `resources/content/pulls/chunk-1/pr-9537.md` (`metadata.{type}[].path`)
 *
 * Passing the third against a `contentRoot` of `resources/content` resolves to
 * `resources/content/resources/content/…` and parses as `null`. Nothing in the string itself reveals
 * which convention produced it, so the caller must know; resolve metadata paths against the project
 * root before handing them here.
 *
 * **Both segment vocabularies are configured, not universal.** `chunkPrefix` and `versionPrefix`
 * default to the values the shipped config happens to use (`chunk-` / `v`), which is exactly why a
 * hardcoded parser passes every test and still diverges the moment a deployment overrides either:
 * the forward direction would build `slice-3/` while the inverse only recognises `chunk-3/`, and the
 * two halves of one contract would disagree silently. Callers holding an `issueSyncConfig` must pass
 * `archiveChunkPrefix` / `versionDirectoryPrefix` through.
 *
 * @param {Object} config
 * @param {String} config.contentRoot Repository-relative or absolute root, e.g. `'resources/content'`
 * @param {String} config.filePath Absolute or contentRoot-relative path to a content file
 * @param {String} [config.chunkPrefix='chunk-'] Chunk-subdirectory prefix; pass `archiveChunkPrefix`
 * @param {String} [config.versionPrefix='v'] Release-bucket prefix; pass `versionDirectoryPrefix`
 * @returns {{type: String, version: String|null, bucket: String|null, chunkNumber: Number, filename: String}|null}
 *
 * @example
 *   // Absolute
 *   parseContentPath({contentRoot: '/repo/resources/content', filePath: '/repo/resources/content/archive/pulls/v13.0.0/chunk-2/pr-10124.md'})
 *   // → {type: 'pulls', version: 'v13.0.0', bucket: null, chunkNumber: 2, filename: 'pr-10124.md'}
 *
 * @example
 *   // contentRoot-relative — the `_index.json` entry shape
 *   parseContentPath({contentRoot: 'resources/content', filePath: 'pulls/chunk-1/pr-9537.md'})
 *   // → {type: 'pulls', version: null, bucket: null, chunkNumber: 1, filename: 'pr-9537.md'}
 */
export function parseContentPath(config = {}) {
    const {
        contentRoot,
        filePath,
        chunkPrefix   = DEFAULT_CHUNK_PREFIX,
        versionPrefix = DEFAULT_VERSION_PREFIX
    } = config;

    validateSegment(contentRoot, 'contentRoot', {allowPath: true});
    validateSegment(filePath,    'filePath',    {allowPath: true});

    const relative = path.relative(path.resolve(contentRoot), path.resolve(contentRoot, filePath));

    // Escapes the content root — not ours to describe.
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

    const segments = relative.split(path.sep).filter(Boolean);

    // Active: {type}/{chunk-N}/{filename}          → 3 segments
    // Archive: archive/{type}/{version}/{chunk-N}/{filename} → 5 segments
    const archiveTier = segments[0] === 'archive';
    const expected    = archiveTier ? 5 : 3;

    if (segments.length !== expected) return null;

    const filename   = segments[expected - 1],
          chunkDir   = segments[expected - 2],
          type       = archiveTier ? segments[1] : segments[0],
          versionSeg = archiveTier ? segments[2] : null;

    if (!chunkDir.startsWith(chunkPrefix)) return null;

    const chunkNumber = Number(chunkDir.slice(chunkPrefix.length));

    if (!Number.isInteger(chunkNumber) || chunkNumber < 1) return null;

    // `version` vs `bucket` is not recoverable from the path alone — both occupy the same segment.
    // Version-shaped segments carry the configured prefix followed by a digit; anything else is a
    // non-release bucket. Built from `versionPrefix` rather than a literal so an overridden prefix
    // does not silently reclassify every release bucket as a named bucket. Callers that know their
    // tier can ignore the split.
    const isVersion = versionSeg
        ? versionSeg.startsWith(versionPrefix) && /^\d/.test(versionSeg.slice(versionPrefix.length))
        : false;

    return {
        type,
        version: archiveTier && isVersion  ? versionSeg : null,
        bucket : archiveTier && !isVersion ? versionSeg : null,
        chunkNumber,
        filename
    };
}

/**
 * @summary Maps an `issueSync` config block to {@link parseContentPath}'s segment options.
 *
 * The two vocabularies live under different names on each side — `archiveChunkPrefix` /
 * `versionDirectoryPrefix` in config, `chunkPrefix` / `versionPrefix` in the path math — so every
 * call site that translated them by hand would be a place the mapping could drift. One helper means
 * a renamed config key breaks in one file instead of four, and callers cannot accidentally thread
 * only half of it.
 *
 * @param {Object} issueSyncConfig GitHub workflow `issueSync` config block
 * @returns {{chunkPrefix: String, versionPrefix: String}}
 */
export function pathSegmentOptionsFor(issueSyncConfig = {}) {
    return {
        chunkPrefix  : issueSyncConfig.archiveChunkPrefix     || DEFAULT_CHUNK_PREFIX,
        versionPrefix: issueSyncConfig.versionDirectoryPrefix || DEFAULT_VERSION_PREFIX
    };
}

/**
 * @summary Resolves the bucket directory (without chunk or filename) for syncer planning.
 *
 * Useful when a syncer needs to know "where does this collection live" before computing
 * per-item chunk placement — e.g., for `fs.readdir`-based scanning or for emitting a
 * version-bucket-level `_index.json` shard.
 *
 * @param {Object} config
 * @param {String} config.contentRoot Repository-relative or absolute root
 * @param {String} config.type Single-segment type identifier
 * @param {String} [config.version] Release-bucket segment; mutually exclusive with `bucket`
 * @param {String} [config.bucket] Non-release-bucket segment; mutually exclusive with `version`
 * @returns {String}
 */
export function contentBucketDir(config = {}) {
    const {contentRoot, type, version, bucket} = config;

    validateSegment(contentRoot, 'contentRoot', {allowPath: true});
    validateSegment(type,        'type');
    validateBucketXor({version, bucket});

    // Supplied-but-empty archive-tier selectors must fail-loud rather than
    // silently routing to active-tier.
    if (version !== undefined && version !== null) validateSegment(version, 'version');
    if (bucket  !== undefined && bucket  !== null) validateSegment(bucket,  'bucket');

    const archiveTier = (version !== undefined && version !== null) || (bucket !== undefined && bucket !== null);
    return archiveTier
        ? path.join(contentRoot, 'archive', type, version || bucket)
        : path.join(contentRoot, type);
}

/**
 * @summary Computes the 1-based chunk number for an ordinal item index.
 * Pure arithmetic helper; exported so syncers can populate `_index.json` entries without
 * re-deriving the chunk math (single source of truth).
 *
 * @param {Number} itemIndex Zero-based ordinal
 * @param {Number} [itemsPerChunk=100]
 * @returns {Number} 1-based chunk number
 */
export function chunkNumberFor(itemIndex, itemsPerChunk = DEFAULT_ITEMS_PER_CHUNK) {
    validateNonNegativeInteger(itemIndex, 'itemIndex');
    validatePositiveInteger(itemsPerChunk, 'itemsPerChunk');
    return Math.floor(itemIndex / itemsPerChunk) + 1;
}

/**
 * @summary Validates the mutual-exclusivity invariant on the version/bucket pair.
 * Supplying both is a programming error (archive disambiguation conflict); supplying neither
 * is the legitimate "active tier" path and is permitted.
 *
 * Presence-aware semantics: supplying both keys is a conflict even if both values are
 * empty strings — the caller signaled archive-tier intent on two different axes
 * simultaneously. Non-emptiness of the supplied value is validated separately by
 * `validateSegment` at the call site.
 *
 * @param {Object} config
 * @param {String} [config.version]
 * @param {String} [config.bucket]
 * @throws {TypeError} If both `version` and `bucket` are supplied (presence-aware, not truthiness)
 */
export function validateBucketXor({version, bucket}) {
    const versionSupplied = version !== undefined && version !== null;
    const bucketSupplied  = bucket  !== undefined && bucket  !== null;

    if (versionSupplied && bucketSupplied) {
        throw new TypeError('exactly zero or one of version or bucket may be supplied');
    }
}

/**
 * @summary Validates that a value is a non-negative integer.
 * @param {*} value
 * @param {String} name Identifier for the error message
 * @throws {TypeError}
 */
export function validateNonNegativeInteger(value, name) {
    if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative integer`);
    }
}

/**
 * @summary Validates that a value is a positive (>= 1) integer.
 * @param {*} value
 * @param {String} name Identifier for the error message
 * @throws {TypeError}
 */
export function validatePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value < 1) {
        throw new TypeError(`${name} must be a positive integer`);
    }
}

/**
 * @summary Validates a single path segment (or, with `allowPath: true`, a path-shaped value).
 * Single-segment validation rejects `/`, `\`, `..`, and embedded `..` substrings to prevent
 * directory-traversal at path-build time.
 *
 * @param {*} value
 * @param {String} name Identifier for the error message
 * @param {Object} [options]
 * @param {Boolean} [options.allowPath=false] When true, permits `/` and `\` separators (for root paths)
 * @throws {TypeError}
 */
export function validateSegment(value, name, options = {}) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${name} must be a non-empty string`);
    }

    if (!options.allowPath && (
        value.includes('/') ||
        value.includes('\\') ||
        value === '..' ||
        value.includes('..')
    )) {
        throw new TypeError(`${name} must be a single safe path segment`);
    }
}
