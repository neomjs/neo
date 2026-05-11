import path from 'path';

export const DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR = 100;

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
 * @param {Number} [config.maxItemsPerDir=100] Maximum items per flat/chunk folder
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
        maxItemsPerDir = DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR
    } = config;

    validateSegment(archiveRoot, 'archiveRoot', {allowPath: true});
    validateSegment(type,        'type');
    validateSegment(filename,    'filename');
    validateBucket({version, bucket});
    validatePositiveInteger(maxItemsPerDir, 'maxItemsPerDir');
    validateNonNegativeInteger(itemCount, 'itemCount');

    const bucketDir = path.join(archiveRoot, type, version || bucket);

    if (itemIndex !== undefined) {
        validateNonNegativeInteger(itemIndex, 'itemIndex');

        if (itemIndex >= itemCount) {
            throw new RangeError('itemIndex must be smaller than itemCount')
        }
    }

    if (itemCount <= maxItemsPerDir) {
        return path.join(bucketDir, filename)
    }

    if (itemIndex === undefined) {
        throw new TypeError('itemIndex is required when itemCount exceeds maxItemsPerDir')
    }

    const chunkNumber = Math.floor(itemIndex / maxItemsPerDir) + 1;

    return path.join(bucketDir, `chunk-${chunkNumber}`, filename)
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
