import Base     from './Base.mjs';
import fs       from 'fs-extra';
import path     from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Extracts knowledge chunks from locally synced Pull Request conversations.
 *
 * This source provider iterates through the `resources/content/pulls` directory,
 * embedding PR bodies and review conversations into the Knowledge Base. It closes
 * the signal-asymmetry gap where Tickets capture the *problem* while PRs capture
 * the *solution*: merge rationale, reviewer corrections, scope-creep warnings, and
 * follow-up ticket links. Without this provider, `ask_knowledge_base` can surface
 * the intent of a change but not the reasoning recorded during execution.
 *
 * @class Neo.ai.services.knowledge-base.source.PullRequestSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class PullRequestSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.PullRequestSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.PullRequestSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from local Markdown Pull Requests.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        const targetPaths = [
            path.resolve(aiConfig.neoRootDir, 'resources/content/pulls'),
            path.resolve(aiConfig.neoRootDir, 'resources/content/archive/pulls')
        ];

        for (const targetPath of targetPaths) {
            if (await fs.pathExists(targetPath)) {
                const pullFiles = await fs.readdir(targetPath, { recursive: true });
                pullFiles.sort();

                for (const file of pullFiles) {
                    if (typeof file === 'string' && file.endsWith('.md')) {
                        const filePath = path.join(targetPath, file);
                        const content  = await fs.readFile(filePath, 'utf-8');
                        const chunk    = {
                            type   : 'pull',
                            kind   : 'pull',
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

export default Neo.setupClass(PullRequestSource);
