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
const loadIndexMap = async (neoRootDir, type) => {
    const map = new Map();
    const typeIndex = path.resolve(neoRootDir, `resources/content/${type}/_index.json`);
    const rootIndex = path.resolve(neoRootDir, 'resources/content/_index.json');

    let entries = [];
    if (await fs.pathExists(typeIndex)) {
        entries = JSON.parse(await fs.readFile(typeIndex, 'utf-8'));
    } else if (await fs.pathExists(rootIndex)) {
        const rootEntries = JSON.parse(await fs.readFile(rootIndex, 'utf-8'));
        entries = rootEntries.filter(e => e.type === type);
    }

    for (const entry of entries) {
        if (entry.path) {
            map.set(path.normalize(entry.path), entry.id);
        }
    }

    return map;
};

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
        // Per-source paths (array) from the `sourcePaths` config (SSOT).
        const pullRequestPaths = aiConfig.sourcePaths.PullRequestSource;
        const targetPaths = pullRequestPaths.map(p => path.resolve(aiConfig.neoRootDir, p));

        const indexMap = await loadIndexMap(aiConfig.neoRootDir, 'pulls');
        const contentRoot = path.resolve(aiConfig.neoRootDir, 'resources/content');

        for (const targetPath of targetPaths) {
            if (await fs.pathExists(targetPath)) {
                const pullFiles = await fs.readdir(targetPath, { recursive: true });
                pullFiles.sort();

                for (const file of pullFiles) {
                    if (typeof file === 'string' && file.endsWith('.md')) {
                        const filePath = path.join(targetPath, file);
                        const relativeToContent = path.relative(contentRoot, filePath);

                        let id = indexMap.get(relativeToContent);
                        if (id === undefined) {
                            id = path.basename(file).replace('.md', '').replace(/^pr-/, '');
                        }

                        const content  = await fs.readFile(filePath, 'utf-8');
                        const chunk    = {
                            type   : 'pull',
                            kind   : 'pull',
                            name   : `pr-${id}`,
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
        }

        return count;
    }
}

export default Neo.setupClass(PullRequestSource);
