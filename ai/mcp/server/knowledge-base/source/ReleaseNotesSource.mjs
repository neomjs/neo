import Base from './Base.mjs';
import fs   from 'fs-extra';
import path from 'path';

/**
 * @summary Extracts knowledge chunks from Release Notes.
 *
 * This source provider scans the `.github/RELEASE_NOTES` directory for Markdown files.
 * Each release note file is treated as a single knowledge chunk, providing historical
 * context on feature additions, bug fixes, and breaking changes.
 *
 * @class Neo.ai.mcp.server.knowledge-base.source.ReleaseNotesSource
 * @extends Neo.ai.mcp.server.knowledge-base.source.Base
 * @singleton
 */
class ReleaseNotesSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.source.ReleaseNotesSource'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.source.ReleaseNotesSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from Release Notes.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        const releaseNotesPath = path.resolve(process.cwd(), '.github/RELEASE_NOTES');

        if (await fs.pathExists(releaseNotesPath)) {
            const releaseFiles = await fs.readdir(releaseNotesPath);
            releaseFiles.sort();

            for (const file of releaseFiles) {
                if (file.endsWith('.md')) {
                    const filePath = path.join(releaseNotesPath, file);
                    const content  = await fs.readFile(filePath, 'utf-8');
                    const chunk    = {
                        type   : 'release',
                        kind   : 'release',
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

export default Neo.setupClass(ReleaseNotesSource);
