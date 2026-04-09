import Base from './Base.mjs';
import fs   from 'fs-extra';
import path from 'path';
import aiConfig from '../config.mjs';

/**
 * @summary Extracts knowledge chunks from the active and archived GitHub Discussions.
 *
 * This source provider iterates through the `resources/content/discussions` directory,
 * providing deep historical context on architectural brainstorming,
 * proposals, and high-level agent communications.
 *
 * @class Neo.ai.mcp.server.knowledge-base.source.DiscussionSource
 * @extends Neo.ai.mcp.server.knowledge-base.source.Base
 * @singleton
 */
class DiscussionSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.source.DiscussionSource'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.source.DiscussionSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from local Markdown Discussions.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        const targetPath = path.resolve(aiConfig.neoRootDir, 'resources/content/discussions');

        if (await fs.pathExists(targetPath)) {
            const ticketFiles = await fs.readdir(targetPath);
            ticketFiles.sort();

            for (const file of ticketFiles) {
                if (file.endsWith('.md')) {
                    const filePath   = path.join(targetPath, file);
                    const content    = await fs.readFile(filePath, 'utf-8');
                    const chunk      = {
                        type   : 'discussion',
                        kind   : 'discussion',
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

        return count;
    }
}

export default Neo.setupClass(DiscussionSource);
