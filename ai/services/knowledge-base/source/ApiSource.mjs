import Base         from './Base.mjs';
import SourceParser from '../parser/SourceParser.mjs';
import fs           from 'fs-extra';
import logger       from '../../../mcp/server/knowledge-base/logger.mjs';
import path         from 'path';
import aiConfig     from '../../../mcp/server/knowledge-base/config.mjs';

import {assertCoverageBaseline, loadClassHierarchy} from '../helpers/classHierarchyContract.mjs';

/**
 * @summary Extracts knowledge chunks from Neo.mjs source code.
 *
 * This source provider scans the `src/` directory for `.mjs` files.
 * It delegates the parsing logic to `SourceParser`, which decomposes the source code
 * into semantic chunks (Module Context, Class Properties, Config, Methods).
 *
 * This approach ensures the Knowledge Base contains deep implementation details,
 * allowing the AI to understand not just the API contract but also the logic and patterns
 * used within the framework.
 *
 * @class Neo.ai.services.knowledge-base.source.ApiSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class ApiSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.ApiSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.ApiSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from the source directory.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        // Per-source sourceMap (path → type object) from the `sourcePaths` config (SSOT).
        const sourceMap = aiConfig.sourcePaths.ApiSource;

        // Fail-closed, because the hierarchy is an IDENTITY input rather than an enrichment:
        // `extends` is hashed into every chunk id, so an absent map re-identifies every class
        // member and marks the existing corpus stale. The contract and the incident that earned
        // it live in the helper's docblock. Refusal happens HERE, before the indexing loop below,
        // so no chunk is written under a degraded identity.
        const hierarchy = await loadClassHierarchy({
            hierarchyPath  : aiConfig.hierarchyPath,
            sourcePathCount: Object.keys(sourceMap).length
        });

        let count = 0;

        // Per-root coverage, measured rather than inferred from the map being non-empty. Those are
        // different claims: the map is produced for the docs site, and this source indexes roots that
        // producer never covered, so a loaded map can still leave a whole tree with empty `extends`.
        // Reported per root on every ingest so the next regression is loud — see the helper for why
        // this reports instead of refusing.
        const coverage = {};

        for (const [path, type] of Object.entries(sourceMap)) {
            coverage[path] = {declared: 0, resolved: 0};

            count += await this.indexRawDirectory(writeStream, createHashFn, path, type, hierarchy, coverage[path]);
        }

        // Throws on a regression below the interim floor — the incident's actual shape, where `src`
        // fell from 96.42% populated to 0% and every check passed. Standing gaps do NOT throw; see
        // the helper for why refusing on those would make the degraded corpus unrebuildable.
        for (const {root, declared, resolved, ratio, floor} of assertCoverageBaseline({coverage})) {
            const percent = (ratio * 100).toFixed(1);

            if (resolved < declared) {
                // Named as DEBT, never as health: these chunks take an id derived from an empty
                // `extends`, so the number is a defect description that happens to be within floor.
                logger.warn?.(`[ApiSource] Class hierarchy resolves ${resolved}/${declared} (${percent}%) of the classes declaring a superclass under '${root}' — the remainder ingest with an empty 'extends', which is part of their chunk id. Known interim debt at floor ${floor === undefined ? 'unbaselined' : (floor * 100).toFixed(1) + '%'}; the generator's domain does not cover this root.`);
            } else {
                logger.log?.(`[ApiSource] Class hierarchy resolves ${resolved}/${declared} (100%) under '${root}'.`);
            }
        }

        return count;
    }

    /**
     * Recursively scans a directory and indexes .mjs files.
     * @param {Object}   writeStream           The stream to write chunks to.
     * @param {Function} createHashFn          Function to create content hash.
     * @param {String}   relativePath          The relative path from cwd to scan.
     * @param {String}   defaultType           The default type to assign to chunks.
     * @param {Object}   hierarchy             The class hierarchy map.
     * @returns {Promise<Number>} The number of chunks created.
     * @private
     */
    async indexRawDirectory(writeStream, createHashFn, relativePath, defaultType, hierarchy, coverage) {
        let   count    = 0;
        const fullPath = path.resolve(aiConfig.neoRootDir, relativePath);

        if (!await fs.pathExists(fullPath)) return 0;

        const entries = await fs.readdir(fullPath, {withFileTypes: true});
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            const entryName         = entry.name;
            const entryPath         = path.join(fullPath, entryName);
            const relativeEntryPath = path.join(relativePath, entryName);

            if (entry.isDirectory()) {
                if (entryName === 'node_modules') continue; // Safety check
                count += await this.indexRawDirectory(writeStream, createHashFn, relativeEntryPath, defaultType, hierarchy, coverage);
            } else if (entry.isFile() && entryName.endsWith('.mjs')) {
                const content = await fs.readFile(entryPath, 'utf-8');

                // Emit the neoRootDir-relative path as chunk metadata.source so the distributed
                // Chroma zip shipped with each neo release stays portable across recipients'
                // filesystems. SearchService resolves against its own neoRootDir at read time.
                // Absolute paths would hard-code the local FS layout into the distributed zip.
                const chunks = SourceParser.parse(content, relativeEntryPath, defaultType, hierarchy, coverage);

                chunks.forEach(chunk => {
                    chunk.hash = createHashFn(chunk);
                    writeStream.write(JSON.stringify(chunk) + '\n');
                    count++;
                });
            }
        }
        return count;
    }
}

export default Neo.setupClass(ApiSource);
