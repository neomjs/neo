import Base     from './Base.mjs';
import fs       from 'fs-extra';
import path     from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

const DEFAULT_EXCLUDE_EXTENSIONS = Object.freeze([
    '.7z', '.avif', '.bin', '.bmp', '.bz2', '.class', '.dmg', '.eot', '.exe',
    '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.lockb', '.mov', '.mp3',
    '.mp4', '.otf', '.pdf', '.png', '.sqlite', '.tar', '.tgz', '.ttf', '.wasm',
    '.webm', '.webp', '.woff', '.woff2', '.zip'
]);

const DEFAULT_EXCLUDE_PATHS = Object.freeze([
    '.git',
    '.neo-ai-data',
    'coverage',
    'dist',
    'docs/output',
    'node_modules',
    'package-lock.json',
    'playwright-report',
    'resources/examples',
    'resources/fonts',
    'resources/images',
    'test-results',
    'yarn.lock'
]);

const DEFAULT_CONFIG = Object.freeze({
    excludeExtensions: DEFAULT_EXCLUDE_EXTENSIONS,
    excludePaths     : DEFAULT_EXCLUDE_PATHS,
    includeExtensions: [],
    kind             : 'doc-section',
    parserId         : 'raw-text',
    parserVersion    : '1.0.0',
    root             : '.',
    rootKind         : 'external-source',
    type             : 'raw'
});

/**
 * @summary Extracts one raw-text Knowledge Base chunk per file from an arbitrary repository tree.
 *
 * `RawRepoSource` is an explicit opt-in bridge for tenants whose repository shape does not match
 * Neo's curated Source classes and who have not authored a custom Source yet. It walks a configured
 * repository root, skips common generated/binary/heavy paths, and emits each remaining file through
 * the existing raw-text parsed-chunk contract. This keeps day-0 tenant ingestion possible without
 * widening Neo's default 10-source corpus.
 *
 * @class Neo.ai.services.knowledge-base.source.RawRepoSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class RawRepoSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.RawRepoSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.RawRepoSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Extracts raw-text chunks from the configured repository root.
     *
     * Config is read from `aiConfig.sourcePaths.RawRepoSource`. A string value is treated as
     * `{root: value}`; an object may define `root`, `includeExtensions`, `excludeExtensions`,
     * `excludePaths`, `kind`, `type`, `parserId`, `parserVersion`, and `rootKind`.
     *
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} Number of file chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        const config   = this.normalizeConfig(aiConfig.sourcePaths.RawRepoSource),
              rootPath = path.resolve(aiConfig.neoRootDir, config.root);

        if (!await fs.pathExists(rootPath)) {
            return 0;
        }

        return await this.indexRawDirectory({
            config,
            createHashFn,
            directoryPath: rootPath,
            writeStream
        });
    }

    /**
     * @summary Recursively walks a directory and emits chunks for included files.
     * @param {Object} options
     * @returns {Promise<Number>}
     * @protected
     */
    async indexRawDirectory({config, createHashFn, directoryPath, writeStream}) {
        const entries = await fs.readdir(directoryPath, {withFileTypes: true});
        entries.sort((a, b) => a.name.localeCompare(b.name));

        let count = 0;

        for (const entry of entries) {
            const absolutePath = path.join(directoryPath, entry.name),
                  sourcePath   = this.toSourcePath(path.relative(aiConfig.neoRootDir, absolutePath));

            if (this.isPathExcluded(sourcePath, config.excludePaths)) {
                continue;
            }

            if (entry.isDirectory()) {
                count += await this.indexRawDirectory({
                    config,
                    createHashFn,
                    directoryPath: absolutePath,
                    writeStream
                });
            } else if (entry.isFile() && this.isFileIncluded(sourcePath, config)) {
                const content = await fs.readFile(absolutePath, 'utf-8'),
                      chunk   = this.createChunk({config, content, sourcePath});

                chunk.hash = createHashFn(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                count++;
            }
        }

        return count;
    }

    /**
     * @summary Creates the raw-text parsed chunk for a source file.
     * @param {Object} options
     * @returns {Object}
     * @protected
     */
    createChunk({config, content, sourcePath}) {
        return {
            schemaVersion: '1.0.0',
            sourcePath,
            source       : sourcePath,
            content,
            hashInputs   : ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion'],
            parserId     : config.parserId,
            parserVersion: config.parserVersion,
            rootKind     : config.rootKind,
            kind         : config.kind,
            type         : config.type,
            name         : sourcePath
        };
    }

    /**
     * @summary Normalizes the source-specific config entry.
     * @param {String|Object|null} rawConfig Raw `aiConfig.sourcePaths.RawRepoSource` value.
     * @returns {Object}
     * @protected
     */
    normalizeConfig(rawConfig) {
        const input = typeof rawConfig === 'string' ? {root: rawConfig} : (rawConfig || {});

        return {
            ...DEFAULT_CONFIG,
            ...input,
            excludeExtensions: this.normalizeExtensions(input.excludeExtensions ?? DEFAULT_CONFIG.excludeExtensions),
            excludePaths     : this.normalizePatterns(input.excludePaths ?? DEFAULT_CONFIG.excludePaths),
            includeExtensions: this.normalizeExtensions(input.includeExtensions ?? DEFAULT_CONFIG.includeExtensions),
            root             : input.root || DEFAULT_CONFIG.root
        };
    }

    /**
     * @summary Returns true when a file survives extension allow/deny filters.
     * @param {String} sourcePath Source path relative to `aiConfig.neoRootDir`.
     * @param {Object} config Normalized source config.
     * @returns {Boolean}
     * @protected
     */
    isFileIncluded(sourcePath, config) {
        const extension = path.extname(sourcePath).toLowerCase();

        if (config.excludeExtensions.includes(extension)) {
            return false;
        }

        return config.includeExtensions.length === 0 || config.includeExtensions.includes(extension);
    }

    /**
     * @summary Returns true when a repo-relative path matches an excluded path pattern.
     * @param {String} sourcePath Source path relative to `aiConfig.neoRootDir`.
     * @param {String[]} patterns Excluded path patterns.
     * @returns {Boolean}
     * @protected
     */
    isPathExcluded(sourcePath, patterns) {
        const normalized = this.toSourcePath(sourcePath);

        return patterns.some(pattern => this.matchesPathPattern(normalized, pattern));
    }

    /**
     * @summary Matches simple repository path patterns without pulling in a glob dependency.
     * @param {String} sourcePath Source path relative to `aiConfig.neoRootDir`.
     * @param {String} pattern Exclusion pattern.
     * @returns {Boolean}
     * @protected
     */
    matchesPathPattern(sourcePath, pattern) {
        const normalizedPattern = this.normalizeRelativePath(pattern);

        if (!normalizedPattern) {
            return false;
        }

        if (normalizedPattern.endsWith('/**')) {
            const prefix = normalizedPattern.slice(0, -3);
            return sourcePath === prefix || sourcePath.startsWith(`${prefix}/`);
        }

        if (normalizedPattern.startsWith('**/')) {
            const suffix = normalizedPattern.slice(3);
            return sourcePath === suffix || sourcePath.endsWith(`/${suffix}`);
        }

        if (normalizedPattern.includes('/')) {
            return sourcePath === normalizedPattern ||
                   sourcePath.startsWith(`${normalizedPattern}/`) ||
                   sourcePath.endsWith(`/${normalizedPattern}`) ||
                   sourcePath.includes(`/${normalizedPattern}/`);
        }

        return sourcePath.split('/').includes(normalizedPattern);
    }

    /**
     * @summary Normalizes extension arrays to lowercase dot-prefixed values.
     * @param {String[]} extensions Extension list.
     * @returns {String[]}
     * @protected
     */
    normalizeExtensions(extensions = []) {
        return [...new Set((Array.isArray(extensions) ? extensions : [])
            .map(extension => String(extension || '').trim().toLowerCase())
            .filter(Boolean)
            .map(extension => extension.startsWith('.') ? extension : `.${extension}`))];
    }

    /**
     * @summary Normalizes path pattern arrays to slash-separated relative paths.
     * @param {String[]} patterns Pattern list.
     * @returns {String[]}
     * @protected
     */
    normalizePatterns(patterns = []) {
        return [...new Set((Array.isArray(patterns) ? patterns : [])
            .map(pattern => this.normalizeRelativePath(pattern))
            .filter(Boolean))];
    }

    /**
     * @summary Normalizes a path-like value for config matching.
     * @param {String} value Path-like value.
     * @returns {String}
     * @protected
     */
    normalizeRelativePath(value) {
        return this.toSourcePath(value).replace(/^\.\//u, '').replace(/\/+$/u, '');
    }

    /**
     * @summary Converts platform path separators to portable source-path separators.
     * @param {String} value Path-like value.
     * @returns {String}
     * @protected
     */
    toSourcePath(value) {
        return String(value || '').replaceAll(path.sep, '/').replaceAll('\\', '/');
    }
}

export default Neo.setupClass(RawRepoSource);
