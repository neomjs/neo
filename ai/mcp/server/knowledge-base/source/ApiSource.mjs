import Base         from './Base.mjs';
import SourceParser from '../parser/SourceParser.mjs';
import fs           from 'fs-extra';
import path         from 'path';
import aiConfig     from '../config.mjs';

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
 * @class Neo.ai.mcp.server.knowledge-base.source.ApiSource
 * @extends Neo.ai.mcp.server.knowledge-base.source.Base
 * @singleton
 */
class ApiSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.source.ApiSource'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.source.ApiSource',
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
        const sourceMap = {
            'src'     : 'src',
            'apps'    : 'app',
            'examples': 'example',
            'docs/app': 'app',
            'ai'      : 'ai-infrastructure'
        };

        // Load the authoritative class hierarchy
        let hierarchy = {};
        try {
            if (await fs.pathExists(aiConfig.hierarchyPath)) {
                hierarchy = await fs.readJson(aiConfig.hierarchyPath);
            } else {
                console.warn(`[ApiSource] Class hierarchy file not found at ${aiConfig.hierarchyPath}. 'extends' metadata will be incomplete.`);
            }
        } catch (e) {
            console.warn(`[ApiSource] Failed to load class hierarchy: ${e.message}`);
        }

        let count = 0;

        for (const [path, type] of Object.entries(sourceMap)) {
            count += await this.indexRawDirectory(writeStream, createHashFn, path, type, hierarchy);
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
    async indexRawDirectory(writeStream, createHashFn, relativePath, defaultType, hierarchy) {
        let count = 0;
        const fullPath = path.resolve(process.cwd(), relativePath);

        if (!await fs.pathExists(fullPath)) return 0;

        const entries = await fs.readdir(fullPath, {withFileTypes: true});
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            const entryName         = entry.name;
            const entryPath         = path.join(fullPath, entryName);
            const relativeEntryPath = path.join(relativePath, entryName);

            if (entry.isDirectory()) {
                if (entryName === 'node_modules') continue; // Safety check
                count += await this.indexRawDirectory(writeStream, createHashFn, relativeEntryPath, defaultType, hierarchy);
            } else if (entry.isFile() && entryName.endsWith('.mjs')) {
                const content = await fs.readFile(entryPath, 'utf-8');
                const chunks  = SourceParser.parse(content, relativeEntryPath, defaultType, hierarchy);

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
