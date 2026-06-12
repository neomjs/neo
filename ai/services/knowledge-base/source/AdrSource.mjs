import Base from './Base.mjs';
import fs   from 'fs-extra';
import path from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Extracts knowledge chunks from Architecture Decision Records (ADRs).
 *
 * This source provider reads `learn/agentos/decisions/0NNN-*.md`.
 * Each ADR file is treated as a single knowledge chunk.
 *
 * @class Neo.ai.services.knowledge-base.source.AdrSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class AdrSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.AdrSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.AdrSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from ADR markdown files.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        // Per-source path from the `sourcePaths` config (SSOT — the leaf in the KB config template
        // defines every Source's default path).
        const adrDir = path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths.AdrSource);

        if (await fs.pathExists(adrDir)) {
            const files = await fs.readdir(adrDir);
            files.sort();

            for (const file of files) {
                // Match the 0NNN-*.md pattern
                if (!file.match(/^\d{4}-.*\.md$/)) continue;

                const filePath = path.join(adrDir, file);
                const rawContent = await fs.readFile(filePath, 'utf-8');

                const chunk = {
                    type   : 'adr',
                    kind   : 'adr',
                    name   : path.basename(file, '.md'),
                    content: rawContent.trim(),
                    source : path.relative(aiConfig.neoRootDir, filePath)
                };

                chunk.hash = createHashFn(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                count++;
            }
        }

        return count;
    }
}

export default Neo.setupClass(AdrSource);
