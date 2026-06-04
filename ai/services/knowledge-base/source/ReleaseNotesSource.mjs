import Base from './Base.mjs';
import fs   from 'fs-extra';
import path from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Extracts knowledge chunks from Release Notes.
 *
 * This source provider scans the `.github/RELEASE_NOTES` directory for Markdown files.
 * Each release note file is treated as a single knowledge chunk, providing historical
 * context on feature additions, bug fixes, and breaking changes.
 *
 * @class Neo.ai.services.knowledge-base.source.ReleaseNotesSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class ReleaseNotesSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.ReleaseNotesSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.ReleaseNotesSource',
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
        // Per-source path from the `sourcePaths` config (SSOT).
        const releaseNotesPath = path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths.ReleaseNotesSource);

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
                        // Relative path keeps the distributed Chroma zip portable.
                        source : path.relative(aiConfig.neoRootDir, filePath)
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
