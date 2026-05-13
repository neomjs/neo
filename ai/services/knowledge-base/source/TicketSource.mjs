import Base from './Base.mjs';
import fs   from 'fs-extra';
import path from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Extracts knowledge chunks from the Issue Archive.
 *
 * This source provider iterates through the `resources/content/archive/issues` directory structure,
 * which is organized by release versions and chunks (`vN.M.K/{flat|chunk-N}`). It extracts the content of closed issues,
 * providing deep historical context on past bug fixes, architectural decisions, and
 * feature implementations.
 *
 * @class Neo.ai.services.knowledge-base.source.TicketSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class TicketSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.TicketSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.TicketSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from the Issue Archive.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        const targetPaths = [
            path.resolve(aiConfig.neoRootDir, 'resources/content/issues'),
            path.resolve(aiConfig.neoRootDir, 'resources/content/archive/issues')
        ];

        for (const targetPath of targetPaths) {
            if (await fs.pathExists(targetPath)) {
                const ticketFiles = await fs.readdir(targetPath, { recursive: true });
                ticketFiles.sort();

                for (const file of ticketFiles) {
                    if (typeof file === 'string' && file.endsWith('.md')) {
                        const filePath   = path.join(targetPath, file);
                        const content    = await fs.readFile(filePath, 'utf-8');
                        const chunk      = {
                            type   : 'ticket',
                            kind   : 'ticket',
                            name   : path.basename(file).replace('.md', ''),
                            content,
                            // Relative path keeps the distributed Chroma zip portable (#10097).
                            source : path.relative(aiConfig.neoRootDir, filePath)
                        };

                        chunk.hash = createHashFn(chunk);
                        writeStream.write(JSON.stringify(chunk) + '\n');
                        count++;
                    }
                }
            }
        }

        return count;
    }
}

export default Neo.setupClass(TicketSource);
