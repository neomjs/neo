import path             from 'path';
import {chunkNumberFor} from './contentPath.mjs';

export const DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR = 100;
export const DEFAULT_ARCHIVE_CHUNK_PREFIX      = 'chunk-';

/**
 * @summary Fail-loud runtime validator for the archive substrate config contract.
 *
 * Per Epic #11187 B0a (#11290): the GitHub Workflow runtime config is gitignored
 * (`ai/mcp/server/github-workflow/config.mjs`) and can drift from
 * `config.template.mjs` per real-repo clone. The partial-patch state observed
 * 2026-05-13 (archiveRoot present, archiveChunkThreshold + archiveChunkPrefix
 * missing) is more dangerous than fully-stale-config — undefined chunk semantics
 * silently fall back to defaults, masking the clone-drift instead of failing
 * operator-actionably.
 *
 * Callers MUST invoke this validator before any archive-path planning / sync /
 * release-archive operation. Validation enforces presence + type, not byte-
 * identical value equality (clone-local overrides remain legal per ticket OoS).
 *
 * @param {Object} issueSyncConfig The full `aiConfig.issueSync` object
 * @throws {Error} If any required archive field is missing or wrong-typed
 */
export function validateArchiveConfig(issueSyncConfig) {
    const required = [
        {
            key     : 'archiveRoot',
            expected: 'non-empty string',
            test    : v => typeof v === 'string' && v.length > 0
        },
        {
            key     : 'archiveChunkThreshold',
            expected: 'positive integer',
            test    : v => Number.isInteger(v) && v > 0
        },
        {
            key     : 'archiveChunkPrefix',
            expected: 'non-empty string',
            test    : v => typeof v === 'string' && v.length > 0
        }
    ];

    const errors = [];

    for (const {key, expected, test} of required) {
        const value = issueSyncConfig?.[key];

        if (value === undefined || value === null) {
            errors.push(`'issueSync.${key}' is missing (expected ${expected})`);
        } else if (!test(value)) {
            errors.push(`'issueSync.${key}' must be ${expected}, got ${JSON.stringify(value)}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(
            '[archive-config] Runtime config validation failed for ai/mcp/server/github-workflow/config.mjs:\n' +
            errors.map(e => `  - ${e}`).join('\n') +
            '\nCheck against config.template.mjs (see #11290 / Epic #11187 B0a).'
        );
    }
}

/**
 * @summary Builds archive-tier paths for GitHub workflow markdown files.
 *
 * This helper is intentionally archive-only. Active issue / pull request paths stay
 * ID-range based via `chunkPath(id)` so callers such as `LocalFileService#getIssueById`
 * can keep deterministic lookup from the item number.
 *
 * `itemCount` is the planned total size of the archive bucket after the item is
 * placed. `itemIndex` is zero-based within that planned bucket order. The helper
 * does not inspect the filesystem; callers own any sync or migration planning.
 *
 * @param {Object} config
 * @param {String} config.archiveRoot Base archive root, e.g. `resources/content/archive`
 * @param {String} config.type Archive type segment, e.g. `issues`, `pulls`, `discussions`
 * @param {String} [config.version] Release bucket, e.g. `v13.0.0`
 * @param {String} [config.bucket] Non-release bucket, e.g. `rejected`
 * @param {String} config.filename Markdown filename
 * @param {Number} config.itemCount Planned bucket size after placement
 * @param {Number} [config.itemIndex] Zero-based item index, required when chunking
 * @param {Number} [config.maxItemsPerDir=100] Maximum items per flat/chunk folder (alias for legacy callers)
 * @param {Number} [config.archiveChunkThreshold] Runtime override for max items per dir (preferred; takes precedence over `maxItemsPerDir`)
 * @param {String} [config.archiveChunkPrefix='chunk-'] Runtime override for chunk subdir prefix
 * @returns {String}
 */
export default function archivePath(config = {}) {
    const {
        archiveRoot,
        type,
        version,
        bucket,
        filename,
        itemCount,
        itemIndex,
        archiveChunkThreshold,
        archiveChunkPrefix = DEFAULT_ARCHIVE_CHUNK_PREFIX,
        maxItemsPerDir     = DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR
    } = config;

    // Runtime override precedence: archiveChunkThreshold (B0a #11290) > maxItemsPerDir (legacy) > default
    const effectiveThreshold = archiveChunkThreshold ?? maxItemsPerDir;

    validateSegment(archiveRoot, 'archiveRoot', {allowPath: true});
    validateSegment(type,        'type');
    validateSegment(filename,    'filename');
    validateBucket({version, bucket});
    validatePositiveInteger(effectiveThreshold, archiveChunkThreshold !== undefined ? 'archiveChunkThreshold' : 'maxItemsPerDir');
    validateNonNegativeInteger(itemCount, 'itemCount');
    validateSegment(archiveChunkPrefix, 'archiveChunkPrefix');

    const bucketDir = path.join(archiveRoot, type, version || bucket);

    if (itemIndex !== undefined) {
        validateNonNegativeInteger(itemIndex, 'itemIndex');

        if (itemIndex >= itemCount) {
            throw new RangeError('itemIndex must be smaller than itemCount')
        }
    }

    if (itemCount <= effectiveThreshold) {
        return path.join(bucketDir, filename)
    }

    if (itemIndex === undefined) {
        throw new TypeError('itemIndex is required when itemCount exceeds archiveChunkThreshold')
    }

    // Chunk-math delegation per #11381 GPT review RA2 partial-AC7-satisfaction: the chunked-branch
    // math is the SAME ordinal-100 rule `contentPath()` enforces. Delegating via `chunkNumberFor()`
    // makes the universal helper the single source of truth for the chunk-number computation while
    // preserving `archivePath()`'s flat-when-itemCount<=threshold legacy branch for backward
    // compatibility (the flat branch cannot delegate since `contentPath()` is always-chunked per
    // ADR 0004 §3.1). Full retirement of this module's local path computation is deferred to
    // Lane B / #TBD when call sites migrate to `contentPath()` directly.
    const chunkNumber = chunkNumberFor(itemIndex, effectiveThreshold);

    return path.join(bucketDir, `${archiveChunkPrefix}${chunkNumber}`, filename)
}

/**
 * @summary Builds the archive bucket directory without appending a file path.
 * @param {Object} config
 * @param {String} config.archiveRoot Base archive root
 * @param {String} config.type Archive type segment
 * @param {String} [config.version] Release bucket
 * @param {String} [config.bucket] Non-release bucket
 * @returns {String}
 */
export function archiveBucketDir(config = {}) {
    const {archiveRoot, type, version, bucket} = config;

    validateSegment(archiveRoot, 'archiveRoot', {allowPath: true});
    validateSegment(type,        'type');
    validateBucket({version, bucket});

    return path.join(archiveRoot, type, version || bucket)
}

function validateBucket({version, bucket}) {
    if ((version && bucket) || (!version && !bucket)) {
        throw new TypeError('exactly one of version or bucket is required')
    }

    validateSegment(version || bucket, version ? 'version' : 'bucket')
}

function validateNonNegativeInteger(value, name) {
    if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative integer`)
    }
}

function validatePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value < 1) {
        throw new TypeError(`${name} must be a positive integer`)
    }
}

function validateSegment(value, name, options = {}) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${name} must be a non-empty string`)
    }

    if (!options.allowPath && (
        value.includes('/') ||
        value.includes('\\') ||
        value === '..' ||
        value.includes('..')
    )) {
        throw new TypeError(`${name} must be a single safe path segment`)
    }
}
