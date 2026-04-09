import Base from './Base.mjs';
import fs   from 'fs-extra';
import path from 'path';
import aiConfig from '../config.mjs';

/**
 * @summary Extracts knowledge chunks from the Issue Archive.
 *
 * This source provider iterates through the `.github/ISSUE_ARCHIVE` directory structure,
 * which is organized by release version. It extracts the content of closed issues,
 * providing deep historical context on past bug fixes, architectural decisions, and
 * feature implementations.
 *
 * @class Neo.ai.mcp.server.knowledge-base.source.TicketSource
 * @extends Neo.ai.mcp.server.knowledge-base.source.Base
 * @singleton
 */
class TicketSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.source.TicketSource'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.source.TicketSource',
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
            path.resolve(aiConfig.neoRootDir, 'resources/content/issue-archive')
        ];

        for (const targetPath of targetPaths) {
            if (await fs.pathExists(targetPath)) {
                const ticketFiles = await fs.readdir(targetPath);
                ticketFiles.sort();

                for (const file of ticketFiles) {
                    if (file.endsWith('.md')) {
                        const filePath   = path.join(targetPath, file);
                        const content    = await fs.readFile(filePath, 'utf-8');
                        const chunk      = {
                            type   : 'ticket',
                            kind   : 'ticket',
                            name   : file.replace('.md', ''),
                            content,
                            source : filePath
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
